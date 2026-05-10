import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger('PdfTableExtractor');

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TableRow {
  cells: string[];
  y: number;
}

interface Table {
  rows: TableRow[];
  columns: number;
  startLineIndex?: number;
}

/**
 * PDF에서 표 구조를 추출하는 유틸리티
 * pdfjs-dist를 사용하여 텍스트의 위치 정보를 활용해 표 구조를 재구성
 */
export class PdfTableExtractor {
  /**
   * PDF에서 텍스트와 위치 정보를 추출하여 표 구조 재구성
   */
  static async extractTablesFromPdf(pdfBuffer: Buffer): Promise<Table[]> {
    // pdfjs-dist를 dynamic import로 사용 (ES Module)
    // TypeScript 컴파일러가 require로 변환하지 않도록 Function 생성자 사용
    const loadPdfjsLib = new Function('return import("pdfjs-dist/legacy/build/pdf.mjs")');
    const pdfjsLib = await loadPdfjsLib();
    
    // Worker 설정 - 파일 경로로 설정
    // node_modules에서 pdfjs-dist 경로 찾기
    let workerPath: string | undefined;
    const cwd = process.cwd();
    const possiblePaths = [
      path.join(cwd, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
      path.join(cwd, 'backend', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    ];
    
    for (const possiblePath of possiblePaths) {
      try {
        if (fs.existsSync(possiblePath)) {
          workerPath = possiblePath;
          break;
        }
      } catch (e) {
        // 파일 확인 실패 시 다음 경로 시도
      }
    }
    
    if (!workerPath) {
      // Worker 파일을 찾지 못한 경우, Worker 없이 시도 (일부 환경에서는 작동할 수 있음)
      logger.warn('pdfjs-dist worker 파일을 찾을 수 없습니다. Worker 없이 시도합니다.');
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
    }

    logger.log('PDF 파일 로딩 시작...');
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    logger.log(`PDF 로딩 완료 - 총 ${pdf.numPages}페이지`);

    const tables: Table[] = [];
    const allTextItems: TextItem[] = [];

    // 모든 페이지에서 텍스트와 위치 정보 추출
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // 각 텍스트 항목의 위치 정보 추출
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim().length > 0) {
          const transform = item.transform;
          allTextItems.push({
            str: item.str.trim(),
            x: transform[4], // x 좌표
            y: transform[5], // y 좌표
            width: item.width || 0,
            height: item.height || 0,
          });
        }
      }
    }

    logger.log(`총 ${allTextItems.length}개 텍스트 항목 추출`);

    // Y 좌표로 그룹화하여 행 구성 (같은 Y 좌표 범위 내의 텍스트는 같은 행)
    const rowTolerance = 3; // Y 좌표 차이가 3 이하면 같은 행으로 간주
    const rows: TextItem[][] = [];
    let currentRow: TextItem[] = [];
    let currentY = -1;

    // Y 좌표 기준으로 정렬 (위에서 아래로)
    const sortedItems = [...allTextItems].sort((a, b) => {
      // Y 좌표가 같으면 X 좌표로 정렬 (왼쪽에서 오른쪽으로)
      if (Math.abs(a.y - b.y) < rowTolerance) {
        return a.x - b.x;
      }
      return b.y - a.y; // Y는 위에서 아래로 (큰 값이 위)
    });

    for (const item of sortedItems) {
      if (currentY === -1 || Math.abs(item.y - currentY) > rowTolerance) {
        // 새 행 시작
        if (currentRow.length > 0) {
          rows.push(currentRow);
        }
        currentRow = [item];
        currentY = item.y;
      } else {
        // 같은 행에 추가
        currentRow.push(item);
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    logger.log(`총 ${rows.length}개 행 추출`);

    // 각 행을 X 좌표 간격으로 셀 구분
    const addressPattern = /^([가-힣]+(?:특별시|광역시|특별자치도|특별자치시|도))([가-힣0-9]*(?:시|군|구))([가-힣0-9]*(?:읍|면|동))/;
    const ratePatternStart = /^\d{1,3},\d{3}/;

    let currentTable: TableRow[] = [];
    let currentTableStartIndex: number | undefined;
    let expectedColumns = 0;
    let processedRows = 0;
    let skippedRows = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      
      // X 좌표로 정렬
      row.sort((a, b) => a.x - b.x);
      
      // X 좌표 간격을 분석하여 셀 구분
      // 간격이 큰 부분(예: 15 이상)을 셀 경계로 간주
      const cellThreshold = 15; // 셀 간 최소 간격
      const cells: string[] = [];
      let currentCell: string[] = [];
      let lastX = -1;
      
      for (const item of row) {
        if (lastX === -1) {
          // 첫 번째 항목
          currentCell.push(item.str);
          lastX = item.x + (item.width || 0);
        } else {
          const gap = item.x - lastX;
          if (gap > cellThreshold) {
            // 셀 경계 - 현재 셀 저장하고 새 셀 시작
            if (currentCell.length > 0) {
              cells.push(currentCell.join(''));
              currentCell = [item.str];
            }
          } else {
            // 같은 셀에 추가
            currentCell.push(item.str);
          }
          lastX = item.x + (item.width || 0);
        }
      }
      
      // 마지막 셀 추가
      if (currentCell.length > 0) {
        cells.push(currentCell.join(''));
      }
      
      // 셀이 7개 이상인 경우만 처리 (주소 3개 + 거리 1개 + 요금 6개 이상)
      if (cells.length >= 7) {
        let region = '';
        let city = '';
        let town = '';
        
        // 첫 번째 셀에서 전체 주소 패턴 확인
        const firstCell = cells[0];
        const addressMatch = firstCell.match(addressPattern);
        
        if (addressMatch) {
          // 주소가 첫 번째 셀에 모두 있는 경우
          region = addressMatch[1];
          city = addressMatch[2];
          town = addressMatch[3];
        } else {
          // 주소가 여러 셀로 나뉘어 있는 경우
          // 첫 번째 셀에서 시도 추출
          const regionMatch = firstCell.match(/^([가-힣]+(?:특별시|광역시|특별자치도|특별자치시|도))/);
          if (regionMatch) {
            region = regionMatch[1];
          }
          
          // 두 번째 셀에서 시군구 추출
          if (cells.length > 1) {
            const cityMatch = cells[1].match(/^([가-힣0-9]*(?:시|군|구))/);
            if (cityMatch) {
              city = cityMatch[1];
            }
          }
          
          // 세 번째 셀에서 읍면동 추출
          if (cells.length > 2) {
            const townMatch = cells[2].match(/^([가-힣0-9]*(?:읍|면|동))/);
            if (townMatch) {
              town = townMatch[1];
            }
          }
        }
        
        // 주소가 모두 추출되었는지 확인
        if (region && city && town) {
          
          // 주소가 첫 번째 셀에 모두 있는 경우와 여러 셀로 나뉜 경우를 구분하여 처리
          let distanceStartIndex = addressMatch ? 1 : 3; // 주소가 한 셀에 있으면 1, 여러 셀이면 3
          let actualDistance = '';
          const rates: string[] = [];
          
          // 거리와 요금 추출
          if (cells.length > distanceStartIndex) {
            const distanceCell = cells[distanceStartIndex];
            
            // 거리와 첫 요금이 붙어있는지 확인
            let foundDistance = false;
            for (let len = 1; len <= Math.min(4, distanceCell.length); len++) {
              const candidateDistance = distanceCell.substring(0, len);
              const afterDistance = distanceCell.substring(len);
              
              if (/^\d+$/.test(candidateDistance) && ratePatternStart.test(afterDistance)) {
                actualDistance = candidateDistance;
                // 첫 요금도 추출
                const firstRateMatch = afterDistance.match(/\d{1,3}(?:,\d{3})+/);
                if (firstRateMatch) {
                  rates.push(firstRateMatch[0]);
                }
                // 나머지 요금들도 추출
                const remainingRates = afterDistance.substring(firstRateMatch ? firstRateMatch[0].length : 0);
                const rateMatches = remainingRates.match(/\d{1,3}(?:,\d{3})+/g) || [];
                rates.push(...rateMatches);
                foundDistance = true;
                break;
              }
            }
            
            // 붙어있지 않으면 거리만 저장
            if (!foundDistance) {
              const distanceMatch = distanceCell.match(/^\d{1,4}$/);
              if (distanceMatch) {
                actualDistance = distanceMatch[0];
              }
            }
            
            // 다음 셀들에서 요금 추출
            for (let i = distanceStartIndex + 1; i < cells.length; i++) {
              const cell = cells[i];
              const rateMatches = cell.match(/\d{1,3}(?:,\d{3})+/g) || [];
              rates.push(...rateMatches);
            }
          }
          
          // 쉼표 제거하여 숫자만 추출
          const rateNumbers = rates.map(r => r.replace(/,/g, ''));
          
          if (rateNumbers.length >= 6 && actualDistance) {
            const tableCells = [
              region,
              city,
              town,
              actualDistance,
              ...rateNumbers,
            ];
            
            processedRows++;
            
            if (currentTable.length === 0) {
              expectedColumns = tableCells.length;
              currentTableStartIndex = rowIndex;
            }
            
            // 열 개수 차이가 2 이하이거나 첫 행이면 같은 표로 간주
            // 또는 연속된 행이면 같은 표로 간주 (행 인덱스 차이가 10 이하)
            const lastRowY = currentTable.length > 0 ? currentTable[currentTable.length - 1].y : rowIndex;
            const rowGap = rowIndex - lastRowY;
            const isConsecutive = currentTable.length === 0 || rowGap <= 10;
            
            if ((Math.abs(tableCells.length - expectedColumns) <= 2 || currentTable.length === 0) && isConsecutive) {
              currentTable.push({
                cells: tableCells,
                y: rowIndex,
              });
              expectedColumns = Math.max(expectedColumns, tableCells.length);
            } else {
              // 새 표 시작 - 기존 표 저장
              if (currentTable.length >= 1) {
                tables.push({
                  rows: currentTable,
                  columns: expectedColumns,
                  startLineIndex: currentTableStartIndex,
                });
              }
              currentTable = [{
                cells: tableCells,
                y: rowIndex,
              }];
              currentTableStartIndex = rowIndex;
              expectedColumns = tableCells.length;
            }
          } else {
            skippedRows++;
          }
        } else {
          // 주소 패턴이 없으면 스킵
          skippedRows++;
        }
      } else if (currentTable.length > 0) {
        // 빈 줄이면 표 종료
        if (currentTable.length >= 1) {
          tables.push({
            rows: currentTable,
            columns: expectedColumns,
            startLineIndex: currentTableStartIndex,
          });
        }
        currentTable = [];
        currentTableStartIndex = undefined;
        expectedColumns = 0;
      } else {
        skippedRows++;
      }
    }

    // 마지막 표 추가
    if (currentTable.length >= 1) {
      tables.push({
        rows: currentTable,
        columns: expectedColumns,
        startLineIndex: currentTableStartIndex,
      });
    }

    logger.log(`처리된 행: ${processedRows}개, 건너뛴 행: ${skippedRows}개`);
    logger.log(`추출된 표 개수: ${tables.length}`);
    tables.forEach((table, i) => {
      logger.log(`표 ${i + 1}: ${table.rows.length}행, ${table.columns}열`);
    });

    return tables;
  }

  /**
   * 표 데이터를 구조화된 객체 배열로 변환
   */
  static parseSafeFreightRateTable(table: Table, portName?: string): any[] {
    const rows: any[] = [];

    for (const row of table.rows) {
      const cells = row.cells;

      if (cells.length < 7) {
        continue;
      }

      const region = cells[0] || '';
      const city = cells[1] || '';
      const town = cells[2] || '';
      const distanceKm = parseInt(cells[3] || '0', 10);

      // 숫자 셀 추출 (거리 이후부터)
      const numbers: number[] = [];
      for (let i = 4; i < cells.length; i++) {
        const numStr = cells[i].replace(/,/g, '');
        const num = parseFloat(numStr);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }

      if (numbers.length >= 6) {
        rows.push({
          port: portName,
          region,
          city,
          town,
          distanceKm: distanceKm || null,
          cells,
          numbers,
        });
      }
    }

    return rows;
  }
}
