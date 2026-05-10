import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { createReadStream, existsSync } from 'fs';
import type { Express } from 'express';
import { extname, join, resolve, relative, isAbsolute } from 'path';
import pdfParse from 'pdf-parse';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { TradeContract } from './entities/trade-contract.entity';
import { TradeOrder } from './entities/trade-order.entity';
import { TradeOrderPayment } from './entities/trade-order-payment.entity';
import { TradeOrderBookingTempPayment } from './entities/trade-order-booking-temp-payment.entity';
import { TradeContainer } from './entities/trade-container.entity';
import { TradeOrderInbound } from './entities/trade-order-inbound.entity';
import { EtaUpdateBatch, EtaUpdateBatchErrorCode, EtaUpdateBatchResultItem } from './entities/eta-update-batch.entity';
import { FileEntity } from '../files/entities/file.entity';
import { SaveTradeContractDto } from './dto/save-trade-contract.dto';
import { UpdateTradeOrderDto } from './dto/update-trade-order.dto';
import { UpdateTradeContractDto } from './dto/update-trade-contract.dto';
import { CreateTradeOrderDto } from './dto/create-trade-order.dto';
import type { BookingTempPaymentDto } from './dto/booking-temp.dto';
import { UpdateTradeOrderInboundDto } from './dto/update-trade-order-inbound.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import { Code } from '../codes/entities/code.entity';
import { SaveInvoiceDto } from './dto/save-invoice.dto';
import { FreeTime } from '../free-time/entities/free-time.entity';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { User } from '../users/entities/user.entity';
import { SalesItem } from '../sales/entities/sales-item.entity';
import { SalesReservation } from '../sales-reservation/entities/sales-reservation.entity';
import { SalesReservationSheetRow } from '../sales-reservation-sheet/entities/sales-reservation-sheet-row.entity';
import { FeatureAuditLogService } from '../feature-audit-log/feature-audit-log.service';
import {
  diffTradeAuditSnapshots,
  mergeTradeAuditSnapshots,
  snapshotTradeContractAudit,
  snapshotTradeOrderAudit,
} from './trade-contracts-field-audit.util';
import {
  buildBlOptionsByProductCodeFromOrders,
  filterSheetBlOptionsBySalesGrade,
  type SheetBlOptionRow,
} from './utils/sheet-bl-options-from-orders.util';
import { effectiveSalesBalesFromContainer, resolveContainerTypeSalesItemCargoQuantities } from './sales-item-cargo.helper';
import * as XLSX from 'xlsx';

/** 프론트 `PRODUCT_RESERVATIONS_SHEET_ID` 와 동일 */
const PRODUCT_RESERVATIONS_GRID_SHEET_ID = 'product-reservations-sheet';

/** 시트 상태가 이 경우에만 재고(가용) 차감 집계에 포함 — 프론트 기본값·코드명과 동일 */
const SHEET_STATUS_INVENTORY_DEDUCTION_LABEL = '예약등록';

const TEMP_DIR = './uploads/contracts/temp';
const FINAL_CONTRACT_DIR = './uploads/contracts/final';
const INVOICE_TEMP_DIR = './uploads/invoices/temp';
const FINAL_INVOICE_DIR = './uploads/invoices/final';
const SEARATES_TRACKING_URL = 'https://tracking.searates.com/tracking';

type NormalizedCore = {
  totalQuantity: number | null;
  perShipmentQuantity: number | null;
  shipmentPeriod: {
    rawText: string | null;
    frequencyPerMonth: number | null;
    totalMonths: number | null;
    startMonth: string | null;
    endMonth: string | null;
  };
  priceSchedule: Array<{ period: string; unitPrice: number; currency: string }>;
  productName: string | null;
  destination: string | null;
  exportCountry: string | null;
  packing: string | null;
  notes: string | null;
  exporter: string | null;
  contractNumber: string | null;
};

type NormalizedPayment = {
  sequence: number;
  dueDate: Date | null;
  ratio: number | null;
  amount: number | null;
  method: string | null;
  exchangeRate: number | null;
  result: string | null;
  notes: string | null;
  paymentType?: string | null;
  dueDateReference?: string | null;
  dueDateOffsetDays?: number | null;
  rawText?: string | null;
  useRatio?: boolean | null; // 비율 사용 여부 (기본값: true)
};

@Injectable()
export class TradeContractsService implements OnModuleInit {
  private readonly logger = new Logger(TradeContractsService.name);
  private readonly openai?: OpenAI;
  private readonly searatesApiKey?: string;
  private readonly searatesTrackingUrl: string;
  private readonly projectRoot = resolve(__dirname, '../../..');
  private shippingLineCodesCache: Code[] | null = null;
  private readonly codeCategoryCache = new Map<string, Code[]>();
  private readonly codeCategoryLoading = new Map<string, Promise<Code[]>>();
  private productCodes: Code[] = [];
  private packingCodes: Code[] = [];
  private shippingLineCodes: Code[] = [];
  private exporterCodes: Code[] = [];
  private destinationCodes: Code[] = [];
  private currencyCodes: Code[] = [];
  private exportCountryCodes: Code[] = [];
  private paymentTermsCodes: Code[] = [];
  private readonly defaultStopWords = ['the', 'and', 'of', 'for'];
  private readonly categoryStopWordsMap: Record<string, string[]> = {
    PRODUCT: ['mixed', 'feed', 'hay', 'pellet', 'byproduct', 'meal'],
    PACKING_TYPE: ['pack', 'packing', 'package', 'type', 'kg', 'kgs', 'lb', 'lbs', 'net', 'per'],
    EXPORTER: ['co', 'company', 'comp', 'ltd', 'limited', 'inc', 'corp', 'corporation', 'group', 'srl', 'spa', 'sa', 'bv'],
    DESTINATION_PORT: ['port', 'harbour', 'harbor', 'terminal', 'terminalo'],
    CURRENCY: ['currency'],
    EXPORT_COUNTRY: [],
    PAYMENT_TERMS: ['terms', 'payment'],
    SHIPPING_LINE: ['shipping', 'line', 'co', 'company', 'ltd'],
  };

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TradeContract)
    private readonly tradeContractRepository: Repository<TradeContract>,
    @InjectRepository(TradeOrder)
    private readonly tradeOrderRepository: Repository<TradeOrder>,
    @InjectRepository(TradeOrderPayment)
    private readonly tradeOrderPaymentRepository: Repository<TradeOrderPayment>,
    @InjectRepository(TradeOrderBookingTempPayment)
    private readonly tradeOrderBookingTempPaymentRepository: Repository<TradeOrderBookingTempPayment>,
    @InjectRepository(TradeContainer)
    private readonly tradeContainerRepository: Repository<TradeContainer>,
    @InjectRepository(TradeOrderInbound)
    private readonly tradeOrderInboundRepository: Repository<TradeOrderInbound>,
    @InjectRepository(Code)
    private readonly codeRepository: Repository<Code>,
    @InjectRepository(FreeTime)
    private readonly freeTimeRepository: Repository<FreeTime>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SalesItem)
    private readonly salesItemRepository: Repository<SalesItem>,
    @InjectRepository(SalesReservation)
    private readonly salesReservationRepository: Repository<SalesReservation>,
    @InjectRepository(SalesReservationSheetRow)
    private readonly salesReservationSheetRowRepository: Repository<SalesReservationSheetRow>,
    @InjectRepository(EtaUpdateBatch)
    private readonly etaUpdateBatchRepository: Repository<EtaUpdateBatch>,
    private readonly dataSource: DataSource,
    private readonly googleDriveService: GoogleDriveService,
    private readonly featureAuditLogService: FeatureAuditLogService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
      });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY가 설정되어 있지 않습니다. 계약서 분석 시 GPT 호출이 생략됩니다.',
      );
    }

    this.searatesApiKey = this.configService.get<string>('SEARATES_API_KEY') ?? undefined;
    this.searatesTrackingUrl =
      this.configService.get<string>('SEARATES_TRACKING_URL') ?? SEARATES_TRACKING_URL;

    if (!this.searatesApiKey) {
      this.logger.warn('SEARATES_API_KEY가 설정되어 있지 않습니다. 선적 조회 기능을 사용할 수 없습니다.');
    }
  }

  async extractContractText(file: Express.Multer.File) {
    const filePath = file.path;
    const fileName = file.originalname ?? file.filename;
    const extension = extname(fileName).toLowerCase();

    try {
      this.logger.log(`계약서 텍스트 추출 시작 - 파일명: ${fileName}`);
      let text = '';
      if (extension === '.pdf') {
        const buffer = await fs.readFile(filePath);
        const parsed = await pdfParse(buffer);
        text = parsed?.text ?? '';
      } else if (file.mimetype?.startsWith('text/')) {
        text = await fs.readFile(filePath, 'utf8');
      } else {
        this.logger.warn(
          `텍스트 추출을 지원하지 않는 파일 형식입니다: ${extension || file.mimetype}`,
        );
      }

      const normalizedText = text.replace(/\s+/g, ' ').trim();
      return {
        fileName,
        text: normalizedText,
        length: normalizedText.length,
        preview: normalizedText.substring(0, 2000),
      };
    } catch (error) {
      this.logger.error('계약서 텍스트 추출 중 오류가 발생했습니다.', error as Error);
      throw error;
    }
  }

  async analyzeContract(
    file?: Express.Multer.File,
    googleDriveFileId?: string,
    userId?: number,
  ) {
    this.logger.log(`[계약서 분석] ========== 분석 시작 ==========`);
    this.logger.log(`[계약서 분석] 파일 소스: ${googleDriveFileId ? `Google Drive (fileId: ${googleDriveFileId})` : file ? `로컬 파일 (${file.originalname})` : '없음'}`);
    this.logger.log(`[계약서 분석] userId: ${userId || '없음'}`);

    // 구글 드라이브 파일 ID가 있으면 다운로드
    let actualFile = file;
    let tempFilePath: string | null = null;

    if (googleDriveFileId && userId) {
      try {
        this.logger.log(`[계약서 분석] [1단계] Google Drive 파일 다운로드 시작 - fileId: ${googleDriveFileId}`);
        const downloadStart = Date.now();
        
        const { metadata, stream } = await this.googleDriveService.downloadFile(userId, googleDriveFileId);
        const downloadDuration = Date.now() - downloadStart;
        
        this.logger.log(`[계약서 분석] [1단계] Google Drive 파일 메타데이터 조회 완료 - ${downloadDuration}ms 소요`);
        this.logger.log(`[계약서 분석] [1단계] 파일명: ${metadata.name}, 크기: ${metadata.size} bytes, MIME 타입: ${metadata.mimeType}`);
        
        // 임시 파일로 저장
        const timestamp = Date.now();
        const ext = extname(metadata.name || '');
        tempFilePath = join(TEMP_DIR, `${timestamp}${ext}`);
        
        this.logger.log(`[계약서 분석] [1단계] 임시 파일 경로: ${tempFilePath}`);
        
        if (!existsSync(TEMP_DIR)) {
          this.logger.log(`[계약서 분석] [1단계] 임시 디렉토리 생성: ${TEMP_DIR}`);
          await fs.mkdir(TEMP_DIR, { recursive: true });
        }

        this.logger.log(`[계약서 분석] [1단계] 파일 스트림 읽기 시작`);
        const streamStart = Date.now();
        const chunks: Buffer[] = [];
        let chunkCount = 0;
        for await (const chunk of stream) {
          chunks.push(chunk);
          chunkCount++;
        }
        const buffer = Buffer.concat(chunks);
        const streamDuration = Date.now() - streamStart;
        this.logger.log(`[계약서 분석] [1단계] 파일 스트림 읽기 완료 - ${streamDuration}ms 소요, 청크 수: ${chunkCount}, 버퍼 크기: ${buffer.length} bytes`);
        
        this.logger.log(`[계약서 분석] [1단계] 임시 파일 저장 시작`);
        const writeStart = Date.now();
        await fs.writeFile(tempFilePath, buffer);
        const writeDuration = Date.now() - writeStart;
        this.logger.log(`[계약서 분석] [1단계] 임시 파일 저장 완료 - ${writeDuration}ms 소요`);

        // Express.Multer.File 형태로 변환
        actualFile = {
          fieldname: 'file',
          originalname: metadata.name || 'file',
          encoding: '7bit',
          mimetype: metadata.mimeType || 'application/octet-stream',
          size: parseInt(metadata.size || '0', 10),
          destination: TEMP_DIR,
          filename: `${timestamp}${ext}`,
          path: tempFilePath,
          buffer: buffer,
        } as Express.Multer.File;
        
        this.logger.log(`[계약서 분석] [1단계] Google Drive 파일 다운로드 완료 - 총 소요 시간: ${Date.now() - downloadStart}ms`);
      } catch (error) {
        const err = error as Error;
        this.logger.error(`[계약서 분석] [1단계] Google Drive 파일 다운로드 실패`, err);
        this.logger.error(`[계약서 분석] [1단계] 에러 메시지: ${err.message}`);
        this.logger.error(`[계약서 분석] [1단계] 에러 스택: ${err.stack}`);
        throw new BadRequestException('구글 드라이브 파일을 다운로드할 수 없습니다.');
      }
    } else if (file) {
      this.logger.log(`[계약서 분석] [1단계] 로컬 파일 사용 - 파일명: ${file.originalname}, 크기: ${file.size} bytes, 경로: ${file.path}`);
    }

    if (!actualFile) {
      this.logger.error(`[계약서 분석] [1단계] 파일 또는 구글 드라이브 파일 ID가 필요합니다.`);
      throw new BadRequestException('파일 또는 구글 드라이브 파일 ID가 필요합니다.');
    }

    const filePath = actualFile.path;
    this.logger.log(`[계약서 분석] [1단계] 최종 사용 파일 경로: ${filePath}`);

    if (!this.openai) {
      this.logger.warn(`[계약서 분석] OpenAI 클라이언트가 초기화되지 않아 GPT 분석을 건너뜁니다.`);
      return {
        fileName: actualFile.filename,
        tempFilePath: filePath,
        draftOrders: [],
        rawResult: null,
        message: 'OPENAI_API_KEY가 설정되지 않아 GPT 분석이 수행되지 않았습니다.',
      };
    }

    let uploadedFileId: string | null = null;

    const overallStart = Date.now();
    try {
      this.logger.log(`[계약서 분석] [2단계] 코드 카테고리 로딩 시작`);
      const codeLoadStart = Date.now();
      await this.loadCodeCategories([
        'PRODUCT',
        'PACKING_TYPE',
        'SHIPPING_LINE',
        'EXPORTER',
        'DESTINATION_PORT',
        'CURRENCY',
        'EXPORT_COUNTRY',
        'PAYMENT_TERMS',
      ]);
      const codeLoadDuration = Date.now() - codeLoadStart;
      this.logger.log(`[계약서 분석] [2단계] 코드 카테고리 로딩 완료 - ${codeLoadDuration}ms 소요`);

      this.logger.log(
        `[계약서 분석] [3단계] 계약서 분석 시작 - 파일명: ${actualFile.originalname ?? actualFile.filename}, 크기: ${actualFile.size} bytes`,
      );

      this.logger.log(`[계약서 분석] [3단계] OpenAI 파일 업로드 시작 - 파일 경로: ${filePath}`);
      const uploadStart = Date.now();
      const fileStream = createReadStream(filePath);
      this.logger.log(`[계약서 분석] [3단계] 파일 스트림 생성 완료`);
      
      const uploaded = await this.openai.files.create({
        file: fileStream,
        purpose: 'assistants',
      });
      uploadedFileId = uploaded.id;
      const uploadDuration = Date.now() - uploadStart;
      this.logger.log(
        `[계약서 분석] [3단계] OpenAI 파일 업로드 완료 - fileId: ${uploadedFileId}, 소요 시간: ${uploadDuration}ms`,
      );

      this.logger.log(`[계약서 분석] [4단계] GPT 프롬프트 생성 시작`);
      const prompt = this.buildCoreExtractionPrompt();
      this.logger.log(`[계약서 분석] [4단계] GPT 프롬프트 생성 완료 - 프롬프트 길이: ${prompt.length} characters`);

      this.logger.log(`[계약서 분석] [5단계] GPT 분석 요청 시작 - 모델: gpt-4.1-mini, fileId: ${uploadedFileId}`);
      const gptStart = Date.now();
      const completion = await this.openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'You are an assistant that extracts structured data from contract documents and returns strict JSON arrays that follow the provided schema.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `${prompt}\n첨부된 PDF 계약서를 검토하고 위 조건에 맞는 JSON 객체 하나만 반환해 주세요.`,
              },
              {
                type: 'input_file',
                file_id: uploadedFileId,
              },
            ],
          },
        ],
      });
      const gptDuration = Date.now() - gptStart;
      this.logger.log(`[계약서 분석] [5단계] GPT 응답 수신 완료 - 소요 시간: ${gptDuration}ms`);
      this.logger.log(`[계약서 분석] [5단계] GPT 응답 타입: ${(completion as any).object || 'unknown'}`);

      let rawResult = completion.output_text?.trim() ?? '';
      this.logger.log(`[계약서 분석] [6단계] GPT 원본 응답 수신 - 응답 길이: ${rawResult.length} characters`);
      if (rawResult.length > 0) {
        this.logger.debug(`[계약서 분석] [6단계] GPT 원본 응답 (처음 500자): ${rawResult.substring(0, 500)}...`);
      } else {
        this.logger.warn(`[계약서 분석] [6단계] GPT 원본 응답이 비어있습니다!`);
      }

      this.logger.log(`[계약서 분석] [7단계] JSON 파싱 시작`);
      let normalizedCore: NormalizedCore | null = null;
      try {
        if (rawResult.startsWith('```')) {
          this.logger.log(`[계약서 분석] [7단계] 마크다운 코드 블록 제거`);
          rawResult = rawResult.replace(/```json/gi, '').replace(/```/g, '').trim();
        }
        
        this.logger.log(`[계약서 분석] [7단계] JSON 파싱 시도 - 파싱할 문자열 길이: ${rawResult.length}`);
        const parsed = JSON.parse(rawResult);
        this.logger.log(`[계약서 분석] [7단계] JSON 파싱 성공`);
        
        this.logger.log(`[계약서 분석] [7단계] 데이터 정규화 시작`);
        normalizedCore = this.normalizeCoreExtraction(parsed);
        this.logger.log(`[계약서 분석] [7단계] 데이터 정규화 완료`);
        this.logger.log(`[계약서 분석] [7단계] GPT 핵심 정보 추출 완료: ${JSON.stringify(normalizedCore, null, 2)}`);
      } catch (error) {
        const err = error as Error;
        this.logger.error(`[계약서 분석] [7단계] JSON 파싱 실패`, err);
        this.logger.error(`[계약서 분석] [7단계] 에러 메시지: ${err.message}`);
        this.logger.error(`[계약서 분석] [7단계] 에러 스택: ${err.stack}`);
        this.logger.error(`[계약서 분석] [7단계] 파싱 실패한 원본 응답: ${rawResult}`);
        normalizedCore = null;
      }

      this.logger.log(`[계약서 분석] [8단계] 선적 스케줄 생성 시작`);
      const draftOrders = normalizedCore ? this.buildDraftOrders(normalizedCore) : [];
      this.logger.log(
        `[계약서 분석] [8단계] 선적 스케줄 생성 완료 - 생성된 스케줄 수: ${draftOrders.length}`,
      );
      if (draftOrders.length > 0) {
        this.logger.log(`[계약서 분석] [8단계] 생성된 선적 스케줄 상세: ${JSON.stringify(draftOrders, null, 2)}`);
      } else {
        this.logger.warn(`[계약서 분석] [8단계] 생성된 선적 스케줄이 없습니다.`);
      }

      // 반환값 준비 (Google Drive 파일인 경우 tempFilePath는 null로 설정, finally에서 삭제됨)
      const result = {
        fileName: actualFile.originalname || actualFile.filename, // 원본 파일명 사용 (Google Drive 파일명 또는 로컬 파일명)
        tempFilePath: googleDriveFileId ? null : filePath, // Google Drive 파일은 null (삭제 예정)
        draftOrders,
        rawResult,
        core: normalizedCore,
        notes: normalizedCore?.notes ?? null,
        message: draftOrders.length
          ? `계약서 핵심 정보를 기반으로 선적 스케줄 ${draftOrders.length}건을 생성했습니다.`
          : '계약서 핵심 정보를 추출했지만 선적 스케줄을 생성하지 못했습니다. notes를 확인해 주세요.',
        ...(googleDriveFileId && { googleDriveFileId }), // Google Drive 파일 ID 포함
      };

      this.logger.log(`[계약서 분석] [9단계] 분석 결과 반환 준비 완료`);
      this.logger.log(`[계약서 분석] ========== 분석 성공 완료 ==========`);
      
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[계약서 분석] ========== 분석 실패 ==========`);
      this.logger.error(`[계약서 분석] 에러 발생 - 메시지: ${err.message}`);
      this.logger.error(`[계약서 분석] 에러 스택: ${err.stack}`);
      this.logger.error(`[계약서 분석] 에러 이름: ${err.name}`);
      if (err instanceof Error && 'response' in err) {
        this.logger.error(`[계약서 분석] API 응답 에러: ${JSON.stringify((err as any).response?.data || (err as any).response)}`);
      }
      throw error;
    } finally {
      const totalDuration = Date.now() - overallStart;
      this.logger.log(
        `[계약서 분석] [정리] 계약서 분석 종료 - 총 소요 시간: ${totalDuration}ms`,
      );
      
      if (uploadedFileId) {
        try {
          this.logger.log(`[계약서 분석] [정리] OpenAI 업로드 파일 삭제 시작 - fileId: ${uploadedFileId}`);
          await this.openai.files.del(uploadedFileId);
          this.logger.log(`[계약서 분석] [정리] OpenAI 업로드 파일 삭제 완료`);
        } catch (error) {
          const err = error as Error;
          this.logger.warn(`[계약서 분석] [정리] OpenAI 업로드 파일 삭제 실패 - fileId: ${uploadedFileId}`, err);
          this.logger.warn(`[계약서 분석] [정리] 삭제 실패 에러 메시지: ${err.message}`);
        }
      }
      
      // Google Drive 파일인 경우 서버 임시 파일 삭제 (로컬 파일은 저장 시까지 유지)
      if (googleDriveFileId && tempFilePath) {
        try {
          this.logger.log(`[계약서 분석] [정리] Google Drive 임시 파일 삭제 시작 - 경로: ${tempFilePath}`);
          await this.deleteTempFile(tempFilePath);
          this.logger.log(`[계약서 분석] [정리] Google Drive 임시 파일 삭제 완료`);
        } catch (error) {
          const err = error as Error;
          this.logger.warn(`[계약서 분석] [정리] Google Drive 임시 파일 삭제 실패 - 경로: ${tempFilePath}`, err);
          this.logger.warn(`[계약서 분석] [정리] 삭제 실패 에러 메시지: ${err.message}`);
        }
      }
      
      this.logger.log(`[계약서 분석] ========== 정리 완료 ==========`);
    }
  }

  async deleteTempFile(tempFilePath: string) {
    try {
      await fs.unlink(tempFilePath);
      this.logger.debug(`임시 계약서 파일 삭제: ${tempFilePath}`);
    } catch (error) {
      this.logger.error(`임시 계약서 파일 삭제 실패: ${tempFilePath}`, error as Error);
    }
  }

  async moveToFinalLocation(tempFilePath: string, finalDir: string) {
    if (!tempFilePath) {
      throw new Error('tempFilePath is required');
    }

    const absoluteTempPath = isAbsolute(tempFilePath)
      ? tempFilePath
      : resolve(this.projectRoot, tempFilePath);
    const absoluteFinalDir = isAbsolute(finalDir) ? finalDir : resolve(this.projectRoot, finalDir);

    if (!existsSync(absoluteTempPath)) {
      throw new Error(`Temp file not found: ${absoluteTempPath}`);
    }

    if (!existsSync(absoluteFinalDir)) {
      await fs.mkdir(absoluteFinalDir, { recursive: true });
    }

    const fileName = absoluteTempPath.split(/[/\\]/).pop();
    if (!fileName) {
      throw new Error('Unable to resolve temp file name');
    }

    const finalAbsolutePath = join(absoluteFinalDir, fileName);
    await fs.rename(absoluteTempPath, finalAbsolutePath);
    const finalRelativePath = relative(this.projectRoot, finalAbsolutePath);
    this.logger.debug(`임시 파일을 최종 경로로 이동: ${finalAbsolutePath}`);

    return {
      fileName,
      finalPath: finalRelativePath,
      absolutePath: finalAbsolutePath,
    };
  }

  private buildCoreExtractionPrompt(): string {
    return `
계약서에서 선적 스케줄 계산에 필요한 핵심 정보를 추출해 주세요.
JSON 객체 하나만 반환하며, 반드시 아래 스키마와 규칙을 지켜야 합니다.

{
  "contract_number": string | null,         // 계약서에 명시된 계약 번호/식별자. 없으면 null
  "total_quantity": number | null,          // 총 선적 수량(컨테이너 HC 기준). HC 언급이 없으면 null
  "per_shipment_quantity": number | null,   // 1회 선적 수량(HC 기준). HC 근거 없으면 null
  "shipment_period": {
      "raw_text": string | null,            // 선적 주기/기간 원문 문구
      "frequency_per_month": number | null, // 월별 선적 횟수. 확신 없으면 null
      "total_months": number | null,        // 전체 선적 기간(개월 수) 또는 null
      "start_month": string | null,         // ISO 형식 YYYY-MM. 추정 시 notes에 근거 명시
      "end_month": string | null            // ISO 형식 YYYY-MM. 추정 시 notes에 근거 명시
  },
  "price_schedule": Array<{
      "period": string;                     // 가격 적용 기간 설명 (예: "November-December")
      "unit_price": number;                 // 단가(숫자)
      "currency": string;                   // 통화 코드 또는 명칭
  }>,
  "product_name": string | null,
  "destination": string | null,
  "export_country": string | null,
  "packing": string | null,
  "exporter": string | null,
  "notes": string                          // Markdown bullet 최소 2줄
}

규칙:
- contract_number는 계약서에 명시된 번호(예: "BAF0311-1")를 그대로 사용하며, 찾지 못하면 null로 두고 notes에 "계약번호 확인 필요"라고 남깁니다. 파일명 추정은 하지 않습니다.
- total_quantity와 per_shipment_quantity는 반드시 HC/컨테이너/contr(s) 등 컨테이너 단위 표현을 근거로 채우세요. "880 MT"처럼 톤/중량 값은 참고용이므로 절대 total_quantity에 넣지 않습니다. 근거가 없으면 null로 두고 notes에 "HC 수량 확인 필요"라고 적습니다.
- 숫자를 추출할 때 컨테이너 단위가 붙은 패턴(예: "40 HC", "20 contrs", "5 containers")을 우선적으로 탐색해 그 숫자를 사용합니다. 해당 패턴이 보이면 반드시 그 숫자를 사용했다고 notes에 문장 위치를 남깁니다.
- 숫자를 추출할 때 단위(MT, TON 등)는 제거하고, 제거/변환 근거를 notes에 기록합니다.
- shipment_period.raw_text에는 원문을 거의 그대로 사용하고, 월별 빈도·기간·시작/종료 월을 추정했다면 notes에 "추정" 근거를 명확히 남깁니다.
- price_schedule은 계약서에 구간별 가격이 명시된 경우에만 채우고, period/단가/통화를 정확히 분리합니다.
- exporter는 계약서의 Seller/Supplier/Exporter 항목을 그대로 반환합니다. 약어가 있다면 notes에 근거를 남깁니다.
- 확실하지 않은 값은 추정하지 말고 null로 두며, notes에 "확인 필요" 형태로 이유를 설명합니다.
- notes는 Markdown bullet(\`- 내용\`) 형식으로 최소 두 줄이며, 각 값이 어디에서 왔는지 또는 왜 모호한지에 대한 근거를 포함해야 합니다.
- JSON 객체 외의 텍스트(설명, 코드블록 등)는 절대로 출력하지 마세요.`;
  }

  private normalizeCoreExtraction(parsed: any): NormalizedCore {
    const safeNumber = (value: unknown) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        if (!match) {
          return null;
        }
        const num = Number.parseFloat(match[0]);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const safeString = (value: unknown) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      }
      return String(value);
    };

    const shipmentPeriodRaw = parsed?.shipment_period ?? {};

    const containerNumber = (value: unknown) => {
      const text = safeString(value);
      if (!text) {
        return null;
      }
      const match = text.match(/(-?\d+(?:\.\d+)?)\s*(hc|contrs?|containers?)/i);
      if (match) {
        const num = Number.parseFloat(match[1]);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const containerTotal = containerNumber(parsed?.total_quantity ?? parsed?.quantity ?? parsed);
    const perShipmentFromText = containerNumber(
      parsed?.per_shipment_quantity ?? shipmentPeriodRaw?.raw_text ?? parsed,
    );

    const priceSchedule: Array<{ period: string; unitPrice: number; currency: string }> = Array.isArray(
      parsed?.price_schedule,
    )
      ? parsed.price_schedule
          .map((item: any) => ({
            period: safeString(item?.period),
            unitPrice: safeNumber(item?.unit_price),
            currency: safeString(item?.currency),
          }))
          .filter(
            (item): item is { period: string; unitPrice: number; currency: string } =>
              !!item.period && item.unitPrice !== null && !!item.currency,
          )
      : [];

    const normalized: NormalizedCore = {
      totalQuantity: safeNumber(parsed?.total_quantity),
      perShipmentQuantity: safeNumber(parsed?.per_shipment_quantity),
      shipmentPeriod: {
        rawText: safeString(shipmentPeriodRaw?.raw_text),
        frequencyPerMonth: safeNumber(shipmentPeriodRaw?.frequency_per_month),
        totalMonths: safeNumber(shipmentPeriodRaw?.total_months),
        startMonth: safeString(shipmentPeriodRaw?.start_month),
        endMonth: safeString(shipmentPeriodRaw?.end_month),
      },
      priceSchedule,
      productName: safeString(parsed?.product_name),
      destination: safeString(parsed?.destination),
      exportCountry: safeString(parsed?.export_country),
      packing: safeString(parsed?.packing),
      exporter: safeString(parsed?.exporter),
      notes: safeString(parsed?.notes),
      contractNumber: safeString(parsed?.contract_number),
    };

    if (!normalized.totalQuantity && containerTotal) {
      normalized.totalQuantity = containerTotal;
    }

    if (!normalized.perShipmentQuantity && perShipmentFromText) {
      normalized.perShipmentQuantity = perShipmentFromText;
    }
    if (!normalized.perShipmentQuantity && normalized.totalQuantity) {
      normalized.perShipmentQuantity = normalized.totalQuantity;
      const existingNotes = normalized.notes ?? '';
      const appendedNote = '- per_shipment_quantity가 없어 total_quantity 값을 기본으로 사용했습니다.';
      normalized.notes = existingNotes
        ? `${existingNotes}
${appendedNote}`
        : appendedNote;
    }

    if (!normalized.totalQuantity && !normalized.perShipmentQuantity) {
      normalized.totalQuantity = 1;
      normalized.perShipmentQuantity = 1;
      const existingNotes = normalized.notes ?? '';
      const appendedNote = '- HC 수량이 없어 1회 선적으로 기본 설정했습니다.';
      normalized.notes = existingNotes
        ? `${existingNotes}
${appendedNote}`
        : appendedNote;
    }

    return normalized;
  }

  private buildDraftOrders(core: NormalizedCore): Array<{
    to_contract_no: string;
    to_shipment_seq: number;
    to_export_country: string;
    to_product_name: string;
    to_quantity: number;
    to_grade: string;
    to_packing: string;
    to_currency: string;
    to_unit_price: number;
    to_destination: string;
    to_etd: string;
    to_exporter: string;
  }> {
    if (!core.totalQuantity || !core.perShipmentQuantity) {
      this.logger.warn('총 수량 또는 1회 선적 HC가 없어 선적 스케줄을 생성할 수 없습니다.');
      return [];
    }

    const perShipment = core.perShipmentQuantity;
    const shipmentCount = Math.round(core.totalQuantity / perShipment);
    if (!Number.isFinite(shipmentCount) || shipmentCount <= 0) {
      this.logger.warn('총 선적 회차 계산에 실패했습니다.');
      return [];
    }

    const contractNumber = this.normalizeContractNumber(core.contractNumber);
    const exportCountry = this.normalizeCountry(core.exportCountry);
    const productName = this.normalizeProduct(core.productName);
    const packingSource = this.resolvePackingSource(core);
    const packing = this.normalizePacking(packingSource);
    const destination = this.normalizeDestination(core.destination);
    const exporter = this.normalizeExporter(core.exporter);

    const months = this.resolveMonths(core, shipmentCount);
    const priceMap = this.mapPricesToMonths(months, core.priceSchedule);

    let frequency = core.shipmentPeriod.frequencyPerMonth ?? null;
    if (frequency && frequency > perShipment && perShipment > 0) {
      const candidate = frequency / perShipment;
      if (Number.isFinite(candidate) && Number.isInteger(candidate)) {
        frequency = candidate;
      }
    }
    const occurrences = new Array(months.length).fill(0);
    let remaining = shipmentCount;

    if (frequency && frequency > 0) {
      for (let i = 0; i < months.length && remaining > 0; i += 1) {
        const slotsLeft = months.length - i - 1;
        const maxAllocatable = remaining - slotsLeft * frequency;
        const alloc = Math.min(frequency, Math.max(0, maxAllocatable));
        occurrences[i] = alloc;
        remaining -= alloc;
      }
    }

    let index = 0;
    while (remaining > 0 && months.length > 0) {
      occurrences[index % months.length] += 1;
      remaining -= 1;
      index += 1;
    }

    const draftOrders = [];
    let globalSequence = 1;
    months.forEach((month, monthIndex) => {
      const count = occurrences[monthIndex];
      if (!count) {
        return;
      }
      const pricing = priceMap[monthIndex] ?? { unitPrice: null, currency: null };
      for (let occurrence = 0; occurrence < count; occurrence += 1) {
        const shipmentSequence = globalSequence;
        draftOrders.push({
          to_contract_no: contractNumber,
          to_shipment_seq: shipmentSequence,
          to_export_country: exportCountry,
          to_product_name: productName,
          to_quantity: perShipment,
          to_grade: '',
          to_packing: packing,
          to_currency: this.normalizeCurrency(pricing.currency),
          to_unit_price: pricing.unitPrice ?? 0,
          to_destination: destination,
          to_etd: month ?? '',
          to_exporter: exporter,
        });
        globalSequence += 1;
      }
    });

    return draftOrders;
  }

  private resolveMonths(core: NormalizedCore, shipmentCount: number) {
    const months: Array<string | null> = [];
    const { shipmentPeriod } = core;

    const rangeMonths = this.expandMonthsFromRange(
      shipmentPeriod.startMonth,
      shipmentPeriod.endMonth,
      shipmentPeriod.totalMonths ?? undefined,
    );
    if (rangeMonths.length) {
      months.push(...rangeMonths);
    }

    if (!months.length) {
      const priceMonths = this.expandMonthsFromPriceSchedule(core.priceSchedule);
      if (priceMonths.length) {
        months.push(...priceMonths);
        if (!shipmentPeriod.startMonth) {
          shipmentPeriod.startMonth = priceMonths[0];
        }
        if (!shipmentPeriod.endMonth && priceMonths.length > 1) {
          shipmentPeriod.endMonth = priceMonths[priceMonths.length - 1];
        }
      }
    }

    if (!months.length && shipmentPeriod.rawText) {
      const extracted = this.extractMonthsFromText(shipmentPeriod.rawText);
      if (extracted.length) {
        months.push(...extracted);
        if (!shipmentPeriod.startMonth) {
          shipmentPeriod.startMonth = extracted[0];
        }
        if (!shipmentPeriod.endMonth && extracted.length > 1) {
          shipmentPeriod.endMonth = extracted[extracted.length - 1];
        }
      }
    }

    if (!months.length) {
      return Array(Math.max(1, shipmentCount)).fill(null);
    }

    const uniqueMonths = months.filter(
      (value, index, self) => value !== null && self.indexOf(value) === index,
    );

    return uniqueMonths.length ? uniqueMonths : months;
  }

  private expandMonthsFromRange(
    start: string | null,
    end: string | null,
    totalMonths?: number,
  ) {
    if (!start) {
      return [];
    }
    const startDate = this.parseIsoMonth(start);
    if (!startDate) {
      return [];
    }

    const months: string[] = [];
    let current = new Date(startDate.getTime());
    const maxIterations = Math.max(totalMonths ?? 0, 1) + 24;
    let count = 0;

    while (count < maxIterations) {
      months.push(this.formatIsoMonth(current));
      count += 1;

      if (end) {
        const endDate = this.parseIsoMonth(end);
        if (endDate && current >= endDate) {
          break;
        }
      } else if (totalMonths && count >= totalMonths) {
        break;
      }

      current = this.addMonths(current, 1);
    }

    return months;
  }

  private expandMonthsFromPriceSchedule(
    priceSchedule: Array<{ period: string; unitPrice: number; currency: string }>,
  ) {
    const months: string[] = [];
    priceSchedule.forEach((entry) => {
      const extracted = this.extractMonthsFromText(entry.period);
      if (extracted.length) {
        months.push(...extracted);
      }
    });
    return months;
  }

  private extractMonthsFromText(text: string) {
    if (!text) {
      return [];
    }

    const cleaned = text.replace(/\u2013|\u2014|\-/g, ' to ');

    const monthRegex =
      /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/gi;
    const yearRegex = /(\d{4})/g;

    const monthsFound: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = monthRegex.exec(cleaned))) {
      const month = this.monthNameToNumber(match[1]);
      if (month) {
        monthsFound.push(month);
      }
    }

    const yearsFound = Array.from(cleaned.matchAll(yearRegex)).map((y) => y[1]);
    const primaryYear = yearsFound[0] ?? new Date().getFullYear().toString();
    const secondaryYear = yearsFound[1] ?? primaryYear;

    if (!monthsFound.length) {
      return [];
    }

    const monthOrder = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const sortedMonths = [...new Set(monthsFound)].sort(
      (a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b),
    );

    const results: string[] = [];
    let currentYear = Number.parseInt(primaryYear, 10);
    sortedMonths.forEach((month, idx) => {
      if (idx > 0) {
        const prev = sortedMonths[idx - 1];
        if (monthOrder.indexOf(month) < monthOrder.indexOf(prev)) {
          currentYear += 1;
        }
      }
      results.push(`${currentYear}-${month}`);
    });

    return results;
  }

  private mapPricesToMonths(
    months: Array<string | null>,
    priceSchedule: Array<{ period: string; unitPrice: number; currency: string }>,
  ) {
    if (!months.length) {
      return [];
    }

    const prices = months.map(() => ({ unitPrice: null as number | null, currency: null as string | null }));

    priceSchedule.forEach((entry) => {
      const targetMonths = this.extractMonthsFromText(entry.period);
      if (targetMonths.length) {
        targetMonths.forEach((month) => {
          const index = months.findIndex((candidate) => candidate === month);
          if (index !== -1) {
            prices[index] = { unitPrice: entry.unitPrice, currency: entry.currency };
          }
        });
      }
    });

    for (let i = 0; i < prices.length; i += 1) {
      if (prices[i].unitPrice === null && priceSchedule.length) {
        const fallback = priceSchedule[Math.min(i, priceSchedule.length - 1)];
        prices[i] = { unitPrice: fallback.unitPrice, currency: fallback.currency };
      }
    }

    return prices;
  }

  private parseIsoMonth(value: string | null) {
    if (!value) {
      return null;
    }
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return null;
    }
    return new Date(Date.UTC(year, month - 1, 1));
  }

  private formatIsoMonth(date: Date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  private addMonths(date: Date, count: number) {
    const cloned = new Date(date.getTime());
    cloned.setUTCMonth(cloned.getUTCMonth() + count);
    return cloned;
  }

  private monthNameToNumber(value: string | null | undefined) {
    if (!value) {
      return null;
    }
    const mapping: Record<string, string> = {
      january: '01',
      jan: '01',
      february: '02',
      feb: '02',
      march: '03',
      mar: '03',
      april: '04',
      apr: '04',
      may: '05',
      june: '06',
      jun: '06',
      july: '07',
      jul: '07',
      august: '08',
      aug: '08',
      september: '09',
      sep: '09',
      sept: '09',
      october: '10',
      oct: '10',
      november: '11',
      nov: '11',
      december: '12',
      dec: '12',
    };
    return mapping[value.toLowerCase()] ?? null;
  }

  private normalizeContractNumber(value: string | null) {
    if (!value) {
      return '';
    }
    return value.trim();
  }

  private normalizeCountry(value: string | null) {
    if (!value) {
      return null;
    }
    const cleaned = value.replace(/origin/gi, '').replace(/country/gi, '').trim();
    if (!cleaned) {
      return null;
    }
    const match = this.findBestCodeMatch(cleaned, 'EXPORT_COUNTRY');
    if (match?.value) {
      const code = match.value.trim().toUpperCase();
      this.logger.debug(`[normalizeCountry] 매칭 성공: "${value}" -> "${code}"`);
      return code;
    }
    // 코드 매칭 실패 시 경고 로그
    this.logger.warn(`[normalizeCountry] 코드 매칭 실패: "${value}" -> "${cleaned.toUpperCase()}" (코드 관리에 등록되지 않은 값)`);
    return cleaned.toUpperCase();
  }

  private normalizeProduct(value: string | null) {
    if (!value) {
      return '';
    }
    const match = this.findBestCodeMatch(value, 'PRODUCT');
    if (match?.value) {
      return match.value.trim().toUpperCase();
    }
    return value.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
  }

  private normalizeExporter(value: string | null) {
    if (!value) {
      return '';
    }
    const match = this.findBestCodeMatch(value, 'EXPORTER');
    if (match?.value) {
      return match.value.trim().toUpperCase();
    }
    return value.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
  }

  private normalizePacking(value: string | null) {
    if (!value) {
      return '';
    }
    const match = this.findBestCodeMatch(value, 'PACKING_TYPE');
    if (match?.value) {
      return match.value.trim().toUpperCase();
    }
    return value.replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
  }

  private normalizeDestination(value: string | null) {
    if (!value) {
      return '';
    }
    let cleaned = value.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\(.*?\)/g, '');
    cleaned = cleaned.split(',')[0];
    cleaned = cleaned.replace(/[,]/g, ' ');
    cleaned = cleaned.replace(/port|harbour|harbor|terminal/gi, '');
    cleaned = cleaned.trim();
    const match = this.findBestCodeMatch(cleaned, 'DESTINATION_PORT');
    if (match?.value) {
      return match.value.trim().toUpperCase();
    }
    return cleaned.replace(/\s+/g, '_').toUpperCase();
  }

  private normalizeCurrency(value: string | null) {
    if (!value) {
      return '';
    }
    const match = this.findBestCodeMatch(value, 'CURRENCY');
    if (match?.value) {
      return match.value.trim().toUpperCase();
    }
    const normalized = value.toUpperCase().trim();
    return normalized;
  }

  private normalizePayments(rawPayments: unknown, defaultSequenceBase = 1): NormalizedPayment[] {
    if (!Array.isArray(rawPayments)) {
      return [];
    }

    const sanitizeString = (value: unknown) => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const match = this.findBestCodeMatch(trimmed, 'PAYMENT_TERMS');
      if (match?.value) {
        return match.value.trim().toUpperCase();
      }
      return trimmed;
    };

    const sanitizeNumber = (value: unknown): number | null => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const cleaned = value
          .replace(/,/g, '')
          .replace(/[\s]/g, '')
          .replace(/[^0-9.+-]/g, '');
        if (!cleaned) {
          return null;
        }
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    return rawPayments
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') {
          return null;
        }

        const sequenceSource =
          (raw as any).sequence ??
          (raw as any).seq ??
          (raw as any).order ??
          (raw as any).nth ??
          null;
        let sequence = Number(sequenceSource);
        if (!Number.isFinite(sequence) || sequence <= 0) {
          sequence = defaultSequenceBase + index;
        } else {
          sequence = Math.max(1, Math.round(sequence));
        }

        const dueSource =
          (raw as any).due_date ??
          (raw as any).dueDate ??
          (raw as any).date ??
          (raw as any).scheduled_at ??
          null;
        const dueDate =
          typeof dueSource === 'string' && dueSource.trim().length > 0
            ? this.parseFlexibleDate(dueSource)
            : null;

        const ratioSource =
          (raw as any).ratio ??
          (raw as any).rate ??
          (raw as any).percentage ??
          (raw as any).percent ??
          null;
        let ratio = sanitizeNumber(ratioSource);

        const amountSource =
          (raw as any).amount ?? (raw as any).value ?? (raw as any).price ?? null;
        let amount = sanitizeNumber(amountSource);

        const method = sanitizeString(
          (raw as any).method ??
            (raw as any).payment_method ??
            (raw as any).paymentMethod
        );

        const exchangeRateSource =
          (raw as any).exchange_rate ??
          (raw as any).exchangeRate ??
          (raw as any).fx ??
          null;
        let exchangeRate = sanitizeNumber(exchangeRateSource);

        const result = sanitizeString(
          (raw as any).result ??
            (raw as any).status ??
            (raw as any).outcome ??
            (raw as any).note ??
            null
        );

        const notes = sanitizeString((raw as any).notes) ?? sanitizeString((raw as any).memo);

        const paymentType = sanitizeString(
          (raw as any).paymentType ??
          (raw as any).payment_type ??
          (raw as any).payment_type_code
        );

        const useRatioSource = (raw as any).useRatio;
        const useRatio = useRatioSource !== undefined && useRatioSource !== null ? Boolean(useRatioSource) : true; // 기본값: true

        if (
          dueDate === null &&
          ratio === null &&
          amount === null &&
          !method &&
          exchangeRate === null &&
          !result &&
          (notes === null || notes === undefined)
        ) {
          return null;
        }

        return {
          sequence,
          dueDate,
          ratio,
          amount,
          method: method ?? null,
          exchangeRate,
          result: result ?? null,
          notes: notes ?? null,
          paymentType: paymentType ?? null,
          useRatio, // 비율 사용 여부
        } as NormalizedPayment;
      })
      .filter((payment): payment is NormalizedPayment => payment !== null)
      .sort((a, b) => a.sequence - b.sequence);
  }

  private parseMonthToDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }
    if (!/^\d{4}-\d{2}$/.test(value)) {
      return null;
    }
    const [year, month] = value.split('-').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return null;
    }
    return new Date(Date.UTC(year, month - 1, 1));
  }

  private normalizeEtdInput(value?: string | null): { text: string | null; date: Date | null } {
     if (!value) {
       return { text: null, date: null };
     }
     const trimmed = value.trim();
     if (!trimmed) {
       return { text: null, date: null };
     }
     if (/^\d{4}-\d{2}$/.test(trimmed)) {
       return { text: trimmed.slice(0, 10), date: this.parseMonthToDate(trimmed) };
     }
     if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
       const parsed = this.parseFlexibleDate(trimmed);
       return { text: trimmed.slice(0, 10), date: parsed };
     }
     const parsed = new Date(trimmed);
     if (!Number.isNaN(parsed.getTime())) {
       const isoDate = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
       return { text: isoDate.slice(0, 10), date: parsed };
     }
     return { text: trimmed.slice(0, 10), date: null };
   }

  private bookingTempPaymentRowHasData(row: BookingTempPaymentDto): boolean {
    if (!row) return false;
    const s = (v: unknown) => v != null && String(v).trim() !== '';
    const num = (v: unknown) =>
      v != null && String(v).trim() !== '' && Number.isFinite(Number(v));
    return (
      s(row.dueDate) ||
      num(row.ratio) ||
      num(row.amount) ||
      s(row.method) ||
      num(row.exchangeRate) ||
      num(row.krwAmount) ||
      s(row.result) ||
      s(row.notes)
    );
  }

  private async replaceBookingTempPayments(orderId: string, rows: BookingTempPaymentDto[] | null | undefined) {
    const existing = await this.tradeOrderBookingTempPaymentRepository.find({
      where: { order: { id: orderId } as any },
      order: { sequence: 'ASC' },
    });
    const existingBySeq = new Map<number, (typeof existing)[number]>();
    existing.forEach((p) => existingBySeq.set(Number(p.sequence), p));

    const filled = (rows ?? []).filter((r) => this.bookingTempPaymentRowHasData(r)).slice(0, 2);
    const incomingSeqs = new Set<number>();
    const entitiesToSave: (typeof existing)[number][] = [];

    for (let idx = 0; idx < filled.length; idx++) {
      const row = filled[idx];
      const sequence = idx + 1;
      incomingSeqs.add(sequence);

      const dueDate = row.dueDate ? this.parseFlexibleDate(row.dueDate) : null;
      const ratio =
        row.ratio != null && String(row.ratio).trim() !== '' && Number.isFinite(Number(row.ratio))
          ? String(row.ratio)
          : null;
      const amount =
        row.amount != null && String(row.amount).trim() !== '' && Number.isFinite(Number(row.amount))
          ? String(row.amount)
          : null;
      const exchangeRate =
        row.exchangeRate != null &&
        String(row.exchangeRate).trim() !== '' &&
        Number.isFinite(Number(row.exchangeRate))
          ? String(row.exchangeRate)
          : null;
      const krwAmount =
        row.krwAmount != null &&
        String(row.krwAmount).trim() !== '' &&
        Number.isFinite(Number(row.krwAmount))
          ? String(row.krwAmount)
          : null;
      const result = row.result?.trim() ? row.result.trim() : null;
      const notes = row.notes?.trim() ? row.notes.trim() : null;
      const method = row.method?.trim() ? row.method.trim() : null;

      const existingEntity = existingBySeq.get(sequence);
      if (existingEntity) {
        existingEntity.dueDate = dueDate;
        existingEntity.ratio = ratio;
        existingEntity.amount = amount;
        existingEntity.method = method;
        existingEntity.exchangeRate = exchangeRate;
        existingEntity.krwAmount = krwAmount;
        existingEntity.result = result;
        existingEntity.notes = notes;
        entitiesToSave.push(existingEntity);
      } else {
        const ent = this.tradeOrderBookingTempPaymentRepository.create({
          order: { id: orderId } as TradeOrder,
          sequence,
          dueDate,
          ratio,
          amount,
          method,
          exchangeRate,
          krwAmount,
          result,
          notes,
        });
        entitiesToSave.push(ent);
      }
    }

    const toDelete = existing.filter((p) => !incomingSeqs.has(Number(p.sequence)));
    if (toDelete.length > 0) {
      await this.tradeOrderBookingTempPaymentRepository.remove(toDelete);
    }
    if (entitiesToSave.length > 0) {
      await this.tradeOrderBookingTempPaymentRepository.save(entitiesToSave);
    }
  }

  private parseFlexibleDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      return this.parseMonthToDate(trimmed);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T00:00:00.000Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async saveContract(dto: SaveTradeContractDto, userId?: number | null) {
    const {
      tempFilePath,
      originalFileName,
      fileMimeType,
      fileSize,
      contractNumber,
      rawResult,
      notes,
      draftOrders,
      googleDriveFileId,
    } = dto;

    if (!draftOrders?.length) {
      throw new BadRequestException('저장할 선적 스케줄이 없습니다.');
    }

    const sanitizeString = (value: unknown) => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const normalizedOrders = draftOrders.map((order, index) => {
      const normalized = {
        ...order,
        to_contract_no: this.normalizeContractNumber(order.to_contract_no ?? contractNumber ?? ''),
        to_shipment_seq: order.to_shipment_seq ?? index + 1,
        to_export_country: this.normalizeCountry(order.to_export_country ?? null),
        to_product_name: this.normalizeProduct(order.to_product_name ?? null),
        to_exporter: this.normalizeExporter(order.to_exporter ?? null),
        to_quantity:
          order.to_quantity !== undefined && order.to_quantity !== null
            ? Number(order.to_quantity)
            : null,
        to_grade: sanitizeString(order.to_grade),
        to_bk: sanitizeString(order.to_bk),
        to_bl: sanitizeString(order.to_bl),
        to_packing_type: this.normalizePacking(order.to_packing_type ?? null),
        to_currency: this.normalizeCurrency(order.to_currency ?? null),
        to_unit_price:
          order.to_unit_price !== undefined && order.to_unit_price !== null
            ? Number(order.to_unit_price)
            : null,
        to_destination: this.normalizeDestination(order.to_destination ?? null),
        to_etd: order.to_etd ?? null,
      };

      return {
        ...normalized,
        payments: this.normalizePayments((order as any)?.payments ?? null, index + 1),
      };
    });

    const primaryOrder = normalizedOrders[0] ?? null;
    const contractExporter = primaryOrder?.to_exporter ?? null;
    const contractExportCountry = primaryOrder?.to_export_country ?? null;
    const contractProductName = primaryOrder?.to_product_name ?? null;

    const resolvedContractNo =
      this.normalizeContractNumber(contractNumber ?? null) ??
      normalizedOrders[0]?.to_contract_no;

    if (!resolvedContractNo) {
      throw new BadRequestException('계약번호를 확인할 수 없습니다.');
    }

    const duplicatedContract = await this.tradeContractRepository.findOne({
      where: { contractNo: resolvedContractNo },
    });

    if (duplicatedContract) {
      throw new BadRequestException(
        `이미 등록된 계약번호입니다. 기존 계약을 삭제하거나 다른 계약 번호로 저장해 주세요. (계약번호: ${resolvedContractNo})`,
      );
    }

    let movedFile: { fileName: string; finalPath: string; absolutePath: string } | null = null;
    // 구글 드라이브 파일 ID가 없고 tempFilePath가 있으면 로컬 파일로 저장
    if (!dto.googleDriveFileId && tempFilePath) {
      movedFile = await this.moveToFinalLocation(tempFilePath, FINAL_CONTRACT_DIR);
    }

    // 사용자 정보 조회 (userId가 있는 경우)
    let managerUser: User | null = null;
    if (userId) {
      managerUser = await this.userRepository.findOne({ where: { id: userId } });
    }

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        let contract = manager.create(TradeContract, {
          contractNo: resolvedContractNo,
          exporter: contractExporter ?? null,
          exportCountry: contractExportCountry ?? null,
          productName: contractProductName ?? null,
          // 계약서 파일 정보는 TradeContract에 저장 (계약서는 하나이므로)
          contractGoogleDriveFileId: googleDriveFileId ?? null,
          contractFileName: googleDriveFileId ? originalFileName : null,
          status: dto.status || null,
        });

        contract = await manager.save(contract);

        const orderEntities = normalizedOrders.map((order) =>
          manager.create(TradeOrder, {
            contract,
            sequence: order.to_shipment_seq,
            contractNo: order.to_contract_no,
            managerUser: managerUser || null,
            quantity:
              order.to_quantity !== null && order.to_quantity !== undefined
                ? order.to_quantity.toString()
                : null,
            grade: order.to_grade ?? null,
            bk: order.to_bk ?? null,
            bl: order.to_bl ?? null,
            packing: order.to_packing_type ?? null,
            currency: order.to_currency ?? null,
            unitPrice:
              order.to_unit_price !== null && order.to_unit_price !== undefined
                ? order.to_unit_price.toString()
                : null,
            destination: order.to_destination ?? null,
            etdText: order.to_etd ?? null,
            etdDate: this.parseMonthToDate(order.to_etd ?? null),
            rawResult: rawResult ?? null,
            notes: null,
          }),
        );

        const savedOrders = await manager.save(orderEntities);

        const paymentEntities: TradeOrderPayment[] = [];
        normalizedOrders.forEach((order, orderIndex) => {
          const payments = order.payments ?? [];
          if (!payments.length) {
            return;
          }
          const savedOrder = savedOrders[orderIndex];
          payments.forEach((payment) => {
            // krwAmount 계산
            let krwAmountStr: string | null = null;
            const paymentType = payment.paymentType?.trim() || 'REGULAR';
            if (paymentType === 'REGULAR' && payment.amount !== null && payment.amount !== undefined && payment.exchangeRate !== null && payment.exchangeRate !== undefined) {
              // REGULAR: amount * exchangeRate
              const calculatedKrwAmount = payment.amount * payment.exchangeRate;
              krwAmountStr = this.roundNumber(calculatedKrwAmount, 2).toString();
            } else if (paymentType === 'DO_COST' || paymentType === 'CUSTOMS_COST') {
              // DO_COST, CUSTOMS_COST: amount가 원화 금액이므로 그대로 사용
              if (payment.amount !== null && payment.amount !== undefined) {
                krwAmountStr = this.roundNumber(payment.amount, 2).toString();
              }
            }

            paymentEntities.push(
              manager.create(TradeOrderPayment, {
                order: savedOrder,
                sequence: payment.sequence,
                dueDate: payment.dueDate ?? null,
                ratio:
                  payment.ratio !== null && payment.ratio !== undefined
                    ? payment.ratio.toString()
                    : null,
                amount:
                  payment.amount !== null && payment.amount !== undefined
                    ? payment.amount.toString()
                    : null,
                method: payment.method ?? null,
                exchangeRate:
                  payment.exchangeRate !== null && payment.exchangeRate !== undefined
                    ? payment.exchangeRate.toString()
                    : null,
                krwAmount: krwAmountStr,
                result: payment.result ?? null,
                paymentType: payment.paymentType?.trim() || 'REGULAR', // 기본값: REGULAR
                notes: payment.notes ?? null,
                useRatio: payment.useRatio !== undefined ? payment.useRatio : true, // 기본값: true
              }),
            );
          });
        });

        if (paymentEntities.length) {
          await manager.save(paymentEntities);
        }

        let fileRecord: FileEntity | null = null;
        if (dto.googleDriveFileId) {
          // 구글 드라이브 파일 ID를 메타데이터에 저장
          fileRecord = manager.create(FileEntity, {
            module: 'TRADE_CONTRACT',
            type: 'CONTRACT_DOC',
            refId: contract.id,
            path: `google-drive:${dto.googleDriveFileId}`, // 구글 드라이브 파일임을 표시
            originalName: originalFileName,
            contentType: fileMimeType ?? null,
            size: fileSize !== undefined ? String(fileSize) : undefined,
            metadata: {
              contractNo: resolvedContractNo,
              googleDriveFileId: dto.googleDriveFileId,
            },
          });
          fileRecord = await manager.save(fileRecord);
        } else if (movedFile) {
          // 로컬 파일 저장
          fileRecord = manager.create(FileEntity, {
            module: 'TRADE_CONTRACT',
            type: 'CONTRACT_DOC',
            refId: contract.id,
            path: movedFile.finalPath,
            originalName: originalFileName,
            contentType: fileMimeType ?? null,
            size: fileSize !== undefined ? String(fileSize) : undefined,
            metadata: {
              contractNo: resolvedContractNo,
            },
          });
          fileRecord = await manager.save(fileRecord);
        }

        return {
          contract,
          orders: savedOrders,
          file: fileRecord,
        };
      });

      return {
        contractId: result.contract.id,
        contractNo: resolvedContractNo,
        orderCount: result.orders.length,
        fileId: result.file?.id ?? null,
        message: '계약서 스케줄이 저장되었습니다.',
      };
    } catch (error) {
      if (movedFile) {
        try {
          await fs.unlink(movedFile.absolutePath);
        } catch (unlinkError) {
          this.logger.warn(
            `DB 저장 실패 후 파일 삭제에 실패했습니다: ${movedFile.absolutePath}`,
            unlinkError as Error,
          );
        }
      }
      throw error;
    }
  }

  async getTradeOrder(id: string) {
    this.logger.log(`[getTradeOrder] 시작 - id: ${id}`);
    
    let contract: TradeContract | null = null;
    let order: TradeOrder | null = null;

    try {
      // 먼저 TradeOrder로 찾기 시도 (부킹인 경우)
      const tradeOrder = await this.tradeOrderRepository.findOne({
        where: { id },
        relations: [
          'contract',
          'contract.createdBy',
          'managerUser',
          'containers',
          'payments',
          'bookingTempPayments',
          'inbounds',
        ],
      });

      this.logger.log(`[getTradeOrder] TradeOrder 조회 결과 - found: ${!!tradeOrder}`);

      if (tradeOrder) {
        // 부킹(TradeOrder)인 경우
        order = tradeOrder;
        contract = tradeOrder.contract;
        this.logger.log(`[getTradeOrder] TradeOrder 찾음 - orderId: ${tradeOrder.id}, contractId: ${contract.id}, containers: ${tradeOrder.containers?.length || 0}건`);
        this.logger.log(`[getTradeOrder] TradeOrder payments 조회 - payments 존재: ${!!tradeOrder.payments}, payments 길이: ${tradeOrder.payments?.length ?? 0}, payments: ${JSON.stringify((tradeOrder.payments || []).map(p => ({ id: p.id, sequence: p.sequence, notes: p.notes, amount: p.amount })))}`);
      } else {
        // 발주(TradeContract)인 경우
        this.logger.log(`[getTradeOrder] TradeOrder를 찾지 못함, TradeContract 조회 시도 - id: ${id}`);
        contract = await this.tradeContractRepository.findOne({
          where: { id },
          relations: ['createdBy'],
        });
        
        this.logger.log(`[getTradeOrder] TradeContract 조회 결과 - found: ${!!contract}`);
        
        if (!contract) {
          this.logger.error(`[getTradeOrder] TradeOrder와 TradeContract 모두 찾지 못함 - id: ${id}`);
          throw new NotFoundException(`발주 또는 부킹을 찾을 수 없습니다. (ID: ${id})`);
        }
        this.logger.log(`[getTradeOrder] TradeContract 찾음 - contractId: ${contract.id}`);
      }
    } catch (error: any) {
      this.logger.error(`[getTradeOrder] 오류 발생 - id: ${id}, error: ${error?.message || error}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`발주 또는 부킹 조회 중 오류가 발생했습니다. (ID: ${id})`);
    }

    if (!contract) {
      this.logger.error(`[getTradeOrder] contract가 null입니다 - id: ${id}`);
      throw new NotFoundException(`발주 또는 부킹을 찾을 수 없습니다. (ID: ${id})`);
    }

    // listTradeOrders와 동일한 코드 카테고리 사용
    const codeCategories = [
      'EXPORT_COUNTRY',
      'PRODUCT',
      'PACKING_TYPE',
      'CURRENCY',
      'DESTINATION_PORT',
      'EXPORTER',
      'PAYMENT_TERMS',
      'SHIPPING_LINE',
      'TRADE_GRADE',
      'TRADE_ORDER_STATUS',
    ];

    const codes = await this.codeRepository.find({
      where: {
        group: In(codeCategories),
      },
    });

    const codeMap = new Map<string, Map<string, string>>();
    const normalizeKey = (value: string) => value.trim().toUpperCase();

    codes.forEach((code) => {
      if (!code.value) {
        return;
      }
      if (!codeMap.has(code.group)) {
        codeMap.set(code.group, new Map());
      }
      codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
    });

    const getCodeName = (category: string, value?: string | null) => {
      if (!value) {
        return null;
      }
      const map = codeMap.get(category);
      if (!map) {
        return null;
      }
      return map.get(normalizeKey(value)) ?? null;
    };

    const getCurrencyDisplay = (value?: string | null, fallback?: string | null) => {
      if (value && value.trim()) {
        return value.trim();
      }
      if (fallback && fallback.trim()) {
        const mapped = getCodeName('CURRENCY', fallback);
        return mapped ?? fallback.trim();
      }
      return null;
    };

    // listTradeOrders와 동일한 매핑 로직 적용
    const contractId = String(contract.id);
    const contractNo = contract.contractNo ?? null;

    const exportCountryCode = contract.exportCountry ?? null;
    const exportCountryName = getCodeName('EXPORT_COUNTRY', exportCountryCode);

    const productCode = contract.productName ?? null;
    const productName = getCodeName('PRODUCT', productCode) ?? productCode;

    const exporterCode = contract.exporter ?? null;
    const exporterName = getCodeName('EXPORTER', exporterCode);

    const currencyCode = contract.currency ?? null;
    const currencyName = getCurrencyDisplay(null, currencyCode);

    const destinationCode = contract.destination ?? null;
    const destinationName = getCodeName('DESTINATION_PORT', destinationCode);

    const gradeCode = contract.grade ?? null;
    const gradeName = gradeCode && gradeCode.trim()
        ? getCodeName('TRADE_GRADE', gradeCode) ?? gradeCode
        : null;

    const packingCode = contract.packingType ?? null;
    const packingName = getCodeName('PACKING_TYPE', packingCode);

    // managerUser: TradeOrder가 있으면 TradeOrder의 managerUser, 없으면 contract의 createdBy
    const orderManagerUser = order?.managerUser
      ? {
          id: order.managerUser.id,
          name: order.managerUser.name,
          email: order.managerUser.email,
        }
      : null;
    
    const contractManagerUser = contract.createdBy
      ? {
          id: contract.createdBy.id,
          name: contract.createdBy.name,
          email: contract.createdBy.email,
        }
      : null;
    
    const managerUser = orderManagerUser || contractManagerUser;

    // shippingLine: 주문에만 있음 (계약에는 없음)
    const finalShippingLineCode = order?.shippingLine ?? null;
    const finalShippingLineName = finalShippingLineCode
      ? (getCodeName('SHIPPING_LINE', finalShippingLineCode) ?? finalShippingLineCode)
      : null;

    // destination: TradeOrder가 있으면 TradeOrder의 destination, 없으면 contract의 destination
    const orderDestinationCode = order?.destination ?? null;
    const finalDestinationCode = orderDestinationCode || destinationCode;
    const finalDestinationName = orderDestinationCode
      ? getCodeName('DESTINATION_PORT', orderDestinationCode) ?? orderDestinationCode
      : destinationName;

    // 컨테이너 정보 매핑
    const containers = order?.containers?.map((c) => ({
      id: String(c.id),
      containerNo: c.containerNo ?? null,
      product: c.product ?? null,
      tradeGrade: c.tradeGrade ?? null,
      salesGrade: c.salesGrade ?? null,
      packing: c.packingType ?? null,
      packingType: c.packingType ?? null, // 코드 값도 packingType으로 반환 (프론트엔드 호환성)
      currency: c.currency ?? null,
      unitPrice: c.unitPrice ? Number(c.unitPrice) : null,
      weight: c.weight ? Number(c.weight) : null,
      tradeBales: c.tradeBales ? Number(c.tradeBales) : null,
      salesBales: c.salesBales != null && c.salesBales !== '' ? Number(c.salesBales) : (c.tradeBales ? Number(c.tradeBales) : null),
      pendingPurchaseCost: c.pendingPurchaseCost ?? null,
      confirmedPurchaseCost: c.confirmedPurchaseCost ?? null,
      stoCost: c.stoCost ?? null,
      dtCost: c.dtCost ?? null,
      workFee: c.workFee ?? null,
      onsiteWorkFee: c.onsiteWorkFee ?? null,
      sequence: c.sequence ?? null,
      notes: c.notes ?? null,
    })) || [];

    const result: any = {
      id: order ? String(order.id) : contractId, // TradeOrder가 있으면 order.id 사용
      contractId,
      contractNo,
      sequence: order?.sequence ?? 1,
      sequenceSub: order?.sequenceSub ?? 0,
      newOld: contract.newOld ?? null,
      commissionMonth: order?.commissionMonth ?? contract.commissionMonth ?? null,
      commissionDollar: order?.commissionDollar ?? contract.commissionDollar ?? null,
      managerUser,
      orderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
      exportCountryCode,
      exportCountryName,
      exporterCode,
      exporterName,
      productCode,
      productName,
      quota: order?.quota ?? contract.quota ?? null, // 주문별 쿼터 (현물과 동일)
      fumigation: contract.fumigation ?? null,
      spot: order?.spot ?? null, // 현물은 주문 레벨
      customsDuty: contract.customsDuty ?? null,
      shippingLineCode: finalShippingLineCode,
      shippingLineName: finalShippingLineName,
      shippingLine: finalShippingLineCode,
      quantity: order?.quantity ? Number(order.quantity) : (contract.quantity ? Number(contract.quantity) : null),
      grade: gradeName,
      gradeCode,
      bk: order?.bk ?? null,
      bl: order?.bl ?? null,
      packingCode,
      packing: packingName ?? packingCode ?? null,
      packingType: packingCode, // 코드 값도 packingType으로 반환 (프론트엔드 호환성)
      currencyCode,
      currencyName,
      currency: currencyCode,
      unitPrice: contract.unitPrice ? Number(contract.unitPrice) : null,
      totalAmount: null,
      destinationCode: finalDestinationCode,
      destinationName: finalDestinationName,
      destination: finalDestinationCode,
      finalDestination: order?.finalDestination ?? null,
      finalDestinationCode: null,
      finalDestinationName: null,
      finalDestinationArrivalDate: order?.finalDestinationArrivalDate ? this.normalizeDateValue(order.finalDestinationArrivalDate) : null,
      etdText: order?.etdText ?? null,
      etdDate: order?.etdDate ? this.normalizeDateValue(order.etdDate) : null,
      etdApi: order?.etdApiDate ? this.normalizeDateValue(order.etdApiDate) : null,
      etaDate: order?.etaDate ? this.normalizeDateValue(order.etaDate) : null,
      notes: order?.notes ?? contract.notes ?? null,
      salesNotes: order?.salesNotes ?? null,
      bookingTempWeightMt:
        order?.bookingTempWeightMt != null && String(order.bookingTempWeightMt).trim() !== ''
          ? Number(order.bookingTempWeightMt)
          : null,
      bookingTempInvoiceAmount:
        order?.bookingTempInvoiceAmount != null && String(order.bookingTempInvoiceAmount).trim() !== ''
          ? Number(order.bookingTempInvoiceAmount)
          : null,
      invoiceNumber: order?.invoiceNumber ?? null,
      invoiceDate: order?.invoiceDate ? this.normalizeDateValue(order.invoiceDate) : null,
      invoiceCurrency: order?.invoiceCurrency ?? null,
      invoiceCurrencyName: order?.invoiceCurrency ? getCodeName('CURRENCY', order.invoiceCurrency) : null,
      invoiceAmount: order?.invoiceAmount ? Number(order.invoiceAmount) : null,
      invoiceWeight: order?.invoiceWeight ? Number(order.invoiceWeight) : null,
      invoiceFilePath: order?.invoiceFilePath ?? null,
      invoiceFileName: order?.invoiceFileName ?? null,
      invoiceGoogleDriveFileId: order?.invoiceGoogleDriveFileId ?? null,
      contractGoogleDriveFileId: contract.contractGoogleDriveFileId ?? null,
      contractFileName: contract.contractFileName ?? null,
      certificateRequest: order?.certificateRequest ?? null,
      certificateNumber: order?.certificateNumber ?? null,
      // hasOriginalShipment가 없지만 originalShipment가 있으면 자동으로 'Y'로 설정 (기존 데이터 호환성)
      hasOriginalShipment: order?.hasOriginalShipment ?? (order?.originalShipment ? 'Y' : null),
      originalShipment: order?.originalShipment ?? null,
      doGoogleDriveFileId: order?.doGoogleDriveFileId ?? null,
      doFileName: order?.doFileName ?? null,
      customsCertificateGoogleDriveFileId: order?.customsCertificateGoogleDriveFileId ?? null,
      customsCertificateFileName: order?.customsCertificateFileName ?? null,
      customsCertificateGoogleDriveFileId2: order?.customsCertificateGoogleDriveFileId2 ?? null,
      customsCertificateFileName2: order?.customsCertificateFileName2 ?? null,
      customsDate: order?.customsDate ? this.normalizeDateValue(order.customsDate) : null,
      customsScheduledDate: order?.customsScheduledDate ? this.normalizeDateValue(order.customsScheduledDate) : null,
      quarantineDate: order?.quarantineDate ? this.normalizeDateValue(order.quarantineDate) : null,
      // status 필드는 더 이상 사용하지 않음 (tradeStatus로 대체됨)
      tradeStatus: order?.tradeStatus ?? 'BOOKING', // 무역 상태
      tradeStatusName: getCodeName('TRADE_ORDER_STATUS', order?.tradeStatus ?? 'BOOKING') ?? (order?.tradeStatus ?? 'BOOKING'), // 무역 상태 이름
      salesStatus: order?.salesStatus ?? null, // 영업 상태
      financeStatus: order?.financeStatus ?? null, // 재무 상태
      excludeFromLogistics: order?.excludeFromLogistics === true,
      shipBack: order?.shipBack === true, // 쉽백(반송) 여부
      contractStatus: contract.status ?? 'ORDER', // TradeContract의 status (계약 상태)
      totalOrderCount: contract.totalOrderCount ?? null,
      createdAt: order?.createdAt ?? contract.createdAt,
      updatedAt: order?.updatedAt ?? contract.updatedAt,
      payments: (() => {
        const rawPayments = order?.payments;
        this.logger.log(`[getTradeOrder] payments 처리 시작 - orderId: ${order?.id}, rawPayments 존재: ${!!rawPayments}, rawPayments 길이: ${rawPayments?.length ?? 0}`);
        if (rawPayments && rawPayments.length > 0) {
          this.logger.log(`[getTradeOrder] rawPayments 상세: ${JSON.stringify(rawPayments.map(p => ({ id: p.id, sequence: p.sequence, notes: p.notes, amount: p.amount })))}`);
        }
        const paymentsData = rawPayments?.slice().sort((a, b) => a.sequence - b.sequence).map((payment) => ({
          id: payment.id,
          sequence: payment.sequence,
          dueDate: this.normalizeDateValue(payment.dueDate),
          ratio: payment.ratio ? Number(payment.ratio) : null,
          amount: payment.amount ? Number(payment.amount) : null,
          method: payment.method ?? null,
          exchangeRate: payment.exchangeRate ? Number(payment.exchangeRate) : null,
          krwAmount: payment.krwAmount ? Number(payment.krwAmount) : null,
          result: payment.result ?? payment.notes ?? null,
          paymentType: payment.paymentType ?? 'REGULAR', // 결제 유형 (기본값: REGULAR)
          notes: payment.notes ?? null,
          useRatio: payment.useRatio !== undefined ? payment.useRatio : true, // 기본값: true
        })) ?? [];
        this.logger.log(`[getTradeOrder] payments 반환 - orderId: ${order?.id}, paymentsCount: ${paymentsData.length}, payments: ${JSON.stringify(paymentsData.map(p => ({ id: p.id, sequence: p.sequence, notes: p.notes })))}`);
        return paymentsData;
      })(),
      bookingTempPayments: (() => {
        const raw = order?.bookingTempPayments;
        if (!raw?.length) {
          return [];
        }
        return raw
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((p) => ({
            id: String(p.id),
            sequence: p.sequence,
            dueDate: this.normalizeDateValue(p.dueDate),
            ratio: p.ratio != null && p.ratio !== '' ? Number(p.ratio) : null,
            amount: p.amount != null && p.amount !== '' ? Number(p.amount) : null,
            method: p.method ?? null,
            exchangeRate:
              p.exchangeRate != null && p.exchangeRate !== '' ? Number(p.exchangeRate) : null,
            krwAmount: p.krwAmount != null && p.krwAmount !== '' ? Number(p.krwAmount) : null,
            result: p.result ?? null,
            notes: p.notes ?? null,
          }));
      })(),
      containers: containers, // 컨테이너 정보
    };

    // 입고 예정 데이터 조회 (PENDING 상태)
    if (order) {
      const pendingInbound = order.inbounds?.find((inbound) => inbound.status === 'PENDING');
      if (pendingInbound) {
        result.pendingInbound = {
          id: pendingInbound.id,
          warehouse: pendingInbound.warehouse ?? null,
          igodate: pendingInbound.igodate ? this.normalizeDateValue(pendingInbound.igodate) : null,
          quarantineDate: pendingInbound.quarantineDate ? this.normalizeDateValue(pendingInbound.quarantineDate) : null,
          dtDate: pendingInbound.dtDate ? this.normalizeDateValue(pendingInbound.dtDate) : null,
          targetMargin: pendingInbound.targetMargin ? Number(pendingInbound.targetMargin) : null,
          customsFee: pendingInbound.customsFee ? Number(pendingInbound.customsFee) : null,
          firstTierLoadingFee: pendingInbound.firstTierLoadingFee ? Number(pendingInbound.firstTierLoadingFee) : null,
          doCost: pendingInbound.doCost ? Number(pendingInbound.doCost) : null,
          quarantineAgencyFee: pendingInbound.quarantineAgencyFee ? Number(pendingInbound.quarantineAgencyFee) : null,
          customsDuty: pendingInbound.customsDuty ? Number(pendingInbound.customsDuty) : null,
          additionalItem: pendingInbound.additionalItem ? Number(pendingInbound.additionalItem) : null,
          bankFee: pendingInbound.bankFee ? Number(pendingInbound.bankFee) : null,
          quarantineWorkCost: pendingInbound.quarantineWorkCost ? Number(pendingInbound.quarantineWorkCost) : null,
          spot: pendingInbound.spot ? Number(pendingInbound.spot) : null,
          document: pendingInbound.document ? Number(pendingInbound.document) : null,
          igobi: pendingInbound.igobi ? Number(pendingInbound.igobi) : null,
          extractionFee: pendingInbound.extractionFee ? Number(pendingInbound.extractionFee) : null,
          sto: pendingInbound.sto ? Number(pendingInbound.sto) : null,
          fumigationQuarantine: pendingInbound.fumigationQuarantine ? Number(pendingInbound.fumigationQuarantine) : null,
          fee: pendingInbound.fee ? Number(pendingInbound.fee) : null,
          sampleCollection: pendingInbound.sampleCollection ? Number(pendingInbound.sampleCollection) : null,
          quotaCost: pendingInbound.quotaCost ? Number(pendingInbound.quotaCost) : null,
          comparisonExchangeRate: pendingInbound.comparisonExchangeRate ? Number(pendingInbound.comparisonExchangeRate) : null,
          comparisonPurchaseCost: pendingInbound.comparisonPurchaseCost ? Number(pendingInbound.comparisonPurchaseCost) : null,
        };
      } else {
        result.pendingInbound = null;
      }

      // 입고 확정 데이터 조회 (CONFIRMED 상태)
      const confirmedInbound = order.inbounds?.find((inbound) => inbound.status === 'CONFIRMED');
      if (confirmedInbound) {
        result.confirmedInbound = {
          id: confirmedInbound.id,
          warehouse: confirmedInbound.warehouse ?? null,
          igodate: confirmedInbound.igodate ? this.normalizeDateValue(confirmedInbound.igodate) : null,
          quarantineDate: confirmedInbound.quarantineDate ? this.normalizeDateValue(confirmedInbound.quarantineDate) : null,
          dtDate: confirmedInbound.dtDate ? this.normalizeDateValue(confirmedInbound.dtDate) : null,
          targetMargin: confirmedInbound.targetMargin ? Number(confirmedInbound.targetMargin) : null,
          customsFee: confirmedInbound.customsFee ? Number(confirmedInbound.customsFee) : null,
          firstTierLoadingFee: confirmedInbound.firstTierLoadingFee ? Number(confirmedInbound.firstTierLoadingFee) : null,
          doCost: confirmedInbound.doCost ? Number(confirmedInbound.doCost) : null,
          quarantineAgencyFee: confirmedInbound.quarantineAgencyFee ? Number(confirmedInbound.quarantineAgencyFee) : null,
          customsDuty: confirmedInbound.customsDuty ? Number(confirmedInbound.customsDuty) : null,
          additionalItem: confirmedInbound.additionalItem ? Number(confirmedInbound.additionalItem) : null,
          bankFee: confirmedInbound.bankFee ? Number(confirmedInbound.bankFee) : null,
          quarantineWorkCost: confirmedInbound.quarantineWorkCost ? Number(confirmedInbound.quarantineWorkCost) : null,
          spot: confirmedInbound.spot ? Number(confirmedInbound.spot) : null,
          document: confirmedInbound.document ? Number(confirmedInbound.document) : null,
          igobi: confirmedInbound.igobi ? Number(confirmedInbound.igobi) : null,
          extractionFee: confirmedInbound.extractionFee ? Number(confirmedInbound.extractionFee) : null,
          sto: confirmedInbound.sto ? Number(confirmedInbound.sto) : null,
          fumigationQuarantine: confirmedInbound.fumigationQuarantine ? Number(confirmedInbound.fumigationQuarantine) : null,
          fee: confirmedInbound.fee ? Number(confirmedInbound.fee) : null,
          sampleCollection: confirmedInbound.sampleCollection ? Number(confirmedInbound.sampleCollection) : null,
          quotaCost: confirmedInbound.quotaCost ? Number(confirmedInbound.quotaCost) : null,
          dayExchangeRate: confirmedInbound.dayExchangeRate ? Number(confirmedInbound.dayExchangeRate) : null,
          comparisonExchangeRate: confirmedInbound.comparisonExchangeRate ? Number(confirmedInbound.comparisonExchangeRate) : null,
          appliedExchangeRate: confirmedInbound.appliedExchangeRate && 
            typeof confirmedInbound.appliedExchangeRate === 'string' && 
            confirmedInbound.appliedExchangeRate.trim() !== '' 
            ? Number(confirmedInbound.appliedExchangeRate) 
            : (confirmedInbound.appliedExchangeRate != null && typeof confirmedInbound.appliedExchangeRate !== 'string'
                ? Number(confirmedInbound.appliedExchangeRate)
                : null),
          purchaseCost: confirmedInbound.purchaseCost ? Number(confirmedInbound.purchaseCost) : null,
        };
      } else {
        result.confirmedInbound = null;
      }
    } else {
      result.pendingInbound = null;
      result.confirmedInbound = null;
    }

    this.logger.log(`[getTradeOrder] 완료 - ${order ? `orderId: ${order.id}, ` : ''}contractId: ${contract.id}, containers: ${containers.length}건`);
    return result;
  }

  /**
   * 주문의 입고 예정/확정 데이터만 조회 (GET orders/:id/inbound)
   */
  async getTradeOrderInbound(orderId: string) {
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['inbounds'],
    });
    if (!order) {
      throw new NotFoundException(`주문을 찾을 수 없습니다: ${orderId}`);
    }
    const pendingInbound = order.inbounds?.find((i) => i.status === 'PENDING');
    const confirmedInbound = order.inbounds?.find((i) => i.status === 'CONFIRMED');
    const mapPending = (inbound: typeof pendingInbound) => {
      if (!inbound) return null;
      return {
        id: inbound.id,
        warehouse: inbound.warehouse ?? null,
        igodate: inbound.igodate ? this.normalizeDateValue(inbound.igodate) : null,
        quarantineDate: inbound.quarantineDate ? this.normalizeDateValue(inbound.quarantineDate) : null,
        dtDate: inbound.dtDate ? this.normalizeDateValue(inbound.dtDate) : null,
        targetMargin: inbound.targetMargin ? Number(inbound.targetMargin) : null,
        customsFee: inbound.customsFee ? Number(inbound.customsFee) : null,
        firstTierLoadingFee: inbound.firstTierLoadingFee ? Number(inbound.firstTierLoadingFee) : null,
        doCost: inbound.doCost ? Number(inbound.doCost) : null,
        quarantineAgencyFee: inbound.quarantineAgencyFee ? Number(inbound.quarantineAgencyFee) : null,
        customsDuty: inbound.customsDuty ? Number(inbound.customsDuty) : null,
        additionalItem: inbound.additionalItem ? Number(inbound.additionalItem) : null,
        bankFee: inbound.bankFee ? Number(inbound.bankFee) : null,
        quarantineWorkCost: inbound.quarantineWorkCost ? Number(inbound.quarantineWorkCost) : null,
        spot: inbound.spot ? Number(inbound.spot) : null,
        document: inbound.document ? Number(inbound.document) : null,
        igobi: inbound.igobi ? Number(inbound.igobi) : null,
        extractionFee: inbound.extractionFee ? Number(inbound.extractionFee) : null,
        sto: inbound.sto ? Number(inbound.sto) : null,
        fumigationQuarantine: inbound.fumigationQuarantine ? Number(inbound.fumigationQuarantine) : null,
        fee: inbound.fee ? Number(inbound.fee) : null,
        sampleCollection: inbound.sampleCollection ? Number(inbound.sampleCollection) : null,
        quotaCost: inbound.quotaCost ? Number(inbound.quotaCost) : null,
        comparisonExchangeRate: inbound.comparisonExchangeRate ? Number(inbound.comparisonExchangeRate) : null,
        comparisonPurchaseCost: inbound.comparisonPurchaseCost ? Number(inbound.comparisonPurchaseCost) : null,
      };
    };
    const mapConfirmed = (inbound: typeof confirmedInbound) => {
      if (!inbound) return null;
      return {
        id: inbound.id,
        warehouse: inbound.warehouse ?? null,
        igodate: inbound.igodate ? this.normalizeDateValue(inbound.igodate) : null,
        quarantineDate: inbound.quarantineDate ? this.normalizeDateValue(inbound.quarantineDate) : null,
        dtDate: inbound.dtDate ? this.normalizeDateValue(inbound.dtDate) : null,
        targetMargin: inbound.targetMargin ? Number(inbound.targetMargin) : null,
        customsFee: inbound.customsFee ? Number(inbound.customsFee) : null,
        firstTierLoadingFee: inbound.firstTierLoadingFee ? Number(inbound.firstTierLoadingFee) : null,
        doCost: inbound.doCost ? Number(inbound.doCost) : null,
        quarantineAgencyFee: inbound.quarantineAgencyFee ? Number(inbound.quarantineAgencyFee) : null,
        customsDuty: inbound.customsDuty ? Number(inbound.customsDuty) : null,
        additionalItem: inbound.additionalItem ? Number(inbound.additionalItem) : null,
        bankFee: inbound.bankFee ? Number(inbound.bankFee) : null,
        quarantineWorkCost: inbound.quarantineWorkCost ? Number(inbound.quarantineWorkCost) : null,
        spot: inbound.spot ? Number(inbound.spot) : null,
        document: inbound.document ? Number(inbound.document) : null,
        igobi: inbound.igobi ? Number(inbound.igobi) : null,
        extractionFee: inbound.extractionFee ? Number(inbound.extractionFee) : null,
        sto: inbound.sto ? Number(inbound.sto) : null,
        fumigationQuarantine: inbound.fumigationQuarantine ? Number(inbound.fumigationQuarantine) : null,
        fee: inbound.fee ? Number(inbound.fee) : null,
        sampleCollection: inbound.sampleCollection ? Number(inbound.sampleCollection) : null,
        quotaCost: inbound.quotaCost ? Number(inbound.quotaCost) : null,
        dayExchangeRate: inbound.dayExchangeRate ? Number(inbound.dayExchangeRate) : null,
        comparisonExchangeRate: inbound.comparisonExchangeRate ? Number(inbound.comparisonExchangeRate) : null,
        appliedExchangeRate: inbound.appliedExchangeRate && typeof inbound.appliedExchangeRate === 'string' && inbound.appliedExchangeRate.trim() !== ''
          ? Number(inbound.appliedExchangeRate)
          : (inbound.appliedExchangeRate != null && typeof inbound.appliedExchangeRate !== 'string' ? Number(inbound.appliedExchangeRate) : null),
        purchaseCost: inbound.purchaseCost ? Number(inbound.purchaseCost) : null,
      };
    };
    return {
      pendingInbound: mapPending(pendingInbound ?? undefined),
      confirmedInbound: mapConfirmed(confirmedInbound ?? undefined),
    };
  }

  /**
   * 부킹 목록 BK/BL/계약번호/제품명 검색에 매칭되는 주문 ID (listTradeOrders bookingOnly 검색절과 동일).
   * TypeORM `where: [{}, {}]` 빈 OR는 행을 못 가져오는 경우가 있어, 검색만 쓸 때는 ID → find(In) 경로로 우회한다.
   */
  private async findBookingOrderIdsMatchingSearch(term: string): Promise<Set<string>> {
    const pattern = `%${term.trim().replace(/%/g, '\\%')}%`;
    const productCodeRows = await this.codeRepository
      .createQueryBuilder('code')
      .select('code.value')
      .where("code.group = 'PRODUCT'")
      .andWhere('(code.value ILIKE :pattern OR code.name ILIKE :pattern)')
      .setParameter('pattern', pattern)
      .getMany();
    const productCodeValues = productCodeRows
      .map((c) => c.value)
      .filter((v): v is string => v != null && v !== '');
    const weightMatchFragment =
      'EXISTS (SELECT 1 FROM (SELECT c2.co_order_id, CAST(COALESCE(SUM(c2.co_weight::numeric), 0) AS TEXT) AS total FROM tb_container c2 GROUP BY c2.co_order_id) tot WHERE tot.co_order_id = "order"."to_id" AND tot.total ILIKE :pattern)';
    const whereClause =
      productCodeValues.length > 0
        ? `(order.contractNo ILIKE :pattern OR order.bk ILIKE :pattern OR order.bl ILIKE :pattern OR contract.contractNo ILIKE :pattern OR contract.productName ILIKE :pattern OR contract.productName IN (:...productCodeValues) OR ${weightMatchFragment})`
        : `(order.contractNo ILIKE :pattern OR order.bk ILIKE :pattern OR order.bl ILIKE :pattern OR contract.contractNo ILIKE :pattern OR contract.productName ILIKE :pattern OR ${weightMatchFragment})`;
    const matchOrders = await this.tradeOrderRepository
      .createQueryBuilder('order')
      .leftJoin('order.contract', 'contract', 'contract.tc_deleted_at IS NULL')
      .where(whereClause, {
        pattern,
        ...(productCodeValues.length > 0 ? { productCodeValues } : {}),
      })
      .andWhere('order.to_deleted_at IS NULL')
      .select(['order.id'])
      .getMany();
    return new Set(matchOrders.map((o) => o.id));
  }

  async listTradeOrders(userId?: number, contractStatuses?: string[], bookingOnly?: boolean, productNames?: string[], status?: string, salesStatus?: string, financeStatus?: string, certificateRequestFilter?: string, contractNo?: string, tradeStatuses?: string[], dateType?: 'etd' | 'eta' | 'quarantine' | 'customs', dateFrom?: string, dateTo?: string, search?: string, includeOrdersWithAllContainersExcluded?: boolean, includeExcluded?: boolean, exporters?: string[]) {
    const searchTerm = (search?.trim() || contractNo?.trim()) || undefined; // search 우선, 없으면 contractNo (B/K, B/L, 계약번호 검색)
    this.logger.log(`[listTradeOrders] 시작 - userId: ${userId ?? '전체'}, contractStatuses: ${contractStatuses?.join(',') ?? '전체'}, bookingOnly: ${bookingOnly}, status: ${status}, salesStatus: ${salesStatus}, financeStatus: ${financeStatus}, productNames: ${productNames?.join(',') ?? '전체'}, certificateRequestFilter: ${certificateRequestFilter ?? '전체'}, contractNo: ${contractNo ?? '전체'}, search: ${search ?? '-'}, dateType: ${dateType ?? '전체'}, dateFrom: ${dateFrom ?? '-'}, dateTo: ${dateTo ?? '-'}, includeExcluded: ${includeExcluded ?? false}, exporters: ${exporters?.join(',') ?? '전체'}`);
    
    // bookingOnly가 true이면 주문 테이블 기준으로 조회
    if (bookingOnly) {
      this.logger.log(`[listTradeOrders] 부킹 목록 조회 - 주문 테이블 기준`);
      
      // 주문 테이블에서 직접 조회
      const orderFindOptions: any = {
        relations: [
          'contract',
          'contract.createdBy',
          'managerUser',
          'containers',
          'payments',
          'bookingTempPayments',
          'inbounds',
        ],
        order: {
          contract: {
            contractNo: 'ASC',
          },
          sequence: 'ASC',
          sequenceSub: 'ASC',
          createdAt: 'DESC',
        },
      };

      // bk 또는 bl이 있는 주문만 필터링 (계약번호/BK/BL 검색 중일 때는 이 조건 완화)
      const hasContractNoSearch = !!(searchTerm && searchTerm.trim() !== '');
      const hasBookingCondition = [
        { bk: Not(IsNull()) },
        { bl: Not(IsNull()) },
      ];

      // tradeStatus 필터 적용 (물류관리용)
      // tradeStatus만 사용 (기존 status 필드는 사용하지 않음)
      let whereConditions: any[] = [];
      
      // salesStatus가 있으면 tradeStatus 제한을 완화 (영업 상태가 있으면 무역 상태와 무관하게 조회)
      const hasSalesStatusFilter = !!salesStatus;
      
      // 빈 배열이면 아무것도 반환하지 않음 (전체 해제)
      if (tradeStatuses && tradeStatuses.length === 0) {
        return [];
      }
      
      // 계약번호/BK/BL 검색 시: BK/BL 필수 조건 없이 조회 (검색어에 맞는 주문이 나오도록)
      const bookingCondition = hasContractNoSearch ? [{}, {}] : hasBookingCondition; // 검색 시 빈 조건으로 OR만 유지

      if (tradeStatuses && tradeStatuses.length > 0) {
        // tradeStatus가 배열로 전달된 경우 (다중 선택)
        // 각 tradeStatus 값에 대해 OR 조건 생성
        const statusConditions: any[] = [];
        tradeStatuses.forEach((tradeStatus) => {
          statusConditions.push(
            { ...bookingCondition[0], tradeStatus: tradeStatus },
            { ...bookingCondition[1], tradeStatus: tradeStatus },
          );
        });
        whereConditions = statusConditions;
      } else if (status) {
        // tradeStatus가 단일 값인 경우 (하위 호환성)
        whereConditions = [
          { ...bookingCondition[0], tradeStatus: status },
          { ...bookingCondition[1], tradeStatus: status },
        ];
      } else if (hasSalesStatusFilter) {
        // salesStatus가 있으면 tradeStatus 제한 없이 (bk 또는 bl만 있으면 됨)
        whereConditions = [
          { ...bookingCondition[0] },
          { ...bookingCondition[1] },
        ];
      } else {
        // status가 없고 salesStatus도 없으면 모든 상태 반환 (bk 또는 bl만 있으면 됨)
        whereConditions = [
          { ...bookingCondition[0] },
          { ...bookingCondition[1] },
        ];
      }

      // salesStatus 필터 적용 (영업관리용)
      // 입고대기 페이지의 경우: salesStatus가 null이거나 'INBOUND_PENDING'인 경우 모두 포함 (부킹 포함)
      if (salesStatus) {
        if (salesStatus === 'INBOUND_PENDING') {
          // 입고대기: salesStatus가 null이거나 'INBOUND_PENDING'인 경우 모두 포함 (tradeStatus 무관, 부킹 포함)
          const newConditions: any[] = [];
          whereConditions.forEach((condition) => {
            newConditions.push(
              { ...condition, salesStatus: 'INBOUND_PENDING' },
              { ...condition, salesStatus: IsNull() },
            );
          });
          whereConditions = newConditions;
        } else {
          // 다른 영업 상태: 정확히 일치하는 경우만
          whereConditions = whereConditions.map((condition) => ({
            ...condition,
            salesStatus: salesStatus,
          }));
        }
      }

      // financeStatus 필터 적용 (재무관리용)
      if (financeStatus) {
        whereConditions = whereConditions.map((condition) => ({
          ...condition,
          financeStatus: financeStatus,
        }));
      }

      orderFindOptions.where = whereConditions;

      /** 검색 시 BK/BL 조건을 빈 객체로 풀면 `where: [{},{}]` 가 되어 find 결과가 비는 경우가 있음 */
      const onlyEmptyOrBranches =
        hasContractNoSearch &&
        whereConditions.length > 0 &&
        whereConditions.every(
          (c) => c && typeof c === 'object' && Object.keys(c).length === 0,
        );

      // userId 필터 적용
      if (userId !== undefined && userId !== null) {
        if (Array.isArray(orderFindOptions.where)) {
          orderFindOptions.where = orderFindOptions.where.map((condition: any) => ({
            ...condition,
            managerUser: { id: userId },
          }));
        } else {
          orderFindOptions.where = {
            ...orderFindOptions.where,
            managerUser: { id: userId },
          };
        }
      }

      let orders: TradeOrder[];

      if (onlyEmptyOrBranches && searchTerm?.trim()) {
        const idSet = await this.findBookingOrderIdsMatchingSearch(
          searchTerm.trim(),
        );
        this.logger.log(
          `[listTradeOrders] 검색 전용 조회(빈 OR 회피) 매칭 ID ${idSet.size}건`,
        );
        if (idSet.size === 0) {
          orders = [];
        } else {
          const whereIds: Record<string, unknown> = { id: In([...idSet]) };
          if (userId !== undefined && userId !== null) {
            whereIds.managerUser = { id: userId };
          }
          orders = await this.tradeOrderRepository.find({
            where: whereIds as any,
            relations: orderFindOptions.relations,
            order: orderFindOptions.order,
          });
        }
      } else {
        this.logger.log(`[listTradeOrders] 주문 쿼리 실행 - findOptions: ${JSON.stringify(orderFindOptions)}`);
        orders = await this.tradeOrderRepository.find(orderFindOptions);
      }
      // 소프트 삭제 행은 보통 find에서 제외되나, 복합 OR where 등 엣지에서 누락될 수 있어 방어적으로 한 번 더 제거
      const activeOrders = orders.filter((o) => o.deletedAt == null);
      if (activeOrders.length !== orders.length) {
        this.logger.warn(
          `[listTradeOrders] 소프트 삭제된 주문 ${orders.length - activeOrders.length}건을 목록에서 제외했습니다.`,
        );
      }
      this.logger.log(`[listTradeOrders] 조회된 주문 개수: ${activeOrders.length}`);

      // 제품 필터 적용 (주문의 contract를 통해). productNames: 빈 배열이면 결과 없음, 있으면 IN 조건
      let filteredOrders = activeOrders;
      if (productNames !== undefined) {
        if (productNames.length === 0) {
          filteredOrders = [];
          this.logger.log(`[listTradeOrders] 제품 필터(빈 배열) 적용 후 주문 개수: 0`);
        } else {
          const productSet = new Set(productNames);
          filteredOrders = activeOrders.filter((order) => {
            const code = order.contract?.productName?.trim();
            return code != null && code !== '' && productSet.has(code);
          });
          this.logger.log(`[listTradeOrders] 제품 필터 적용 후 주문 개수: ${filteredOrders.length}`);
        }
      }

      // 수출사 필터 (주문의 contract.exporter). 빈 배열이면 선택 안 함 = 결과 없음
      if (exporters !== undefined) {
        if (exporters.length === 0) {
          filteredOrders = [];
          this.logger.log(`[listTradeOrders] 수출사 필터(빈 배열) 적용 후 주문 개수: 0`);
        } else {
          const exporterSet = new Set(exporters);
          filteredOrders = filteredOrders.filter((order) => {
            const code = order.contract?.exporter?.trim();
            return code != null && code !== '' && exporterSet.has(code);
          });
          this.logger.log(`[listTradeOrders] 수출사 필터 적용 후 주문 개수: ${filteredOrders.length}`);
        }
      }

      // 계약번호 / BK / BL / 제품 검색: DB에서 ILIKE로 부분 일치 (계약번호·BK·BL·제품코드·제품명 중 하나라도 맞으면 통과)
      if (searchTerm && searchTerm.trim() !== '' && !onlyEmptyOrBranches) {
        const matchingIds = await this.findBookingOrderIdsMatchingSearch(
          searchTerm.trim(),
        );
        filteredOrders = filteredOrders.filter((o) => matchingIds.has(o.id));
        this.logger.log(`[listTradeOrders] 계약번호/BK/BL/제품 검색(DB) 적용 후 주문 개수: ${filteredOrders.length}`);
      }

      // certificateRequestFilter 필터 적용 (서류 처리 페이지용)
      // 빈 문자열도 체크해야 하므로 조회 후 필터링
      if (certificateRequestFilter && certificateRequestFilter !== '__all__') {
        if (certificateRequestFilter === 'completed') {
          // 필증번호가 있고 빈 문자열이 아닌 것만
          filteredOrders = filteredOrders.filter((order) => {
            return order.certificateNumber && order.certificateNumber.trim() !== '';
          });
          this.logger.log(`[listTradeOrders] 필증번호 완료 필터 적용 후 주문 개수: ${filteredOrders.length}`);
        } else if (certificateRequestFilter === 'pending') {
          // 필증번호가 없거나 빈 문자열인 것만
          filteredOrders = filteredOrders.filter((order) => {
            return !order.certificateNumber || order.certificateNumber.trim() === '';
          });
          this.logger.log(`[listTradeOrders] 필증번호 미완료 필터 적용 후 주문 개수: ${filteredOrders.length}`);
        }
      }

      // bk 또는 bl이 실제로 값이 있는지 확인 (빈 문자열 제외)
      // 계약번호/BK/BL 검색 중일 때는 검색어에 맞는 주문을 보여주기 위해 이 필터 생략
      if (!hasContractNoSearch) {
        filteredOrders = filteredOrders.filter((order) => {
          const hasBk = order.bk && order.bk.trim() !== '';
          const hasBl = order.bl && order.bl.trim() !== '';
          return hasBk || hasBl;
        });
        this.logger.log(`[listTradeOrders] bk/bl 필터 적용 후 주문 개수: ${filteredOrders.length}`);
      }

      // 날짜 기간 필터 적용 (ETD, ETA, 검역일, 통관일)
      if (dateType && (dateFrom || dateTo)) {
        const dateFieldMap = { etd: 'etdDate', eta: 'etaDate', quarantine: 'quarantineDate', customs: 'customsDate' } as const;
        const dateField = dateFieldMap[dateType];
        const fromTime = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
        const toTime = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
        filteredOrders = filteredOrders.filter((order) => {
          const raw = order[dateField];
          if (raw == null) return false;
          const orderTime = (raw instanceof Date ? raw : new Date(raw as string)).getTime();
          if (Number.isNaN(orderTime)) return false;
          if (fromTime != null && orderTime < fromTime) return false;
          if (toTime != null && orderTime > toTime) return false;
          return true;
        });
        this.logger.log(`[listTradeOrders] 날짜 기간 필터(${dateType}) 적용 후 주문 개수: ${filteredOrders.length}`);
      }

      // 물류관리 목록 제외: includeExcluded가 아니면 제외된 주문은 목록에서 빼기
      // 단, 입고관리(salesStatus 있음)에서는 적용하지 않음 - excludeFromLogistics는 물류관리 전용
      if (!salesStatus && !includeExcluded) {
        filteredOrders = filteredOrders.filter((order) => order.excludeFromLogistics !== true);
        this.logger.log(`[listTradeOrders] 물류관리 제외 필터 적용 후 주문 개수: ${filteredOrders.length}`);
      }

      return this.finalizeBookingOrderListForApi(filteredOrders, {
        salesStatus,
        includeOrdersWithAllContainersExcluded:
          includeOrdersWithAllContainersExcluded === true,
      });

    }
    
    // bookingOnly가 false이면 기존 로직 (계약 테이블 기준)
    // 발주 데이터는 계약 테이블에서 가져옴
    const findOptions: any = {
      order: {
          contractNo: 'ASC',
        createdAt: 'DESC',
      },
    };

    // contractStatus 필터 적용 (서버에서 필터링)
    // 여러 상태를 지원하도록 IN 쿼리 사용
    // bookingOnly=false일 때는 계약 테이블의 상태만 체크
    if (contractStatuses && contractStatuses.length > 0) {
      findOptions.where = { status: In(contractStatuses) };
    }

    this.logger.log(`[listTradeOrders] 쿼리 실행 - findOptions: ${JSON.stringify(findOptions)}`);
      const contracts = await this.tradeContractRepository.find({
      ...findOptions,
      relations: ['createdBy', 'orders', 'orders.containers', 'orders.managerUser'],
    });
    this.logger.log(`[listTradeOrders] 계약 개수: ${contracts.length}`);

    const codeCategories = [
      'EXPORT_COUNTRY',
      'PRODUCT',
      'PACKING_TYPE',
      'CURRENCY',
      'DESTINATION_PORT',
      'EXPORTER',
      'PAYMENT_TERMS',
      'SHIPPING_LINE',
      'TRADE_GRADE',
      'TRADE_ORDER_STATUS',
    ];

    const codes = await this.codeRepository.find({
      where: {
        group: In(codeCategories),
      },
    });

    const codeMap = new Map<string, Map<string, string>>();
    const normalizeKey = (value: string) => value.trim().toUpperCase();

    codes.forEach((code) => {
      if (!code.value) {
        return;
      }
      if (!codeMap.has(code.group)) {
        codeMap.set(code.group, new Map());
      }
      codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
    });

    const getCodeName = (category: string, value?: string | null) => {
      if (!value) {
        return null;
      }
      const map = codeMap.get(category);
      if (!map) {
        return null;
      }
      return map.get(normalizeKey(value)) ?? null;
    };

    const getCurrencyDisplay = (value?: string | null, fallback?: string | null) => {
      if (value && value.trim()) {
        return value.trim();
      }
      if (fallback && fallback.trim()) {
        const mapped = getCodeName('CURRENCY', fallback);
        return mapped ?? fallback.trim();
      }
      return null;
    };

    this.logger.log(`[listTradeOrders] 계약 매핑 시작 - contracts 개수: ${contracts.length}`);
    
    const result: any[] = [];
    
    for (const contract of contracts) {
      const contractId = String(contract.id);
      const contractNo = contract.contractNo ?? null;
      const contractStatus = contract.status ?? null;
      
      const exportCountryCode = contract.exportCountry ?? null;
      const productCode = contract.productName ?? null;
      const exporterCode = contract.exporter ?? null;
      // 선사: 주문에만 있음. 발주(ORDER)일 때 첫 주문 값 사용
      const firstOrderForList = contract.status === 'ORDER' && contract.orders?.[0] ? contract.orders[0] : null;
      const shippingLineCode = firstOrderForList?.shippingLine ?? null;
      const shippingLineName = getCodeName('SHIPPING_LINE', shippingLineCode) ?? shippingLineCode ?? null;

      const currencyCode = contract.currency ?? null;
      const resolvedCurrencyName = getCurrencyDisplay(null, currencyCode);
      
      const gradeCode = contract.grade ?? null;
      const gradeLabel = gradeCode && gradeCode.trim()
          ? getCodeName('TRADE_GRADE', gradeCode) ?? gradeCode
          : null;

      const packingCode = contract.packingType ?? null;
      const packingName = getCodeName('PACKING_TYPE', packingCode);
      
      // 계약 테이블의 작성자(등록자) 정보
      const contractManagerUser = contract.createdBy
        ? {
            id: contract.createdBy.id,
            name: contract.createdBy.name,
            email: contract.createdBy.email,
          }
          : null;

      // 계약에 연결된 TradeOrder가 있는 경우
      if (contract.orders && contract.orders.length > 0) {
        // bookingOnly가 true이면 각 TradeOrder를 개별적으로 반환 (부킹 목록용)
        if (bookingOnly) {
          // bk 또는 bl이 있는 TradeOrder만 필터링
          const bookingOrders = contract.orders.filter((order) => {
            const hasBookingInfo = (order.bk && order.bk.trim() !== '') || (order.bl && order.bl.trim() !== '');
            return hasBookingInfo;
          });
          
          // tradeStatus 필터 적용 (bookingOnly일 때, 물류관리용)
          // tradeStatus만 사용 (기존 status 필드는 사용하지 않음)
          let filteredByStatus = bookingOrders;
          if (status) {
            filteredByStatus = bookingOrders.filter((order) => {
              // tradeStatus만 확인
              return order.tradeStatus === status;
            });
          } else {
            // status가 없으면 모든 상태 반환
            filteredByStatus = bookingOrders;
          }

          // salesStatus 필터 적용 (영업관리용)
          // 입고대기 페이지의 경우: salesStatus가 null이거나 'INBOUND_PENDING'인 경우 모두 포함 (부킹 포함)
          if (salesStatus) {
            if (salesStatus === 'INBOUND_PENDING') {
              // 입고대기: salesStatus가 null이거나 'INBOUND_PENDING'인 경우 모두 포함 (tradeStatus 무관, 부킹 포함)
              filteredByStatus = filteredByStatus.filter((order) => {
                return order.salesStatus === 'INBOUND_PENDING' || order.salesStatus === null;
              });
            } else {
              // 다른 영업 상태: 정확히 일치하는 경우만
              filteredByStatus = filteredByStatus.filter((order) => {
                return order.salesStatus === salesStatus;
              });
            }
          }

          // financeStatus 필터 적용 (재무관리용)
          if (financeStatus) {
            filteredByStatus = filteredByStatus.filter((order) => {
              return order.financeStatus === financeStatus;
            });
          }

          // 제품 필터 적용 (백엔드에서 처리). productNames: 빈 배열이면 결과 없음, 있으면 IN 조건
          let filteredBookingOrders = filteredByStatus;
          if (productNames !== undefined) {
            if (productNames.length === 0) {
              filteredBookingOrders = [];
            } else {
              const productSet = new Set(productNames);
              filteredBookingOrders = filteredByStatus.filter((order) => {
                const code = contract.productName?.trim();
                return code != null && code !== '' && productSet.has(code);
              });
            }
          }

          // 각 부킹을 개별적으로 반환
          for (const order of filteredBookingOrders) {
            // getTradeOrder와 동일한 매핑 로직 적용
            const orderManagerUser = order.managerUser
              ? {
                  id: order.managerUser.id,
                  name: order.managerUser.name,
                  email: order.managerUser.email,
                }
              : null;
            const managerUser = orderManagerUser || contractManagerUser;

            const finalShippingLineCode = order.shippingLine ?? null;
            const finalShippingLineName = finalShippingLineCode
              ? (getCodeName('SHIPPING_LINE', finalShippingLineCode) ?? finalShippingLineCode)
              : null;

            const orderDestinationCode = order.destination ?? null;
            const contractDestinationCode = contract.destination ?? null;
            const finalDestinationCode = orderDestinationCode || contractDestinationCode;
            const finalDestinationName = orderDestinationCode
              ? getCodeName('DESTINATION_PORT', orderDestinationCode) ?? orderDestinationCode
              : (getCodeName('DESTINATION_PORT', contractDestinationCode) ?? contractDestinationCode ?? null);

            const containers = order.containers?.map((c) => ({
              id: String(c.id),
              containerNo: c.containerNo ?? null,
              product: c.product ?? null,
              tradeGrade: c.tradeGrade ?? null,
              salesGrade: c.salesGrade ?? null,
              packing: c.packingType ?? null,
              packingType: c.packingType ?? null,
              currency: c.currency ?? null,
              unitPrice: c.unitPrice ? Number(c.unitPrice) : null,
              weight: c.weight ? Number(c.weight) : null,
              tradeBales: c.tradeBales ? Number(c.tradeBales) : null,
              salesBales: c.salesBales != null && c.salesBales !== '' ? Number(c.salesBales) : (c.tradeBales ? Number(c.tradeBales) : null),
              pendingPurchaseCost: c.pendingPurchaseCost ?? null,
              confirmedPurchaseCost: c.confirmedPurchaseCost ?? null,
              sequence: c.sequence ?? null,
              excludeFromInventory: c.excludeFromInventory === true,
              inventoryStatus: c.inventoryStatus ?? null,
            })) || [];

            // 입고 확정/입고 예정/입고대기 목록: 모든 컨테이너가 제외된 BL은 기본에서 숨김 (includeOrdersWithAllContainersExcluded 시 포함)
            if ((salesStatus === 'INBOUND_CONFIRMED' || salesStatus === 'INBOUND_SCHEDULED' || salesStatus === 'INBOUND_PENDING') && !includeOrdersWithAllContainersExcluded && order.containers && order.containers.length > 0) {
              const allExcluded = order.containers.every((c) => c.excludeFromInventory === true);
              if (allExcluded) continue;
            }

            // 입고 예정 데이터 조회 (PENDING 상태)
            const pendingInbound = order.inbounds?.find((inbound) => inbound.status === 'PENDING');
            const pendingInboundData = pendingInbound ? {
              id: pendingInbound.id,
              warehouse: pendingInbound.warehouse ?? null,
              igodate: pendingInbound.igodate ? this.normalizeDateValue(pendingInbound.igodate) : null,
              quarantineDate: pendingInbound.quarantineDate ? this.normalizeDateValue(pendingInbound.quarantineDate) : null,
              dtDate: pendingInbound.dtDate ? this.normalizeDateValue(pendingInbound.dtDate) : null,
              targetMargin: pendingInbound.targetMargin ? Number(pendingInbound.targetMargin) : null,
              customsFee: pendingInbound.customsFee ? Number(pendingInbound.customsFee) : null,
              firstTierLoadingFee: pendingInbound.firstTierLoadingFee ? Number(pendingInbound.firstTierLoadingFee) : null,
              doCost: pendingInbound.doCost ? Number(pendingInbound.doCost) : null,
              quarantineAgencyFee: pendingInbound.quarantineAgencyFee ? Number(pendingInbound.quarantineAgencyFee) : null,
              customsDuty: pendingInbound.customsDuty ? Number(pendingInbound.customsDuty) : null,
              additionalItem: pendingInbound.additionalItem ? Number(pendingInbound.additionalItem) : null,
              bankFee: pendingInbound.bankFee ? Number(pendingInbound.bankFee) : null,
              quarantineWorkCost: pendingInbound.quarantineWorkCost ? Number(pendingInbound.quarantineWorkCost) : null,
              spot: pendingInbound.spot ? Number(pendingInbound.spot) : null,
              document: pendingInbound.document ? Number(pendingInbound.document) : null,
              igobi: pendingInbound.igobi ? Number(pendingInbound.igobi) : null,
              extractionFee: pendingInbound.extractionFee ? Number(pendingInbound.extractionFee) : null,
              sto: pendingInbound.sto ? Number(pendingInbound.sto) : null,
              fumigationQuarantine: pendingInbound.fumigationQuarantine ? Number(pendingInbound.fumigationQuarantine) : null,
              fee: pendingInbound.fee ? Number(pendingInbound.fee) : null,
              sampleCollection: pendingInbound.sampleCollection ? Number(pendingInbound.sampleCollection) : null,
              quotaCost: pendingInbound.quotaCost ? Number(pendingInbound.quotaCost) : null,
              comparisonExchangeRate: pendingInbound.comparisonExchangeRate ? Number(pendingInbound.comparisonExchangeRate) : null,
              comparisonPurchaseCost: pendingInbound.comparisonPurchaseCost ? Number(pendingInbound.comparisonPurchaseCost) : null,
            } : null;

            // 입고 확정 데이터 조회 (CONFIRMED 상태)
            const confirmedInbound = order.inbounds?.find((inbound) => inbound.status === 'CONFIRMED');
            const confirmedInboundData = confirmedInbound ? {
              id: confirmedInbound.id,
              warehouse: confirmedInbound.warehouse ?? null,
              igodate: confirmedInbound.igodate ? this.normalizeDateValue(confirmedInbound.igodate) : null,
              quarantineDate: confirmedInbound.quarantineDate ? this.normalizeDateValue(confirmedInbound.quarantineDate) : null,
              dtDate: confirmedInbound.dtDate ? this.normalizeDateValue(confirmedInbound.dtDate) : null,
              targetMargin: confirmedInbound.targetMargin ? Number(confirmedInbound.targetMargin) : null,
              customsFee: confirmedInbound.customsFee ? Number(confirmedInbound.customsFee) : null,
              firstTierLoadingFee: confirmedInbound.firstTierLoadingFee ? Number(confirmedInbound.firstTierLoadingFee) : null,
              doCost: confirmedInbound.doCost ? Number(confirmedInbound.doCost) : null,
              quarantineAgencyFee: confirmedInbound.quarantineAgencyFee ? Number(confirmedInbound.quarantineAgencyFee) : null,
              customsDuty: confirmedInbound.customsDuty ? Number(confirmedInbound.customsDuty) : null,
              additionalItem: confirmedInbound.additionalItem ? Number(confirmedInbound.additionalItem) : null,
              bankFee: confirmedInbound.bankFee ? Number(confirmedInbound.bankFee) : null,
              quarantineWorkCost: confirmedInbound.quarantineWorkCost ? Number(confirmedInbound.quarantineWorkCost) : null,
              spot: confirmedInbound.spot ? Number(confirmedInbound.spot) : null,
              document: confirmedInbound.document ? Number(confirmedInbound.document) : null,
              igobi: confirmedInbound.igobi ? Number(confirmedInbound.igobi) : null,
              extractionFee: confirmedInbound.extractionFee ? Number(confirmedInbound.extractionFee) : null,
              sto: confirmedInbound.sto ? Number(confirmedInbound.sto) : null,
              fumigationQuarantine: confirmedInbound.fumigationQuarantine ? Number(confirmedInbound.fumigationQuarantine) : null,
              fee: confirmedInbound.fee ? Number(confirmedInbound.fee) : null,
              sampleCollection: confirmedInbound.sampleCollection ? Number(confirmedInbound.sampleCollection) : null,
              quotaCost: confirmedInbound.quotaCost ? Number(confirmedInbound.quotaCost) : null,
              dayExchangeRate: confirmedInbound.dayExchangeRate ? Number(confirmedInbound.dayExchangeRate) : null,
              comparisonExchangeRate: confirmedInbound.comparisonExchangeRate ? Number(confirmedInbound.comparisonExchangeRate) : null,
              appliedExchangeRate: confirmedInbound.appliedExchangeRate && 
                typeof confirmedInbound.appliedExchangeRate === 'string' && 
                confirmedInbound.appliedExchangeRate.trim() !== '' 
                ? Number(confirmedInbound.appliedExchangeRate) 
                : (confirmedInbound.appliedExchangeRate != null && typeof confirmedInbound.appliedExchangeRate !== 'string'
                    ? Number(confirmedInbound.appliedExchangeRate)
                    : null),
              purchaseCost: confirmedInbound.purchaseCost ? Number(confirmedInbound.purchaseCost) : null,
            } : null;

            result.push({
              id: String(order.id),
              contractId,
              contractNo,
              sequence: order.sequence ?? 1,
              sequenceSub: order.sequenceSub ?? 0,
              newOld: contract.newOld ?? null,
              commissionMonth: order.commissionMonth ?? contract.commissionMonth ?? null,
              commissionDollar: order.commissionDollar ?? contract.commissionDollar ?? null,
              managerUser,
              orderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
              exportCountryCode,
              exportCountryName: getCodeName('EXPORT_COUNTRY', exportCountryCode) ?? exportCountryCode ?? null,
              exporterCode,
              exporterName: getCodeName('EXPORTER', exporterCode) ?? exporterCode ?? null,
          productCode,
          productName: getCodeName('PRODUCT', productCode) ?? productCode ?? null,
          quota: order.quota ?? contract.quota ?? null, // 주문별 쿼터 (현물과 동일)
          fumigation: contract.fumigation ?? null,
          spot: order.spot ?? null, // 현물은 주문 레벨
          customsDuty: contract.customsDuty ?? null,
          shippingLineCode: finalShippingLineCode,
              shippingLineName: finalShippingLineName,
              shippingLine: finalShippingLineCode,
              quantity: order.quantity ? Number(order.quantity) : (contract.quantity ? Number(contract.quantity) : null),
              grade: gradeLabel ?? gradeCode ?? null,
              gradeCode,
              bk: order.bk ?? null,
              bl: order.bl ?? null,
              packingCode,
              packing: packingName ?? packingCode ?? null,
              currencyCode,
              currencyName: resolvedCurrencyName,
              currency: currencyCode,
              unitPrice: contract.unitPrice ? Number(contract.unitPrice) : null,
              totalAmount: null,
              destinationCode: finalDestinationCode,
              destinationName: finalDestinationName,
              destination: finalDestinationCode,
              finalDestination: order.finalDestination ?? null,
              finalDestinationCode: null,
              finalDestinationName: null,
              finalDestinationArrivalDate: order.finalDestinationArrivalDate ? this.normalizeDateValue(order.finalDestinationArrivalDate) : null,
              etdText: order.etdText ?? null,
              etdDate: order.etdDate ? this.normalizeDateValue(order.etdDate) : null,
              etdApi: order.etdApiDate ? this.normalizeDateValue(order.etdApiDate) : null,
              etaDate: order.etaDate ? this.normalizeDateValue(order.etaDate) : null,
              notes: order.notes ?? contract.notes ?? null,
              salesNotes: order.salesNotes ?? null,
              invoiceNumber: order.invoiceNumber ?? null,
              invoiceDate: order.invoiceDate ? this.normalizeDateValue(order.invoiceDate) : null,
              invoiceCurrency: order.invoiceCurrency ?? null,
              invoiceCurrencyName: order.invoiceCurrency ? getCodeName('CURRENCY', order.invoiceCurrency) : null,
              invoiceAmount: order.invoiceAmount ? Number(order.invoiceAmount) : null,
              invoiceWeight: order.invoiceWeight ? Number(order.invoiceWeight) : null,
              invoiceFilePath: order.invoiceFilePath ?? null,
              invoiceFileName: order.invoiceFileName ?? null,
              invoiceGoogleDriveFileId: order.invoiceGoogleDriveFileId ?? null,
              contractGoogleDriveFileId: contract.contractGoogleDriveFileId ?? null,
              contractFileName: contract.contractFileName ?? null,
              status: order.status ?? 'BOOKING', // 기존 status 필드 (호환성 유지)
              tradeStatus: order.tradeStatus ?? order.status ?? 'BOOKING', // 무역 상태 (fallback: status)
              tradeStatusName: getCodeName('TRADE_ORDER_STATUS', order.tradeStatus ?? order.status ?? 'BOOKING') ?? (order.tradeStatus ?? order.status ?? 'BOOKING'), // 무역 상태 이름
              salesStatus: order.salesStatus ?? null, // 영업 상태
              financeStatus: order.financeStatus ?? null, // 재무 상태
              excludeFromLogistics: order.excludeFromLogistics === true, // 물류관리 목록 제외 여부
              shipBack: order.shipBack === true, // 쉽백(반송) 여부
              contractStatus: contract.status ?? 'ORDER',
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
              payments: order.payments?.slice().sort((a, b) => a.sequence - b.sequence).map((payment) => ({
                id: payment.id,
                sequence: payment.sequence,
                dueDate: this.normalizeDateValue(payment.dueDate),
                ratio: payment.ratio ? Number(payment.ratio) : null,
                amount: payment.amount ? Number(payment.amount) : null,
                method: payment.method ?? null,
                exchangeRate: payment.exchangeRate ? Number(payment.exchangeRate) : null,
                result: payment.result ?? null,
                paymentType: payment.paymentType ?? 'REGULAR', // 결제 유형 (기본값: REGULAR)
                notes: payment.notes ?? null,
              })) ?? [],
              containers: containers,
              pendingInbound: pendingInboundData,
              confirmedInbound: confirmedInboundData,
            });
          } // for 루프 끝
        } else {
          // 계약 목록에서는 계약 단위로 하나만 반환
          // 부킹 개수 정보만 포함 (부킹 상세 정보는 계약 상세에서 확인)

          result.push({
          id: contractId, // 계약 ID 사용 (계약 목록이므로)
          contractId,
          contractNo,
          sequence: 1, // 계약 목록에서는 sequence 불필요
          orderCount: contract.orders.length, // 부킹(주문) 개수
          quota: contract.quota ?? null,
          fumigation: contract.fumigation ?? null,
          spot: null, // 현물은 주문 레벨이므로 계약 목록에서는 null
          customsDuty: contract.customsDuty ?? null,
          contractGoogleDriveFileId: contract.contractGoogleDriveFileId ?? null,
          contractFileName: contract.contractFileName ?? null,
          exportCountryCode,
          exportCountryName: getCodeName('EXPORT_COUNTRY', exportCountryCode) ?? exportCountryCode ?? null,
          productCode,
          productName: getCodeName('PRODUCT', productCode) ?? productCode ?? null,
          exporterCode,
          exporterName: getCodeName('EXPORTER', exporterCode) ?? exporterCode ?? null,
          shippingLineCode,
          shippingLineName,
          shippingLine: shippingLineName,
          newOld: contract.newOld ?? null,
          commissionMonth: contract.commissionMonth ?? null,
          commissionDollar: contract.commissionDollar ?? null,
          managerUser: contractManagerUser,
          orderDate: this.normalizeDateValue(contract.orderDate),
          quantity: contract.quantity !== null && contract.quantity !== undefined
            ? Number(contract.quantity)
            : null,
          grade: gradeLabel ?? gradeCode ?? null,
          gradeCode,
          bk: null, // 부킹 상세 정보는 계약 상세에서 확인
          bl: null,
          packingCode,
          packing: packingName ?? packingCode ?? null,
          currencyCode,
          currencyName: resolvedCurrencyName,
          unitPrice: contract.unitPrice ? Number(contract.unitPrice) : null,
          destinationCode: contract.destination ?? null,
          destinationName: getCodeName('DESTINATION_PORT', contract.destination) ?? contract.destination ?? null,
          finalDestination: null,
          finalDestinationCode: null,
          finalDestinationName: null,
          finalDestinationArrivalDate: null,
          etdText: null,
          etdDate: null,
          etdApi: null,
          etaDate: null,
          notes: contract.notes ?? null,
          dm: null,
          dt: null,
          cb: null,
          quarantineDate: null,
          customsDate: null,
          certificateRequest: null,
          claim: null,
          bankPickup: null,
          sto: null,
          hasOriginalShipment: null,
          originalShipment: null,
          invoiceNumber: null,
          invoiceDate: null,
          invoiceCurrency: null,
          invoiceCurrencyName: null,
          invoiceAmount: null,
          totalAmount: null,
          invoiceWeight: null,
          invoiceFilePath: null,
          invoiceFileName: null,
          invoiceGoogleDriveFileId: null,
          productImagesFolderId: null,
          productImagesFolderName: null,
          payments: [],
          status: null, // 계약 목록에서는 부킹 상태 불필요
          contractStatus: contract.status ?? 'ORDER', // TradeContract의 status (계약 상태)
            pendingInbound: null,
            confirmedInbound: null,
            inboundDoCost: null,
            inboundCustomsFee: null,
            inboundQuarantineAgencyFee: null,
            inboundCustomsDuty: null,
            inboundSpot: null,
            inboundFumigationQuarantine: null,
            inboundDocument: null,
            inboundIgobi: null,
            inboundExtractionFee: null,
            inboundFirstTierLoadingFee: null,
            inboundFee: null,
            inboundSampleCollection: null,
            inboundQuotaCost: null,
            inboundWarehouse: null,
            inboundIgodate: null,
            inboundQuarantineDate: null,
            inboundDtDate: null,
            inboundDayExchangeRate: null,
            inboundComparisonExchangeRate: null,
            inboundTargetMargin: null,
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
          containers: [], // 계약 목록에서는 컨테이너 정보 불필요 (계약 상세에서 확인)
        });
        } // if (bookingOnly) else 블록 끝
      } else {
        // TradeOrder가 없는 경우 계약 정보만 반환 (발주 페이지용)
        result.push({
          id: contractId, // 계약 ID를 발주 ID로 사용
          contractId,
          contractNo,
          contractStatus,
          sequence: 1,
          quota: contract.quota ?? null,
          fumigation: contract.fumigation ?? null,
          spot: null, // 현물은 주문 레벨이므로 계약 목록에서는 null
          customsDuty: contract.customsDuty ?? null,
          contractGoogleDriveFileId: contract.contractGoogleDriveFileId ?? null,
          contractFileName: contract.contractFileName ?? null,
          exportCountryCode,
          exportCountryName: getCodeName('EXPORT_COUNTRY', exportCountryCode) ?? exportCountryCode ?? null,
          productCode,
          productName: getCodeName('PRODUCT', productCode) ?? productCode ?? null,
          exporterCode,
          exporterName: getCodeName('EXPORTER', exporterCode) ?? exporterCode ?? null,
          shippingLineCode,
          shippingLineName,
          shippingLine: shippingLineName,
          newOld: contract.newOld ?? null,
          commissionMonth: contract.commissionMonth ?? null,
          commissionDollar: contract.commissionDollar ?? null,
          managerUser: contractManagerUser,
          orderDate: this.normalizeDateValue(contract.orderDate),
          quantity: contract.quantity !== null && contract.quantity !== undefined
            ? Number(contract.quantity)
            : null,
          grade: gradeLabel ?? gradeCode ?? null,
          gradeCode,
          bk: null,
          bl: null,
          packingCode,
          packing: packingName ?? packingCode ?? null,
          currencyCode,
          currencyName: resolvedCurrencyName,
          unitPrice: contract.unitPrice ? Number(contract.unitPrice) : null,
          destinationCode: contract.destination ?? null,
          destinationName: getCodeName('DESTINATION_PORT', contract.destination) ?? contract.destination ?? null,
          finalDestination: null,
          finalDestinationCode: null,
          finalDestinationName: null,
          finalDestinationArrivalDate: null,
          etdText: null,
          etdDate: null,
          etaDate: null,
          notes: contract.notes ?? null,
          dm: null,
          dt: null,
          cb: null,
          quarantineDate: null,
          customsDate: null,
          certificateRequest: null,
          claim: null,
          bankPickup: null,
          sto: null,
          hasOriginalShipment: null,
          originalShipment: null,
          invoiceNumber: null,
          invoiceDate: null,
          invoiceCurrency: null,
          invoiceCurrencyName: null,
          invoiceAmount: null,
          totalAmount: null,
          invoiceWeight: null,
          invoiceFilePath: null,
          invoiceFileName: null,
          invoiceGoogleDriveFileId: null,
          productImagesFolderId: null,
          productImagesFolderName: null,
          payments: [],
          status: contract.status ?? 'ORDER',
          pendingInbound: null,
          confirmedInbound: null,
          inboundDoCost: null,
          inboundCustomsFee: null,
          inboundQuarantineAgencyFee: null,
          inboundCustomsDuty: null,
          inboundSpot: null,
          inboundFumigationQuarantine: null,
          inboundDocument: null,
          inboundIgobi: null,
          inboundExtractionFee: null,
          inboundFirstTierLoadingFee: null,
          inboundFee: null,
          inboundSampleCollection: null,
          inboundQuotaCost: null,
          inboundWarehouse: null,
          inboundIgodate: null,
          inboundQuarantineDate: null,
          inboundDtDate: null,
          inboundDayExchangeRate: null,
          inboundComparisonExchangeRate: null,
          inboundTargetMargin: null,
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
          containers: [],
        });
      }
    }
    
    this.logger.log(`[listTradeOrders] 완료 - 반환할 결과 개수: ${result.length}`);
    return result;
  }

  /** 물류관리 엑셀 다운로드 - 필터 적용, 전체 페이지 데이터 */
  async exportLogisticsOrdersToExcel(
    userId?: number,
    contractStatuses?: string[],
    bookingOnly?: boolean,
    productNames?: string[],
    status?: string,
    salesStatus?: string,
    financeStatus?: string,
    certificateRequestFilter?: string,
    contractNo?: string,
    tradeStatuses?: string[],
    dateType?: 'etd' | 'eta' | 'quarantine' | 'customs',
    dateFrom?: string,
    dateTo?: string,
    search?: string,
    includeOrdersWithAllContainersExcluded?: boolean,
    includeExcluded?: boolean,
    exporters?: string[],
  ): Promise<Buffer> {
    this.logger.log(`[exportLogisticsOrdersToExcel] 시작 - 필터 적용, 전체 데이터 조회`);

    const orders = await this.listTradeOrders(
      userId,
      contractStatuses,
      bookingOnly,
      productNames,
      status,
      salesStatus,
      financeStatus,
      certificateRequestFilter,
      contractNo,
      tradeStatuses,
      dateType,
      dateFrom,
      dateTo,
      search,
      includeOrdersWithAllContainersExcluded,
      includeExcluded,
      exporters,
    );

    const formatDateForExcel = (value?: string | null): string => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    };

    const formatOrderSequence = (seq?: number | null, sub?: number | null): string => {
      if (seq == null) return '-';
      const s = sub ?? 0;
      return s > 0 ? `${seq}-${s}` : String(seq);
    };

    const formatPaymentResultForExcel = (result?: string | null): string => {
      if (result == null || String(result).trim() === '') return '미결제';
      const r = String(result).trim().toUpperCase();
      if (r === 'COMPLETED') return '완료';
      if (r === 'PENDING' || r === 'PROCESSING') return '진행중';
      return String(result).trim();
    };

    const formatRatioForExcel = (ratio?: number | null): string => {
      if (ratio == null || Number.isNaN(Number(ratio))) return '-';
      return `${Number(ratio).toFixed(1)}%`;
    };

    const formatAmountForExcel = (amount?: number | null): string => {
      if (amount == null || Number.isNaN(Number(amount))) return '-';
      return Number(amount).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const excelData = orders.map((o) => {
      const containers = o.containers || [];
      const totalBales = containers.reduce((sum, c) => sum + (c.salesBales ?? c.tradeBales ?? 0), 0);
      const totalWeight = containers.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
      const invoiceW = o.invoiceWeight != null ? Number(o.invoiceWeight) : null;
      const weightStr = invoiceW != null && !Number.isNaN(invoiceW)
        ? `${invoiceW.toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} (${totalWeight.toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })})`
        : totalWeight > 0
          ? totalWeight.toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
          : '-';
      const docLabels: string[] = [];
      if (o.invoiceGoogleDriveFileId || o.invoiceFilePath) docLabels.push('송장:있음');
      else docLabels.push('송장:없음');
      if (o.doGoogleDriveFileId) docLabels.push('DO:있음');
      else docLabels.push('DO:없음');
      if (o.customsCertificateGoogleDriveFileId || o.customsCertificateGoogleDriveFileId2) {
        docLabels.push(
          o.customsCertificateGoogleDriveFileId && o.customsCertificateGoogleDriveFileId2
            ? '면장:2건'
            : '면장:있음',
        );
      } else docLabels.push('면장:없음');

      const payments = o.payments || [];
      const regularPayments = payments
        .filter((p) => p.paymentType === 'REGULAR' || !p.paymentType)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      const productCost1 = regularPayments[0];
      const productCost2 = regularPayments[1];

      const isBooking = String(o.tradeStatus || '').toUpperCase() === 'BOOKING';
      const tempPaymentsRaw = (o as { bookingTempPayments?: Array<Record<string, unknown>> }).bookingTempPayments;
      const tempPayments =
        isBooking && Array.isArray(tempPaymentsRaw) && tempPaymentsRaw.length > 0
          ? [...tempPaymentsRaw].sort(
              (a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0),
            )
          : [];
      const tempCost1 = tempPayments[0];
      const tempCost2 = tempPayments[1];

      return {
        '상태': o.tradeStatusName || o.tradeStatus || '-',
        '발주일': formatDateForExcel(o.orderDate),
        '계약번호': o.contractNo || '-',
        '순번': formatOrderSequence(o.sequence, o.sequenceSub),
        '상품': o.productName || '-',
        '등급': o.grade || '-',
        '컨테이너 수': containers.length > 0 ? containers.length : '-',
        'BK': o.bk || '-',
        'BL': o.bl || '-',
        'ETD': formatDateForExcel(o.etdDate),
        'ETA': formatDateForExcel(o.etaDate),
        '검역일': formatDateForExcel(o.quarantineDate),
        '통관예정일': formatDateForExcel(o.customsScheduledDate),
        '통관일': formatDateForExcel(o.customsDate),
        '문서': docLabels.join(' '),
        '수출국': o.exportCountryName || '-',
        '수출사': o.exporterName || '-',
        '선사': o.shippingLineName || '-',
        '베일': totalBales > 0 ? totalBales.toLocaleString('ko-KR') : '-',
        '중량': weightStr,
        '필증신청': o.certificateNumber || '-',
        '원본발송': formatDateForExcel(o.originalShipment),
        '상품비용1_결제예정일': productCost1 ? formatDateForExcel(productCost1.dueDate ?? null) : '-',
        '상품비용1_비율': productCost1 ? formatRatioForExcel(productCost1.ratio ?? null) : '-',
        '상품비용1_송장금액': productCost1 ? formatAmountForExcel(productCost1.amount ?? null) : '-',
        '상품비용1_TT결과': productCost1 ? formatPaymentResultForExcel(productCost1.result ?? null) : '-',
        '상품비용2_결제예정일': productCost2 ? formatDateForExcel(productCost2.dueDate ?? null) : '-',
        '상품비용2_비율': productCost2 ? formatRatioForExcel(productCost2.ratio ?? null) : '-',
        '상품비용2_송장금액': productCost2 ? formatAmountForExcel(productCost2.amount ?? null) : '-',
        '상품비용2_TT결과': productCost2 ? formatPaymentResultForExcel(productCost2.result ?? null) : '-',
        '임시상품비용1_결제예정일': tempCost1 ? formatDateForExcel((tempCost1.dueDate as string | null) ?? null) : '-',
        '임시상품비용1_비율': tempCost1 ? formatRatioForExcel((tempCost1.ratio as number | null) ?? null) : '-',
        '임시상품비용1_송장금액': tempCost1 ? formatAmountForExcel((tempCost1.amount as number | null) ?? null) : '-',
        '임시상품비용1_TT결과': tempCost1 ? formatPaymentResultForExcel((tempCost1.result as string | null) ?? null) : '-',
        '임시상품비용2_결제예정일': tempCost2 ? formatDateForExcel((tempCost2.dueDate as string | null) ?? null) : '-',
        '임시상품비용2_비율': tempCost2 ? formatRatioForExcel((tempCost2.ratio as number | null) ?? null) : '-',
        '임시상품비용2_송장금액': tempCost2 ? formatAmountForExcel((tempCost2.amount as number | null) ?? null) : '-',
        '임시상품비용2_TT결과': tempCost2 ? formatPaymentResultForExcel((tempCost2.result as string | null) ?? null) : '-',
        '등록자': o.managerUser?.name || '-',
        '비고': o.notes || '-',
        '도착항': o.destinationName || '-',
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
      { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 14 },
      { wch: 12 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      { wch: 14 }, { wch: 30 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, '물류관리');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    this.logger.log(`[exportLogisticsOrdersToExcel] 완료 - 총 ${orders.length}개 데이터`);
    return buffer;
  }

  async getLogisticsStatusOverview(productName?: string) {
    this.logger.log(`[getLogisticsStatusOverview] 시작 - productName: ${productName ?? '전체'}`);
    
    // 코드 마스터 조회 (EXPORTER, PRODUCT)
    const codeCategories = ['EXPORTER', 'PRODUCT'];
    const codes = await this.codeRepository.find({
      where: {
        group: In(codeCategories),
      },
    });

    const codeMap = new Map<string, Map<string, string>>();
    const normalizeKey = (value: string) => value.trim().toUpperCase();

    codes.forEach((code) => {
      if (!code.value) {
        return;
      }
      if (!codeMap.has(code.group)) {
        codeMap.set(code.group, new Map());
      }
      codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
    });

    const getCodeName = (category: string, value?: string | null) => {
      if (!value) {
        return null;
      }
      const map = codeMap.get(category);
      if (!map) {
        return null;
      }
      return map.get(normalizeKey(value)) ?? null;
    };
    
    // 모든 부킹 주문 조회 (bk 또는 bl이 있는 주문)
    const orders = await this.tradeOrderRepository.find({
      where: [
        { bk: Not(IsNull()) },
        { bl: Not(IsNull()) },
      ],
      relations: ['contract'],
      order: {
        contract: {
          contractNo: 'ASC',
        },
        sequence: 'ASC',
        sequenceSub: 'ASC',
      },
    });

    // 제품 필터 적용
    let filteredOrders = orders;
    if (productName && productName.trim() !== '') {
      filteredOrders = orders.filter((order) => {
        return order.contract?.productName === productName.trim();
      });
    }

    // 계약번호별로 그룹화
    const contractMap = new Map<string, {
      contractId: string;
      contractNo: string;
      productName?: string | null;
      exporterName?: string | null;
      statusCounts: Record<string, number>;
      totalOrders: number;
      createdAt: Date;
    }>();

    filteredOrders.forEach((order) => {
      const contract = order.contract;
      if (!contract) {
        return;
      }

      const contractNo = contract.contractNo ?? '';
      const contractId = String(contract.id);

      if (!contractMap.has(contractNo)) {
        contractMap.set(contractNo, {
          contractId,
          contractNo,
          productName: getCodeName('PRODUCT', contract.productName) ?? contract.productName ?? null,
          exporterName: getCodeName('EXPORTER', contract.exporter) ?? contract.exporter ?? null,
          statusCounts: {
            BOOKING: 0,
            DOCUMENTS: 0,
            DO: 0,
            CUSTOMS: 0,
            ARRIVED: 0,
            QUARANTINE: 0,
            COMPLETED: 0,
          },
          totalOrders: 0,
          createdAt: contract.createdAt,
        });
      }

      const contractData = contractMap.get(contractNo)!;
      const tradeStatus = order.tradeStatus || order.status || 'BOOKING';
      const statusKey = tradeStatus.toUpperCase();

      // 상태별 개수 증가
      if (contractData.statusCounts.hasOwnProperty(statusKey)) {
        contractData.statusCounts[statusKey]++;
      } else {
        // 알 수 없는 상태는 기타로 처리하거나 무시
        contractData.statusCounts[statusKey] = 1;
      }
      contractData.totalOrders++;
    });

    // Map을 배열로 변환
    const result = Array.from(contractMap.values()).map((data) => ({
      contractId: data.contractId,
      contractNo: data.contractNo,
      productName: data.productName,
      exporterName: data.exporterName,
      statusCounts: data.statusCounts,
      totalOrders: data.totalOrders,
      createdAt: data.createdAt,
    }));

    this.logger.log(`[getLogisticsStatusOverview] 완료 - 계약 개수: ${result.length}`);
    return result;
  }

  async listManagers() {
    // 무역팀 역할 코드
    // 역할 관리 페이지에서 "무역팀" 역할을 생성하고 코드를 'ROLE_TRADE'로 설정해야 합니다
    const TRADE_ROLE_CODE = 'ROLE_TRADE';

    // 무역팀 역할을 가진 사용자 중에서, 스케줄에 실제로 할당된 담당자만 조회
    // 이 방법이 가장 효율적: 스케줄 데이터가 많아도 역할 필터링으로 사용자 수가 적고, DISTINCT도 빠름
    const orderManagers = await this.tradeOrderRepository
      .createQueryBuilder('order')
      .select('DISTINCT user.id', 'userId')
      .innerJoin('order.managerUser', 'user')
      .innerJoin('user.roles', 'role')
      .where('order.managerUser IS NOT NULL')
      .andWhere('order.to_deleted_at IS NULL')
      .andWhere('role.code = :roleCode', { roleCode: TRADE_ROLE_CODE })
      .andWhere('role.isActive = :roleActive', { roleActive: true })
      .andWhere('user.isActive = :isActive', { isActive: true })
      .getRawMany();

    const userIds = orderManagers
      .map((row) => row.userId)
      .filter((id): id is number => id !== null && id !== undefined);

    if (userIds.length === 0) {
      return [];
    }

    // 사용자 정보 조회 (이미 역할 필터링이 되어 있어서 적은 수만 조회)
    const users = await this.userRepository.find({
      where: userIds.map((id) => ({ id })),
      select: ['id', 'name', 'email'],
      relations: ['roles'], // 역할 정보도 함께 가져옴 (필요시)
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name || user.email || '',
      email: user.email || '',
    }));
  }

  /**
   * 물류 BK/BL 점검: 동일 값(공백 제거·대문자 기준)으로 여러 발주가 묶이거나,
   * 한 값이 어떤 건의 BK이면서 다른 건의 BL인 경우를 집계합니다.
   */
  async getDuplicateBkBlReport(): Promise<{
    duplicateBkGroups: Array<{
      normalizedValue: string;
      orders: Array<{
        id: string;
        contractNo: string | null;
        sequence: number;
        sequenceSub: number;
        bk: string | null;
        bl: string | null;
        tradeStatus: string | null;
      }>;
    }>;
    duplicateBlGroups: Array<{
      normalizedValue: string;
      orders: Array<{
        id: string;
        contractNo: string | null;
        sequence: number;
        sequenceSub: number;
        bk: string | null;
        bl: string | null;
        tradeStatus: string | null;
      }>;
    }>;
    crossFieldGroups: Array<{
      normalizedValue: string;
      asBkOrders: Array<{
        id: string;
        contractNo: string | null;
        sequence: number;
        sequenceSub: number;
        bk: string | null;
        bl: string | null;
        tradeStatus: string | null;
      }>;
      asBlOrders: Array<{
        id: string;
        contractNo: string | null;
        sequence: number;
        sequenceSub: number;
        bk: string | null;
        bl: string | null;
        tradeStatus: string | null;
      }>;
    }>;
    scannedOrderCount: number;
  }> {
    const norm = (s: string | null | undefined): string => {
      const t = (s ?? '').trim();
      return t.length === 0 ? '' : t.toUpperCase();
    };

    type ReportRow = {
      id: string;
      contractNo: string | null;
      sequence: number;
      sequenceSub: number;
      bk: string | null;
      bl: string | null;
      tradeStatus: string | null;
    };

    const orders = await this.tradeOrderRepository.find({
      relations: ['contract'],
      order: { id: 'DESC' },
    });

    const toRow = (o: TradeOrder): ReportRow => ({
      id: String(o.id),
      contractNo: o.contract?.contractNo ?? null,
      sequence: o.sequence,
      sequenceSub: o.sequenceSub ?? 0,
      bk: o.bk ?? null,
      bl: o.bl ?? null,
      tradeStatus: o.tradeStatus ?? null,
    });

    const bkMap = new Map<string, ReportRow[]>();
    const blMap = new Map<string, ReportRow[]>();

    for (const o of orders) {
      const row = toRow(o);
      const nbk = norm(row.bk);
      const nbl = norm(row.bl);
      if (nbk) {
        if (!bkMap.has(nbk)) bkMap.set(nbk, []);
        bkMap.get(nbk)!.push(row);
      }
      if (nbl) {
        if (!blMap.has(nbl)) blMap.set(nbl, []);
        blMap.get(nbl)!.push(row);
      }
    }

    const sortByNorm = (a: { normalizedValue: string }, b: { normalizedValue: string }) =>
      a.normalizedValue.localeCompare(b.normalizedValue, 'en');

    const duplicateBkGroups = [...bkMap.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([normalizedValue, list]) => ({ normalizedValue, orders: list }))
      .sort(sortByNorm);

    const duplicateBlGroups = [...blMap.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([normalizedValue, list]) => ({ normalizedValue, orders: list }))
      .sort(sortByNorm);

    const crossKeys = [...bkMap.keys()].filter((k) => blMap.has(k));
    const crossFieldGroups = crossKeys
      .map((normalizedValue) => ({
        normalizedValue,
        asBkOrders: [...(bkMap.get(normalizedValue) ?? [])],
        asBlOrders: [...(blMap.get(normalizedValue) ?? [])],
      }))
      .sort(sortByNorm);

    this.logger.log(
      `[getDuplicateBkBlReport] 스캔 ${orders.length}건, BK중복 그룹 ${duplicateBkGroups.length}, BL중복 ${duplicateBlGroups.length}, BK·BL교차 ${crossFieldGroups.length}`,
    );

    return {
      duplicateBkGroups,
      duplicateBlGroups,
      crossFieldGroups,
      scannedOrderCount: orders.length,
    };
  }

  /**
   * 날짜를 YYYY-MM-DD 형식의 문자열로 변환하는 헬퍼 함수
   */
  private formatDate(date: any): string | null {
    if (!date) return null;
    
    try {
      if (date instanceof Date) {
        return date.toISOString().split('T')[0];
      }
      if (typeof date === 'string') {
        // 이미 YYYY-MM-DD 형식이거나 ISO 형식인 경우
        if (date.includes('T')) {
          return date.split('T')[0];
        }
        // YYYY-MM-DD 형식인 경우 그대로 반환
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
        // 다른 형식인 경우 Date로 변환 시도
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }
      // 숫자 타임스탬프인 경우
      if (typeof date === 'number') {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }
      // 그 외의 경우 Date 생성자로 시도
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch (error) {
      this.logger.warn(`[formatDate] 날짜 변환 실패: ${date}, 에러: ${error}`);
    }
    
    return null;
  }

  /**
   * 주간재고현황·외부 API confirmed 전용.
   * 대시보드와 외부 API가 동일한 결과를 보장하기 위해 단일 코드 경로 사용.
   * 판매예약 시트(그리드)는 `loadGridSheetReservationTotalsByBlProduct` — 상태 `예약등록`만 집계.
   * 주간재고현황: **재고 목록 제외** 컨(`excludeFromInventory`)만 빼고 나머지는 필터하지 않음(`includeExcluded: false`, `forDashboardDisplay: false`).
   */
  async getConfirmedInventoryForDashboard(): Promise<any[]> {
    return this.listContainers(
      'CONFIRMED',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      false,
      undefined,
      true,
    );
  }

  /**
   * 판매 대시보드「통관 전 재고」탭 전용.
   * 주간 재고와 동일: `includeSheetReservations: true`, 시트 그리드는 `예약등록`(및 코드마스터 동일 표시명) 행만 재고 반영.
   */
  async getInboundScheduledInventoryForDashboard(): Promise<any[]> {
    return this.listContainers(
      'INBOUND_SCHEDULED',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      false,
      undefined,
      true,
    );
  }

  /**
   * 판매관리(tb_sales_reservation) 요청 수량만 해석. (판매예약 시트 그리드 행은 별도 테이블·컨 단위이므로 여기서 다루지 않음.)
   * - MT/TON/T → 중량(톤)
   * - BALE·null·그 외 → 베일 수 (컨테이너 수로 해석하지 않음)
   */
  private parseSalesMgmtReservationQty(r: SalesReservation): { bales: number; weight: number } {
    const raw = r.requestedQty != null && String(r.requestedQty).trim() !== '' ? Number(r.requestedQty) : 0;
    if (!Number.isFinite(raw) || raw <= 0) {
      return { bales: 0, weight: 0 };
    }
    const unit = (r.qtyUnit ?? '').trim().toUpperCase();
    if (unit === 'MT' || unit === 'TON' || unit === 'T') {
      return { bales: 0, weight: raw };
    }
    return { bales: raw, weight: 0 };
  }

  /** BL 비교용(시트·발주 동일 규칙) */
  private normalizeBlForSheetMatch(s: string | null | undefined): string {
    return (s ?? '').trim().toUpperCase();
  }

  /**
   * 판매예약 시트 요청수량: 컨테이너 단위(소수 가능, 예: 0.8컨).
   * UI·차량분류 자동입력과 동일 개념. 재고 차감 시 컨당 적재량으로 베일/중량 환산함.
   */
  private parseGridSheetRowRequestedContainerUnits(raw: string | null | undefined): number {
    const t = raw != null ? String(raw).trim().replace(/,/g, '') : '';
    if (t === '') {
      return 0;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) {
      return 0;
    }
    return n;
  }

  /**
   * BL|상품별 시트 요청 "컨" 합계를 매칭 컨테이너에 베일(또는 중량)로 분배.
   * 컨 i: (R × cap_i) / N  (R=합계 컨 수, cap_i=해당 컨 베일 또는 중량, N=매칭 컨 대수)
   * → 총 환산량 R × (Σcap/N) = 컨 R개분을 컨별 크기에 비례 분배.
   */
  private computeGridSheetReservationDistribution(
    matchedContainers: TradeContainer[],
    containerUnits: number,
  ): { totalBales: number; totalWeight: number; perContainer: Array<{ id: string; bales: number; weight: number }> } {
    const perContainer: Array<{ id: string; bales: number; weight: number }> = [];
    const R = containerUnits;
    if (!Number.isFinite(R) || R <= 0 || matchedContainers.length === 0) {
      return { totalBales: 0, totalWeight: 0, perContainer };
    }
    const n = matchedContainers.length;
    let denom = 0;
    const caps: number[] = [];
    const useBales: boolean[] = [];
    for (const c of matchedContainers) {
      const b = this.getEffectiveSalesBales(c);
      const w = c.weight ? Number(c.weight) : 0;
      const ub = b > 0;
      const cap = ub ? b : w;
      caps.push(cap);
      useBales.push(ub);
      denom += cap;
    }

    if (denom <= 0) {
      const each = R / n;
      let totalBales = 0;
      for (const c of matchedContainers) {
        const id = String(c.id);
        perContainer.push({ id, bales: each, weight: 0 });
        totalBales += each;
      }
      return { totalBales, totalWeight: 0, perContainer };
    }

    let totalBales = 0;
    let totalWeight = 0;
    for (let i = 0; i < matchedContainers.length; i++) {
      const c = matchedContainers[i]!;
      const cap = caps[i]!;
      const ub = useBales[i]!;
      const amt = (R * cap) / n;
      const id = String(c.id);
      if (ub) {
        perContainer.push({ id, bales: amt, weight: 0 });
        totalBales += amt;
      } else {
        perContainer.push({ id, bales: 0, weight: amt });
        totalWeight += amt;
      }
    }
    return { totalBales, totalWeight, perContainer };
  }

  /**
   * 판매관리 예약(베일 또는 톤)을 컨테이너 단위 R로 바꾼 뒤, 그리드와 동일한 `computeGridSheetReservationDistribution`으로 컨별 베일·중량에 나눔.
   * - 발주 컨이 모두 베일 기준이면 R = (총베일 × n) / Σcap → 시트(컨) 파이프라인과 동일 식.
   * - 모두 중량 기준이면 동일하게 톤 합계로 R 산출.
   * - 베일/중량 컨이 섞이거나 한 행에 베일·톤이 동시에 있으면 기존처럼 cap 비율로만 배분(레거시).
   */
  private distributeSalesMgmtReservationToContainers(
    orderContainers: TradeContainer[],
    pq: { bales: number; weight: number },
  ): Array<{ id: string; bales: number; weight: number }> {
    const n = orderContainers.length;
    if (n === 0 || (pq.bales <= 0 && pq.weight <= 0)) {
      return [];
    }

    const allBalesContainers = orderContainers.every((c) => this.getEffectiveSalesBales(c) > 0);
    const allWeightContainers = orderContainers.every((c) => {
      const b = this.getEffectiveSalesBales(c);
      const w = c.weight ? Number(c.weight) : 0;
      return b <= 0 && w > 0;
    });

    if (pq.bales > 0 && pq.weight <= 0 && allBalesContainers) {
      let sumCap = 0;
      for (const c of orderContainers) {
        sumCap += this.getEffectiveSalesBales(c);
      }
      if (sumCap <= 0) {
        const each = pq.bales / n;
        return orderContainers.map((c) => ({ id: String(c.id), bales: each, weight: 0 }));
      }
      const R = (pq.bales * n) / sumCap;
      return this.computeGridSheetReservationDistribution(orderContainers, R).perContainer;
    }

    if (pq.weight > 0 && pq.bales <= 0 && allWeightContainers) {
      let sumCap = 0;
      for (const c of orderContainers) {
        sumCap += c.weight ? Number(c.weight) : 0;
      }
      if (sumCap <= 0) {
        const each = pq.weight / n;
        return orderContainers.map((c) => ({ id: String(c.id), bales: 0, weight: each }));
      }
      const R = (pq.weight * n) / sumCap;
      return this.computeGridSheetReservationDistribution(orderContainers, R).perContainer;
    }

    let denom = 0;
    const caps: number[] = [];
    for (const c of orderContainers) {
      const b = this.getEffectiveSalesBales(c);
      const w = c.weight ? Number(c.weight) : 0;
      const cap = b > 0 ? b : w;
      caps.push(cap);
      denom += cap;
    }
    if (denom <= 0) {
      return orderContainers.map((c) => ({
        id: String(c.id),
        bales: pq.bales / n,
        weight: pq.weight / n,
      }));
    }
    return orderContainers.map((c, i) => {
      const share = caps[i]! / denom;
      return { id: String(c.id), bales: pq.bales * share, weight: pq.weight * share };
    });
  }

  /**
   * 재고 차감에 포함할 시트 상태 저장값 (셀에 저장되는 code value 또는 한글 기본값).
   * tb_code SALES_RESERVATION_SHEET_STATUS 에서 표시명이 `예약등록`인 항목의 value 도 허용.
   */
  private async getSheetRowStatusesEligibleForInventoryDeduction(): Promise<Set<string>> {
    const allowed = new Set<string>([SHEET_STATUS_INVENTORY_DEDUCTION_LABEL]);
    const codes = await this.codeRepository.find({
      where: { group: 'SALES_RESERVATION_SHEET_STATUS' },
    });
    for (const c of codes) {
      const name = (c.name ?? '').trim();
      if (name !== SHEET_STATUS_INVENTORY_DEDUCTION_LABEL) {
        continue;
      }
      const v = (c.value ?? '').trim();
      if (v) {
        allowed.add(v);
      }
      allowed.add(name);
    }
    return allowed;
  }

  /** 시트 행을 BL|상품코드(contract.productName과 동일한 코드값)별 컨 단위로 합산 */
  private async loadGridSheetReservationTotalsByBlProduct(): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const statusOk = await this.getSheetRowStatusesEligibleForInventoryDeduction();
    const rows = await this.salesReservationSheetRowRepository.find({
      where: { sheetId: PRODUCT_RESERVATIONS_GRID_SHEET_ID },
    });
    for (const r of rows) {
      const st = (r.status ?? '').trim();
      if (!st || !statusOk.has(st)) {
        continue;
      }
      const bl = this.normalizeBlForSheetMatch(r.bl);
      const pc = (r.productCode ?? '').trim();
      if (!bl || !pc) {
        continue;
      }
      const u = this.parseGridSheetRowRequestedContainerUnits(r.requestedQty);
      if (u <= 0) {
        continue;
      }
      const k = `${bl}|${pc}`;
      out.set(k, (out.get(k) ?? 0) + u);
    }
    return out;
  }

  /**
   * 판매관리(tb_sales_reservation) ACTIVE만 발주별 베일·톤 합산(컨 비율 분배 없음).
   */
  private async loadTbSalesMgmtReservationTotalsByOrder(
    orders: TradeOrder[],
  ): Promise<Map<string, { bales: number; weight: number }>> {
    const out = new Map<string, { bales: number; weight: number }>();
    if (!orders.length) {
      return out;
    }

    const orderIds = orders.map((o) => String(o.id));
    const orderIdSet = new Set(orderIds);
    const containerToOrderId = new Map<string, string>();
    for (const o of orders) {
      const oid = String(o.id);
      out.set(oid, { bales: 0, weight: 0 });
      for (const c of o.containers || []) {
        containerToOrderId.set(String(c.id), oid);
      }
    }

    const containerIds = [...containerToOrderId.keys()];
    const qb = this.salesReservationRepository
      .createQueryBuilder('r')
      .where('r.status = :st', { st: 'ACTIVE' })
      .andWhere(
        new Brackets((w) => {
          if (containerIds.length > 0) {
            w.where('r.containerId IN (:...cids)', { cids: containerIds });
            w.orWhere('(r.tradeOrderId IN (:...oids) AND r.containerId IS NULL)', { oids: orderIds });
          } else {
            w.where('(r.tradeOrderId IN (:...oids) AND r.containerId IS NULL)', { oids: orderIds });
          }
        }),
      );
    const rows = await qb.getMany();

    for (const r of rows) {
      const qty = this.parseSalesMgmtReservationQty(r);
      if (qty.bales <= 0 && qty.weight <= 0) continue;

      let oid: string | undefined;
      if (r.containerId != null && String(r.containerId).trim() !== '') {
        oid = containerToOrderId.get(String(r.containerId));
      } else if (r.tradeOrderId != null && String(r.tradeOrderId).trim() !== '') {
        const t = String(r.tradeOrderId);
        if (orderIdSet.has(t)) oid = t;
      }
      if (!oid) continue;
      const cur = out.get(oid) || { bales: 0, weight: 0 };
      cur.bales += qty.bales;
      cur.weight += qty.weight;
      out.set(oid, cur);
    }

    for (const [k, v] of out.entries()) {
      out.set(k, {
        bales: this.roundNumber(v.bales, 6),
        weight: this.roundNumber(v.weight, 6),
      });
    }
    return out;
  }

  /**
   * 입고·재고 화면용: 판매관리 예약을 중량(MT) 기준으로 통일해 내려줌.
   * - DB에 톤(MT/TON/T)으로 적힌 예약은 그대로 합산.
   * - 베일 예약은 BL 전체 중량·전체 영업 베일 비율로 환산: bales × (Σ중량/Σ베일).
   * - BL에 중량이 없거나 베일 합이 0이면 베일 값은 salesMgmtReservationBalesByBl 폴백으로만 전달.
   */
  private computeSalesMgmtInboundDisplayByWeight(
    order: TradeOrder,
    tb: { bales: number; weight: number },
  ): { weightMtForInbound: number; balesFallbackForInbound: number } {
    let totalBales = 0;
    let totalWt = 0;
    for (const c of order.containers || []) {
      totalBales += this.getEffectiveSalesBales(c);
      const w = c.weight != null ? Number(c.weight) : 0;
      if (Number.isFinite(w) && w > 0) {
        totalWt += w;
      }
    }
    let weightMt = tb.weight;
    let balesFallback = 0;
    if (totalWt > 0 && tb.bales > 0 && totalBales > 0) {
      weightMt += (tb.bales * totalWt) / totalBales;
    } else if (tb.bales > 0) {
      balesFallback = tb.bales;
    }
    return {
      weightMtForInbound: this.roundNumber(weightMt, 6),
      balesFallbackForInbound: this.roundNumber(balesFallback, 6),
    };
  }

  /** 그리드(예약등록·컨 단위) 합계를 발주별 베일·중량으로 합산해 map에 가산 */
  private mergeGridSheetReservationIntoOrderTotals(
    orders: TradeOrder[],
    out: Map<string, { bales: number; weight: number }>,
    gridBlProductTotals: Map<string, number>,
  ): void {
    if (!orders.length || gridBlProductTotals.size === 0) {
      return;
    }
    const orderById = new Map(orders.map((o) => [String(o.id), o]));
    const orderIds = orders.map((o) => String(o.id));
    for (const oid of orderIds) {
      const o = orderById.get(oid);
      if (!o) continue;
      const bl = this.normalizeBlForSheetMatch(o.bl);
      const product = (o.contract?.productName ?? '').trim();
      if (!bl || !product) continue;
      const key = `${bl}|${product}`;
      const containerUnits = gridBlProductTotals.get(key);
      if (containerUnits == null || containerUnits <= 0) continue;
      const matched = o.containers ?? [];
      if (matched.length === 0) continue;
      const dist = this.computeGridSheetReservationDistribution(matched, containerUnits);
      const cur = out.get(oid) || { bales: 0, weight: 0 };
      cur.bales += dist.totalBales;
      cur.weight += dist.totalWeight;
      out.set(oid, cur);
    }
  }

  /**
   * 컨별 판매예약 차감량(베일·중량): (1) 판매관리 tb_sales_reservation = 베일/톤만 해석 후 컨 상당은 그리드와 동일 분배식으로 환산,
   * (2) 시트 그리드 행 = 요청 수량을 컨 단위로 두고 `computeGridSheetReservationDistribution`만 적용.
   */
  private async loadActiveSheetReservationQtyByContainer(
    containers: TradeContainer[],
    /** 수정 중인 예약 행은 집계에서 제외(자기 자신에게 이중 차감 방지) */
    excludeReservationId?: string | null,
  ): Promise<Map<string, { bales: number; weight: number }>> {
    const out = new Map<string, { bales: number; weight: number }>();
    const bump = (containerId: string, bales: number, weight: number) => {
      const cur = out.get(containerId) || { bales: 0, weight: 0 };
      cur.bales += bales;
      cur.weight += weight;
      out.set(containerId, cur);
    };

    if (!containers.length) {
      return out;
    }

    const containerIds = containers.map((c) => String(c.id));
    const orderIds = [...new Set(containers.map((c) => c.order?.id).filter((id): id is string => !!id))];

    const qb = this.salesReservationRepository
      .createQueryBuilder('r')
      .where('r.status = :st', { st: 'ACTIVE' })
      .andWhere(
        new Brackets((w) => {
          w.where('r.containerId IN (:...cids)', { cids: containerIds });
          if (orderIds.length > 0) {
            w.orWhere('(r.tradeOrderId IN (:...oids) AND r.containerId IS NULL)', { oids: orderIds });
          }
        }),
      );

    const rows = await qb.getMany();
    const ex = excludeReservationId?.trim();
    const filteredRows =
      ex ? rows.filter((r) => String(r.id) !== String(ex)) : rows;

    const byOrder = new Map<string, TradeContainer[]>();
    for (const c of containers) {
      const oid = c.order?.id;
      if (!oid) {
        continue;
      }
      const k = String(oid);
      if (!byOrder.has(k)) {
        byOrder.set(k, []);
      }
      byOrder.get(k)!.push(c);
    }

    for (const r of filteredRows) {
      const pq = this.parseSalesMgmtReservationQty(r);
      if (pq.bales <= 0 && pq.weight <= 0) {
        continue;
      }

      if (r.containerId != null && String(r.containerId).trim() !== '') {
        const cid = String(r.containerId);
        if (containerIds.includes(cid)) {
          bump(cid, pq.bales, pq.weight);
        }
        continue;
      }

      const oid = r.tradeOrderId != null ? String(r.tradeOrderId) : '';
      const orderContainers = oid ? byOrder.get(oid) ?? [] : [];
      if (orderContainers.length === 0) {
        continue;
      }

      const parts = this.distributeSalesMgmtReservationToContainers(orderContainers, pq);
      for (const p of parts) {
        bump(p.id, p.bales, p.weight);
      }
    }

    const gridBlProductTotals = await this.loadGridSheetReservationTotalsByBlProduct();
    if (gridBlProductTotals.size > 0) {
      const containersByBlProduct = new Map<string, TradeContainer[]>();
      for (const c of containers) {
        const order = c.order;
        const contract = order?.contract;
        if (!order || !contract) {
          continue;
        }
        const bl = this.normalizeBlForSheetMatch(order.bl);
        const prod = (contract.productName ?? '').trim();
        if (!bl || !prod) {
          continue;
        }
        const k = `${bl}|${prod}`;
        if (!gridBlProductTotals.has(k)) {
          continue;
        }
        if (!containersByBlProduct.has(k)) {
          containersByBlProduct.set(k, []);
        }
        containersByBlProduct.get(k)!.push(c);
      }
      for (const [k, matchedContainers] of containersByBlProduct) {
        const containerUnits = gridBlProductTotals.get(k);
        if (containerUnits == null || containerUnits <= 0) {
          continue;
        }
        const dist = this.computeGridSheetReservationDistribution(matchedContainers, containerUnits);
        for (const p of dist.perContainer) {
          bump(p.id, p.bales, p.weight);
        }
      }
    }

    for (const [k, v] of out.entries()) {
      v.bales = this.roundNumber(v.bales, 4);
      v.weight = this.roundNumber(v.weight, 6);
      out.set(k, v);
    }

    return out;
  }

  async listContainers(
    inboundStatus?: 'PENDING' | 'CONFIRMED' | 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED',
    excludeSoldOut?: boolean,
    warehouses?: number[],
    availableOnly?: boolean,
    bls?: string[],
    requestedContainers?: string[],
    search?: string,
    productNames?: string[],
    includeExcluded?: boolean,
    returnStatus?: string[],
    /** @deprecated 주간재고 등에서 더 이상 필터에 사용하지 않음(하위 호환만 유지) */
    forDashboardDisplay?: boolean,
    /** 판매예약 수정 drawer 등: 해당 예약 행은 시트 집계에서 제외 */
    excludeSalesReservationId?: string,
    /** false면 판매예약(그리드) 집계를 컨테이너 가용 차감에서 제외 */
    includeSheetReservations: boolean = true,
  ) {
    // 컨테이너와 관련된 모든 정보를 조회
    const qb = this.tradeContainerRepository
      .createQueryBuilder('container')
      .leftJoinAndSelect('container.order', 'order', 'order.to_deleted_at IS NULL')
      .leftJoinAndSelect('order.contract', 'contract', 'contract.tc_deleted_at IS NULL')
      .leftJoinAndSelect('order.inbounds', 'inbounds')
      .leftJoinAndSelect('order.managerUser', 'managerUser')
      .orderBy('container.id', 'DESC');

    // 입고 상태 필터링 (order.inboundStatus 기준)
    if (inboundStatus) {
      if (inboundStatus === 'INBOUND_PENDING') {
        qb.andWhere('order.inboundStatus = :inboundStatusVal', { inboundStatusVal: 'INBOUND_PENDING' });
      } else if (inboundStatus === 'PENDING' || inboundStatus === 'INBOUND_SCHEDULED') {
        // PENDING(레거시) / 입고예정: INBOUND_SCHEDULED
        qb.andWhere('order.inboundStatus = :inboundStatusVal', { inboundStatusVal: 'INBOUND_SCHEDULED' });
      } else if (inboundStatus === 'CONFIRMED' || inboundStatus === 'INBOUND_CONFIRMED') {
        qb.andWhere('order.inboundStatus = :inboundStatusVal', { inboundStatusVal: 'INBOUND_CONFIRMED' });
      }
    }

    // BL 필터링
    if (bls && bls.length > 0) {
      qb.andWhere('order.bl IN (:...bls)', { bls });
    }

    // 검색 필터링 (BK, BL, 컨테이너 번호, 제품 코드/제품명)
    if (search && search.trim().length > 0) {
      const searchTerm = `%${search.trim()}%`;
      qb.andWhere(
        `(LOWER(container.containerNo) LIKE LOWER(:search) OR LOWER(order.bk) LIKE LOWER(:search) OR LOWER(order.bl) LIKE LOWER(:search) OR LOWER(contract.tc_product_name) LIKE LOWER(:search) OR EXISTS (SELECT 1 FROM tb_code code WHERE code.cd_group = 'PRODUCT' AND code.cd_value = contract.tc_product_name AND LOWER(code.cd_name) LIKE LOWER(:search)))`,
        { search: searchTerm },
      );
    }

    // 제품 필터링 (다중). 빈 배열이면 결과 없음, undefined면 필터 없음
    if (productNames !== undefined) {
      if (productNames.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('contract.productName IN (:...productNames)', { productNames });
      }
    }

    // 재고 목록 제외: includeExcluded가 아니면 제외된 컨테이너는 목록에서 빼기
    if (!includeExcluded) {
      qb.andWhere('(container.excludeFromInventory = :excludeFalse OR container.excludeFromInventory IS NULL)', {
        excludeFalse: false,
      });
    }

    // 반납여부 필터
    if (returnStatus && returnStatus.length > 0) {
      qb.andWhere('container.returnStatus IN (:...returnStatus)', { returnStatus });
    }

    const containers = await qb.getMany();

    // 컨테이너 ID 목록 추출
    const containerIds = containers.map((c) => c.id);

    // 판매 수량 집계 (컨테이너별) - CONTAINER 타입과 CARGO 타입 모두 집계
    // soldQuantities: 전체 (예약+판매완료), reservedQuantities: RESERVED+SOLD(레거시 명칭),
    // completedQuantities: 순 판매완료 분량 — COMPLETED·INVENTORY_CONSUMPTION 합에 INVENTORY_INBOUND(음수) 가용 복원분 반영 (입고 확정·가용 차감과 동일)
    // availableStockDeductQuantities: 재고 잔여(available*) 차감용 — 취소가 아닌 모든 판매 항목(SALES_ITEM_RESERVED 포함)
    const soldQuantities = new Map<string, { bales: number; weight: number }>();
    const reservedQuantities = new Map<string, { bales: number; weight: number }>();
    const completedQuantities = new Map<string, { bales: number; weight: number }>();
    const availableStockDeductQuantities = new Map<string, { bales: number; weight: number }>();
    const salesStatusMap = new Map<string, { hasReservedOnly: boolean; salesCount: number; hasCompleted: boolean }>();
    
    if (containerIds.length > 0) {
      // 판매 항목 조회 (containerType 포함)
      const salesItems = await this.salesItemRepository
        .createQueryBuilder('item')
        .leftJoinAndSelect('item.container', 'container')
        .where('item.containerId IN (:...containerIds)', { containerIds })
        .andWhere('item.containerId IS NOT NULL')
        .getMany();

      const isReservedStatus = (s: string) =>
        s === 'SALES_ITEM_RESERVED' || s === 'SALES_ITEM_SOLD';
      const isCompletedStatus = (s: string) =>
        s === 'SALES_ITEM_COMPLETED' || s === 'INVENTORY_CONSUMPTION';

      // 컨테이너별 판매 수량 계산 (취소된 판매는 제외)
      salesItems.forEach((item) => {
        // 취소된 판매는 재고에 다시 반영되어야 하므로 판매 수량 계산에서 제외
        if (item.status === 'SALES_ITEM_CANCELLED') {
          return;
        }

        const containerId = item.containerId;
        const currentQty = soldQuantities.get(containerId) || { bales: 0, weight: 0 };
        const currentReserved = reservedQuantities.get(containerId) || { bales: 0, weight: 0 };
        const currentCompleted = completedQuantities.get(containerId) || { bales: 0, weight: 0 };
        const currentStatus = salesStatusMap.get(containerId) || { hasReservedOnly: true, salesCount: 0, hasCompleted: false };
        
        // 판매 상태 확인
        if (item.status !== 'SALES_ITEM_RESERVED') {
          currentStatus.hasReservedOnly = false;
        }
        if (item.status === 'SALES_ITEM_COMPLETED' || item.status === 'INVENTORY_CONSUMPTION') {
          currentStatus.hasCompleted = true;
        }
        currentStatus.salesCount++;
        
        let cargoBales = 0;
        let cargoWeight = 0;
        if (item.containerType === 'CONTAINER') {
          const container = item.container;
          if (container) {
            const q = resolveContainerTypeSalesItemCargoQuantities(container, item);
            cargoBales = q.bales;
            cargoWeight = q.weight;
          }
        } else {
          cargoBales = item.cargoBales ? Number(item.cargoBales) : 0;
          cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
        }
        
        currentQty.bales += cargoBales;
        currentQty.weight += cargoWeight;
        if (isReservedStatus(item.status ?? '')) {
          currentReserved.bales += cargoBales;
          currentReserved.weight += cargoWeight;
        } else if (isCompletedStatus(item.status ?? '')) {
          currentCompleted.bales += cargoBales;
          currentCompleted.weight += cargoWeight;
        } else if (item.status === 'INVENTORY_INBOUND') {
          currentCompleted.bales += cargoBales;
          currentCompleted.weight += cargoWeight;
        }

        const curAvailDeduct = availableStockDeductQuantities.get(containerId) || { bales: 0, weight: 0 };
        curAvailDeduct.bales += cargoBales;
        curAvailDeduct.weight += cargoWeight;
        availableStockDeductQuantities.set(containerId, curAvailDeduct);

        soldQuantities.set(containerId, currentQty);
        reservedQuantities.set(containerId, currentReserved);
        completedQuantities.set(containerId, currentCompleted);
        salesStatusMap.set(containerId, currentStatus);
      });
    }

    const sheetQtyByContainer = includeSheetReservations
      ? await this.loadActiveSheetReservationQtyByContainer(
          containers,
          excludeSalesReservationId?.trim() || undefined,
        )
      : new Map<string, { bales: number; weight: number }>();

    const orderByIdForReservationBreakdown = new Map<string, TradeOrder>();
    for (const c of containers) {
      if (c.order?.id != null) {
        orderByIdForReservationBreakdown.set(String(c.order.id), c.order);
      }
    }
    const uniqueOrdersForReservationBreakdown = [...orderByIdForReservationBreakdown.values()];
    const gridBlProductTotalsListContainers =
      uniqueOrdersForReservationBreakdown.length > 0
        ? await this.loadGridSheetReservationTotalsByBlProduct()
        : new Map<string, number>();
    const tbMgmtTotalsListContainers =
      uniqueOrdersForReservationBreakdown.length > 0
        ? await this.loadTbSalesMgmtReservationTotalsByOrder(uniqueOrdersForReservationBreakdown)
        : new Map<string, { bales: number; weight: number }>();
    const mgmtInboundDisplayByOrderId = new Map<
      string,
      { weightMtForInbound: number; balesFallbackForInbound: number }
    >();
    for (const o of uniqueOrdersForReservationBreakdown) {
      const k = String(o.id);
      const t = tbMgmtTotalsListContainers.get(k) || { bales: 0, weight: 0 };
      mgmtInboundDisplayByOrderId.set(k, this.computeSalesMgmtInboundDisplayByWeight(o, t));
    }

    // 코드 정보 조회
    const codeCategories = [
      'EXPORT_COUNTRY',
      'PRODUCT',
      'PACKING_TYPE',
      'DESTINATION_PORT',
      'EXPORTER',
      'SHIPPING_LINE',
      'TRADE_GRADE',
      'SALES_GRADE',
      'WAREHOUSE',
      'CONTAINER_RETURN_STATUS',
    ];

    const codes = await this.codeRepository.find({
      where: {
        group: In(codeCategories),
      },
    });

    const codeMap = new Map<string, Map<string, string>>();
    const normalizeKey = (value: string) => value.trim().toUpperCase();

    codes.forEach((code) => {
      if (!code.value) {
        return;
      }
      if (!codeMap.has(code.group)) {
        codeMap.set(code.group, new Map());
      }
      codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
    });

    const getCodeName = (category: string, value?: string | null) => {
      if (!value) {
        return null;
      }
      const map = codeMap.get(category);
      if (!map) {
        return null;
      }
      return map.get(normalizeKey(value)) ?? null;
    };

    // 컨테이너 단위로 결과 매핑
    const result: any[] = [];
    
    for (const container of containers) {
      const order = container.order;
      if (!order) {
        this.logger.warn(`[listContainers] 컨테이너 ID ${container.id}에 연결된 주문이 없습니다.`);
        continue;
      }

      const contract = order.contract;
      if (!contract) {
        this.logger.warn(`[listContainers] 주문 ID ${order.id}에 연결된 계약이 없습니다.`);
        continue;
      }

      // 입고 정보 (order.inboundStatus 사용, 없으면 가장 최근 입고 정보 사용)
      const orderInboundStatus = order.inboundStatus;
      const inbounds = order.inbounds || [];
      const latestInbound = inbounds.length > 0 
        ? [...inbounds].sort((a, b) => {
            const aDate = a.createdAt?.getTime() || 0;
            const bDate = b.createdAt?.getTime() || 0;
            return bDate - aDate;
          })[0]
        : null;
      
      // order.inboundStatus가 있으면 우선 사용, 없으면 latestInbound.status 사용
      const inboundStatusValue = orderInboundStatus || latestInbound?.status || null;
      // 예정 원가(원화 kg당): 입고 예정(PENDING) 데이터의 comparisonPurchaseCost 사용 → 판매예약 시 마진 계산에 사용
      const pendingInbound = inbounds.find((i: { status?: string }) => i.status === 'PENDING');
      const comparisonPurchaseCost =
        pendingInbound?.comparisonPurchaseCost != null
          ? Number(pendingInbound.comparisonPurchaseCost)
          : latestInbound?.comparisonPurchaseCost != null
            ? Number(latestInbound.comparisonPurchaseCost)
            : null;
      // 입고예정(INBOUND_SCHEDULED)일 때는 pendingInbound 사용 → 목록과 상세의 통관예정일 등 일치
      const inboundForDates =
        orderInboundStatus === 'INBOUND_SCHEDULED' && pendingInbound ? pendingInbound : latestInbound;

      // 판매 수량 계산 (영업 베일 기준)
      const soldQty = soldQuantities.get(container.id) || { bales: 0, weight: 0 };
      const reservedQty = reservedQuantities.get(container.id) || { bales: 0, weight: 0 };
      const completedQty = completedQuantities.get(container.id) || { bales: 0, weight: 0 };
      const soldBales = soldQty.bales;
      const soldWeight = soldQty.weight;
      const reservedBales = reservedQty.bales;
      const reservedWeight = reservedQty.weight;
      const completedBales = completedQty.bales;
      const completedWeight = completedQty.weight;
      const availDeduct = availableStockDeductQuantities.get(container.id) || { bales: 0, weight: 0 };
      const originalBales = this.getEffectiveSalesBales(container);
      const originalWeight = container.weight ? Number(container.weight) : 0;
      const sheetQty = sheetQtyByContainer.get(String(container.id)) || { bales: 0, weight: 0 };
      const availableBales = originalBales - availDeduct.bales - sheetQty.bales;
      const availableWeight = originalWeight - availDeduct.weight - sheetQty.weight;

      // 재고 상태는 목록 조회 시 DB에 쓰지 않음. 저장된 값만 그대로 반환 (재고 차감/판매 확정 등 액션에서만 갱신)

      result.push({
        id: container.id,
        containerNo: container.containerNo,
        orderId: order.id,
        contractNo: contract.contractNo ?? null,
        sequence: container.sequence ?? 0,
        bk: order.bk ?? null,
        bl: order.bl ?? null,
        product: container.product ?? contract.productName ?? null,
        productName: getCodeName('PRODUCT', container.product ?? contract.productName) ?? container.product ?? contract.productName ?? null,
        tradeGrade: container.tradeGrade ?? order.grade ?? null,
        tradeGradeName: getCodeName('TRADE_GRADE', container.tradeGrade ?? order.grade) ?? container.tradeGrade ?? order.grade ?? null,
        salesGrade: container.salesGrade ?? null,
        salesGradeName: getCodeName('SALES_GRADE', container.salesGrade) ?? container.salesGrade ?? null,
        packing: container.packingType ?? contract.packingType ?? null,
        packingType: container.packingType ?? contract.packingType ?? null,
        packingName: getCodeName('PACKING_TYPE', container.packingType ?? contract.packingType) ?? container.packingType ?? contract.packingType ?? null,
        tradeBales: container.tradeBales ? Number(container.tradeBales) : null,
        salesBales: container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : null),
        bales: originalBales, // 영업 기준(표시용, availableBales와 일치)
        availableBales,
        soldBales, // 판매된 베일 수량 추가 (예약+판매완료 합계)
        weight: originalWeight,
        availableWeight,
        soldWeight, // 판매된 중량 추가 (예약+판매완료 합계)
        reservedBales, // 판매항목 예약~판매중 (RESERVED, SOLD 상태)
        reservedWeight,
        completedBales, // 순 판매완료 베일 (COMPLETED, INVENTORY_CONSUMPTION, INVENTORY_INBOUND 음수 반영)
        completedWeight, // 순 판매완료 중량
        /** 판매관리(tb) + 시트 그리드(컨→베일) 예약 합계 — 가용 차감에 이미 반영 */
        sheetReservationBales: sheetQty.bales,
        sheetReservationWeight: sheetQty.weight,
        salesMgmtReservationBalesByBl:
          (mgmtInboundDisplayByOrderId.get(String(order.id))?.balesFallbackForInbound ?? 0) || 0,
        salesMgmtReservationWeightMtByBl:
          (mgmtInboundDisplayByOrderId.get(String(order.id))?.weightMtForInbound ?? 0) || 0,
        gridSheetReservationContainerUnits: (() => {
          const bl = this.normalizeBlForSheetMatch(order.bl);
          const product = (contract.productName ?? '').trim();
          if (!bl || !product) return 0;
          return gridBlProductTotalsListContainers.get(`${bl}|${product}`) ?? 0;
        })(),
        exportCountry: contract.exportCountry ?? null,
        exportCountryName: getCodeName('EXPORT_COUNTRY', contract.exportCountry) ?? contract.exportCountry ?? null,
        exporter: contract.exporter ?? null,
        exporterName: getCodeName('EXPORTER', contract.exporter) ?? contract.exporter ?? null,
        destination: contract.destination ?? null,
        destinationName: getCodeName('DESTINATION_PORT', contract.destination) ?? contract.destination ?? null,
        inboundStatus: inboundStatusValue,
        inboundWarehouse: inboundForDates?.warehouse ?? null,
        inboundWarehouseName: getCodeName('WAREHOUSE', inboundForDates?.warehouse) ?? inboundForDates?.warehouse ?? null,
        inboundIgodate: this.formatDate(inboundForDates?.igodate),
        inboundQuarantineDate: this.formatDate(inboundForDates?.quarantineDate),
        inboundCustomsScheduledDate: this.formatDate(order.customsScheduledDate),
        inboundDtDate: this.formatDate(inboundForDates?.dtDate),
        // ETA (입항 예정일) - 판매 대시보드 통관 전 재고 월별 필터용
        etaDate: order.etaDate ? this.formatDate(order.etaDate) : null,
        // 단가 (계약/송장 단가)
        unitPrice: container.unitPrice != null ? Number(container.unitPrice) : null,
        // 원가 데이터 (예정 시 comparisonPurchaseCost = 입고 예정 원화 kg당, 마진 계산용)
        pendingPurchaseCost: container.pendingPurchaseCost ?? null,
        comparisonPurchaseCost: comparisonPurchaseCost ?? null,
        confirmedPurchaseCost: container.confirmedPurchaseCost ?? null,
        finalPurchaseCost: container.finalPurchaseCost ?? null,
        // STO, DT, 창고·현장 작업비
        stoCost: container.stoCost ?? null,
        dtCost: container.dtCost ?? null,
        workFee: container.workFee ?? null,
        onsiteWorkFee: container.onsiteWorkFee ?? null,
        // 환율 데이터 (입고 정보에서 가져옴)
        comparisonExchangeRate: latestInbound?.comparisonExchangeRate ?? null,
        appliedExchangeRate: latestInbound?.appliedExchangeRate ?? null,
        // 재고 상태
        inventoryStatus: container.inventoryStatus ?? null,
        // 재고 목록 제외 여부 (제외된 재고 포함 시 배지/제외 해제 버튼용)
        excludeFromInventory: container.excludeFromInventory === true,
        // 반납여부 (tb_code CONTAINER_RETURN_STATUS)
        returnStatus: container.returnStatus ?? 'NOT_RETURNED',
        returnStatusName: getCodeName('CONTAINER_RETURN_STATUS', container.returnStatus ?? 'NOT_RETURNED') ?? (container.returnStatus ?? 'NOT_RETURNED'),
        // 컨테이너 비고 (없으면 BL 영업 비고 fallback - 계약-주문 패턴)
        notes: container.notes ?? order.salesNotes ?? null,
        // 주문 단위 송장 금액·통화 (판매 대시보드 통관 전재고/입항예정 표시용)
        invoiceAmount: order.invoiceAmount != null ? Number(order.invoiceAmount) : null,
        invoiceCurrency: order.invoiceCurrency ?? contract.currency ?? null,
        invoiceCurrencyName: getCodeName('CURRENCY', order.invoiceCurrency ?? contract.currency) ?? (order.invoiceCurrency ?? contract.currency) ?? null,
        // 쉽백(반송) 여부 - 컨테이너 또는 주문 기준
        shipBack: container.shipBack === true || order.shipBack === true,
      });
    }

    let filteredResult = result;

    // 창고 필터링 (inboundWarehouse 기준)
    if (warehouses && warehouses.length > 0) {
      filteredResult = filteredResult.filter((c) => c.inboundWarehouse != null && warehouses.includes(Number(c.inboundWarehouse)));
    }

    // 재고 수량이 있는 항목만 (availableBales 또는 availableWeight > 0)
    // 단, 요청된 컨테이너는 재고가 없어도 포함
    if (availableOnly) {
      filteredResult = filteredResult.filter((c) => {
        // 요청된 컨테이너는 재고가 없어도 포함
        if (requestedContainers && requestedContainers.length > 0 && c.containerNo && requestedContainers.includes(c.containerNo)) {
          return true;
        }
        const hasAvailableBales = c.availableBales != null && Number(c.availableBales) > 0;
        const hasAvailableWeight = c.availableWeight != null && Number(c.availableWeight) > 0;
        return hasAvailableBales || hasAvailableWeight;
      });
    }

    // 제품 선택 화면용 필터링: 모든 중량이 예약되거나 판매된 컨테이너 제외
    if (excludeSoldOut) {
      filteredResult = filteredResult.filter((c) => {
        const status = c.inventoryStatus;
        // RESERVED(전체 예약), SELLING(판매중 - 모든 재고 판매됨), SOLD_OUT(판매 완료)는 제외
        return status !== 'RESERVED' && status !== 'SELLING' && status !== 'SOLD_OUT';
      });
    }

    return filteredResult;
  }

  /**
   * 재무 입고예정 재고 - BL 단위
   * 송장·통관예정일 확인용. 컨테이너 수량, 총 베일, 총 kg
   */
  async listFinanceInventoryPendingByBl(
    search?: string,
    productNames?: string[],
    includeExcluded?: boolean,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<
    Array<{
      orderId: string;
      exporterName: string | null;
      exportCountryName: string | null;
      /** 계약/컨 상품 코드 — 필터·IN 조건과 동일 */
      product: string | null;
      productName: string | null;
      salesGrade: string | null;
      bk: string | null;
      bl: string | null;
      inboundWarehouse: string | null;
      inboundWarehouseName: string | null;
      inboundIgodate: string | null;
      inboundQuarantineDate: string | null;
      inboundCustomsScheduledDate: string | null;
      inboundDtDate: string | null;
      pendingPurchaseCost: string | null;
      packingType: string | null;
      packingName: string | null;
      destinationName: string | null;
      etaDate: string | null;
      containerCount: number;
      totalBales: number;
      totalKg: number;
      firstContainerId: string;
      invoiceAmount: number | null;
      invoiceCurrency: string | null;
      invoiceCurrencyName: string | null;
      comparisonExchangeRate: number | null;
      appliedExchangeRate: number | null;
    }>
  > {
    const containers = await this.listContainers(
      'PENDING', // 입고예정 (INBOUND_SCHEDULED)
      false, // excludeSoldOut
      undefined, // warehouses
      false, // availableOnly
      undefined, // bls
      undefined, // requestedContainers
      search,
      productNames,
      includeExcluded ?? false,
      undefined, // returnStatus
      false, // forDashboardDisplay
      undefined, // excludeSalesReservationId
      false, // includeSheetReservations - 재무 재고에서는 판매예약(그리드) 미반영
    );

    const byOrder = new Map<string, typeof containers>();
    for (const c of containers) {
      const key = String(c.orderId ?? c.id);
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key)!.push(c);
    }

    const rows = Array.from(byOrder.entries()).map(([orderId, list]) => {
      const first = list[0] as (typeof containers)[0];
      const totalBales = list.reduce((sum, c) => sum + (Number(c.bales ?? c.salesBales ?? c.tradeBales ?? 0)), 0);
      const totalWeight = list.reduce((sum, c) => sum + (Number(c.weight ?? 0)), 0);
      const totalKg = totalWeight * 1000; // MT → kg
      return {
        orderId,
        exporterName: first.exporterName ?? null,
        exportCountryName: first.exportCountryName ?? null,
        product: (first as { product?: string | null }).product ?? null,
        productName: first.productName ?? null,
        salesGrade: first.salesGrade ?? null,
        bk: first.bk ?? null,
        bl: first.bl ?? null,
        inboundWarehouse: first.inboundWarehouse ?? null,
        inboundWarehouseName: first.inboundWarehouseName ?? null,
        inboundIgodate: first.inboundIgodate ?? null,
        inboundQuarantineDate: first.inboundQuarantineDate ?? null,
        inboundCustomsScheduledDate: first.inboundCustomsScheduledDate ?? null,
        inboundDtDate: first.inboundDtDate ?? null,
        pendingPurchaseCost: first.pendingPurchaseCost ?? null,
        packingType: first.packingType ?? null,
        packingName: first.packingName ?? null,
        destinationName: first.destinationName ?? null,
        etaDate: first.etaDate ?? null,
        containerCount: list.length,
        totalBales,
        totalKg,
        firstContainerId: String(first.id),
        invoiceAmount: first.invoiceAmount != null ? Number(first.invoiceAmount) : null,
        invoiceCurrency: first.invoiceCurrency ?? null,
        invoiceCurrencyName: first.invoiceCurrencyName ?? null,
        comparisonExchangeRate: first.comparisonExchangeRate != null ? Number(first.comparisonExchangeRate) : null,
        appliedExchangeRate: first.appliedExchangeRate != null ? Number(first.appliedExchangeRate) : null,
      };
    });

    // 통관예정일(dateFrom ~ dateTo) 필터 - customsScheduledDate 우선, 없으면 dtDate
    if (dateFrom || dateTo) {
      return rows.filter((row) => {
        const dateVal = row.inboundCustomsScheduledDate ?? row.inboundDtDate;
        if (!dateVal) return false;
        const dateStr = String(dateVal).slice(0, 10); // YYYY-MM-DD
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo && dateStr > dateTo) return false;
        return true;
      });
    }
    return rows;
  }

  /**
   * 재무 입고예정 재고 - 엑셀 다운로드
   * sortBy, sortOrder: 페이지 정렬과 동일하게 적용
   */
  async exportFinanceInventoryPendingToExcel(
    search?: string,
    productNames?: string[],
    includeExcluded?: boolean,
    dateFrom?: string,
    dateTo?: string,
    sortBy: string = 'inboundCustomsScheduledDate',
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<Buffer> {
    let rows = await this.listFinanceInventoryPendingByBl(
      search,
      productNames,
      includeExcluded ?? false,
      dateFrom,
      dateTo,
    );

    // 페이지 정렬과 동일하게 적용
    rows = [...rows].sort((a, b) => {
      let aVal: unknown = (a as Record<string, unknown>)[sortBy];
      let bVal: unknown = (b as Record<string, unknown>)[sortBy];
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string') aVal = aVal.toUpperCase();
      if (typeof bVal === 'string') bVal = bVal.toUpperCase();
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const symbolMap: Record<string, string> = {
      USD: '$',
      EUR: '€',
      KRW: '₩',
      GBP: '£',
      JPY: '¥',
      CNY: '¥',
      CHF: 'CHF',
      AUD: 'A$',
      CAD: 'C$',
    };

    const excelData = rows.map((row) => {
      const code = (row.invoiceCurrency ?? '').trim().toUpperCase();
      const symbol = code ? (symbolMap[code] ?? code) : '';
      const amountStr =
        row.invoiceAmount != null
          ? symbol
            ? `${symbol} ${Number(row.invoiceAmount).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`
            : Number(row.invoiceAmount).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
          : '-';

      return {
        수출사: row.exporterName ?? '-',
        수출국: row.exportCountryName ?? '-',
        상품명: row.productName ?? '-',
        bk: row.bk ?? '-',
        bl: row.bl ?? '-',
        '컨테이너 수량': row.containerCount,
        중량: row.totalKg > 0 ? row.totalKg.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '-',
        '중량 인보이스금액': amountStr,
        목적지: row.destinationName ?? '-',
        통관예정일: row.inboundCustomsScheduledDate ?? row.inboundDtDate ?? '-',
        ETA: row.etaDate ?? '-',
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, '입고예정재고');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    this.logger.log(`[exportFinanceInventoryPendingToExcel] 완료 - 총 ${rows.length}개 데이터`);
    return buffer;
  }

  /**
   * 재무 입고확정 재고 - BL 단위
   * 창고 DT, 반납여부, 재고상태, 패킹 포함
   */
  async listFinanceInventoryConfirmedByBl(
    search?: string,
    productNames?: string[],
    warehouses?: number[],
    warehouseNames?: string[],
    inventoryStatus?: string[],
    returnStatus?: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<
    Array<{
      orderId: string;
      exporterName: string | null;
      exportCountryName: string | null;
      /** 계약/컨 상품 코드 — 필터·IN 조건과 동일 */
      product: string | null;
      productName: string | null;
      salesGrade: string | null;
      bk: string | null;
      bl: string | null;
      inboundWarehouse: string | null;
      inboundWarehouseName: string | null;
      inboundDtDate: string | null;
      returnStatus: string | null;
      returnStatusName: string | null;
      returnStatusMixed: boolean;
      inventoryStatus: string | null;
      inventoryStatusMixed: boolean;
      packingType: string | null;
      packingName: string | null;
      destinationName: string | null;
      containerCount: number;
      totalBales: number;
      totalKg: number;
      availableBales: number;
      availableKg: number;
      firstContainerId: string;
      stoCost: number | null;
      dtCost: number | null;
      workFee: number | null;
      onsiteWorkFee: number | null;
      confirmedPurchaseCost: string | null;
      finalPurchaseCost: string | null;
    }>
  > {
    const containers = await this.listContainers(
      'CONFIRMED',
      false,
      warehouses,
      false,
      undefined,
      undefined,
      search,
      productNames,
      false, // includeExcluded - 재무에서는 제외된 재고 미표시
      returnStatus,
      false,
      undefined, // excludeSalesReservationId
      false, // includeSheetReservations - 재무 재고에서는 판매예약(그리드) 미반영
    );

    // inventoryStatus 필터 (listContainers에 없음)
    let filtered = containers;
    if (inventoryStatus && inventoryStatus.length > 0) {
      filtered = filtered.filter((c) => c.inventoryStatus && inventoryStatus.includes(c.inventoryStatus));
    }

    // 창고명 필터 (inboundWarehouse는 코드값, inboundWarehouseName으로 필터)
    if (warehouseNames && warehouseNames.length > 0) {
      filtered = filtered.filter((c) => {
        const whName = c.inboundWarehouseName?.trim();
        return whName && warehouseNames.some((n) => n.trim() === whName);
      });
    }

    // DT 날짜 필터
    if (dateFrom || dateTo) {
      filtered = filtered.filter((c) => {
        const dt = c.inboundDtDate;
        if (!dt) return false;
        const dtStr = String(dt).slice(0, 10);
        if (dateFrom && dtStr < dateFrom) return false;
        if (dateTo && dtStr > dateTo) return false;
        return true;
      });
    }

    const byOrder = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const key = String(c.orderId ?? c.id);
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key)!.push(c);
    }

    const rows = Array.from(byOrder.entries()).map(([orderId, list]) => {
      const first = list[0] as (typeof filtered)[0];
      const totalBales = list.reduce((sum, c) => sum + (Number(c.bales ?? c.salesBales ?? c.tradeBales ?? 0)), 0);
      const totalWeight = list.reduce((sum, c) => sum + (Number(c.weight ?? 0)), 0);
      const totalKg = totalWeight * 1000;
      const availableWeight = list.reduce((sum, c) => sum + (Number(c.availableWeight ?? 0)), 0);
      const availableKg = availableWeight * 1000;
      const availableBales = list.reduce((sum, c) => sum + (Number(c.availableBales ?? 0)), 0);

      const retStatuses = [...new Set(list.map((c) => c.returnStatus ?? 'NOT_RETURNED'))];
      const invStatuses = [...new Set(list.map((c) => c.inventoryStatus).filter(Boolean))];

      return {
        orderId,
        exporterName: first.exporterName ?? null,
        exportCountryName: first.exportCountryName ?? null,
        product: (first as { product?: string | null }).product ?? null,
        productName: first.productName ?? null,
        salesGrade: first.salesGrade ?? null,
        bk: first.bk ?? null,
        bl: first.bl ?? null,
        inboundWarehouse: first.inboundWarehouse ?? null,
        inboundWarehouseName: first.inboundWarehouseName ?? null,
        inboundDtDate: first.inboundDtDate ?? null,
        returnStatus: retStatuses.length === 1 ? retStatuses[0] : null,
        returnStatusName: retStatuses.length === 1 ? (first.returnStatusName ?? null) : null,
        returnStatusMixed: retStatuses.length > 1,
        inventoryStatus: invStatuses.length === 1 ? invStatuses[0] : null,
        inventoryStatusMixed: invStatuses.length > 1,
        packingType: first.packingType ?? null,
        packingName: first.packingName ?? null,
        destinationName: first.destinationName ?? null,
        containerCount: list.length,
        totalBales,
        totalKg,
        availableBales,
        availableKg,
        firstContainerId: String(first.id),
        stoCost: list.some((c) => c.stoCost != null && c.stoCost !== '') ? list.reduce((s, c) => s + (c.stoCost != null && c.stoCost !== '' ? Number(c.stoCost) : 0), 0) : null,
        dtCost: list.some((c) => c.dtCost != null && c.dtCost !== '') ? list.reduce((s, c) => s + (c.dtCost != null && c.dtCost !== '' ? Number(c.dtCost) : 0), 0) : null,
        workFee: list.some((c) => c.workFee != null && c.workFee !== '') ? list.reduce((s, c) => s + (c.workFee != null && c.workFee !== '' ? Number(c.workFee) : 0), 0) : null,
        onsiteWorkFee: list.some((c) => c.onsiteWorkFee != null && c.onsiteWorkFee !== '')
          ? list.reduce((s, c) => s + (c.onsiteWorkFee != null && c.onsiteWorkFee !== '' ? Number(c.onsiteWorkFee) : 0), 0)
          : null,
        confirmedPurchaseCost: first.confirmedPurchaseCost ?? null,
        finalPurchaseCost: first.finalPurchaseCost ?? null,
      };
    });

    // 재고중량(availableKg) 0인 건만 제외 (음수는 유지)
    return rows.filter((r) => {
      const kg = Number(r.availableKg ?? 0);
      return !Number.isNaN(kg) && kg !== 0;
    });
  }

  /**
   * BL 단위 재고 목록 (외부 API용)
   * 입고대기·입고예정·입고확정 모두 포함, 제외된 재고·판매완료 제외
   */
  async listInventoryByBl(): Promise<
    Array<{
      bl: string | null;
      bk: string | null;
      status: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED';
      orderId: string;
      product: string | null;
      productName: string | null;
      etaDate: string | null;
      containerCount: number;
      totalBales: number;
      totalWeight: number;
      availableBales: number;
      availableWeight: number;
      containers: Array<{
        containerNo: string | null;
        bales: number;
        availableBales: number;
        weight: number;
        availableWeight: number;
        packing: string | null;
        packingName: string | null;
        unitPrice: number | null;
        currency: string | null;
        tradeGrade: string | null;
        salesGrade: string | null;
        pendingPurchaseCost: number | null;
        confirmedPurchaseCost: number | null;
      }>;
    }>
  > {
    const [pendingOrders, scheduledContainers, confirmedContainers, currencyCodes] = await Promise.all([
      this.listTradeOrders(
        undefined,
        undefined,
        true,
        undefined,
        undefined,
        'INBOUND_PENDING',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false, // includeOrdersWithAllContainersExcluded - 제외된 재고만 있는 주문 제외
        false, // includeExcluded - 제외된 재고 제외
        undefined,
      ),
      this.listContainers(
        'INBOUND_SCHEDULED',
        true, // excludeSoldOut - 판매완료 제외
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        false, // includeExcluded
        undefined,
        false,
      ),
      this.listContainers(
        'CONFIRMED',
        true, // excludeSoldOut - 판매완료 제외
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        false, // includeExcluded
        undefined,
        false, // forDashboardDisplay 아님 (단순 목록)
      ),
      this.codeRepository.find({ where: { group: 'CURRENCY' } }),
    ]);

    const currencySymbolMap = new Map<string, string>();
    currencyCodes.forEach((c) => {
      if (c.value) currencySymbolMap.set(c.value.trim().toUpperCase(), c.name?.trim() ?? c.value);
    });
    const getCurrencySymbol = (code?: string | null) =>
      code ? currencySymbolMap.get(code.trim().toUpperCase()) ?? code : null;

    const result: Array<{
      bl: string | null;
      bk: string | null;
      status: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED';
      orderId: string;
      product: string | null;
      productName: string | null;
      etaDate: string | null;
      containerCount: number;
      totalBales: number;
      totalWeight: number;
      availableBales: number;
      availableWeight: number;
      containers: Array<{
        containerNo: string | null;
        bales: number;
        availableBales: number;
        weight: number;
        availableWeight: number;
        packing: string | null;
        packingName: string | null;
        unitPrice: number | null;
        currency: string | null;
        tradeGrade: string | null;
        salesGrade: string | null;
        pendingPurchaseCost: number | null;
        confirmedPurchaseCost: number | null;
      }>;
    }> = [];

    const blSeen = new Set<string>();

    // 입고대기: 주문(BL) 단위
    for (const order of pendingOrders as any[]) {
      const bl = order.bl ?? order.bk ?? '';
      if (!bl || blSeen.has(bl)) continue;
      blSeen.add(bl);

      const containers = order.containers ?? [];
      const soldOutStatuses = ['RESERVED', 'SELLING', 'SOLD_OUT'];
      const validContainers = containers
        .filter(
          (c: any) =>
            c.excludeFromInventory !== true &&
            !soldOutStatuses.includes(c.inventoryStatus ?? ''),
        )
        .filter((c: any) => {
          const b = Number(c.bales ?? c.salesBales ?? c.tradeBales ?? 0) || 0;
          const w = Number(c.weight ?? 0) || 0;
          return b > 0 || w >= 0.01; // 베일·중량 모두 0인 컨테이너 제외 (중량 톤 기준 10kg 미만=0)
        });
      if (validContainers.length === 0 && containers.length > 0) continue; // 전부 제외/판매완료인 경우 스킵

      const totalBales = validContainers.reduce(
        (sum: number, c: any) => sum + (Number(c.salesBales ?? c.bales ?? c.tradeBales ?? 0) || 0),
        0,
      );
      const totalWeightTon = validContainers.reduce(
        (sum: number, c: any) => sum + (Number(c.weight ?? 0) || 0),
        0,
      );
      const TONS_TO_KG = 1000;

      result.push({
        bl: order.bl ?? null,
        bk: order.bk ?? null,
        status: 'INBOUND_PENDING',
        orderId: String(order.id),
        product: order.productCode ?? order.productName ?? null,
        productName: order.productName ?? order.productCode ?? null,
        etaDate: order.etaDate ?? null,
        containerCount: validContainers.length,
        totalBales,
        totalWeight: Math.round(totalWeightTon * TONS_TO_KG),
        availableBales: totalBales,
        availableWeight: Math.round(totalWeightTon * TONS_TO_KG),
        containers: validContainers.map((c: any) => {
          const salesB = Number(c.salesBales ?? c.bales ?? c.tradeBales ?? 0) || 0;
          const availB = Number(c.availableBales ?? c.salesBales ?? c.bales ?? c.tradeBales ?? 0) || 0;
          return {
            containerNo: c.containerNo ?? null,
            bales: salesB,
            availableBales: availB,
            weight: Math.round((Number(c.weight ?? 0) || 0) * TONS_TO_KG),
            availableWeight: Math.round((Number(c.availableWeight ?? c.weight ?? 0) || 0) * TONS_TO_KG),
            packing: c.packingType ?? c.packing ?? null,
            packingName: c.packingName ?? c.packingType ?? c.packing ?? null,
            unitPrice: c.unitPrice != null ? Number(c.unitPrice) : null,
            currency: getCurrencySymbol(c.currency ?? order.invoiceCurrency) ?? c.currency ?? order.invoiceCurrency ?? null,
            tradeGrade: c.tradeGrade ?? order.grade ?? null,
            salesGrade: c.salesGrade ?? null,
            pendingPurchaseCost: c.pendingPurchaseCost != null ? Number(c.pendingPurchaseCost) : null,
            confirmedPurchaseCost: c.confirmedPurchaseCost != null ? Number(c.confirmedPurchaseCost) : null,
          };
        }),
      });
    }

    const addFromContainers = (
      containers: any[],
      status: 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED',
    ) => {
      const byBl = new Map<
        string,
        {
          bl: string | null;
          bk: string | null;
          orderId: string;
          product: string | null;
          productName: string | null;
          etaDate: string | null;
          items: any[];
        }
      >();
      for (const c of containers) {
        const bl = c.bl ?? c.bk ?? '';
        if (!bl) continue;
        if (!byBl.has(bl)) {
          byBl.set(bl, {
            bl: c.bl ?? null,
            bk: c.bk ?? null,
            orderId: c.orderId ?? '',
            product: c.product ?? c.productName ?? null,
            productName: c.productName ?? c.product ?? null,
            etaDate: c.etaDate ?? null,
            items: [],
          });
        }
        byBl.get(bl)!.items.push(c);
      }
      for (const [bl, group] of byBl) {
        if (blSeen.has(bl)) continue;
        // BL 내 베일·중량 0인 컨테이너 제외 (0이 아닌 컨테이너만)
        const items = group.items.filter((c: any) => {
          const b = Number(c.bales ?? 0) || 0;
          const w = Number(c.weight ?? 0) || 0;
          return b > 0 || w >= 0.01;
        });
        if (items.length === 0) continue; // 전부 0이면 BL 스킵
        blSeen.add(bl);
        const totalBales = items.reduce((s, c) => s + (Number(c.salesBales ?? c.bales ?? 0) || 0), 0);
        const totalWeightTon = items.reduce((s, c) => s + (Number(c.weight ?? 0) || 0), 0);
        const availableBales = items.reduce((s, c) => s + (Number(c.availableBales ?? 0) || 0), 0);
        const availableWeightTon = items.reduce((s, c) => s + (Number(c.availableWeight ?? 0) || 0), 0);
        const TONS_TO_KG = 1000;

        result.push({
          bl: group.bl,
          bk: group.bk,
          status,
          orderId: group.orderId,
          product: group.product,
          productName: group.productName,
          etaDate: group.etaDate,
          containerCount: items.length,
          totalBales,
          totalWeight: Math.round(totalWeightTon * TONS_TO_KG),
          availableBales,
          availableWeight: Math.round(availableWeightTon * TONS_TO_KG),
          containers: items.map((c) => {
            const salesB = Number(c.salesBales ?? c.bales ?? 0) || 0;
            return {
              containerNo: c.containerNo ?? null,
              bales: salesB,
              availableBales: Number(c.availableBales ?? 0) || 0,
              weight: Math.round((Number(c.weight ?? 0) || 0) * TONS_TO_KG),
              availableWeight: Math.round((Number(c.availableWeight ?? 0) || 0) * TONS_TO_KG),
              packing: c.packing ?? c.packingType ?? null,
              packingName: c.packingName ?? c.packing ?? c.packingType ?? null,
              unitPrice: c.unitPrice != null ? Number(c.unitPrice) : null,
              currency: getCurrencySymbol(c.invoiceCurrency ?? c.currency) ?? c.invoiceCurrency ?? c.currency ?? null,
              tradeGrade: c.tradeGrade ?? c.grade ?? null,
              salesGrade: c.salesGrade ?? null,
              pendingPurchaseCost: c.pendingPurchaseCost != null ? Number(c.pendingPurchaseCost) : null,
              confirmedPurchaseCost: c.confirmedPurchaseCost != null ? Number(c.confirmedPurchaseCost) : null,
            };
          }),
        });
      }
    };

    // 외부 API용: 입고예정·입고확정에서 재고 없는 항목 필터
    // 1) inventoryStatus가 RESERVED, SELLING, SOLD_OUT인 컨테이너 제외
    // 2) 베일·중량 모두 없는 항목 제외 (판매중 포함) - availB<=0 이거나 availW<0.01
    const soldOutStatuses = ['RESERVED', 'SELLING', 'SOLD_OUT'];
    const filterSoldOut = (arr: any[]) =>
      arr.filter((c) => {
        if (soldOutStatuses.includes(c.inventoryStatus ?? '')) return false;
        const availB = Number(c.availableBales ?? 0) || 0;
        const availW = Number(c.availableWeight ?? 0) || 0;
        if (availB <= 0) return false; // 베일 0 = 재고 없음
        if (availW < 0.01) return false; // 중량 10g 미만 = 실질적 0
        return true;
      });
    addFromContainers(filterSoldOut(scheduledContainers), 'INBOUND_SCHEDULED');
    addFromContainers(filterSoldOut(confirmedContainers), 'INBOUND_CONFIRMED');

    // 베일·중량 모두 0인 항목 제외 (외부 API 응답 정리)
    const filtered = result.filter(
      (r) => (r.totalBales ?? 0) > 0 && (r.totalWeight ?? 0) > 0,
    );

    this.logger.log(`[listInventoryByBl] 완료 - BL 개수: ${filtered.length}`);
    return filtered;
  }

  async trackTradeOrder(orderId: string, options?: { skipContainerSync?: boolean }) {
    if (!orderId) {
      throw new BadRequestException('선적 조회할 스케줄 ID가 필요합니다.');
    }

    if (!this.searatesApiKey) {
      throw new BadRequestException(
        'SeaRates API 키가 설정되어 있지 않아 선적 조회를 수행할 수 없습니다.',
      );
    }

    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['contract'],
    });

    if (!order) {
      throw new NotFoundException('선적 조회 대상 스케줄을 찾을 수 없습니다.');
    }

    const identifier = this.resolveTrackingIdentifier(order.bl, order.bk);
    if (!identifier) {
      throw new BadRequestException(
        '해당 스케줄에 등록된 B/L 또는 Booking 번호가 없어 선적 조회를 수행할 수 없습니다.',
      );
    }

    const responseJson = await this.callSeaRatesTracking(identifier.value);
    
    // API 응답 전체 로그 (디버깅용)
    this.logger.log(
      {
        context: 'trackTradeOrder:apiResponse',
        orderId,
        identifier: identifier.value,
        responseKeys: responseJson ? Object.keys(responseJson) : [],
        hasData: !!responseJson?.data,
        responseMessage: responseJson?.message ?? null,
        responseError: responseJson?.error ?? null,
        responseStatus: responseJson?.status ?? null,
        responseJson: process.env.NODE_ENV === 'production' 
          ? '프로덕션 환경에서는 생략됨' 
          : JSON.stringify(responseJson, null, 2).slice(0, 2000), // 최대 2000자만
      },
      'SeaRates API 응답 전체',
    );
    
    // API 키 만료 확인
    const responseMessage = responseJson?.message?.toUpperCase() ?? '';
    const responseStatus = responseJson?.status?.toLowerCase() ?? '';
    if (responseMessage === 'API_KEY_EXPIRED' || responseMessage.includes('API_KEY_EXPIRED') ||
        responseStatus === 'error' && responseMessage.includes('EXPIRED')) {
      this.logger.error(
        {
          context: 'trackTradeOrder:apiKeyExpired',
          orderId,
          responseMessage: responseJson?.message,
        },
        'SeaRates API 키가 만료됨',
      );
      throw new BadRequestException(
        'SeaRates API 키가 만료되었습니다. 관리자에게 문의하여 API 키를 갱신해주세요.',
      );
    }
    
    const rootData = responseJson?.data ?? null;
    
    // API 응답이 없거나 비어있는 경우 제한 여부 확인
    if (!rootData) {
      const message = responseJson?.message || 'SeaRates API에서 유효한 데이터를 반환하지 않았습니다.';
      const errorMessage = (responseJson?.error?.toLowerCase() ?? '') + (responseJson?.message?.toLowerCase() ?? '');
      const isRateLimit = errorMessage.includes('limit') || 
        errorMessage.includes('quota') || 
        errorMessage.includes('rate limit') ||
        responseJson?.status === 429 ||
        responseStatus === 'error' && errorMessage.includes('limit');
      
      if (isRateLimit) {
        this.logger.error(
          {
            context: 'trackTradeOrder:apiLimitInResponse',
            orderId,
            responseMessage: responseJson?.message,
            responseError: responseJson?.error,
          },
          'SeaRates API 응답에서 호출 제한 감지',
        );
        throw new BadRequestException(
          'SeaRates API 호출 제한에 도달했습니다. 잠시 후 다시 시도해주세요.',
        );
      }
      
      throw new BadRequestException(message);
    }

    const payload = rootData?.data ?? rootData;
    
    // payload 구조 로그
    this.logger.log(
      {
        context: 'trackTradeOrder:payloadStructure',
        orderId,
        rootDataKeys: rootData ? Object.keys(rootData) : [],
        payloadKeys: payload ? Object.keys(payload) : [],
        payloadType: payload ? typeof payload : 'null',
        isPayloadArray: Array.isArray(payload),
        payloadLength: Array.isArray(payload) ? payload.length : null,
        hasRoute: !!payload?.route,
        hasRouteData: !!payload?.route_data,
        hasLocations: !!payload?.locations,
        hasContainers: !!payload?.containers,
        hasMetadata: !!payload?.metadata,
        rootDataMessage: rootData?.message ?? null,
      },
      'Payload 구조 분석',
    );
    
    if (!payload) {
      const message = rootData?.message || 'SeaRates API에서 선적 정보를 찾지 못했습니다.';
      this.logger.warn(
        {
          context: 'trackTradeOrder:noPayload',
          orderId,
          rootData: rootData ? JSON.stringify(rootData).slice(0, 1000) : null,
        },
        'Payload가 없음',
      );
      throw new BadRequestException(message);
    }

    const metadata = rootData?.metadata ?? payload?.metadata ?? null;
    const route = payload?.route ?? {};
    const routeData = payload?.route_data ?? null;
    const locations = Array.isArray(payload?.locations) ? payload.locations : [];
    const containers = Array.isArray(payload?.containers) ? payload.containers : [];

    const etd = route?.pol?.date ?? null;
    const shippingLineRaw =
      metadata?.sealine_name ?? metadata?.sealine ?? payload?.metadata?.sealine_name ?? null;
    const shippingLine = shippingLineRaw ? this.abbreviateSealineName(shippingLineRaw) : null;

    // route 데이터 로그 (ETA 결정을 위한)
    const routeDataRoute = routeData?.route 
      ? (Array.isArray(routeData.route) ? routeData.route[routeData.route.length - 1] : routeData.route)
      : null;
    
    // payload에서 직접 ETA 관련 필드 확인
    const directEtaFields = {
      eta: payload?.eta ?? null,
      arrival_date: payload?.arrival_date ?? null,
      destination_date: payload?.destination_date ?? null,
      pod_date: payload?.pod_date ?? null,
      delivery_date: payload?.delivery_date ?? null,
      final_destination_date: payload?.final_destination_date ?? null,
    };
    
    this.logger.log(
      {
        context: 'trackTradeOrder:routeData',
        orderId,
        payloadRoute: {
          delivery: route?.delivery ?? null,
          postpod: route?.postpod ?? null,
          pod: route?.pod ?? null,
          pol: route?.pol ?? null,
        },
        routeData: routeData ? {
          route: Array.isArray(routeData?.route) 
            ? {
                isArray: true,
                length: routeData.route.length,
                lastItem: routeDataRoute,
              }
            : routeData?.route,
          pin: routeData?.pin ?? null,
        } : null,
        locationsCount: locations.length,
        locations: locations.length > 0 ? locations.map((loc: any) => ({
          id: loc?.id,
          name: loc?.name,
          type: loc?.type,
          date: loc?.date,
          location: loc?.location,
        })) : [],
        directEtaFields,
        payloadKeys: payload ? Object.keys(payload) : [],
      },
      'ETA 결정을 위한 route 데이터',
    );

    let { eta, etaDestination, etaPriority } = this.resolveEta(route, routeData, locations);

    // resolveEta에서 찾지 못한 경우 payload에서 직접 필드 확인
    if (!eta) {
      const directEta = payload?.eta ?? payload?.arrival_date ?? payload?.destination_date 
        ?? payload?.pod_date ?? payload?.delivery_date ?? payload?.final_destination_date 
        ?? payload?.arrivalDate ?? payload?.destinationDate ?? null;
      if (directEta) {
        eta = directEta;
        // destination은 기존 값 유지하거나 payload에서 찾기
        if (!etaDestination) {
          const rawDestination = payload?.destination ?? payload?.pod ?? payload?.delivery ?? null;
          if (rawDestination) {
            if (typeof rawDestination === 'object' && rawDestination !== null && 'name' in rawDestination) {
              const destName = (rawDestination as { name?: string }).name;
              etaDestination = destName ? this.translateLocationToKorean(destName) : null;
            } else if (typeof rawDestination === 'string') {
              etaDestination = this.translateLocationToKorean(rawDestination);
            }
          }
        }
      }
    }

    // resolveEta 결과 로그
    this.logger.log(
      {
        context: 'trackTradeOrder:resolveEta',
        orderId,
        resolvedEta: eta,
        resolvedEtaPriority: etaPriority,
        resolvedEtaDestination: etaDestination,
        foundInPayload: !eta ? false : (payload?.eta ?? payload?.arrival_date ?? payload?.destination_date ?? null) ? true : false,
      },
      'resolveEta 메서드 결과',
    );

    const normalizedContainers = containers.map((container: any) => {
      const rawEvents = Array.isArray(container?.events) ? container.events : [];
      const gateOutDate = this.getGateOutDate(rawEvents);
      const lastEvent = this.getLastEventStatus(rawEvents, etd, gateOutDate);
      const timeline = rawEvents
        .map((event: any) => ({
          date: event?.date ?? null,
          description: this.translateEvent(event?.event ?? event?.description ?? event?.event_code ?? ''),
          code: event?.event_code ?? null,
        }))
        .filter((event) => event.date || event.description);

      return {
        containerNumber: container?.number ?? null,
        weight: container?.weight ?? null,
        gateOutDate: gateOutDate ?? null,
        detentionDays: this.parseNumberOrNull(container?.charges?.detention?.days_in_charge),
        lastEvent: lastEvent ?? null,
        events: timeline.length > 0 ? timeline : null,
      };
    });

    const hasContainers = normalizedContainers.length > 0;
    if (hasContainers && !options?.skipContainerSync) {
      await this.syncContainersForOrder(order, normalizedContainers);
    }

    const usage = metadata
      ? {
          apiCalls: metadata?.api_calls ?? null,
          uniqueShipments: metadata?.unique_shipments ?? null,
        }
      : null;

    // API 호출 제한 정보 로그
    if (usage?.apiCalls) {
      const apiCalls = usage.apiCalls;
      const isNearLimit = apiCalls.used !== null && apiCalls.total !== null && 
        apiCalls.total > 0 && (apiCalls.used / apiCalls.total) > 0.8;
      const isExceeded = apiCalls.used !== null && apiCalls.total !== null && 
        apiCalls.used >= apiCalls.total;

      if (isExceeded) {
        this.logger.error(
          {
            context: 'trackTradeOrder:apiLimitExceeded',
            orderId,
            apiCalls: {
              used: apiCalls.used,
              total: apiCalls.total,
              remaining: apiCalls.remaining,
            },
          },
          'SeaRates API 호출 제한 초과',
        );
      } else if (isNearLimit) {
        this.logger.warn(
          {
            context: 'trackTradeOrder:apiLimitWarning',
            orderId,
            apiCalls: {
              used: apiCalls.used,
              total: apiCalls.total,
              remaining: apiCalls.remaining,
              usagePercent: apiCalls.total > 0 ? ((apiCalls.used ?? 0) / apiCalls.total * 100).toFixed(1) : null,
            },
          },
          'SeaRates API 호출 제한에 근접함',
        );
      } else {
        this.logger.log(
          {
            context: 'trackTradeOrder:apiUsage',
            orderId,
            apiCalls: {
              used: apiCalls.used,
              total: apiCalls.total,
              remaining: apiCalls.remaining,
            },
          },
          'SeaRates API 사용량',
        );
      }
    }

    const responseBlNumber =
      this.extractIdentifierFromPayload(payload, [
        'bl_number',
        'bill_of_lading',
        'bill_of_lading_number',
        'bill_of_lading_no',
        'bol',
        'bl',
      ]) ?? this.extractIdentifierFromPayload(metadata, ['bl_number', 'bill_of_lading']);

    const responseBookingNumber =
      this.extractIdentifierFromPayload(payload, [
        'booking_number',
        'booking_no',
        'booking',
        'bk',
      ]) ?? this.extractIdentifierFromPayload(metadata, ['booking_number', 'booking_no']);

    const trackingResult = {
      identifier: identifier.value,
      identifierType: identifier.type,
      blNumber: identifier.type === 'BL' ? identifier.value : order.bl ?? null,
      bookingNumber: identifier.type === 'BK' ? identifier.value : order.bk ?? null,
      responseBlNumber: responseBlNumber ?? null,
      responseBookingNumber: responseBookingNumber ?? null,
      contractNo: order.contract?.contractNo ?? order.contractNo ?? null,
      shipmentSeq: order.sequence ?? null,
      etd,
      eta,
      etaPriority,
      etaDestination,
      shippingLine,
      containers: hasContainers ? normalizedContainers : null,
      usage,
      raw: process.env.NODE_ENV === 'production' ? undefined : payload,
    };

    // 선적 조회 결과 로그 (핵심 데이터만)
    this.logger.log(
      {
        context: 'trackTradeOrder:result',
        orderId,
        contractNo: trackingResult.contractNo,
        shipmentSeq: trackingResult.shipmentSeq,
        identifier: trackingResult.identifier,
        identifierType: trackingResult.identifierType,
        etd: trackingResult.etd,
        eta: trackingResult.eta,
        etaPriority: trackingResult.etaPriority,
        etaDestination: trackingResult.etaDestination,
        shippingLine: trackingResult.shippingLine,
        blNumber: trackingResult.blNumber,
        bookingNumber: trackingResult.bookingNumber,
        responseBlNumber: trackingResult.responseBlNumber,
        responseBookingNumber: trackingResult.responseBookingNumber,
        containersCount: trackingResult.containers ? trackingResult.containers.length : 0,
        usage: trackingResult.usage,
      },
      '선적 조회 결과 데이터',
    );

    return trackingResult;
  }

  async trackByBkBl(bk?: string | null, bl?: string | null) {
    if (!this.searatesApiKey) {
      throw new BadRequestException(
        'SeaRates API 키가 설정되어 있지 않아 선적 조회를 수행할 수 없습니다.',
      );
    }

    const identifier = this.resolveTrackingIdentifier(bl || null, bk || null);
    if (!identifier) {
      throw new BadRequestException(
        'B/L 또는 Booking 번호를 입력해주세요.',
      );
    }

    const responseJson = await this.callSeaRatesTracking(identifier.value);

    // API 응답 전체 로그 (디버깅용)
    this.logger.log(
      {
        context: 'trackByBkBl:apiResponse',
        identifier: identifier.value,
        responseKeys: responseJson ? Object.keys(responseJson) : [],
        hasData: !!responseJson?.data,
        responseMessage: responseJson?.message ?? null,
        responseError: responseJson?.error ?? null,
        responseStatus: responseJson?.status ?? null,
      },
      'SeaRates API 응답 전체',
    );

    // API 키 만료 확인
    const responseMessage = responseJson?.message?.toUpperCase() ?? '';
    const responseStatus = responseJson?.status?.toLowerCase() ?? '';
    if (responseMessage === 'API_KEY_EXPIRED' || responseMessage.includes('API_KEY_EXPIRED') ||
        responseStatus === 'error' && responseMessage.includes('EXPIRED')) {
      this.logger.error(
        {
          context: 'trackByBkBl:apiKeyExpired',
          responseMessage: responseJson?.message,
        },
        'SeaRates API 키가 만료됨',
      );
      throw new BadRequestException(
        'SeaRates API 키가 만료되었습니다. 관리자에게 문의하여 API 키를 갱신해주세요.',
      );
    }

    const rootData = responseJson?.data ?? null;

    // API 응답이 없거나 비어있는 경우 제한 여부 확인
    if (!rootData) {
      const message = responseJson?.message || 'SeaRates API에서 유효한 데이터를 반환하지 않았습니다.';
      const errorMessage = (responseJson?.error?.toLowerCase() ?? '') + (responseJson?.message?.toLowerCase() ?? '');
      const isRateLimit = errorMessage.includes('limit') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('rate limit') ||
        responseJson?.status === 429 ||
        responseStatus === 'error' && errorMessage.includes('limit');

      if (isRateLimit) {
        this.logger.error(
          {
            context: 'trackByBkBl:apiLimitInResponse',
            responseMessage: responseJson?.message,
            responseError: responseJson?.error,
          },
          'SeaRates API 응답에서 호출 제한 감지',
        );
        throw new BadRequestException(
          'SeaRates API 호출 제한에 도달했습니다. 잠시 후 다시 시도해주세요.',
        );
      }

      throw new BadRequestException(message);
    }

    const payload = rootData?.data ?? rootData;
    const metadata = rootData?.metadata ?? payload?.metadata ?? responseJson?.metadata ?? null;

    // trackTradeOrder와 동일한 로직으로 결과 처리
    const route = payload?.route ?? {};
    const routeData = payload?.route_data ?? null;
    const locations = Array.isArray(payload?.locations) ? payload.locations : [];
    const containers = Array.isArray(payload?.containers) ? payload.containers : [];

    const etd = route?.pol?.date ?? null;
    const shippingLineRaw =
      metadata?.sealine_name ?? metadata?.sealine ?? payload?.metadata?.sealine_name ?? null;
    const shippingLine = shippingLineRaw ? this.abbreviateSealineName(shippingLineRaw) : null;

    let { eta, etaDestination, etaPriority } = this.resolveEta(route, routeData, locations);

    // resolveEta에서 찾지 못한 경우 payload에서 직접 필드 확인
    if (!eta) {
      const directEta = payload?.eta ?? payload?.arrival_date ?? payload?.destination_date
        ?? payload?.pod_date ?? payload?.delivery_date ?? payload?.final_destination_date
        ?? payload?.arrivalDate ?? payload?.destinationDate ?? null;
      if (directEta) {
        eta = directEta;
        // destination은 기존 값 유지하거나 payload에서 찾기
        if (!etaDestination) {
          const rawDestination = payload?.destination ?? payload?.pod ?? payload?.delivery ?? null;
          if (rawDestination) {
            if (typeof rawDestination === 'object' && rawDestination !== null && 'name' in rawDestination) {
              const destName = (rawDestination as { name?: string }).name;
              etaDestination = destName ? this.translateLocationToKorean(destName) : null;
            } else if (typeof rawDestination === 'string') {
              etaDestination = this.translateLocationToKorean(rawDestination);
            }
          }
        }
      }
    }

    const normalizedContainers = containers.map((container: any) => {
      const rawEvents = Array.isArray(container?.events) ? container.events : [];
      const gateOutDate = this.getGateOutDate(rawEvents);
      const lastEvent = this.getLastEventStatus(rawEvents, etd, gateOutDate);
      const timeline = rawEvents
        .map((event: any) => ({
          date: event?.date ?? null,
          description: this.translateEvent(event?.event ?? event?.description ?? event?.event_code ?? ''),
          code: event?.event_code ?? null,
        }))
        .filter((event) => event.date || event.description);

      return {
        containerNumber: container?.number ?? null,
        weight: container?.weight ?? null,
        gateOutDate: gateOutDate ?? null,
        detentionDays: this.parseNumberOrNull(container?.charges?.detention?.days_in_charge),
        lastEvent: lastEvent ?? null,
        events: timeline.length > 0 ? timeline : null,
      };
    });

    const hasContainers = normalizedContainers.length > 0;

    const usage = metadata
      ? {
          apiCalls: metadata?.api_calls ?? null,
          uniqueShipments: metadata?.unique_shipments ?? null,
        }
      : null;

    const responseBlNumber =
      this.extractIdentifierFromPayload(payload, [
        'bl_number',
        'bill_of_lading',
        'bl',
      ]) ?? this.extractIdentifierFromPayload(responseJson, ['bl_number', 'bill_of_lading']);

    const responseBookingNumber =
      this.extractIdentifierFromPayload(payload, [
        'booking_number',
        'booking_no',
        'booking',
        'bk',
      ]) ?? this.extractIdentifierFromPayload(responseJson, ['booking_number', 'booking_no']);

    const trackingResult = {
      identifier: identifier.value,
      identifierType: identifier.type,
      blNumber: identifier.type === 'BL' ? identifier.value : bl ?? null,
      bookingNumber: identifier.type === 'BK' ? identifier.value : bk ?? null,
      responseBlNumber: responseBlNumber ?? null,
      responseBookingNumber: responseBookingNumber ?? null,
      etd,
      eta,
      etaPriority,
      etaDestination,
      shippingLine,
      containers: normalizedContainers.length > 0 ? normalizedContainers : null,
      usage,
      raw: process.env.NODE_ENV === 'production' ? undefined : payload,
    };

    return trackingResult;
  }

  /**
   * 여러 주문에 대해 선적 조회를 실행하여 ETA·선사 정보를 일괄 갱신합니다.
   * 프론트엔드 수동 실행 및 Cloud Scheduler 호출용.
   * 이력을 tb_eta_update_batch에 저장 (언제, 누가, 어떤 주문, 변경 여부·before/after).
   */
  async batchEtaUpdate(
    orderIds: string[],
    userId?: number,
    trigger: string = 'MANUAL',
    filterParams?: Record<string, unknown>,
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: EtaUpdateBatchResultItem[];
    batchId: number;
  }> {
    if (!orderIds || orderIds.length === 0) {
      throw new BadRequestException('갱신할 주문 ID가 필요합니다.');
    }

    this.logger.log(
      `[batchEtaUpdate] ETA 일괄 갱신 시작 - ${orderIds.length}건, ETA·ETD·선사만 반영(컨테이너 미처리)`,
    );

    const results: EtaUpdateBatchResultItem[] = [];
    let successCount = 0;

    const toDateStr = (v: Date | string | null | undefined): string | null => {
      if (v == null) return null;
      const d = typeof v === 'string' ? new Date(v) : v;
      if (Number.isNaN(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const toBeforeAfterContainers = (
      containers: Array<{ containerNo?: string | null; weight?: string | number | null }> | null | undefined,
    ): Array<{ containerNo?: string | null; weight?: number | null }> => {
      if (!containers || containers.length === 0) return [];
      return [...containers]
        .sort((a, b) => (a.containerNo ?? '').localeCompare(b.containerNo ?? ''))
        .map((c) => ({
          containerNo: c.containerNo?.trim() ?? null,
          weight: c.weight != null ? Number(c.weight) : null,
        }));
    };

    let lastUsage: { apiCalls?: { used?: number; total?: number; remaining?: number } | null; uniqueShipments?: { used?: number; total?: number; remaining?: number } | null } | null = null;

    for (const orderId of orderIds) {
      let before: EtaUpdateBatchResultItem['before'] | undefined;
      let orderBk: string | null = null;
      let orderContractNo: string | null = null;
      try {
        const order = await this.tradeOrderRepository.findOne({
          where: { id: orderId },
          relations: ['containers', 'contract'],
        });
        orderBk = order?.bk?.trim() ?? null;
        orderContractNo = order?.contract?.contractNo?.trim() ?? null;
        before = {
          eta: order?.etaDate ? toDateStr(order.etaDate) : null,
          etd: order?.etdApiDate ? toDateStr(order.etdApiDate) : null,
          shippingLine: order?.shippingLine?.trim() ?? null,
          containers: order?.containers ? toBeforeAfterContainers(order.containers) : [],
        };
      } catch {
        before = { eta: null, etd: null, shippingLine: null, containers: [] };
      }

      try {
        const trackingResult = await this.trackTradeOrder(orderId, { skipContainerSync: true });

        if (trackingResult.usage) {
          lastUsage = trackingResult.usage;
        }

        const etaValue = trackingResult.eta ?? trackingResult.etaPriority ?? null;
        const updateDto: UpdateTradeOrderDto = {};
        // API에서 값이 있을 때만 갱신. null/빈 값이면 기존 DB 값 유지(덮어쓰지 않음). ETA 갱신은 ETA·ETD·선사만 반영, 컨테이너는 처리하지 않음.
        if (etaValue != null && String(etaValue).trim() !== '') {
          updateDto.eta = etaValue;
        }
        if (trackingResult.etd != null && String(trackingResult.etd).trim() !== '') {
          updateDto.etdApi = trackingResult.etd;
        }
        const sl = trackingResult.shippingLine?.trim();
        if (sl != null && sl !== '') {
          updateDto.shippingLine = sl;
        }

        await this.updateTradeOrder(orderId, updateDto);

        const after: EtaUpdateBatchResultItem['after'] = {
          eta: updateDto.eta != null ? toDateStr(updateDto.eta) : before.eta,
          etd: updateDto.etdApi != null ? toDateStr(updateDto.etdApi) : before.etd,
          shippingLine: updateDto.shippingLine != null ? updateDto.shippingLine : before.shippingLine,
          containers: before.containers ?? [],
        };

        const etaChanged = (before.eta ?? null) !== (after.eta ?? null);
        const etdChanged = (before.etd ?? null) !== (after.etd ?? null);
        const shippingChanged = (before.shippingLine ?? null) !== (after.shippingLine ?? null);
        const changed = etaChanged || etdChanged || shippingChanged;

        if (changed) {
          results.push({ orderId, contractNo: orderContractNo, bk: orderBk, success: true, changed: true, before, after });
        } else {
          results.push({ orderId, contractNo: orderContractNo, bk: orderBk, success: true, changed: false });
        }
        successCount++;
      } catch (err: any) {
        const errorMessage = err?.message ?? String(err);
        this.logger.warn(`[batchEtaUpdate] orderId ${orderId} 실패: ${errorMessage}`);

        // 실패 원인 분류 (errorCode)
        let errorCode: EtaUpdateBatchErrorCode = 'UNKNOWN';
        if (errorMessage.includes('API 키가 만료')) {
          errorCode = 'API_KEY_EXPIRED';
        } else if (errorMessage.includes('호출 제한') || errorMessage.includes('제한에 도달')) {
          errorCode = 'API_LIMIT';
        } else if (errorMessage.includes('고유 선적') || errorMessage.includes('unique shipment') || errorMessage.includes('unique_shipment')) {
          errorCode = 'UNIQUE_SHIPMENT_LIMIT';
        } else if (errorMessage.includes('네트워크 오류') || errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
          errorCode = 'NETWORK';
        } else if (errorMessage.includes('SeaRates') || errorMessage.includes('API')) {
          errorCode = 'API_ERROR';
        }

        // 고유 선적 잔여 0이면 수량 부족 가능성 안내
        let errorDetail: string | null = null;
        const uniqueRemaining = lastUsage?.uniqueShipments?.remaining;
        if (uniqueRemaining != null && uniqueRemaining <= 0) {
          errorDetail = `고유 선적 잔여 ${uniqueRemaining}건 - 수량 부족으로 인한 실패 가능성 있음`;
          if (errorCode === 'NETWORK' || errorCode === 'UNKNOWN') {
            errorCode = 'POSSIBLE_QUOTA';
          }
        }

        results.push({
          orderId,
          contractNo: orderContractNo,
          bk: orderBk,
          success: false,
          error: errorMessage,
          errorCode,
          errorDetail,
        });
      }
    }

    const batch = await this.etaUpdateBatchRepository.save({
      createdById: userId ?? null,
      trigger,
      filterParams: filterParams ?? null,
      orderIds,
      total: orderIds.length,
      success: successCount,
      failed: orderIds.length - successCount,
      results,
      apiUsageAfter: lastUsage,
    });

    return {
      total: orderIds.length,
      success: successCount,
      failed: orderIds.length - successCount,
      results,
      batchId: batch.id,
    };
  }

  /**
   * ETA 일괄 갱신 이력 조회
   */
  async findEtaUpdateBatchHistory(
    page = 1,
    limit = 20,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): Promise<{
    data: Array<{
      id: number;
      createdAt: string;
      createdBy: { id: number; name: string | null } | null;
      trigger: string;
      filterParams: Record<string, unknown> | null;
      orderIds: string[];
      total: number;
      success: number;
      failed: number;
      results: EtaUpdateBatchResultItem[];
      apiUsageAfter: { apiCalls?: { used?: number; total?: number; remaining?: number } | null; uniqueShipments?: { used?: number; total?: number; remaining?: number } | null } | null;
    }>;
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  }> {
    const allowedSort: Record<string, string> = {
      createdAt: 'createdAt',
      trigger: 'trigger',
      total: 'total',
      success: 'success',
      failed: 'failed',
    };
    const orderKey = sortBy && allowedSort[sortBy] ? allowedSort[sortBy] : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const [items, total] = await this.etaUpdateBatchRepository.findAndCount({
      where: {},
      order: { [orderKey]: orderDir },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['createdBy'],
    });

    return {
      data: items.map((b) => ({
        id: b.id,
        createdAt: b.createdAt.toISOString(),
        createdBy: b.createdBy
          ? { id: b.createdBy.id, name: b.createdBy.name ?? null }
          : null,
        trigger: b.trigger,
        filterParams: (b.filterParams as Record<string, unknown>) ?? null,
        orderIds: b.orderIds ?? [],
        total: b.total,
        success: b.success,
        failed: b.failed,
        results: b.results ?? [],
        apiUsageAfter: b.apiUsageAfter ?? null,
      })),
      total,
      page,
      limit,
      lastPage: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createTradeOrder(dto: CreateTradeOrderDto, userId?: number): Promise<{ success: boolean; message: string; orderId: string; sequence?: number | null; sequenceSub?: number }> {
    try {
      this.logger.log(`발주 생성 요청 - contractId: ${dto.contractId}, contractNo: ${dto.contractNo}`);
      
      // 계약서 처리
      let contract: TradeContract | null = null;
      const normalizedContractNo = dto.contractNo ? this.normalizeContractNumber(dto.contractNo) : null;
      
      // contractId가 명시적으로 주어진 경우에만 기존 계약 사용
      if (dto.contractId) {
        this.logger.log(`contractId로 계약 찾기: ${dto.contractId}`);
        contract = await this.tradeContractRepository.findOne({
          where: { id: dto.contractId },
        });
        if (!contract) {
          this.logger.error(`계약 ID(${dto.contractId})를 찾을 수 없습니다.`);
          throw new BadRequestException(`계약 ID(${dto.contractId})를 찾을 수 없습니다.`);
        }
        this.logger.log(`계약 찾기 성공 - ID: ${contract.id}, contractNo: ${contract.contractNo}`);
      } else {
        // contractId가 없으면 새 계약 생성
        const normalizedExporter = dto.exporter ? this.normalizeExporter(dto.exporter) : null;
        const normalizedCountry = dto.exportCountry ? this.normalizeCountry(dto.exportCountry) : null;
        const normalizedProduct = dto.productName ? this.normalizeProduct(dto.productName) : null;
        
        // 등록자 정보 조회
        let createdByUser: User | null = null;
        if (userId) {
          createdByUser = await this.userRepository.findOne({ where: { id: userId } });
        }
        
        contract = this.tradeContractRepository.create({
          contractNo: normalizedContractNo || null,
          exporter: normalizedExporter,
          exportCountry: normalizedCountry,
          productName: normalizedProduct,
          contractGoogleDriveFileId: dto.contractGoogleDriveFileId?.trim() ? dto.contractGoogleDriveFileId.trim() : null,
          contractFileName: dto.contractFileName?.trim() ? dto.contractFileName.trim() : null,
          status: 'ORDER', // 발주 생성 시 상태는 'ORDER'
          createdBy: createdByUser || null,
        });
        this.logger.log(`새 계약 생성 시작`);
      }

      if (!contract) {
      throw new BadRequestException('계약 정보를 생성할 수 없습니다. exporter, exportCountry, productName 중 하나 이상이 필요합니다.');
    }

      // 발주 관련 필드 업데이트
      if (dto.orderDate !== undefined) {
        contract.orderDate = dto.orderDate ? this.parseFlexibleDate(dto.orderDate) : null;
      }

    if (dto.quantity !== undefined && dto.quantity !== null) {
      const qty = Number(dto.quantity);
        contract.quantity = Number.isFinite(qty) ? qty.toString() : null;
      }

      if (dto.grade !== undefined) {
        contract.grade = dto.grade?.trim() ? dto.grade.trim() : null;
      }

    if (dto.packingType !== undefined) {
        contract.packingType = dto.packingType?.trim() ?? null;
    }

    if (dto.currency !== undefined) {
        contract.currency = dto.currency?.trim() ?? null;
    }

    if (dto.unitPrice !== undefined && dto.unitPrice !== null) {
      const price = Number(dto.unitPrice);
        contract.unitPrice = Number.isFinite(price) ? price.toString() : null;
      }

      if (dto.commissionDollar !== undefined) {
        contract.commissionDollar = dto.commissionDollar?.trim() ?? null;
      }

      if (dto.commissionMonth !== undefined) {
        contract.commissionMonth = dto.commissionMonth?.trim() ?? null;
      }

      if (dto.newOld !== undefined) {
        contract.newOld = dto.newOld?.trim() ?? null;
      }

      if (dto.destination !== undefined) {
        contract.destination = dto.destination?.trim() ?? null;
      }

      if (dto.notes !== undefined) {
        contract.notes = dto.notes?.trim() ?? null;
      }

      if (dto.quota !== undefined) {
        contract.quota = dto.quota || null;
      }

      if (dto.fumigation !== undefined) {
        contract.fumigation = dto.fumigation || null;
      }

      if (dto.customsDuty !== undefined) {
        contract.customsDuty = dto.customsDuty || null;
      }

      if (dto.totalOrderCount !== undefined) {
        contract.totalOrderCount = dto.totalOrderCount ?? null;
      }

      // 계약 상태 변경: dto.status가 명시적으로 제공된 경우에만 변경
      // 부킹 생성 시에는 기존 계약 상태를 유지해야 하므로 상태 변경하지 않음
      if (dto.status !== undefined) {
        contract.status = dto.status || null;
      }
      // dto.status가 없으면 기존 계약 상태 유지 (부킹 생성 시)
      // 새 계약 생성 시에는 이미 위에서 status: 'ORDER'로 설정됨

      // 계약 저장
      const savedContract = await this.tradeContractRepository.save(contract);
      this.logger.log(`발주 생성 완료 - 계약 ID: ${savedContract.id}, contractNo: ${savedContract.contractNo || '(없음)'}`);

      // BK 또는 BL 정보가 있으면 TradeOrder 생성 (부킹 등록)
      let savedOrder: TradeOrder | null = null;
      if (dto.bk || dto.bl) {
        // 전체 주문 개수 검증
        if (savedContract.totalOrderCount !== null && savedContract.totalOrderCount !== undefined) {
          const currentOrderCount = await this.tradeOrderRepository.count({
            where: { contract: { id: savedContract.id } },
          });
          
          if (currentOrderCount >= savedContract.totalOrderCount) {
            throw new BadRequestException(
              `계약의 전체 주문 개수(${savedContract.totalOrderCount}개)를 초과할 수 없습니다. 현재 ${currentOrderCount}개의 주문이 등록되어 있습니다.`
            );
          }
        }

        // sequence 자동 할당: 해당 contract의 최대 sequence + 1
        const maxSequenceResult = await this.tradeOrderRepository
          .createQueryBuilder('order')
          .select('MAX(order.sequence)', 'max')
          .where('order.contract = :contractId', { contractId: savedContract.id })
          .andWhere('order.to_deleted_at IS NULL')
          .getRawOne();
        const maxSequence = maxSequenceResult?.max ? Number(maxSequenceResult.max) : 0;
        const nextSequence = dto.shipmentSeq ?? (maxSequence + 1);
        const nextSequenceSub = dto.shipmentSeqSub ?? 0;

        // 수동 순번 입력 시 중복 검사
        if (dto.shipmentSeq != null) {
          const existing = await this.tradeOrderRepository.findOne({
            where: {
              contract: { id: savedContract.id },
              sequence: nextSequence,
              sequenceSub: nextSequenceSub ?? 0,
            },
          });
          if (existing) {
            const displaySeq = (nextSequenceSub ?? 0) > 0 ? `${nextSequence}-${nextSequenceSub}` : String(nextSequence);
            throw new BadRequestException(`이미 사용 중인 순번입니다. (${displaySeq})`);
          }
        }

        // managerUser 조회
        let managerUser: User | null = null;
        if (userId) {
          managerUser = await this.userRepository.findOne({ where: { id: userId } });
        }

        savedOrder = this.tradeOrderRepository.create({
          contract: savedContract,
          sequence: nextSequence,
          sequenceSub: nextSequenceSub,
          contractNo: savedContract.contractNo,
          managerUser: managerUser || null,
          bk: dto.bk?.trim() ?? null,
          bl: dto.bl?.trim() ?? null,
          shippingLine: dto.shippingLine?.trim() ?? null,
          etdText: dto.etd?.trim() ?? null,
          etdDate: dto.etd ? this.parseFlexibleDate(dto.etd) : null,
          etdApiDate: dto.etdApi ? this.parseFlexibleDate(dto.etdApi) : null,
          etaDate: dto.eta ? this.parseFlexibleDate(dto.eta) : null,
          destination: dto.destination?.trim() ?? null,
          quantity: dto.quantity !== null && dto.quantity !== undefined ? dto.quantity.toString() : null,
          grade: dto.grade?.trim() ?? null,
          notes: dto.notes?.trim() ?? null,
          spot: dto.spot?.trim() ? dto.spot.trim().toUpperCase() : null, // 현물은 주문 레벨
          quota: dto.quota?.trim() ? dto.quota.trim().toUpperCase() : null, // 쿼터 유무 주문 레벨 (현물과 동일)
          status: dto.status ?? 'BOOKING', // 기존 status 필드 (호환성 유지)
          tradeStatus: dto.tradeStatus ?? dto.status ?? 'BOOKING', // 무역 상태 (기본값: BOOKING)
          salesStatus: dto.salesStatus ?? 'INBOUND_PENDING', // 영업 상태 (기본값: 입고대기)
          inboundStatus: 'INBOUND_PENDING', // 입고 상태 (기본값: 입고대기)
          financeStatus: dto.financeStatus ?? null, // 재무 상태
        });

        savedOrder = await this.tradeOrderRepository.save(savedOrder);
        this.logger.log(`부킹 TradeOrder 생성 완료 - orderId: ${savedOrder.id}, sequence: ${nextSequence}, sequenceSub: ${nextSequenceSub}, bk: ${dto.bk}, bl: ${dto.bl}`);

        // 컨테이너 정보 저장 (컨테이너 번호 필수)
        if (dto.containers && Array.isArray(dto.containers) && dto.containers.length > 0) {
          const emptyNoIndex = dto.containers.findIndex(
            (c) => c.containerNo == null || String(c.containerNo).trim() === '',
          );
          if (emptyNoIndex !== -1) {
            throw new BadRequestException(
              `컨테이너 ${emptyNoIndex + 1}번에 컨테이너 번호를 입력해주세요.`,
            );
          }
          await this.saveContainersForOrder(savedOrder, dto.containers);
        }

        let bookingScalarSave = false;
        if (dto.bookingTempWeightMt !== undefined) {
          if (dto.bookingTempWeightMt === null || Number.isNaN(Number(dto.bookingTempWeightMt))) {
            savedOrder.bookingTempWeightMt = null;
          } else {
            const n = Number(dto.bookingTempWeightMt);
            savedOrder.bookingTempWeightMt = Number.isFinite(n) ? n.toString() : null;
          }
          bookingScalarSave = true;
        }
        if (dto.bookingTempInvoiceAmount !== undefined) {
          if (dto.bookingTempInvoiceAmount === null || Number.isNaN(Number(dto.bookingTempInvoiceAmount))) {
            savedOrder.bookingTempInvoiceAmount = null;
          } else {
            const n = Number(dto.bookingTempInvoiceAmount);
            savedOrder.bookingTempInvoiceAmount = Number.isFinite(n) ? n.toString() : null;
          }
          bookingScalarSave = true;
        }
        if (bookingScalarSave) {
          await this.tradeOrderRepository.save(savedOrder);
        }
        if (dto.bookingTempPayments !== undefined) {
          await this.replaceBookingTempPayments(savedOrder.id, dto.bookingTempPayments);
        }

        // 부킹 생성은 주문 레벨의 작업이므로 계약 상태는 변경하지 않음
        // 계약 상태는 별도로 "계약 확정" 버튼 등을 통해 명시적으로 변경해야 함
    }

      return {
        success: true,
        message: '발주가 생성되었습니다.',
        orderId: savedOrder?.id ?? savedContract.id,
        sequence: savedOrder?.sequence ?? null,
        sequenceSub: savedOrder?.sequenceSub ?? 0,
      };
    } catch (error: any) {
      this.logger.error('주문 생성 중 오류 발생:', error);
      this.logger.error('주문 생성 DTO:', dto);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error?.message || '주문 생성 중 오류가 발생했습니다.');
    }
  }

  async updateTradeOrder(orderId: string, dto: UpdateTradeOrderDto, userId?: number | null) {
    if (!orderId) {
      throw new BadRequestException('수정할 발주 ID가 필요합니다.');
    }

    // 발주 수정 시작 로그
    this.logger.log(
      {
        context: 'updateTradeOrder:start',
        orderId,
        dtoOrderDate: dto.orderDate ?? null,
        dtoShippingLine: dto.shippingLine ?? null,
      },
      '발주 수정 시작',
    );

    // 먼저 TradeOrder로 찾기 시도 (부킹인 경우)
    const tradeOrder = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['contract'],
    });

    let contract: TradeContract | null = null;
    let order: TradeOrder | null = null;

    if (tradeOrder) {
      // 부킹(TradeOrder)인 경우
      order = tradeOrder;
      contract = tradeOrder.contract;
      this.logger.log(`[updateTradeOrder] TradeOrder 찾음 - orderId: ${tradeOrder.id}, contractId: ${contract.id}`);
    } else {
      // 발주(TradeContract)인 경우
      this.logger.log(`[updateTradeOrder] TradeOrder를 찾지 못함, TradeContract 조회 시도 - id: ${orderId}`);
      contract = await this.tradeContractRepository.findOne({
        where: { id: orderId },
      });

      if (!contract) {
        this.logger.error(`[updateTradeOrder] TradeOrder와 TradeContract 모두 찾지 못함 - id: ${orderId}`);
        throw new NotFoundException(`수정할 발주 또는 부킹을 찾을 수 없습니다. (ID: ${orderId})`);
      }
      this.logger.log(`[updateTradeOrder] TradeContract 찾음 - contractId: ${contract.id}`);
    }

    const auditBeforeMerged = mergeTradeAuditSnapshots(
      snapshotTradeContractAudit(contract),
      order ? snapshotTradeOrderAudit(order) : null,
    );

    this.logger.log(
      {
        context: 'updateTradeOrder:incomingData',
        orderId,
        dtoOrderDate: dto.orderDate ?? null,
        dtoShippingLine: dto.shippingLine ?? null,
        currentOrderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
        currentShippingLine: contract.shippingLine ?? null,
      },
      '발주 수정 요청 주요 필드',
    );

    let contractChanged = false;

    if (dto.contractNo !== undefined) {
      const normalizedContractNo = this.normalizeContractNumber(dto.contractNo);
      // 계약 번호가 변경되는 경우, 중복 체크
      if (normalizedContractNo && normalizedContractNo !== contract.contractNo) {
        const existingContract = await this.tradeContractRepository.findOne({
          where: { contractNo: normalizedContractNo },
        });
        if (existingContract && existingContract.id !== contract.id) {
          throw new BadRequestException(`계약 번호 "${normalizedContractNo}"는 이미 사용 중입니다.`);
        }
      }
      contract.contractNo = normalizedContractNo ?? contract.contractNo;
      contractChanged = true;
    }

    if (dto.exportCountry !== undefined) {
      const normalized = this.normalizeCountry(dto.exportCountry ?? null);
        contract.exportCountry = normalized ?? null;
        this.logger.log(`[계약 수정] exportCountry: ${normalized} (원본: ${dto.exportCountry})`);
        contractChanged = true;
    }

    if (dto.exporter !== undefined) {
      const normalized = this.normalizeExporter(dto.exporter ?? null);
        contract.exporter = normalized ?? null;
        contractChanged = true;
    }

    if (dto.productName !== undefined) {
      const normalized = this.normalizeProduct(dto.productName ?? null);
        contract.productName = normalized ?? null;
        contractChanged = true;
    }

    if (dto.newOld !== undefined) {
      const value = dto.newOld?.trim() ?? null;
      contract.newOld = value && value.length > 0 ? value : null;
      contractChanged = true;
    }

    if (dto.commissionMonth !== undefined) {
      const value = dto.commissionMonth?.trim() ?? null;
      contract.commissionMonth = value && value.length > 0 ? value : null;
      contractChanged = true;
    }

    if (dto.commissionDollar !== undefined) {
      const value = dto.commissionDollar?.trim() ?? null;
      contract.commissionDollar = value && value.length > 0 ? value : null;
      contractChanged = true;
    }

    if (dto.orderDate !== undefined) {
      contract.orderDate = this.parseFlexibleDate(dto.orderDate ?? null);
      contractChanged = true;
    }

    if (dto.totalOrderCount !== undefined) {
      const value = dto.totalOrderCount ?? null;
      if (value != null) {
        const currentOrderCount = await this.tradeOrderRepository.count({
          where: { contract: { id: contract.id } },
        });
        if (value < currentOrderCount) {
          throw new BadRequestException(
            `전체 주문 개수는 현재 등록된 주문 개수(${currentOrderCount}개)보다 작을 수 없습니다.`
          );
        }
      }
      contract.totalOrderCount = value;
      contractChanged = true;
    }

    if (dto.quantity !== undefined) {
      if (dto.quantity === null) {
        contract.quantity = null;
      } else {
        const qty = Number(dto.quantity);
        contract.quantity = Number.isFinite(qty) ? qty.toString() : null;
      }
      contractChanged = true;
    }

    if (dto.grade !== undefined) {
      contract.grade = dto.grade?.trim() ? dto.grade.trim() : null;
      contractChanged = true;
    }

    if (dto.packingType !== undefined) {
      contract.packingType = dto.packingType?.trim() ?? null;
      contractChanged = true;
    }

    if (dto.currency !== undefined) {
      contract.currency = dto.currency?.trim() ?? null;
      contractChanged = true;
    }

    if (dto.unitPrice !== undefined) {
      if (dto.unitPrice === null) {
        contract.unitPrice = null;
      } else {
        const price = Number(dto.unitPrice);
        contract.unitPrice = Number.isFinite(price) ? price.toString() : null;
      }
      contractChanged = true;
    }

    if (dto.destination !== undefined) {
      contract.destination = dto.destination?.trim() ?? null;
      contractChanged = true;
    }

    // 비고: 주문(부킹) 수정 시에는 order.notes에만 반영하고 계약 비고는 건드리지 않음. 계약만 수정하는 경로(order 없음)에서만 contract.notes 반영
    if (dto.notes !== undefined && !order) {
      contract.notes = dto.notes?.trim() ? dto.notes.trim() : null;
      contractChanged = true;
    }

    // 쿼터, 훈증, 관세 유무: 부킹 수정 시에는 주문(order)에만 반영, 계약만 수정 시에만 계약에 반영 (현물과 동일)
    if (dto.quota !== undefined && !order) {
      contract.quota = dto.quota || null;
      contractChanged = true;
      this.logger.log(`[계약 수정] quota: ${contract.quota}`);
    }
    if (dto.fumigation !== undefined) {
      contract.fumigation = dto.fumigation || null;
      contractChanged = true;
      this.logger.log(`[계약 수정] fumigation: ${contract.fumigation}`);
    }
    if (dto.customsDuty !== undefined) {
      contract.customsDuty = dto.customsDuty || null;
      contractChanged = true;
      this.logger.log(`[계약 수정] customsDuty: ${contract.customsDuty}`);
    }

    // 주의: dto.status는 TradeOrder의 상태를 변경하는 것이지, 계약(TradeContract)의 상태를 변경하는 것이 아님
    // 계약 상태는 별도로 관리되며, 주문 상태 변경 시에는 계약 상태를 변경하지 않음

    // 계약서 파일 정보 업데이트
    if (dto.contractGoogleDriveFileId !== undefined) {
      contract.contractGoogleDriveFileId = dto.contractGoogleDriveFileId?.trim() ? dto.contractGoogleDriveFileId.trim() : null;
      contractChanged = true;
    }
    if (dto.contractFileName !== undefined) {
      contract.contractFileName = dto.contractFileName?.trim() ? dto.contractFileName.trim() : null;
      contractChanged = true;
    }

    // 계약 저장
    if (contractChanged) {
      await this.tradeContractRepository.save(contract);
    }

    // 부킹 정보 업데이트: TradeOrder가 있는 경우 (부킹 수정)
    if (order) {
      let orderChanged = false;

      if (dto.bk !== undefined) {
        order.bk = dto.bk?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.bl !== undefined) {
        order.bl = dto.bl?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.shipmentSeq !== undefined) {
        const newSeq = dto.shipmentSeq;
        const newSub = dto.shipmentSeqSub ?? 0;
        // 수동 순번 변경 시 중복 검사 (본인 주문 제외)
        const duplicate = await this.tradeOrderRepository.findOne({
          where: {
            contract: { id: order.contract?.id },
            sequence: newSeq,
            sequenceSub: newSub,
          },
        });
        if (duplicate && String(duplicate.id) !== String(orderId)) {
          const displaySeq = newSub > 0 ? `${newSeq}-${newSub}` : String(newSeq);
          throw new BadRequestException(`이미 사용 중인 순번입니다. (${displaySeq})`);
        }
        order.sequence = newSeq;
        order.sequenceSub = newSub;
        orderChanged = true;
      } else if (dto.shipmentSeqSub !== undefined) {
        const newSub = dto.shipmentSeqSub ?? 0;
        const duplicate = await this.tradeOrderRepository.findOne({
          where: {
            contract: { id: order.contract?.id },
            sequence: order.sequence,
            sequenceSub: newSub,
          },
        });
        if (duplicate && String(duplicate.id) !== String(orderId)) {
          const displaySeq = newSub > 0 ? `${order.sequence}-${newSub}` : String(order.sequence);
          throw new BadRequestException(`이미 사용 중인 순번입니다. (${displaySeq})`);
        }
        order.sequenceSub = newSub;
        orderChanged = true;
      }
      if (dto.destination !== undefined) {
        order.destination = dto.destination?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.etd !== undefined) {
        order.etdText = dto.etd?.trim() ?? null;
        order.etdDate = dto.etd ? this.parseFlexibleDate(dto.etd) : null;
        orderChanged = true;
      }
      if (dto.etdApi !== undefined) {
        order.etdApiDate = dto.etdApi ? this.parseFlexibleDate(dto.etdApi) : null;
        orderChanged = true;
      }
      if (dto.eta !== undefined) {
        order.etaDate = dto.eta ? this.parseFlexibleDate(dto.eta) : null;
        orderChanged = true;
      }
      if (dto.shippingLine !== undefined) {
        order.shippingLine = dto.shippingLine?.trim() ?? null;
        orderChanged = true;
      }
      // status 필드는 더 이상 사용하지 않음 (tradeStatus로 대체됨)
      // dto.status가 있으면 tradeStatus로 변환 (하위 호환성)
      if (dto.status !== undefined && dto.tradeStatus === undefined) {
        order.tradeStatus = dto.status || null;
        orderChanged = true;
        this.logger.log(`[부킹 수정] status -> tradeStatus: ${order.tradeStatus}`);
      }
      if (dto.tradeStatus !== undefined) {
        const previousTradeStatus = order.tradeStatus;
        order.tradeStatus = dto.tradeStatus || null;
        orderChanged = true;
        this.logger.log(`[부킹 수정] tradeStatus: ${previousTradeStatus} -> ${order.tradeStatus}`);
        
      }
      if (dto.salesStatus !== undefined) {
        order.salesStatus = dto.salesStatus ?? null;
        // inboundStatus 동기화 (입고 확정재고 목록과 입고 확정 목록 일치)
        if (
          dto.salesStatus === 'INBOUND_PENDING' ||
          dto.salesStatus === 'INBOUND_SCHEDULED' ||
          dto.salesStatus === 'INBOUND_CONFIRMED'
        ) {
          order.inboundStatus = dto.salesStatus;
        }
        orderChanged = true;
        this.logger.log(`[부킹 수정] salesStatus: ${order.salesStatus}`);
      }
      if (dto.financeStatus !== undefined) {
        order.financeStatus = dto.financeStatus || null;
        orderChanged = true;
        this.logger.log(`[부킹 수정] financeStatus: ${order.financeStatus}`);
      }
      if (dto.excludeFromLogistics !== undefined) {
        order.excludeFromLogistics = dto.excludeFromLogistics === true;
        orderChanged = true;
        this.logger.log(`[부킹 수정] excludeFromLogistics: ${order.excludeFromLogistics}`);
      }
      if (dto.shipBack !== undefined) {
        order.shipBack = dto.shipBack === true;
        orderChanged = true;
        this.logger.log(`[부킹 수정] shipBack: ${order.shipBack}`);
      }

      // 송장 정보 업데이트
      if (dto.invoiceNumber !== undefined) {
        order.invoiceNumber = dto.invoiceNumber?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.invoiceDate !== undefined) {
        order.invoiceDate = dto.invoiceDate ? this.parseFlexibleDate(dto.invoiceDate) : null;
        orderChanged = true;
      }
      if (dto.invoiceCurrency !== undefined) {
        order.invoiceCurrency = dto.invoiceCurrency?.trim() ? dto.invoiceCurrency.trim().toUpperCase() : null;
        orderChanged = true;
      }
      if (dto.invoiceAmount !== undefined) {
        if (dto.invoiceAmount === null || Number.isNaN(dto.invoiceAmount)) {
          order.invoiceAmount = null;
        } else {
          order.invoiceAmount = dto.invoiceAmount.toString();
        }
        orderChanged = true;
      }
      if (dto.invoiceWeight !== undefined) {
        if (dto.invoiceWeight === null || Number.isNaN(dto.invoiceWeight)) {
          order.invoiceWeight = null;
        } else {
          order.invoiceWeight = dto.invoiceWeight.toString();
        }
        orderChanged = true;
      }
      if (dto.invoiceGoogleDriveFileId !== undefined) {
        order.invoiceGoogleDriveFileId = dto.invoiceGoogleDriveFileId?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.invoiceFileName !== undefined) {
        order.invoiceFileName = dto.invoiceFileName?.trim() ?? null;
        orderChanged = true;
      }

      // 필증번호 업데이트
      if (dto.certificateNumber !== undefined) {
        order.certificateNumber = dto.certificateNumber?.trim() ?? null;
        orderChanged = true;
      }

      // 원본발송 유무 업데이트
      if (dto.hasOriginalShipment !== undefined) {
        order.hasOriginalShipment = dto.hasOriginalShipment?.trim() ? dto.hasOriginalShipment.trim().toUpperCase() : null;
        orderChanged = true;
      }

      // 원본발송일 업데이트
      if (dto.originalShipment !== undefined) {
        order.originalShipment = dto.originalShipment?.trim() || null;
        orderChanged = true;
      }

      // 주문 비고 업데이트 (주문 단위로만 저장, 계약 비고는 변경하지 않음)
      if (dto.notes !== undefined) {
        order.notes = dto.notes?.trim() ? dto.notes.trim() : null;
        orderChanged = true;
      }

      // 영업 비고 업데이트 (입고 확정 등)
      if (dto.salesNotes !== undefined) {
        order.salesNotes = dto.salesNotes?.trim() ? dto.salesNotes.trim() : null;
        orderChanged = true;
      }

      // DO 문서 업데이트
      if (dto.doGoogleDriveFileId !== undefined) {
        order.doGoogleDriveFileId = dto.doGoogleDriveFileId?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.doFileName !== undefined) {
        order.doFileName = dto.doFileName?.trim() ?? null;
        orderChanged = true;
      }


      // 통관 면장 파일 업데이트
      if (dto.customsCertificateGoogleDriveFileId !== undefined) {
        order.customsCertificateGoogleDriveFileId = dto.customsCertificateGoogleDriveFileId?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.customsCertificateFileName !== undefined) {
        order.customsCertificateFileName = dto.customsCertificateFileName?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.customsCertificateGoogleDriveFileId2 !== undefined) {
        order.customsCertificateGoogleDriveFileId2 = dto.customsCertificateGoogleDriveFileId2?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.customsCertificateFileName2 !== undefined) {
        order.customsCertificateFileName2 = dto.customsCertificateFileName2?.trim() ?? null;
        orderChanged = true;
      }
      if (dto.customsDate !== undefined) {
        order.customsDate = dto.customsDate ? this.parseFlexibleDate(dto.customsDate) : null;
        orderChanged = true;
      }
      if (dto.quarantineDate !== undefined) {
        order.quarantineDate = dto.quarantineDate ? this.parseFlexibleDate(dto.quarantineDate) : null;
        orderChanged = true;
      }
      if (dto.customsScheduledDate !== undefined) {
        order.customsScheduledDate = dto.customsScheduledDate ? this.parseFlexibleDate(dto.customsScheduledDate) : null;
        orderChanged = true;
      }

      // 현물 유무 업데이트 (주문 레벨)
      if (dto.spot !== undefined) {
        order.spot = dto.spot?.trim() ? dto.spot.trim().toUpperCase() : null;
        orderChanged = true;
        this.logger.log(`[부킹 수정] spot: ${order.spot}`);
      }
      if (dto.quota !== undefined) {
        order.quota = dto.quota?.trim() ? dto.quota.trim().toUpperCase() : null;
        orderChanged = true;
        this.logger.log(`[부킹 수정] quota: ${order.quota}`);
      }
      if (dto.commissionMonth !== undefined) {
        const value = dto.commissionMonth?.trim() ?? null;
        order.commissionMonth = value && value.length > 0 ? value : null;
        orderChanged = true;
      }
      if (dto.commissionDollar !== undefined) {
        const value = dto.commissionDollar?.trim() ?? null;
        order.commissionDollar = value && value.length > 0 ? value : null;
        orderChanged = true;
      }

      if (dto.bookingTempWeightMt !== undefined) {
        if (dto.bookingTempWeightMt === null || Number.isNaN(Number(dto.bookingTempWeightMt))) {
          order.bookingTempWeightMt = null;
        } else {
          const n = Number(dto.bookingTempWeightMt);
          order.bookingTempWeightMt = Number.isFinite(n) ? n.toString() : null;
        }
        orderChanged = true;
      }
      if (dto.bookingTempInvoiceAmount !== undefined) {
        if (dto.bookingTempInvoiceAmount === null || Number.isNaN(Number(dto.bookingTempInvoiceAmount))) {
          order.bookingTempInvoiceAmount = null;
        } else {
          const n = Number(dto.bookingTempInvoiceAmount);
          order.bookingTempInvoiceAmount = Number.isFinite(n) ? n.toString() : null;
        }
        orderChanged = true;
      }

      if (orderChanged) {
        await this.tradeOrderRepository.save(order);
        this.logger.log(`TradeOrder 업데이트 완료 - orderId: ${order.id}`);
      }

      if (dto.bookingTempPayments !== undefined) {
        await this.replaceBookingTempPayments(order.id, dto.bookingTempPayments);
      }

      // 컨테이너 정보 업데이트
      if (dto.containers !== undefined) {
        if (dto.containers && Array.isArray(dto.containers) && dto.containers.length > 0) {
          // 컨테이너 번호 필수: 빈 번호가 있으면 저장/수정 불가
          const emptyNoIndex = dto.containers.findIndex(
            (c) => c.containerNo == null || String(c.containerNo).trim() === '',
          );
          if (emptyNoIndex !== -1) {
            throw new BadRequestException(
              `컨테이너 ${emptyNoIndex + 1}번에 컨테이너 번호를 입력해주세요.`,
            );
          }
          // 컨테이너 번호 또는 상세 정보가 있으면 전체 업데이트 (번호 변경 반영). 없으면 중량/베일만 업데이트
          const hasFullContainerInfo = dto.containers.some(
            (c) => (c.containerNo != null && String(c.containerNo).trim() !== '') || c.product || c.tradeGrade || c.packingType || c.currency || c.unitPrice,
          );
          // 전체 정보가 있으면 전체 업데이트 모드 (containerNo 포함, 삭제 포함)
          // 전체 정보가 없으면 중량/베일만 업데이트 (기존 정보 유지)
          await this.saveContainersForOrder(order, dto.containers, {
            updateOnlyWeightAndBales: !hasFullContainerInfo,
          });
        } else {
          // 빈 배열이면 모든 컨테이너 삭제
          await this.tradeContainerRepository.delete({ order: { id: order.id } as any });
        }
      }

      // 결제 정보 업데이트
      if (dto.payments !== undefined) {
        if (dto.payments && Array.isArray(dto.payments) && dto.payments.length > 0) {
          await this.savePaymentsForOrder(order, dto.payments);
        } else {
          // 빈 배열이면 모든 결제 정보 삭제
          await this.tradeOrderPaymentRepository.delete({ order: { id: order.id } as any });
          // 결제 정보가 없으면 financeStatus 및 최종 가중 환율/최종원가 초기화
          order.financeStatus = null;
          await this.tradeOrderRepository.save(order);
          await this.clearFinalPurchaseCostForOrder(order.id);
        }
      }
    }

    const contractReloaded = await this.tradeContractRepository.findOne({
      where: { id: contract.id },
    });
    const orderReloaded =
      order && contractReloaded
        ? await this.tradeOrderRepository.findOne({
            where: { id: order.id },
          })
        : null;
    if (contractReloaded) {
      const auditAfterMerged = mergeTradeAuditSnapshots(
        snapshotTradeContractAudit(contractReloaded),
        orderReloaded ? snapshotTradeOrderAudit(orderReloaded) : null,
      );
      const { changedFields, oldData, newData } = diffTradeAuditSnapshots(
        auditBeforeMerged,
        auditAfterMerged,
      );
      const hasScalarChanges = Object.keys(changedFields).length > 0;
      const hadRelatedRequest =
        !!order &&
        (dto.containers !== undefined ||
          dto.payments !== undefined ||
          dto.bookingTempPayments !== undefined);
      if (hasScalarChanges || hadRelatedRequest) {
        const summaryParts: string[] = [];
        if (changedFields['order.bk'] || changedFields['order.bl']) {
          summaryParts.push('BK/BL 변경');
        }
        if (hasScalarChanges) {
          summaryParts.push(`스칼라 ${Object.keys(changedFields).length}건`);
        }
        if (hadRelatedRequest) {
          summaryParts.push('컨테이너·결제·임시결제 요청');
        }
        const entityIdNum = orderReloaded
          ? Number.parseInt(String(orderReloaded.id), 10)
          : Number.parseInt(String(contractReloaded.id), 10);
        await this.featureAuditLogService
          .create({
            domain: 'TRADE',
            feature: orderReloaded ? 'TRADE_ORDER' : 'TRADE_CONTRACT',
            action: 'UPDATED',
            userId: userId ?? null,
            summary:
              (orderReloaded ? '부킹 수정' : '발주(계약) 수정') +
              ` ${contractReloaded.contractNo ?? orderId}` +
              (summaryParts.length ? ` · ${summaryParts.join(' · ')}` : ''),
            entityType: orderReloaded ? 'trade_order' : 'trade_contract',
            entityId: Number.isNaN(entityIdNum) ? undefined : entityIdNum,
            payload: {
              contractId: contractReloaded.id,
              orderId: orderReloaded?.id ?? null,
              requestParamId: orderId,
              relatedSectionsRequested: order
                ? {
                    containers: dto.containers !== undefined,
                    payments: dto.payments !== undefined,
                    bookingTempPayments: dto.bookingTempPayments !== undefined,
                  }
                : null,
            },
            oldData: hasScalarChanges ? oldData : null,
            newData: hasScalarChanges ? newData : null,
            changedFields: hasScalarChanges ? changedFields : null,
            description: hadRelatedRequest
              ? '컨테이너·부킹임시결제·결제 배열은 필드 diff에 미포함. TRADE_INVENTORY 등 별도 이력 참고.'
              : null,
          })
          .catch((err) =>
            this.logger.warn('[기능이력] 무역 발주/부킹 수정 로그 저장 실패', err),
          );
      }
    }

    // 저장 완료 로그
      this.logger.log(
        {
        context: 'updateTradeOrder:complete',
        orderId: contract.id,
        savedOrderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
        savedShippingLine: order?.shippingLine ?? null,
        savedGrade: contract.grade ?? null,
        savedQuantity: contract.quantity ? Number(contract.quantity) : null,
      },
      '발주 수정 저장 완료',
    );

    return {
      success: true,
      message: '발주가 수정되었습니다.',
      contractUpdated: contractChanged,
    };
  }

  async updateTradeContract(contractId: string, dto: UpdateTradeContractDto, userId?: number | null) {
    if (!contractId) {
      throw new BadRequestException('계약 ID가 필요합니다.');
    }

    const contract = await this.tradeContractRepository.findOne({
      where: { id: contractId },
    });

    if (!contract) {
      throw new NotFoundException('계약을 찾을 수 없습니다.');
    }

    const auditBeforeContract = mergeTradeAuditSnapshots(snapshotTradeContractAudit(contract), null);

    // 기본 정보
    if (dto.contractNo !== undefined) {
      contract.contractNo = dto.contractNo?.trim() || null;
    }
    if (dto.exporter !== undefined) {
      contract.exporter = dto.exporter?.trim() || null;
    }
    if (dto.exportCountry !== undefined) {
      contract.exportCountry = dto.exportCountry?.trim() || null;
    }
    if (dto.productName !== undefined) {
      contract.productName = dto.productName?.trim() || null;
    }
    if (dto.quota !== undefined) {
      contract.quota = dto.quota || null;
    }
    if (dto.fumigation !== undefined) {
      contract.fumigation = dto.fumigation || null;
    }
    if (dto.customsDuty !== undefined) {
      contract.customsDuty = dto.customsDuty || null;
    }
    if (dto.status !== undefined) {
      contract.status = dto.status || null;
    }
    if (dto.contractGoogleDriveFileId !== undefined) {
      contract.contractGoogleDriveFileId = dto.contractGoogleDriveFileId?.trim() || null;
    }
    if (dto.contractFileName !== undefined) {
      contract.contractFileName = dto.contractFileName?.trim() || null;
    }

    // 발주 기본 정보
    if (dto.orderDate !== undefined) {
      contract.orderDate = dto.orderDate ? this.parseFlexibleDate(dto.orderDate) : null;
    }

    // 상품 정보
    if (dto.grade !== undefined) {
      contract.grade = dto.grade?.trim() || null;
    }
    if (dto.packingType !== undefined) {
      contract.packingType = dto.packingType?.trim() || null;
    }
    if (dto.quantity !== undefined) {
      contract.quantity = dto.quantity !== null && dto.quantity !== undefined ? dto.quantity.toString() : null;
    }

    // 가격 정보
    if (dto.unitPrice !== undefined) {
      contract.unitPrice = dto.unitPrice !== null && dto.unitPrice !== undefined ? dto.unitPrice.toString() : null;
    }
    if (dto.currency !== undefined) {
      contract.currency = dto.currency?.trim() || null;
    }
    if (dto.commissionDollar !== undefined) {
      contract.commissionDollar = dto.commissionDollar?.trim() || null;
    }
    if (dto.commissionMonth !== undefined) {
      contract.commissionMonth = dto.commissionMonth?.trim() || null;
    }

    // 기타 정보
    if (dto.destination !== undefined) {
      contract.destination = dto.destination?.trim() || null;
    }
    if (dto.notes !== undefined) {
      contract.notes = dto.notes?.trim() || null;
    }
    if (dto.newOld !== undefined) {
      contract.newOld = dto.newOld?.trim() || null;
    }
    if (dto.totalOrderCount !== undefined) {
      // 전체 개수가 현재 주문 개수보다 작으면 에러
        if (dto.totalOrderCount !== null && dto.totalOrderCount !== undefined) {
          const currentOrderCount = await this.tradeOrderRepository.count({
            where: { contract: { id: contract.id } },
          });
          if (dto.totalOrderCount < currentOrderCount) {
            throw new BadRequestException(
              `전체 주문 개수는 현재 등록된 주문 개수(${currentOrderCount}개)보다 작을 수 없습니다.`
            );
          }
        }
      contract.totalOrderCount = dto.totalOrderCount ?? null;
    }

    if (dto.monthlyOrderPlan !== undefined) {
      contract.monthlyOrderPlan = dto.monthlyOrderPlan ?? null;
    }

    await this.tradeContractRepository.save(contract);

    this.logger.log(`[updateTradeContract] 완료 - contractId: ${contractId}`);

    const contractReloaded = await this.tradeContractRepository.findOne({
      where: { id: contractId },
    });
    if (contractReloaded) {
      const auditAfterContract = mergeTradeAuditSnapshots(
        snapshotTradeContractAudit(contractReloaded),
        null,
      );
      const { changedFields, oldData, newData } = diffTradeAuditSnapshots(
        auditBeforeContract,
        auditAfterContract,
      );
      if (Object.keys(changedFields).length > 0) {
        const entityIdNum = Number.parseInt(String(contractReloaded.id), 10);
        await this.featureAuditLogService
          .create({
            domain: 'TRADE',
            feature: 'TRADE_CONTRACT',
            action: 'UPDATED',
            userId: userId ?? null,
            summary: `계약 수정 ${contractReloaded.contractNo ?? contractId} · ${Object.keys(changedFields).length}건`,
            entityType: 'trade_contract',
            entityId: Number.isNaN(entityIdNum) ? undefined : entityIdNum,
            payload: { contractId: contractReloaded.id },
            oldData,
            newData,
            changedFields,
          })
          .catch((err) => this.logger.warn('[기능이력] 무역 계약 수정 로그 저장 실패', err));
      }
    }

    return {
      success: true,
      message: '계약이 수정되었습니다.',
      contract: await this.getTradeContract(contractId),
    };
  }

  async listTradeContracts(contractStatuses?: string[], productNames?: string[], contractNo?: string, createdById?: number, exporters?: string[]) {
    this.logger.log(`[listTradeContracts] 시작 - contractStatuses: ${contractStatuses?.join(',') ?? '전체'}, productNames: ${productNames?.join(',') ?? '전체'}, contractNo: ${contractNo ?? '전체'}, createdById: ${createdById ?? '전체'}, exporters: ${exporters?.join(',') ?? '전체'}`);
    
    // 쿼리 빌더 사용
    const qb = this.tradeContractRepository
      .createQueryBuilder('contract')
      .leftJoinAndSelect('contract.createdBy', 'createdBy')
      .leftJoinAndSelect('contract.orders', 'orders', 'orders.to_deleted_at IS NULL');
    
    // 계약 상태 필터 (다중 선택 지원)
    if (contractStatuses !== undefined && contractStatuses.length > 0 && !contractStatuses.includes('__EMPTY__')) {
      const hasOrder = contractStatuses.includes('ORDER');
        const hasContract = contractStatuses.includes('__contract__');
        const hasNull = contractStatuses.includes('__null__');
        if (hasOrder && (hasContract || hasNull)) {
          // 전체 선택과 동일: 필터 없음
        } else if (hasOrder) {
          qb.andWhere('contract.status = :contractStatus', { contractStatus: 'ORDER' });
        } else if (hasContract && hasNull) {
          qb.andWhere('(contract.status != :excludedStatus OR contract.status IS NULL)', { excludedStatus: 'ORDER' });
        } else if (hasContract) {
          qb.andWhere('contract.status != :excludedStatus', { excludedStatus: 'ORDER' });
          qb.andWhere('contract.status IS NOT NULL');
        } else if (hasNull) {
          qb.andWhere('contract.status IS NULL');
        } else {
          // 기타 단일 값 (하위 호환)
          const single = contractStatuses[0];
          if (single === '__all__') {
            // 필터 없음
        } else {
          qb.andWhere('contract.status = :contractStatus', { contractStatus: single });
        }
      }
    } else if (contractStatuses?.includes('__EMPTY__') || (Array.isArray(contractStatuses) && contractStatuses.length === 0)) {
      qb.andWhere('1 = 0'); // 아무것도 선택 안 함 → 빈 결과
    }
    // contractStatuses가 undefined이면 필터를 적용하지 않음 (ORDER 포함 전체 조회)
    
    // 제품 필터 (다중 선택). 빈 배열이면 선택 안 함 = 결과 없음. undefined면 필터 없음
    if (productNames !== undefined) {
      if (productNames.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('contract.productName IN (:...productNames)', { productNames });
      }
    }

    // 계약번호 필터 (부분 일치 검색, ILIKE)
    if (contractNo && contractNo !== '__all__' && contractNo.trim() !== '') {
      const contractNoPattern = `%${contractNo.trim().replace(/%/g, '\\%')}%`;
      qb.andWhere('contract.contractNo ILIKE :contractNoPattern', { contractNoPattern });
    }

    // 생성자 필터
    if (createdById !== undefined) {
      qb.andWhere('contract.createdBy.id = :createdById', { createdById });
    }

    // 수출사 필터 (다중 선택). 빈 배열이면 선택 안 함 = 결과 없음
    if (exporters !== undefined) {
      if (exporters.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('contract.exporter IN (:...exporters)', { exporters });
      }
    }

    qb.orderBy('contract.contractNo', 'ASC')
      .addOrderBy('contract.createdAt', 'DESC');

    const contracts = await qb.getMany();

    this.logger.log(`[listTradeContracts] 계약 개수: ${contracts.length}`);

    // 코드 정보 조회
    const codeGroups = ['EXPORT_COUNTRY', 'EXPORTER', 'PRODUCT', 'SHIPPING_LINE', 'TRADE_GRADE', 'CURRENCY', 'DESTINATION_PORT', 'PACKING_TYPE', 'TRADE_ORDER_STATUS'];
    const allCodes = await this.codeRepository.find({
      where: { group: In(codeGroups) },
      order: { name: 'ASC' },
    });

    const normalizeKey = (value: string) => value.trim().toUpperCase();

    const codeMap = new Map<string, Map<string, string>>();
    codeGroups.forEach(group => {
      codeMap.set(group, new Map());
    });
    allCodes.forEach((code) => {
      if (code.value && codeMap.has(code.group)) {
        codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
      }
    });

    const getCodeName = (group: string, value?: string | null) => {
      if (!value) return null;
      return codeMap.get(group)?.get(normalizeKey(value)) || null;
    };

    // 무역 상태 코드 이름 매핑 (TRADE_ORDER_STATUS 그룹 사용)
    const tradeStatusCodeMap = codeMap.get('TRADE_ORDER_STATUS') || new Map();
    const getTradeStatusName = (value: string) => {
      return tradeStatusCodeMap.get(normalizeKey(value)) || value;
    };

    const result = contracts.map((contract) => {
      // 주문 상태 집계
      const orders = contract.orders || [];
      // 무역 상태만 집계 (코드 이름 매핑을 위해 코드 정보 필요)
      const tradeStatusSummary: Record<string, number> = {};

      orders.forEach((order) => {
        // 무역 상태 집계 (tradeStatus 우선, 없으면 status 사용)
        const tradeStatus = order.tradeStatus || order.status || null;
        const tradeStatusKey = tradeStatus ? String(tradeStatus).toUpperCase() : 'null';
        
        // 동적으로 상태 카운트 증가
        if (!tradeStatusSummary[tradeStatusKey]) {
          tradeStatusSummary[tradeStatusKey] = 0;
        }
        tradeStatusSummary[tradeStatusKey]++;
      });

      // 월별 실제 주문 개수 계산 (ETD 기준)
      const monthlyOrderActual: Record<string, number> = {};
      orders.forEach((order) => {
        if (order.etdDate) {
          // etdDate가 Date 객체가 아닐 수 있으므로 변환
          const etdDateObj = order.etdDate instanceof Date 
            ? order.etdDate 
            : this.parseFlexibleDate(typeof order.etdDate === 'string' ? order.etdDate : null);
          if (etdDateObj) {
            const yearMonth = this.formatIsoMonth(etdDateObj);
            monthlyOrderActual[yearMonth] = (monthlyOrderActual[yearMonth] || 0) + 1;
          }
        }
      });

      // 상태 이름으로 변환된 집계 결과
      const orderStatusSummary: Record<string, number> = {};
      Object.entries(tradeStatusSummary).forEach(([status, count]) => {
        if (count > 0 && status !== 'null') {
          const statusName = getTradeStatusName(status);
          orderStatusSummary[statusName] = (orderStatusSummary[statusName] || 0) + count;
        }
      });

      // 선사: 계약에는 없음. 발주(ORDER)일 때만 첫 번째 주문의 선사 사용
      const firstOrder = orders[0];
      const shippingLineCode =
        contract.status === 'ORDER' && firstOrder ? (firstOrder.shippingLine ?? null) : null;
      const shippingLineName =
        shippingLineCode ? (getCodeName('SHIPPING_LINE', shippingLineCode) ?? shippingLineCode) : null;

      return {
        id: String(contract.id),
        contractId: String(contract.id),
        contractNo: contract.contractNo || null,
        status: contract.status || null,
        contractStatus: contract.status || null,
        exportCountry: contract.exportCountry || null,
        exportCountryName: getCodeName('EXPORT_COUNTRY', contract.exportCountry) || contract.exportCountry || null,
        exporter: contract.exporter || null,
        exporterName: getCodeName('EXPORTER', contract.exporter) || contract.exporter || null,
        productName: contract.productName || null,
        quota: contract.quota || null,
        fumigation: contract.fumigation || null,
        spot: null, // 현물은 주문 레벨이므로 계약에서는 null
        customsDuty: contract.customsDuty || null,
        contractGoogleDriveFileId: contract.contractGoogleDriveFileId || null,
        contractFileName: contract.contractFileName || null,
        // 발주 기본 정보
        orderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
        // 선적 정보 (주문에만 있음, 발주일 때 첫 주문 값 사용)
        shippingLine: shippingLineCode,
        shippingLineName,
        // 상품 정보
        grade: contract.grade || null,
        gradeName: getCodeName('TRADE_GRADE', contract.grade) || contract.grade || null,
        packing: contract.packingType || null,
        packingName: getCodeName('PACKING_TYPE', contract.packingType) || contract.packingType || null,
        quantity: contract.quantity ? parseFloat(String(contract.quantity)) : null,
        // 가격 정보
        unitPrice: contract.unitPrice ? parseFloat(String(contract.unitPrice)) : null,
        currency: contract.currency || null,
        currencyName: getCodeName('CURRENCY', contract.currency) || contract.currency || null,
        commissionDollar: contract.commissionDollar || null,
        commissionMonth: contract.commissionMonth || null,
        // 기타 정보
        destination: contract.destination || null,
        destinationName: getCodeName('DESTINATION_PORT', contract.destination) || contract.destination || null,
        notes: contract.notes || null,
        newOld: contract.newOld || null,
        createdAt: contract.createdAt.toISOString(),
        updatedAt: contract.updatedAt.toISOString(),
        createdBy: contract.createdBy ? {
          id: contract.createdBy.id,
          name: contract.createdBy.name,
          email: contract.createdBy.email,
        } : null,
        orderCount: contract.orders?.length || 0, // 현재 주문 개수
        totalOrderCount: contract.totalOrderCount ?? null, // 전체 계획 주문 개수
        monthlyOrderPlan: contract.monthlyOrderPlan ?? null, // 월별 주문 계획
        monthlyOrderActual: Object.keys(monthlyOrderActual).length > 0 ? monthlyOrderActual : null, // 월별 실제 주문 개수
        // 주문 상태 집계 정보
        orderStatusSummary: orderStatusSummary,
      };
    });

    return result;
  }

  async getTradeContract(id: string) {
    this.logger.log(`[getTradeContract] 시작 - id: ${id}`);
    
    const contract = await this.tradeContractRepository.findOne({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundException('계약을 찾을 수 없습니다.');
    }

    // 코드 정보 조회
    const codeGroups = ['EXPORT_COUNTRY', 'EXPORTER', 'PRODUCT', 'SHIPPING_LINE', 'TRADE_GRADE', 'CURRENCY', 'DESTINATION_PORT', 'PACKING_TYPE'];
    const allCodes = await this.codeRepository.find({
      where: { group: In(codeGroups) },
      order: { name: 'ASC' },
    });

    const normalizeKey = (value: string) => value.trim().toUpperCase();

    const codeMap = new Map<string, Map<string, string>>();
    codeGroups.forEach(group => {
      codeMap.set(group, new Map());
    });
    allCodes.forEach((code) => {
      if (code.value && codeMap.has(code.group)) {
        codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
      }
    });

    const getCodeName = (group: string, value?: string | null) => {
      if (!value) return null;
      return codeMap.get(group)?.get(normalizeKey(value)) || null;
    };

    // 월별 실제 주문 개수 계산 (ETD 기준) + 발주일 때 선사는 첫 주문에서 조회
    const ordersForContract = await this.tradeOrderRepository.find({
      where: { contract: { id: contract.id } },
      select: ['etdDate', 'shippingLine'],
    });
    const monthlyOrderActual: Record<string, number> = {};
    ordersForContract.forEach((order) => {
      if (order.etdDate) {
        // etdDate가 Date 객체가 아닐 수 있으므로 변환
        const etdDateObj = order.etdDate instanceof Date 
          ? order.etdDate 
          : this.parseFlexibleDate(typeof order.etdDate === 'string' ? order.etdDate : null);
        if (etdDateObj) {
          const yearMonth = this.formatIsoMonth(etdDateObj);
          monthlyOrderActual[yearMonth] = (monthlyOrderActual[yearMonth] || 0) + 1;
        }
      }
    });
    const firstOrderForShipping =
      contract.status === 'ORDER' && ordersForContract[0] ? ordersForContract[0].shippingLine ?? null : null;
    const shippingLineForResponse = firstOrderForShipping;
    const shippingLineNameForResponse = shippingLineForResponse
      ? (getCodeName('SHIPPING_LINE', shippingLineForResponse) ?? shippingLineForResponse)
      : null;

    return {
      id: String(contract.id),
      contractId: String(contract.id),
      contractNo: contract.contractNo || null,
      status: contract.status || null,
      contractStatus: contract.status || null,
      exportCountry: contract.exportCountry || null,
      exportCountryName: getCodeName('EXPORT_COUNTRY', contract.exportCountry) || contract.exportCountry || null,
      exporter: contract.exporter || null,
      exporterName: getCodeName('EXPORTER', contract.exporter) || contract.exporter || null,
      productName: contract.productName || null,
      quota: contract.quota || null,
      fumigation: contract.fumigation || null,
      spot: null, // 현물은 주문 레벨이므로 계약에서는 null
      customsDuty: contract.customsDuty || null,
      contractGoogleDriveFileId: contract.contractGoogleDriveFileId || null,
      contractFileName: contract.contractFileName || null,
      // 발주 기본 정보
      orderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
      // 선적 정보 (주문에만 있음, 발주일 때 첫 주문 값 사용)
      shippingLine: shippingLineForResponse,
      shippingLineName: shippingLineNameForResponse,
      // 상품 정보
      grade: contract.grade || null,
      gradeName: getCodeName('TRADE_GRADE', contract.grade) || contract.grade || null,
      packing: contract.packingType || null,
      packingName: getCodeName('PACKING_TYPE', contract.packingType) || contract.packingType || null,
      quantity: contract.quantity ? parseFloat(String(contract.quantity)) : null,
      // 가격 정보
      unitPrice: contract.unitPrice ? parseFloat(String(contract.unitPrice)) : null,
      currency: contract.currency || null,
      currencyName: getCodeName('CURRENCY', contract.currency) || contract.currency || null,
      commissionDollar: contract.commissionDollar || null,
      commissionMonth: contract.commissionMonth || null,
      // 기타 정보
      destination: contract.destination || null,
      destinationName: getCodeName('DESTINATION_PORT', contract.destination) || contract.destination || null,
      notes: contract.notes || null,
      newOld: contract.newOld || null,
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString(),
      createdBy: contract.createdBy ? {
        id: contract.createdBy.id,
        name: contract.createdBy.name,
        email: contract.createdBy.email,
      } : null,
      orderCount: await this.tradeOrderRepository.count({
        where: { contract: { id: contract.id } },
      }),
      totalOrderCount: contract.totalOrderCount ?? null,
      monthlyOrderPlan: contract.monthlyOrderPlan ?? null,
      monthlyOrderActual: Object.keys(monthlyOrderActual).length > 0 ? monthlyOrderActual : null,
    };
  }

  async deleteTradeOrder(
    orderId: string,
    deletedByUserId?: number | null,
    clientPath?: string | null,
  ) {
    if (!orderId) {
      throw new BadRequestException('삭제할 발주 ID가 필요합니다.');
    }

    const normalizedClientPath =
      typeof clientPath === 'string' && clientPath.trim().length > 0
        ? clientPath.trim().slice(0, 500)
        : null;

    // 먼저 TradeOrder로 시도 (부킹 삭제인 경우) — 소프트 삭제된 행 포함 조회
    const tradeOrder = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['contract'],
      withDeleted: true,
    });

    let parentContract: TradeContract | null = tradeOrder?.contract ?? null;
    if (tradeOrder && !parentContract) {
      const rows = await this.dataSource.query<Array<{ tc_id: string }>>(
        'SELECT tc_id::text AS tc_id FROM tb_trade_order WHERE to_id = $1 LIMIT 1',
        [orderId],
      );
      const cid = rows[0]?.tc_id;
      if (cid) {
        parentContract = await this.tradeContractRepository.findOne({
          where: { id: String(cid) },
          withDeleted: true,
        });
      }
    }

    if (tradeOrder && !parentContract) {
      throw new NotFoundException(`부킹에 연결된 계약을 찾을 수 없습니다. (ID: ${orderId})`);
    }

    if (tradeOrder && parentContract) {
      if (parentContract.deletedAt) {
        throw new BadRequestException('삭제 처리된 계약에 속한 부킹입니다.');
      }
      if (tradeOrder.deletedAt) {
        throw new BadRequestException('이미 삭제 처리된 부킹입니다.');
      }
      const deletedEntityId = Number.parseInt(String(orderId), 10);
      const orderSnapshot = {
        orderId: tradeOrder.id,
        contractId: parentContract.id,
        contractNo: tradeOrder.contractNo,
        sequence: tradeOrder.sequence,
        sequenceSub: tradeOrder.sequenceSub,
        bl: tradeOrder.bl,
      };
      await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(TradeOrder);
        await repo.update({ id: orderId }, { deletedByUserId: deletedByUserId ?? null });
        await repo.softDelete({ id: orderId });
      });
      this.logger.log(`TradeOrder 소프트 삭제 완료 - orderId: ${orderId}`);
      await this.featureAuditLogService.create({
        domain: 'TRADE',
        feature: 'TRADE_ORDER',
        action: 'DELETED',
        userId: deletedByUserId ?? null,
        summary: `부킹 ${tradeOrder.contractNo ?? orderId} 삭제 처리`,
        entityType: 'trade_order',
        entityId: Number.isNaN(deletedEntityId) ? undefined : deletedEntityId,
        payload: {
          ...orderSnapshot,
          deletionType: 'SOFT_DELETE',
          deletedByUserId: deletedByUserId ?? null,
          ...(normalizedClientPath ? { clientPath: normalizedClientPath } : {}),
        },
        oldData: orderSnapshot,
      }).catch((err) => this.logger.warn('[기능이력] 무역 부킹 삭제 로그 저장 실패', err));

      return {
        success: true,
        deletedOrderId: orderId,
        message: '부킹이 삭제 처리되었습니다.',
      };
    }

    throw new NotFoundException(
      '해당 ID의 부킹(주문)을 찾을 수 없습니다. 계약(발주) 전체 삭제는 계약 삭제 API를 사용하세요.',
    );
  }

  /**
   * 계약(tb_trade_contract) 및 소속 부킹 전체 소프트 삭제.
   * `DELETE .../orders/:id`와 분리: tc_id·to_id가 같은 숫자일 때 주문이 먼저 매칭되어 계약 삭제가 주문 삭제로 잘못 처리되는 문제를 방지합니다.
   */
  async deleteTradeContract(
    contractId: string,
    deletedByUserId?: number | null,
    clientPath?: string | null,
  ) {
    if (!contractId) {
      throw new BadRequestException('삭제할 발주(계약) ID가 필요합니다.');
    }

    const normalizedClientPath =
      typeof clientPath === 'string' && clientPath.trim().length > 0
        ? clientPath.trim().slice(0, 500)
        : null;

    const contract = await this.tradeContractRepository.findOne({
      where: { id: contractId },
      withDeleted: true,
    });

    if (!contract) {
      throw new NotFoundException('삭제할 발주(계약)을 찾을 수 없습니다.');
    }
    if (contract.deletedAt) {
      throw new BadRequestException('이미 삭제 처리된 발주(계약)입니다.');
    }
    const deletedEntityId = Number.parseInt(String(contractId), 10);
    const contractSnapshot = {
      contractId: contract.id,
      contractNo: contract.contractNo,
      status: contract.status,
    };

    const cascadedOrderIds: string[] = [];
    await this.dataSource.transaction(async (em) => {
      const orderRepo = em.getRepository(TradeOrder);
      const contractRepo = em.getRepository(TradeContract);
      const activeOrders = await orderRepo.find({
        where: { contract: { id: contractId } },
        select: ['id'],
      });
      for (const o of activeOrders) {
        cascadedOrderIds.push(String(o.id));
        await orderRepo.update({ id: o.id }, { deletedByUserId: deletedByUserId ?? null });
        await orderRepo.softDelete({ id: o.id });
      }
      await contractRepo.update({ id: contractId }, { deletedByUserId: deletedByUserId ?? null });
      await contractRepo.softDelete({ id: contractId });
    });
    this.logger.log(
      `TradeContract 소프트 삭제 완료 - contractId: ${contractId}, 연쇄 부킹 ${cascadedOrderIds.length}건`,
    );
    await this.featureAuditLogService.create({
      domain: 'TRADE',
      feature: 'TRADE_CONTRACT',
      action: 'DELETED',
      userId: deletedByUserId ?? null,
      summary: `발주 ${contract.contractNo ?? contractId} 삭제 처리`,
      entityType: 'trade_contract',
      entityId: Number.isNaN(deletedEntityId) ? undefined : deletedEntityId,
      payload: {
        ...contractSnapshot,
        deletionType: 'SOFT_DELETE',
        deletedByUserId: deletedByUserId ?? null,
        cascadedTradeOrderIds: cascadedOrderIds,
        ...(normalizedClientPath ? { clientPath: normalizedClientPath } : {}),
      },
      oldData: contractSnapshot,
    }).catch((err) => this.logger.warn('[기능이력] 무역 발주 삭제 로그 저장 실패', err));

    return {
      success: true,
      deletedOrderId: contractId,
      message: '발주가 삭제 처리되었습니다.',
    };
  }

  private async callSeaRatesTracking(identifier: string): Promise<any> {
    const fetchFn =
      ((globalThis as unknown as { fetch?: (input: string, init?: unknown) => Promise<any> }).fetch);

    if (typeof fetchFn !== 'function') {
      this.logger.error('현재 Node.js 환경에서 fetch API를 사용할 수 없습니다.');
      throw new BadRequestException('서버에서 외부 선적 API를 호출할 수 없는 환경입니다.');
    }

    const url = new URL(this.searatesTrackingUrl);
    url.searchParams.set('number', identifier);
    url.searchParams.set('api_key', this.searatesApiKey as string);
    url.searchParams.set('route', 'true');

    let response: any;
    try {
      response = await fetchFn(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {
      const err = error as Error & { cause?: unknown };
      const causeMsg = err?.message ?? (err?.cause != null ? String(err.cause) : '');
      this.logger.error(
        `SeaRates API 호출 중 네트워크 오류가 발생했습니다. 식별자: ${identifier}, 원인: ${causeMsg}`,
        err,
      );
      const detail = causeMsg ? ` (원인: ${String(causeMsg).slice(0, 100)})` : '';
      throw new BadRequestException(`SeaRates API 호출 중 네트워크 오류가 발생했습니다.${detail}`);
    }

    if (!response) {
      throw new BadRequestException('SeaRates API로부터 응답을 받지 못했습니다.');
    }

    const status = response.status ?? 0;
    const text = await response.text();

    if (status >= 400) {
      this.logger.warn(
        `SeaRates API 오류 응답 - status: ${status}, identifier: ${identifier}, body: ${
          text?.slice(0, 500) ?? ''
        }`,
      );
      let message: string | undefined;
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
        message = parsed?.message ?? parsed?.error ?? undefined;
      } catch {
        message = undefined;
      }

      // API 호출 제한 관련 에러 확인
      const errorText = text?.toLowerCase() ?? '';
      const apiMessage = (parsed?.message ?? parsed?.error ?? message ?? '').toLowerCase();
      const isUniqueShipmentLimit =
        apiMessage.includes('unique') ||
        apiMessage.includes('shipment') ||
        apiMessage.includes('unique_shipment') ||
        errorText.includes('unique shipment') ||
        errorText.includes('unique_shipment');
      const isRateLimit =
        status === 429 ||
        errorText.includes('rate limit') ||
        errorText.includes('quota') ||
        errorText.includes('limit exceeded') ||
        errorText.includes('too many requests') ||
        parsed?.error?.toLowerCase()?.includes('limit') ||
        parsed?.message?.toLowerCase()?.includes('limit');

      if (isRateLimit || isUniqueShipmentLimit) {
        this.logger.error(
          `SeaRates API 호출 제한 - status: ${status}, identifier: ${identifier}, body: ${text?.slice(0, 300)}`,
        );
        const limitMsg = isUniqueShipmentLimit
          ? '고유 선적 수량 한도에 도달했습니다. 일일 한도가 갱신된 후 다시 시도해주세요.'
          : 'API 호출 제한에 도달했습니다. 잠시 후 다시 시도해주세요.';
        throw new BadRequestException(limitMsg);
      }

      throw new BadRequestException(message ?? 'SeaRates API 호출이 실패했습니다.');
    }

    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      this.logger.error('SeaRates API 응답 파싱 중 오류가 발생했습니다.', error as Error);
      throw new BadRequestException('SeaRates API 응답을 해석하는 중 오류가 발생했습니다.');
    }
  }

  private resolveEta(route: any, routeData: any, locations: any[]): {
    eta: string | null;
    etaDestination: string | null;
    etaPriority: string | null;
  } {
    const findLocationName = (locationId?: string | null) => {
      if (!locationId) {
        return null;
      }
      const match = locations.find((loc: any) => loc?.id === locationId);
      const name = match?.name ?? null;
      return name ? this.translateLocationToKorean(name) : null;
    };

    // route_data에서 route 정보 추출 (배열일 수도 있음)
    let routeDataRoute = null;
    if (routeData?.route) {
      if (Array.isArray(routeData.route) && routeData.route.length > 0) {
        // 배열인 경우 마지막 항목(최종 목적지) 사용
        routeDataRoute = routeData.route[routeData.route.length - 1];
      } else if (typeof routeData.route === 'object') {
        routeDataRoute = routeData.route;
      }
    }

    const delivery = route?.delivery ?? routeDataRoute?.delivery ?? null;
    const postpod = route?.postpod ?? routeDataRoute?.postpod ?? null;
    const pod = route?.pod ?? routeDataRoute?.pod ?? null;

    let eta: string | null = null;
    let etaDestination: string | null = null;

    // delivery 우선, 없으면 pod 사용
    if (delivery?.date && delivery?.location) {
      eta = delivery.date;
      etaDestination = findLocationName(delivery.location);
    } else if (pod?.date && pod?.location) {
      eta = pod.date;
      etaDestination = findLocationName(pod.location);
    }

    // route에서 찾지 못한 경우 locations 배열에서 찾기
    if (!eta && locations.length > 0) {
      // locations 배열에서 목적지(POD) 관련 location 찾기
      // 보통 locations 배열의 마지막 항목이 최종 목적지일 가능성이 높음
      const podLocation = locations
        .slice()
        .reverse()
        .find((loc: any) => {
          // location에 date가 있고, POD 관련 타입이거나 마지막 항목인 경우
          return loc?.date && (loc?.type === 'pod' || loc?.type === 'delivery' || loc?.type === 'destination');
        });

      if (podLocation?.date) {
        eta = podLocation.date;
        etaDestination = podLocation?.name ? this.translateLocationToKorean(podLocation.name) : null;
      } else if (locations.length > 0) {
        // 마지막 location에 date가 있으면 사용
        const lastLocation = locations[locations.length - 1];
        if (lastLocation?.date) {
          eta = lastLocation.date;
          etaDestination = lastLocation?.name ? this.translateLocationToKorean(lastLocation.name) : null;
        }
      }
    }

    // payload에서 직접 ETA 필드 확인 (route와 locations에서 찾지 못한 경우)
    if (!eta) {
      const directEta = routeData?.eta ?? routeData?.arrival_date ?? routeData?.destination_date 
        ?? routeData?.pod_date ?? routeData?.delivery_date ?? routeData?.final_destination_date ?? null;
      if (directEta) {
        eta = directEta;
        // destination은 route나 locations에서 찾은 값 사용
      }
    }

    let etaPriority: string | null = null;
    if (delivery?.date && delivery?.location) {
      etaPriority = delivery.date;
    } else if (postpod?.date && postpod?.location) {
      etaPriority = postpod.date;
    } else if (pod?.date && pod?.location) {
      etaPriority = pod.date;
    } else if (eta) {
      // eta를 찾았으면 그것을 priority로도 사용
      etaPriority = eta;
    }

    return {
      eta,
      etaDestination: etaDestination ?? null,
      etaPriority,
    };
  }

  private getGateOutDate(events: any[]): string | null {
    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    try {
      const arrivalEvent = [...events]
        .reverse()
        .find(
          (event) =>
            ['VAA', 'DCH', 'ARRI'].includes(event?.event_code) && event?.date && !Number.isNaN(new Date(event.date).getTime()),
        );

      if (!arrivalEvent?.date) {
        return null;
      }

      const arrivalDate = new Date(arrivalEvent.date);
      const gateOutEvent = events.find((event) => {
        if (event?.event_code !== 'GTOT' || !event?.date) {
          return false;
        }
        const eventDate = new Date(event.date);
        return !Number.isNaN(eventDate.getTime()) && eventDate >= arrivalDate;
      });

      return gateOutEvent?.date ?? null;
    } catch (error) {
      this.logger.warn('Gate Out 날짜 계산 중 오류가 발생했습니다.', error as Error);
      return null;
    }
  }

  private getLastEventStatus(events: any[], etd?: string | null, gateOutDate?: string | null): string | null {
    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    const now = new Date();
    const etdDate = etd ? new Date(etd) : null;
    const filtered = events.filter((event) => {
      if (!event?.date) {
        return false;
      }
      const eventDate = new Date(event.date);
      if (Number.isNaN(eventDate.getTime())) {
        return false;
      }
      if (eventDate > now) {
        return false;
      }
      if (etdDate && !Number.isNaN(etdDate.getTime()) && eventDate < etdDate) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      return null;
    }

    const gateOutEvent = gateOutDate
      ? [...filtered].reverse().find((event) => event?.date === gateOutDate)
      : null;
    const targetEvent = gateOutEvent ?? filtered[filtered.length - 1];

    const description =
      targetEvent?.event ?? targetEvent?.description ?? targetEvent?.event_code ?? '';
    const translated = this.translateEvent(description);
    const dateText = targetEvent?.date ?? null;

    if (!dateText) {
      return translated;
    }

    return `${dateText}, ${translated}`;
  }

  private translateEvent(description?: string | null): string {
    if (!description) {
      return '이벤트 정보 없음';
    }

    const normalized = description.toLowerCase();
    const map: Record<string, string> = {
      'discharged from vessel': '선박 하역 완료',
      'gate out': '반출 완료',
      'loaded on vessel': '선적 완료',
      'customs clearance': '통관 진행 중',
      'on truck for delivery': '트럭 배송 중',
      'empty container returned': '빈 컨테이너 반납',
      'arrived at port': '항구 도착',
      'vessel departure': '선박 출항',
      'vessel arrival': '선박 도착',
      'unloaded from vessel': '선박 하역 완료',
      'received at terminal': '터미널 반입',
      'in transit': '운송 중',
      'available for pickup': '픽업 가능',
      'unavailable for pickup': '픽업 불가',
      'on hold': '보류 중',
      released: '반출 승인',
      'x-ray inspection': 'X-Ray 검사',
      examination: '실물 검사',
      ldd: '선적 완료',
      dch: '하역 완료',
      gtot: '반출 완료',
      vad: '선박 출항',
      vaa: '선박 도착',
      arri: '터미널 도착',
      depa: '출발 완료',
      stuf: '컨테이너 적재',
      stri: '컨테이너 적출',
      pick: '픽업 완료',
      drop: '반납 완료',
      avai: '픽업 가능',
      unav: '픽업 불가',
      hold: '보류 중',
      rels: '반출 승인',
      cust: '세관 통관',
      xray: 'X-Ray 검사',
      exam: '실물 검사',
      weig: '계량 완료',
      seal: '봉인 완료',
      unsl: '봉인 해제',
      plug: '냉동 컨테이너 전원 연결',
      unpl: '냉동 컨테이너 전원 해제',
      fum: '훈증 처리',
      clea: '세척 완료',
      repa: '수리 완료',
      dama: '손상 발생',
      othr: '기타',
      cer: '빈 컨테이너 반납',
      sto: '보관 중',
    };

    const matched = Object.entries(map).find(([key]) => normalized.includes(key));
    return matched ? matched[1] : description;
  }

  private abbreviateSealineName(fullName: string): string {
    if (!fullName) {
      return '';
    }

    const normalized = fullName.toLowerCase();
    const abbreviations: Record<string, string> = {
      'mediterranean shipping company': 'MSC',
      'korea marine transport': 'KMTC',
      'sm line': 'SM',
      evergreen: 'EVERGREEN',
      'hyundai merchant marine': 'HMM',
      'cma cgm': 'CMA',
      cosco: 'COSCO',
      'hapag-lloyd': 'HAPAG',
      'ocean network express': 'ONE',
      'orient overseas container line': 'OOCL',
      'yang ming': 'YM',
      zim: 'ZIM',
      'heung-a': 'HEUNGA',
      apl: 'APL',
      anl: 'ANL',
      hamburg: 'HAMBRUG',
      swire: 'SWIRE',
      'ts lines': 'TS',
      westwood: 'WEST WOOD',
      'maersk line limited (mll)': 'MAERSK',
      'maersk line': 'MAERSK',
      't.s. lines': 'TS',
    };

    const matched = Object.entries(abbreviations).find(([key]) => normalized.includes(key));
    return matched ? matched[1] : fullName;
  }

  private translateLocationToKorean(locationName?: string | null): string {
    if (!locationName) {
      return '';
    }

    const cleanName = locationName.split(',')[0].trim().toLowerCase();
    const translations: Record<string, string> = {
      busan: '부산',
      kwangyang: '광양',
      gwangyang: '광양',
      incheon: '인천',
      pyeongtaek: '평택',
      shanghai: '상하이',
      qingdao: '칭다오',
      ningbo: '닝보',
      'hong kong': '홍콩',
      shenzhen: '선전',
      yantian: '옌톈',
      tianjin: '톈진',
      singapore: '싱가포르',
      haiphong: '하이퐁',
      'ho chi minh city': '호치민',
      'cat lai': '깟라이',
      'laem chabang': '람차방',
      tokyo: '도쿄',
      yokohama: '요코하마',
      osaka: '오사카',
      'los angeles': '로스앤젤레스',
      'long beach': '롱비치',
      'new york': '뉴욕',
      hamburg: '함부르크',
      rotterdam: '로테르담',
      barcelona: '바르셀로나',
    };

    if (translations[cleanName]) {
      return translations[cleanName];
    }

    const fallback = Object.entries(translations).find(([key]) => cleanName.includes(key));
    return fallback ? fallback[1] : locationName;
  }

  private async resolveShippingLine(
    value?: string | null,
  ): Promise<{ code: string | null; name: string | null }> {
    if (value === undefined) {
      return { code: null, name: null };
    }

    const trimmed = value?.trim();
    if (!trimmed) {
      return { code: null, name: null };
    }

    if (!this.shippingLineCodesCache) {
      this.shippingLineCodesCache = await this.codeRepository.find({
        where: { group: 'SHIPPING_LINE' },
      });
    }

    const codes = this.shippingLineCodesCache ?? [];
    const normalized = trimmed.toUpperCase();
    const normalizedKey = normalized.replace(/[\s\-_\.]/g, '');

    const findMatch = (predicate: (code: Code) => boolean) =>
      codes.find((code) => {
        try {
          return predicate(code);
        } catch {
          return false;
        }
      });

    const matchByValue =
      findMatch((code) => {
        if (!code.value) {
          return false;
        }
        const valueUpper = code.value.trim().toUpperCase();
        if (valueUpper === normalized) {
          return true;
        }
        if (valueUpper.includes(normalized) || normalized.includes(valueUpper)) {
          return true;
        }
        const valueKey = valueUpper.replace(/[\s\-_\.]/g, '');
        return valueKey === normalizedKey || valueKey.includes(normalizedKey) || normalizedKey.includes(valueKey);
      }) ?? null;

    const matchByName =
      matchByValue ??
      findMatch((code) => {
        if (!code.name) {
          return false;
        }
        const nameUpper = code.name.trim().toUpperCase();
        if (nameUpper === normalized) {
          return true;
        }
        if (nameUpper.includes(normalized) || normalized.includes(nameUpper)) {
          return true;
        }
        const nameKey = nameUpper.replace(/[\s\-_\.]/g, '');
        return nameKey === normalizedKey || nameKey.includes(normalizedKey) || normalizedKey.includes(nameKey);
      }) ??
      null;

    if (matchByName) {
      const codeValue = matchByName.value?.trim();
      const nameValue = matchByName.name?.trim() ?? codeValue ?? trimmed;
      return {
        code: codeValue ? codeValue.toUpperCase() : normalized,
        name: nameValue,
      };
    }

    const abbreviated = this.abbreviateSealineName(trimmed);
    if (abbreviated) {
      const abUpper = abbreviated.trim().toUpperCase();
      const abKey = abUpper.replace(/[\s\-_\.]/g, '');
      const matchByAbbreviation =
        findMatch((code) => {
          const valueUpper = code.value?.trim().toUpperCase();
          if (!valueUpper) {
            return false;
          }
          if (valueUpper === abUpper) {
            return true;
          }
          if (valueUpper.includes(abUpper) || abUpper.includes(valueUpper)) {
            return true;
          }
          const valueKey = valueUpper.replace(/[\s\-_\.]/g, '');
          return valueKey === abKey || valueKey.includes(abKey) || abKey.includes(valueKey);
        }) ??
        findMatch((code) => {
          const nameUpper = code.name?.trim().toUpperCase();
          if (!nameUpper) {
            return false;
          }
          if (nameUpper === abUpper) {
            return true;
          }
          if (nameUpper.includes(abUpper) || abUpper.includes(nameUpper)) {
            return true;
          }
          const nameKey = nameUpper.replace(/[\s\-_\.]/g, '');
          return nameKey === abKey || nameKey.includes(abKey) || abKey.includes(nameKey);
        }) ??
        null;

      if (matchByAbbreviation) {
        const codeValue = matchByAbbreviation.value?.trim() ?? abUpper;
        const nameValue =
          matchByAbbreviation.name?.trim() ??
          matchByAbbreviation.value?.trim() ??
          abbreviated.trim();
        return {
          code: codeValue.toUpperCase(),
          name: nameValue,
        };
      }

      return {
        code: abUpper,
        name: abbreviated.trim(),
      };
    }

    return {
      code: normalized,
      name: trimmed,
    };
  }

  private async saveContainersForOrder(
    order: TradeOrder,
    containers: Array<{
      id?: string | null;
      containerNo?: string | null;
      product?: string | null;
      tradeGrade?: string | null;
      salesGrade?: string | null;
      packingType?: string | null;
      currency?: string | null;
      unitPrice?: number | null;
      weight?: number | null;
      tradeBales?: number | null;
      salesBales?: number | null;
      sequence?: number | null;
    }>,
    options?: {
      updateOnlyWeightAndBales?: boolean; // true이면 중량과 베일만 업데이트 (기존 정보 유지)
    },
  ): Promise<void> {
    if (!order?.id || !Array.isArray(containers) || containers.length === 0) {
      return;
    }

    // 기존 컨테이너 조회
    const existingContainers = await this.tradeContainerRepository.find({
      where: { order: { id: order.id } },
    });
    const existingById = new Map(existingContainers.map((c) => [String(c.id), c]));

    const updateOnlyWeightAndBales = options?.updateOnlyWeightAndBales ?? false;

    if (updateOnlyWeightAndBales) {
      // 중량과 베일만 업데이트: id로 매칭, 없으면 containerNo로 fallback
      // 신규 생성 시 sequence는 (order_id, sequence) 유니크 제약을 지키기 위해 기존 최대값+1 사용
      const maxSeq =
        existingContainers.length > 0 ? Math.max(...existingContainers.map((c) => c.sequence || 0), 0) : 0;
      let nextSeq = maxSeq + 1;
      for (const container of containers) {
        if (!container.containerNo?.trim()) continue;
        const existingContainer =
          (container.id && existingById.get(String(container.id))) ||
          existingContainers.find((c) => c.containerNo.toUpperCase().trim() === container.containerNo!.toUpperCase().trim());
        if (existingContainer) {
          if (container.weight !== null && container.weight !== undefined) {
            existingContainer.weight = this.roundNumber(container.weight, 4).toString();
          }
          if (container.tradeBales !== null && container.tradeBales !== undefined) {
            existingContainer.tradeBales = this.roundNumber(container.tradeBales, 4).toString();
          }
          if (container.salesBales !== undefined) {
            existingContainer.salesBales = container.salesBales !== null
              ? this.roundNumber(container.salesBales, 4).toString()
              : null;
          }
          await this.tradeContainerRepository.save(existingContainer);
        } else {
          const weightStr = container.weight != null ? this.roundNumber(container.weight, 4).toString() : null;
          const tradeBalesStr = container.tradeBales != null ? this.roundNumber(container.tradeBales, 4).toString() : null;
          const salesBalesStr = container.salesBales != null ? this.roundNumber(container.salesBales, 4).toString() : null;
          const newContainer = this.tradeContainerRepository.create({
            order,
            containerNo: container.containerNo!.trim(),
            sequence: nextSeq++,
            product: null,
            tradeGrade: null,
            salesGrade: null,
            inventoryStatus: 'AVAILABLE',
            packingType: null,
            currency: null,
            unitPrice: null,
            weight: weightStr,
            tradeBales: tradeBalesStr,
            salesBales: salesBalesStr,
          });
          await this.tradeContainerRepository.save(newContainer);
        }
      }
      this.logger.log(`컨테이너 중량/베일 업데이트 완료 - orderId: ${order.id}, containers: ${containers.length}건`);
      return;
    }

    // 전체 업데이트 모드: id 또는 containerNo로 기존 행 매칭 → 있으면 갱신, 없으면 신규 생성. 매칭되지 않은 기존 컨테이너는 삭제
    const maxSequence =
      existingContainers.length > 0 ? Math.max(...existingContainers.map((c) => c.sequence || 0), 0) : 0;
    let nextSequence = maxSequence + 1;

    // (order, sequence) unique 제약으로 인해 순번 교환 시 중복 발생. 2단계 업데이트: 1) 임시값 2) 최종값
    const tempSequenceOffset = 100000;
    const updates: Array<{ existing: TradeContainer; container: (typeof containers)[0]; finalSequence: number }> = [];

    for (let index = 0; index < containers.length; index++) {
      const container = containers[index];
      if (!container.containerNo?.trim()) continue;

      const containerId = container.id ? String(container.id).trim() : null;
      const existingContainer =
        (containerId ? existingById.get(containerId) : null) ||
        existingContainers.find((c) => c.containerNo.toUpperCase().trim() === container.containerNo!.toUpperCase().trim());
      const finalSequence =
        container.sequence != null && container.sequence !== undefined
          ? container.sequence
          : existingContainer?.sequence != null
            ? existingContainer.sequence
            : nextSequence++;

      if (existingContainer) {
        updates.push({ existing: existingContainer, container, finalSequence });
      } else {
        const unitPriceStr =
          container.unitPrice != null ? this.roundNumber(container.unitPrice, 4).toString() : null;
        const weightStr = container.weight != null ? this.roundNumber(container.weight, 4).toString() : null;
        const tradeBalesStr =
          container.tradeBales != null ? this.roundNumber(container.tradeBales, 4).toString() : null;
        const salesBalesStr =
          container.salesBales != null ? this.roundNumber(container.salesBales, 4).toString() : null;
        const newContainer = this.tradeContainerRepository.create({
          order,
          containerNo: container.containerNo.trim(),
          product: container.product?.trim() ?? null,
          tradeGrade: container.tradeGrade?.trim() ?? null,
          salesGrade: container.salesGrade?.trim() ?? null,
          packingType: container.packingType?.trim() ?? null,
          currency: container.currency?.trim() ?? null,
          unitPrice: unitPriceStr,
          weight: weightStr,
          tradeBales: tradeBalesStr,
          salesBales: salesBalesStr,
          sequence: finalSequence,
          inventoryStatus: 'AVAILABLE',
          pendingPurchaseCost: null,
          confirmedPurchaseCost: null,
          finalPurchaseCost: null,
          stoCost: null,
          dtCost: null,
        });
        await this.tradeContainerRepository.save(newContainer);
      }
    }

    // 2단계 업데이트: (order, sequence) unique 제약으로 순번 교환 시 중복 방지
    for (let i = 0; i < updates.length; i++) {
      const { existing } = updates[i];
      existing.sequence = tempSequenceOffset + i;
      await this.tradeContainerRepository.save(existing);
    }
    for (const { existing, container, finalSequence } of updates) {
      existing.containerNo = container.containerNo!.trim();
      if (container.product !== undefined) existing.product = container.product?.trim() ?? null;
      if (container.tradeGrade !== undefined) existing.tradeGrade = container.tradeGrade?.trim() ?? null;
      if (container.salesGrade !== undefined) existing.salesGrade = container.salesGrade?.trim() ?? null;
      if (container.packingType !== undefined) existing.packingType = container.packingType?.trim() ?? null;
      if (container.currency !== undefined) existing.currency = container.currency?.trim() ?? null;
      if (container.unitPrice !== null && container.unitPrice !== undefined) {
        existing.unitPrice = this.roundNumber(container.unitPrice, 4).toString();
      }
      if (container.weight !== null && container.weight !== undefined) {
        existing.weight = this.roundNumber(container.weight, 4).toString();
      }
      if (container.tradeBales !== null && container.tradeBales !== undefined) {
        existing.tradeBales = this.roundNumber(container.tradeBales, 4).toString();
      }
      if (container.salesBales !== undefined) {
        existing.salesBales =
          container.salesBales !== null ? this.roundNumber(container.salesBales, 4).toString() : null;
      }
      existing.sequence = finalSequence;
      await this.tradeContainerRepository.save(existing);
    }

    // 삭제 대상: incoming에 매칭되지 않은 기존 컨테이너
    // incomingIds만 사용하면 id가 없는 요청(예: 송장 분석 후) 시 전부 삭제됨 → updates에 매칭된 것 제외
    const matchedExistingIds = new Set(updates.map((u) => String(u.existing.id)));
    const containersToDelete = existingContainers.filter((ec) => !matchedExistingIds.has(String(ec.id)));
    if (containersToDelete.length > 0) {
      // 판매(SalesItem)에 연결된 컨테이너는 삭제하지 않음 - 연결 끊김 방지
      const idsToDelete = containersToDelete.map((c) => String(c.id));
      const salesItemCount = await this.salesItemRepository.count({
        where: { containerId: In(idsToDelete) },
      });
      if (salesItemCount > 0) {
        const linkedIds = await this.salesItemRepository
          .find({ where: { containerId: In(idsToDelete) }, select: ['containerId'] })
          .then((items) => [...new Set(items.map((i) => i.containerId)).values()]);
        throw new BadRequestException(
          `판매에 연결된 컨테이너는 삭제할 수 없습니다. (연결된 컨테이너: ${linkedIds.join(', ')})`,
        );
      }
      await this.tradeContainerRepository.remove(containersToDelete);
      this.logger.log(`컨테이너 삭제 완료 - orderId: ${order.id}, 삭제된 컨테이너: ${containersToDelete.length}건`);
    }
    this.logger.log(`컨테이너 전체 업데이트 완료 - orderId: ${order.id}, containers: ${containers.length}건`);
  }

  private async savePaymentsForOrder(
    order: TradeOrder,
    payments: Array<{
      sequence?: number | null;
      dueDate?: string | null;
      ratio?: number | null;
      amount?: number | null;
      method?: string | null;
      exchangeRate?: number | null;
      krwAmount?: number | null;
      result?: string | null;
      notes?: string | null;
      paymentType?: string | null;
      useRatio?: boolean | null; // 비율 사용 여부 (기본값: true)
    }>,
  ): Promise<void> {
    if (!order?.id || !Array.isArray(payments) || payments.length === 0) {
      return;
    }

    const existing = await this.tradeOrderPaymentRepository.find({
      where: { order: { id: order.id } as any },
      order: { sequence: 'ASC' },
    });
    const existingBySeq = new Map<number, TradeOrderPayment>();
    existing.forEach((p) => existingBySeq.set(Number(p.sequence), p));
    const incomingSeqs = new Set<number>();

    // 새 결제 정보 생성 및 저장 (upsert)
    const paymentEntities: TradeOrderPayment[] = [];
    
    for (const payment of payments) {
      if (payment.sequence === null || payment.sequence === undefined) {
        continue;
      }
      incomingSeqs.add(payment.sequence);

      const dueDate = payment.dueDate ? this.parseFlexibleDate(payment.dueDate) : null;
      const ratioStr = payment.ratio !== null && payment.ratio !== undefined
        ? this.roundNumber(payment.ratio, 3).toString()
        : null;
      const amountStr = payment.amount !== null && payment.amount !== undefined
        ? this.roundNumber(payment.amount, 2).toString()
        : null;
      const exchangeRateStr = payment.exchangeRate !== null && payment.exchangeRate !== undefined
        ? this.roundNumber(payment.exchangeRate, 6).toString()
        : null;
      
      // krwAmount 계산: DTO에서 제공되면 사용, 없으면 REGULAR인 경우 amount * exchangeRate 계산
      let krwAmountStr: string | null = null;
      if (payment.krwAmount !== null && payment.krwAmount !== undefined) {
        krwAmountStr = this.roundNumber(payment.krwAmount, 2).toString();
      } else {
        const paymentType = payment.paymentType?.trim() || 'REGULAR';
        if (paymentType === 'REGULAR' && payment.amount !== null && payment.amount !== undefined && payment.exchangeRate !== null && payment.exchangeRate !== undefined) {
          // REGULAR: amount * exchangeRate
          const calculatedKrwAmount = payment.amount * payment.exchangeRate;
          krwAmountStr = this.roundNumber(calculatedKrwAmount, 2).toString();
        } else if (paymentType === 'DO_COST' || paymentType === 'CUSTOMS_COST') {
          // DO_COST, CUSTOMS_COST: amount가 원화 금액이므로 그대로 사용
          if (payment.amount !== null && payment.amount !== undefined) {
            krwAmountStr = this.roundNumber(payment.amount, 2).toString();
          }
        }
      }

      const existingEntity = existingBySeq.get(payment.sequence);
      const entity = existingEntity
        ? Object.assign(existingEntity, {
            dueDate,
            ratio: ratioStr,
            amount: amountStr,
            method: payment.method?.trim() ?? null,
            exchangeRate: exchangeRateStr,
            krwAmount: krwAmountStr,
            result: payment.result?.trim() ?? null,
            paymentType: payment.paymentType?.trim() || 'REGULAR',
            notes: payment.notes?.trim() ?? null,
            useRatio: payment.useRatio !== undefined ? payment.useRatio : true,
          })
        : this.tradeOrderPaymentRepository.create({
            order,
            sequence: payment.sequence,
            dueDate,
            ratio: ratioStr,
            amount: amountStr,
            method: payment.method?.trim() ?? null,
            exchangeRate: exchangeRateStr,
            krwAmount: krwAmountStr,
            result: payment.result?.trim() ?? null,
            paymentType: payment.paymentType?.trim() || 'REGULAR', // 기본값: REGULAR
            notes: payment.notes?.trim() ?? null,
            useRatio: payment.useRatio !== undefined ? payment.useRatio : true, // 기본값: true
          });
      paymentEntities.push(entity);
    }

    // 요청에서 빠진 sequence는 삭제(목록 동기화). 화면이 항상 전체를 보내므로 안전.
    const toDelete = existing.filter((p) => !incomingSeqs.has(Number(p.sequence)));
    if (toDelete.length > 0) {
      await this.tradeOrderPaymentRepository.remove(toDelete);
    }

    if (paymentEntities.length > 0) {
      await this.tradeOrderPaymentRepository.save(paymentEntities);
      this.logger.log(`결제 정보 저장 완료 - orderId: ${order.id}, payments: ${paymentEntities.length}건`);

      // 결제 건들의 상태를 확인하여 주문의 financeStatus 자동 업데이트
      await this.updateFinanceStatusFromPayments(order);
      // 최종 가중 환율 갱신 및 최종원가 재계산 (입고 확정이 있으면)
      await this.updateOrderFinalWeightedExchangeRate(order.id);
      await this.recalculateFinalPurchaseCostForOrder(order.id);
    } else {
      // 결제 건이 없으면 financeStatus를 null로 설정
      order.financeStatus = null;
      await this.tradeOrderRepository.save(order);
    }
  }

  /**
   * DO 처리 상태일 때 DO 비용 결제 항목 자동 생성
   * @param order 주문 엔티티
   * @param doCost DO 비용 금액 (파라미터로 받은 값만 사용, 입고 데이터와 별개)
   */
  private async createDoCostPaymentIfNeeded(order: TradeOrder, doCost?: number | null): Promise<void> {
    if (!order?.id) {
      this.logger.log(`[createDoCostPaymentIfNeeded] order.id가 없음`);
      return;
    }

    this.logger.log(`[createDoCostPaymentIfNeeded] 시작 - orderId: ${order.id}, doCost: ${doCost}, doCost type: ${typeof doCost}`);

    try {
      // 기존 결제 항목 조회
      const existingPayments = await this.tradeOrderPaymentRepository.find({
        where: { order: { id: order.id } as any },
        order: { sequence: 'ASC' },
      });

      this.logger.log(`[createDoCostPaymentIfNeeded] 기존 결제 항목 수: ${existingPayments.length}`);

      // 이미 DO 비용 결제 항목이 있는지 확인 (paymentType으로 확인)
      const hasDoCostPayment = existingPayments.some(
        (p) => p.paymentType === 'DO_COST'
      );

      if (hasDoCostPayment) {
        this.logger.log(`[createDoCostPaymentIfNeeded] DO 비용 결제 항목이 이미 존재함 - orderId: ${order.id}`);
        return;
      }

      // DO 비용 값 확인 (파라미터로 받은 값만 사용, 입고 데이터와 별개)
      // 비용이 없어도 결제 항목은 생성 (나중에 비용 입력 가능)
      const doCostValue = (doCost !== undefined && doCost !== null && doCost > 0) ? doCost : null;
      
      if (doCostValue === null) {
        this.logger.log(`[createDoCostPaymentIfNeeded] DO 비용이 없음 - 결제 항목은 생성하되 amount는 null로 설정 - orderId: ${order.id}`);
      }

      // sequence 계산 (기존 결제 항목의 최대값 + 1)
      const maxSequence = existingPayments.length > 0
        ? Math.max(...existingPayments.map((p) => p.sequence || 0))
        : 0;

        // DO 비용 결제 항목 생성 (비용이 없어도 생성, 나중에 입력 가능)
        const doCostPayment = this.tradeOrderPaymentRepository.create({
          order,
          sequence: maxSequence + 1,
          amount: doCostValue !== null ? doCostValue.toString() : null, // 비용이 없으면 null
          ratio: null, // DO 비용은 ratio 없음
          paymentType: 'DO_COST', // 결제 유형: DO 비용
          notes: null, // notes는 실제 비고 내용으로만 사용
          result: null, // 초기 상태
          dueDate: null, // DO 비용은 dueDate 없음 (또는 필요시 설정)
          method: null, // DO 비용은 method 없음 (또는 필요시 설정)
          exchangeRate: null, // DO 비용은 exchangeRate 없음 (원화 단위 가정)
          krwAmount: doCostValue !== null ? this.roundNumber(doCostValue, 2).toString() : null, // DO 비용은 amount가 원화이므로 krwAmount도 동일하게
        });

      await this.tradeOrderPaymentRepository.save(doCostPayment);
      this.logger.log(`[createDoCostPaymentIfNeeded] DO 비용 결제 항목 생성 완료 - orderId: ${order.id}, sequence: ${doCostPayment.sequence}, amount: ${doCostValue ?? 'null (나중에 입력 예정)'}`);

      // financeStatus 업데이트 (결제 항목이 추가되었으므로)
      await this.updateFinanceStatusFromPayments(order);
    } catch (error: any) {
      this.logger.error(`[createDoCostPaymentIfNeeded] DO 비용 결제 항목 생성 실패 - orderId: ${order.id}, error: ${error?.message || error}`);
      // 에러가 발생해도 주문 수정은 계속 진행되도록 함
    }
  }

  /**
   * 통관 비용 결제 항목 자동 생성 (통관 처리 상태로 변경될 때 호출)
   */
  private async createCustomsCostPaymentIfNeeded(order: TradeOrder, customsFee?: number | null): Promise<void> {
    if (!order?.id) {
      this.logger.log(`[createCustomsCostPaymentIfNeeded] order.id가 없음`);
      return;
    }

    this.logger.log(`[createCustomsCostPaymentIfNeeded] 시작 - orderId: ${order.id}, customsFee: ${customsFee}, customsFee type: ${typeof customsFee}`);

    try {
      // 기존 결제 항목 조회
      const existingPayments = await this.tradeOrderPaymentRepository.find({
        where: { order: { id: order.id } as any },
        order: { sequence: 'ASC' },
      });

      this.logger.log(`[createCustomsCostPaymentIfNeeded] 기존 결제 항목 수: ${existingPayments.length}`);

      // 이미 통관 비용 결제 항목이 있는지 확인 (paymentType으로 확인)
      const hasCustomsCostPayment = existingPayments.some(
        (p) => p.paymentType === 'CUSTOMS_COST'
      );

      if (hasCustomsCostPayment) {
        this.logger.log(`[createCustomsCostPaymentIfNeeded] 통관 비용 결제 항목이 이미 존재함 - orderId: ${order.id}`);
        return;
      }

      // 통관 비용 값 확인 (파라미터로 받은 값만 사용)
      // 비용이 없어도 결제 항목은 생성 (나중에 비용 입력 가능)
      const customsFeeValue = (customsFee !== undefined && customsFee !== null && customsFee > 0) ? customsFee : null;
      
      if (customsFeeValue === null) {
        this.logger.log(`[createCustomsCostPaymentIfNeeded] 통관 비용이 없음 - 결제 항목은 생성하되 amount는 null로 설정 - orderId: ${order.id}`);
      }

      // sequence 계산 (기존 결제 항목의 최대값 + 1)
      const maxSequence = existingPayments.length > 0
        ? Math.max(...existingPayments.map((p) => p.sequence || 0))
        : 0;

      // 통관 비용 결제 항목 생성 (비용이 없어도 생성, 나중에 입력 가능)
      const customsCostPayment = this.tradeOrderPaymentRepository.create({
        order,
        sequence: maxSequence + 1,
        amount: customsFeeValue !== null ? customsFeeValue.toString() : null, // 비용이 없으면 null
        ratio: null, // 통관 비용은 ratio 없음
        paymentType: 'CUSTOMS_COST', // 결제 유형: 통관 비용
        notes: null, // notes는 실제 비고 내용으로만 사용
        result: null, // 초기 상태
        dueDate: null, // 통관 비용은 dueDate 없음 (또는 필요시 설정)
        method: null, // 통관 비용은 method 없음 (또는 필요시 설정)
        exchangeRate: null, // 통관 비용은 exchangeRate 없음 (원화 단위 가정)
        krwAmount: customsFeeValue !== null ? this.roundNumber(customsFeeValue, 2).toString() : null, // 통관 비용은 amount가 원화이므로 krwAmount도 동일하게
      });

      await this.tradeOrderPaymentRepository.save(customsCostPayment);
      this.logger.log(`[createCustomsCostPaymentIfNeeded] 통관 비용 결제 항목 생성 완료 - orderId: ${order.id}, sequence: ${customsCostPayment.sequence}, amount: ${customsFeeValue ?? 'null (나중에 입력 예정)'}`);

      // financeStatus 업데이트 (결제 항목이 추가되었으므로)
      await this.updateFinanceStatusFromPayments(order);
    } catch (error: any) {
      this.logger.error(`[createCustomsCostPaymentIfNeeded] 통관 비용 결제 항목 생성 실패 - orderId: ${order.id}, error: ${error?.message || error}`);
      // 에러가 발생해도 주문 수정은 계속 진행되도록 함
    }
  }

  /**
   * 결제 건들의 상태를 확인하여 주문의 financeStatus를 자동으로 업데이트
   * - 모든 결제 건이 PENDING 또는 null → PAYMENT_PENDING (미완료)
   * - 모든 결제 건이 COMPLETED → PAYMENT_COMPLETED (완료)
   * - 일부만 COMPLETED → PAYMENT_PROCESSING (일부 완료)
   */
  private async updateFinanceStatusFromPayments(order: TradeOrder): Promise<void> {
    if (!order?.id) {
      return;
    }

    // 저장된 결제 정보 조회
    const payments = await this.tradeOrderPaymentRepository.find({
      where: { order: { id: order.id } as any },
    });

    if (!payments || payments.length === 0) {
      order.financeStatus = null;
      await this.tradeOrderRepository.save(order);
      return;
    }

    // 결제 건들의 상태 확인
    const completedCount = payments.filter(
      (p) => p.result && p.result.trim().toUpperCase() === 'COMPLETED'
    ).length;
    const totalCount = payments.length;

    // financeStatus 결정
    if (completedCount === 0) {
      // 모든 결제 건이 미완료
      order.financeStatus = 'PAYMENT_PENDING';
    } else if (completedCount === totalCount) {
      // 모든 결제 건이 완료
      order.financeStatus = 'PAYMENT_COMPLETED';
    } else {
      // 일부만 완료
      order.financeStatus = 'PAYMENT_PROCESSING';
    }

    await this.tradeOrderRepository.save(order);
    this.logger.log(
      `financeStatus 자동 업데이트 - orderId: ${order.id}, status: ${order.financeStatus}, 완료: ${completedCount}/${totalCount}`
    );
  }

  private async syncContainersForOrder(
    order: TradeOrder,
    containers: Array<{
      containerNumber: string | null;
      weight: unknown;
    }>,
  ): Promise<void> {
    if (!order?.id || !Array.isArray(containers) || containers.length === 0) {
      return;
    }

    const deduped = new Map<
      string,
      {
        containerNo: string;
        weight: string | null;
      }
    >();

    containers.forEach((container) => {
      const rawNumber = container?.containerNumber ?? null;
      const trimmedNumber = typeof rawNumber === 'string' ? rawNumber.trim() : rawNumber;
      if (!trimmedNumber) {
        return;
      }
      const normalizedKey = trimmedNumber.toUpperCase();
      const existing = deduped.get(normalizedKey);

      const sanitizedWeight =
        typeof container?.weight === 'string'
          ? container.weight.replace(/,/g, '')
          : (container?.weight as number | null);
      const parsedWeight = this.parseNumberOrNull(sanitizedWeight);
      const formattedWeight =
        parsedWeight !== null && parsedWeight !== undefined
          ? this.roundNumber(parsedWeight, 4).toString()
          : null;

      if (!existing) {
        deduped.set(normalizedKey, {
          containerNo: trimmedNumber,
          weight: formattedWeight,
        });
        return;
      }

      if (existing.weight === null && formattedWeight !== null) {
        existing.weight = formattedWeight;
      }
    });

    if (deduped.size === 0) {
      return;
    }

    const existingEntities = await this.tradeContainerRepository.find({
      where: { order: { id: order.id } as any },
    });

    const existingMap = new Map<string, TradeContainer>();
    existingEntities.forEach((entity) => {
      if (entity?.containerNo) {
        existingMap.set(entity.containerNo.toUpperCase(), entity);
      }
    });

    // (order_id, sequence) 유니크 제약 준수: 신규 생성 시 기존 최대 sequence + 1부터 부여
    const maxSeq =
      existingEntities.length > 0
        ? Math.max(...existingEntities.map((c) => c.sequence ?? 0), 0)
        : 0;
    let nextSeq = maxSeq + 1;

    const entitiesToSave: TradeContainer[] = [];

    deduped.forEach((value, key) => {
      const existing = existingMap.get(key);
      if (existing) {
        if (value.weight !== null && existing.weight !== value.weight) {
          existing.weight = value.weight;
          entitiesToSave.push(existing);
        }
        return;
      }

      const entity = this.tradeContainerRepository.create({
        order,
        containerNo: value.containerNo,
        weight: value.weight,
        inventoryStatus: 'AVAILABLE',
        sequence: nextSeq++,
      });
      entitiesToSave.push(entity);
    });

    if (entitiesToSave.length > 0) {
      await this.tradeContainerRepository.save(entitiesToSave);
    }
  }

  private parseNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private resolveTrackingIdentifier(
    bl?: string | null,
    bk?: string | null,
  ): { value: string; type: 'BL' | 'BK' } | null {
    const sanitize = (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith('임시')) {
        return null;
      }
      return trimmed;
    };

    const blNumber = sanitize(bl);
    if (blNumber) {
      return { value: blNumber, type: 'BL' };
    }

    const bookingNumber = sanitize(bk);
    if (bookingNumber) {
      return { value: bookingNumber, type: 'BK' };
    }

    return null;
  }

  private extractIdentifierFromPayload(source: unknown, keys: string[]): string | null {
    if (!source || typeof source !== 'object') {
      return null;
    }

    const normalizedKeys = keys.map((key) => key.toLowerCase());
    const queue: any[] = [source];
    const visited = new Set<any>();

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue;
      }
      visited.add(current);

      for (const [rawKey, value] of Object.entries(current)) {
        const key = rawKey.toLowerCase();

        if (normalizedKeys.includes(key)) {
          if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
              return trimmed;
            }
          }
        }

        if (value && typeof value === 'object' && !visited.has(value)) {
          queue.push(value);
        }
      }
    }

    return null;
  }

  private async computeFreeTimeValues(
    exporterCode: string,
    shippingLineCode: string,
    etaDate: Date,
  ): Promise<{
    dmValue: string | null;
    dmDate: string | null;
    dtValue: string | null;
    dtDate: string | null;
    cbValue: string | null;
    cbDate: string | null;
  }> {
    const normalizedExporter = exporterCode.trim().toUpperCase();
    const normalizedShippingLine = shippingLineCode.trim().toUpperCase();

    if (!normalizedExporter || !normalizedShippingLine || !etaDate) {
      return {
        dmValue: null,
        dmDate: null,
        dtValue: null,
        dtDate: null,
        cbValue: null,
        cbDate: null,
      };
    }

    const calculateForType = async (type: 'DM' | 'DT' | 'CB') => {
      const entry = await this.findApplicableFreeTime(
        normalizedExporter,
        normalizedShippingLine,
        type,
        etaDate,
      );
      if (!entry) {
        return { value: null, date: null };
      }
      const value = entry.value ?? null;
      const offset = Number(entry.value);
      if (!Number.isFinite(offset)) {
        return { value, date: null };
      }
      const appliedDate = this.addDays(etaDate, offset);
      return {
        value,
        date: this.normalizeDateValue(appliedDate),
      };
    };

    const [dm, dt, cb] = await Promise.all([
      calculateForType('DM'),
      calculateForType('DT'),
      calculateForType('CB'),
    ]);

    return {
      dmValue: dm.value,
      dmDate: dm.date,
      dtValue: dt.value,
      dtDate: dt.date,
      cbValue: cb.value,
      cbDate: cb.date,
    };
  }

  private async findApplicableFreeTime(
    exporterCode: string,
    shippingLineCode: string,
    type: 'DM' | 'DT' | 'CB',
    etaDate: Date,
  ): Promise<FreeTime | null> {
    const qb = this.freeTimeRepository
      .createQueryBuilder('ft')
      .where('ft.exporterCode = :exporterCode', { exporterCode })
      .andWhere('ft.shippingLineCode = :shippingLineCode', { shippingLineCode })
      .andWhere('ft.type = :type', { type })
      .andWhere('ft.baseDate <= :baseDate', { baseDate: etaDate })
      .orderBy('ft.baseDate', 'DESC')
      .limit(1);

    let match = await qb.getOne();

    if (!match) {
      match = await this.freeTimeRepository.findOne({
        where: {
          exporterCode,
          shippingLineCode,
          type,
        },
        order: {
          baseDate: 'DESC',
        },
      });
    }

    return match ?? null;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private normalizeDateValue(value: Date | string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
    }
    return null;
  }

  async analyzeInvoice(
    orderId: string,
    file?: Express.Multer.File,
    googleDriveFileId?: string,
    userId?: number,
  ) {
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['contract', 'containers'],
    });

    if (!order) {
      throw new NotFoundException('해당 스케줄을 찾을 수 없습니다.');
    }

    // 구글 드라이브 파일 ID가 있으면 다운로드
    let actualFile = file;
    let tempFilePath: string | null = null;

    if (googleDriveFileId && userId) {
      try {
        const { metadata, stream } = await this.googleDriveService.downloadFile(userId, googleDriveFileId);
        
        // 파일 크기 확인 (50MB 제한)
        const fileSize = parseInt(metadata.size || '0', 10);
        const maxFileSize = 50 * 1024 * 1024; // 50MB
        if (fileSize > maxFileSize) {
          throw new BadRequestException(`파일 크기(${Math.round(fileSize / 1024 / 1024)}MB)가 제한(50MB)을 초과합니다.`);
        }

        // 파일 타입 확인 (PDF만 허용)
        const fileName = metadata.name || '';
        if (!fileName.toLowerCase().endsWith('.pdf') && metadata.mimeType !== 'application/pdf') {
          throw new BadRequestException('PDF 파일만 분석 가능합니다.');
        }
        
        // 임시 파일로 저장
        const timestamp = Date.now();
        const ext = extname(fileName);
        tempFilePath = join(INVOICE_TEMP_DIR, `${timestamp}${ext}`);
        
        if (!existsSync(INVOICE_TEMP_DIR)) {
          await fs.mkdir(INVOICE_TEMP_DIR, { recursive: true });
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        for await (const chunk of stream) {
          totalSize += chunk.length;
          if (totalSize > maxFileSize) {
            throw new BadRequestException(`파일 크기가 제한(50MB)을 초과합니다.`);
          }
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(tempFilePath, buffer);

        // Express.Multer.File 형태로 변환
        actualFile = {
          fieldname: 'file',
          originalname: metadata.name || 'file',
          encoding: '7bit',
          mimetype: metadata.mimeType || 'application/octet-stream',
          size: parseInt(metadata.size || '0', 10),
          destination: INVOICE_TEMP_DIR,
          filename: `${timestamp}${ext}`,
          path: tempFilePath,
          buffer: buffer,
        } as Express.Multer.File;
      } catch (error) {
        this.logger.error('구글 드라이브 파일 다운로드 실패', error as Error);
        throw new BadRequestException('구글 드라이브 파일을 다운로드할 수 없습니다.');
      }
    }

    if (!actualFile) {
      throw new BadRequestException('파일 또는 구글 드라이브 파일 ID가 필요합니다.');
    }

    const filePath = actualFile.path;

    if (!this.openai) {
      this.logger.warn('OpenAI 클라이언트가 초기화되지 않아 송장 분석을 건너뜁니다.');
      return {
        fileName: actualFile.filename,
        originalFileName: actualFile.originalname ?? actualFile.filename,
        tempFilePath: filePath,
        invoice: null,
        payments: [],
        rawResult: null,
        message: 'OPENAI_API_KEY가 설정되지 않아 송장 분석이 수행되지 않았습니다.',
      };
    }

    let uploadedFileId: string | null = null;

    try {
      this.logger.log(
        `송장 분석 시작 - 파일명: ${actualFile.originalname ?? actualFile.filename}, 크기: ${actualFile.size} bytes, 스케줄 ID: ${orderId}`,
      );

      const fileStream = createReadStream(filePath);
      const uploaded = await this.openai.files.create({
        file: fileStream,
        purpose: 'assistants',
      });
      uploadedFileId = uploaded.id;

      const prompt = this.buildInvoiceExtractionPrompt(order);

      const completion = await this.openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'You extract structured invoice data and return strict JSON that matches the provided schema.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `${prompt}\n\n**매우 중요한 지시사항**:\n- **BAF 수출사 특별 처리 (매우 중요)**: 수출사가 "BAF"로 시작하는 경우(예: "BAF", "BAF0311-1" 등), 또는 파일명이 "BAF"로 시작하는 경우, 이 문서는 특별한 구조를 가지고 있습니다:\n  * 이 문서는 여러 페이지로 구성되어 있으며, PACKING LIST 페이지가 90도 또는 270도로 회전되어 있어서 제대로 읽기 어렵습니다.\n  * **BAF 수출사 송장의 경우, PACKING LIST에서 컨테이너 정보를 추출하지 마세요. PACKING LIST는 무시하고 건너뛰세요.**\n  * **MAERSK B/L에서만 컨테이너 정보 추출**: PACKING LIST 다음 페이지에 "MAERSK", "BILL OF LADING", "B/L" 등의 키워드가 있는 MAERSK Bill of Lading이 있다면:\n    - **오직 이 MAERSK B/L 페이지만** 사용하여 컨테이너 정보를 추출해야 합니다.\n    - MAERSK B/L에는 "Particulars Furnished by Shipper" 섹션에 컨테이너 번호, 베일 수(BALES), 중량(Weight, KGS) 정보가 표시되어 있습니다.\n    - 예시 형식: "MRKU5420437 ML-ES0613907: 40 DRY 9'6, 59 BALES, 23720.000 KGS"에서 컨테이너 번호 "MRKU5420437", 베일 수 "59", 중량 "23720.000" (kg 단위이므로 MT로 변환 시 23.720)을 추출합니다.\n    - "Kind of Packages; Description of goods; Marks and Numbers; Container No./Seal No." 섹션에서 각 컨테이너의 정보를 찾습니다.\n    - "Weight" 섹션에 전체 중량(Total Weight)이 표시되어 있을 수 있으며, 이는 invoiceWeight 검증에 사용할 수 있습니다.\n    - **중요**: BAF 수출사 송장에서는 PACKING LIST를 완전히 무시하고, MAERSK B/L에서만 컨테이너 정보를 추출하세요. 이렇게 하면 컨테이너가 중복되지 않습니다.\n- **PACKING LIST 회전 처리 (일반 수출사)**: BAF 수출사가 아닌 경우에만, 이 문서는 여러 페이지로 구성되어 있으며, "PACKING LIST" 또는 "PACKING LIST"라는 제목이 있는 페이지를 찾아야 합니다. PACKING LIST 페이지는 90도, 180도, 270도 등 어느 방향으로 회전되어 있을 수 있습니다. 회전된 PACKING LIST를 발견하면:\n  * 텍스트 방향을 자동으로 인식하고 정상 방향으로 읽을 수 있도록 처리하세요.\n  * 회전된 상태에서도 모든 텍스트, 숫자, 컨테이너 번호를 정확히 인식하고 추출해야 합니다.\n  * PACKING LIST의 테이블 구조를 회전된 상태에서도 올바르게 파악하고, 각 컬럼(CONTAINER NO., Container No., CNTR N#, SEAL NO., BALES, Weight, Bales, DESCRIPTION 등)을 정확히 식별하세요.\n  * BALES 컬럼이 있으면 반드시 베일 수를 추출하고, 값이 숫자만(예: 1080, 1086)인 경우도 그대로 bales로 사용하세요.\n  * DESCRIPTION 컬럼 끝에 중량(MT)이 포함된 경우(예: "... WA123.890") 해당 숫자를 weight로 추출하세요.\n  * 회전된 이미지에서도 컨테이너 번호, 중량, 베일 수를 정확히 추출할 수 있어야 합니다.\n  * 일반 수출사의 경우, PACKING LIST에서 컨테이너 정보를 추출하고, MAERSK B/L이 추가로 있다면 그것에서도 추출할 수 있습니다.\n- **INVOICE와 다른 문서**: INVOICE나 다른 문서들은 일반적으로 정상 방향이지만, PACKING LIST는 회전되어 있을 수 있으므로 각 페이지를 확인하여 "PACKING LIST" 제목이 있는 페이지를 찾고, 그 페이지가 회전되어 있다면 회전된 상태에서도 정확히 읽어야 합니다.\n- 문서에 여러 개의 INVOICE 섹션이 있으면 모든 INVOICE의 금액과 중량을 합산하여 반환합니다.\n- **BAF 수출사가 아닌 경우에만** 여러 개의 PACKING LIST 섹션이 있으면 각 PACKING LIST에서 추출한 모든 컨테이너를 containers 배열에 포함시킵니다.\n- 각 PACKING LIST는 독립적으로 처리하고, 모든 컨테이너를 하나의 배열에 모아서 반환합니다.\n- **컨테이너 번호 추출 시 주의사항 (매우 중요)**:\n  * 컨테이너 번호는 문서에 표시된 그대로 **문자 하나하나, 숫자 하나하나 정확히** 추출해야 합니다.\n  * 숫자를 생략하거나, 문자를 생략하거나, 순서를 바꾸면 절대 안 됩니다.\n  * 잘못된 예시:\n    - "HASU5080392"를 "HASU080392"로 읽으면 안 됩니다 (숫자 "5"를 생략함)\n    - "HASU4863182"를 "HASLU863182"로 읽으면 안 됩니다 (문자와 숫자 순서 변경)\n    - "MRSU6055408"을 "MRSU0683108"로 읽으면 안 됩니다 (숫자 순서 변경)\n  * 올바른 예시:\n    - "HASU5080392"는 정확히 "HASU5080392"로 추출\n    - "MRSU8275762"는 정확히 "MRSU8275762"로 추출\n    - "MRKU5420437"는 정확히 "MRKU5420437"로 추출\n    - "CAAU6551611"는 정확히 "CAAU6551611"로 추출\n  * PACKING LIST의 "CNTR N#" 또는 "Container No." 컬럼에서 표시된 번호를 **문자 하나하나, 숫자 하나하나** 정확히 확인하여 추출하세요.\n  * MAERSK B/L에서 컨테이너 번호를 추출할 때도 동일하게 정확히 추출해야 합니다.\n  * 각 컨테이너 번호를 추출할 때마다 문서의 해당 부분을 다시 확인하고, 모든 문자와 숫자가 정확한지 검증하세요.\n  * 같은 문서를 여러 번 분석해도 항상 동일한 결과가 나와야 합니다.\n\n첨부된 송장을 분석하고 JSON 객체 하나만 반환해 주세요.`,
              },
              {
                type: 'input_file',
                file_id: uploadedFileId,
              },
            ],
          },
        ],
      });

      let rawResult = completion.output_text?.trim() ?? '';
      if (rawResult.startsWith('```')) {
        rawResult = rawResult.replace(/```json/gi, '').replace(/```/g, '').trim();
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(rawResult);
      } catch (error) {
        this.logger.error('송장 분석 결과 JSON 파싱 실패', error as Error);
        parsed = null;
      }

      const {
        contractNumber: extractedContractNumber,
        invoice,
        payments: rawPayments,
        containers: rawContainers,
        notes,
      } = this.normalizeInvoiceExtraction(parsed);

      const normalizedPayments = this.normalizePayments(rawPayments, 1);
      const etdContext = invoice.etd ?? order.etdText ?? this.normalizeDateValue(order.etdDate);
      this.enrichPaymentsWithTotals(normalizedPayments, invoice.invoiceAmount, {
        etd: etdContext,
      });

      const responsePayments = normalizedPayments.map((payment) => ({
        sequence: payment.sequence,
        dueDate: this.normalizeDateValue(payment.dueDate),
        ratio: payment.ratio !== null && payment.ratio !== undefined ? this.roundNumber(payment.ratio, 3) : null,
        amount:
          payment.amount !== null && payment.amount !== undefined
            ? this.roundNumber(payment.amount, 2)
            : null,
        method: payment.method,
        exchangeRate:
          payment.exchangeRate !== null && payment.exchangeRate !== undefined
            ? this.roundNumber(payment.exchangeRate, 6)
            : null,
        result: null,
      }));

      const invoiceDate = this.normalizeDateValue(this.parseFlexibleDate(invoice.invoiceDate));
      const etdDate = this.normalizeDateValue(this.parseFlexibleDate(etdContext ?? invoice.etd ?? null));

      const responseInvoice = {
        invoiceNumber: invoice.invoiceNumber ?? null,
        invoiceDate,
        invoiceCurrency: invoice.invoiceCurrency ?? order.currency ?? null,
        invoiceAmount:
          invoice.invoiceAmount !== null && invoice.invoiceAmount !== undefined
            ? this.roundNumber(invoice.invoiceAmount, 2)
            : null,
        invoiceWeight:
          invoice.invoiceWeight !== null && invoice.invoiceWeight !== undefined
            ? this.roundNumber(invoice.invoiceWeight, 3)
            : null,
        unitPrice:
          invoice.unitPrice !== null && invoice.unitPrice !== undefined
            ? this.roundNumber(invoice.unitPrice, 4)
            : null,
        destination: invoice.destination ?? order.destination ?? null,
        etd: etdDate,
      };

      this.logger.log(
        `[Invoice] 분석 완료 - orderId=${orderId}, contractNo=${order.contract?.contractNo ?? 'N/A'}, invoice=${JSON.stringify(
          responseInvoice,
        )}, payments=${JSON.stringify(responsePayments)}`,
      );

      const expectedContractNumber = order.contract?.contractNo ?? order.contractNo ?? null;
      const normalizedExpectedContractNumber = expectedContractNumber
        ? this.normalizeContractNumber(expectedContractNumber)?.toUpperCase()
        : null;
      const normalizedExtractedContractNumber = extractedContractNumber
        ? this.normalizeContractNumber(extractedContractNumber)?.toUpperCase()
        : null;

      let contractNumberMatched = true;
      if (normalizedExpectedContractNumber) {
        if (!normalizedExtractedContractNumber) {
          contractNumberMatched = false;
        } else {
          contractNumberMatched =
            normalizedExpectedContractNumber === normalizedExtractedContractNumber;
        }
      }

      // 컨테이너 정보 처리 (분석 결과만 반환, 저장은 서류 처리 완료 시점에 수행)
      let containersToUse = rawContainers ?? [];

      // PDF 분석에서 컨테이너를 추출하지 못한 경우 파일명에서 fallback 시도
      if (containersToUse.length === 0) {
        const originalFileName = actualFile.originalname ?? actualFile.filename ?? '';
        const fromFilename = this.parseFilenameForContainerInfo(originalFileName);
        if (fromFilename.containerNo || fromFilename.weight !== null) {
          this.logger.log(
            `[Invoice] PDF에서 컨테이너 미추출 → 파일명 fallback: ${originalFileName} → containerNo=${fromFilename.containerNo}, weight=${fromFilename.weight}, bales=${fromFilename.bales}`,
          );
          containersToUse = [
            {
              containerNo: fromFilename.containerNo ?? '',
              weight: fromFilename.weight,
              bales: fromFilename.bales,
              unitPrice: null,
            },
          ];
        }
      }

      const responseContainers = containersToUse.map((container) => ({
        containerNo: container.containerNo ?? null,
        tradeBales:
          container.bales !== null && container.bales !== undefined
            ? this.roundNumber(container.bales, 4)
            : null,
        salesBales: null as number | null,
        weight:
          container.weight !== null && container.weight !== undefined
            ? this.roundNumber(container.weight, 3)
            : null,
        unitPrice:
          container.unitPrice !== null && container.unitPrice !== undefined
            ? this.roundNumber(container.unitPrice, 4)
            : null,
      }));

      // 컨테이너 번호와 단가 비교 로직
      const existingContainers = order.containers || [];
      const containerComparisons = responseContainers.map((analyzedContainer) => {
        if (!analyzedContainer.containerNo) {
          return {
            containerNo: null,
            containerNoMatched: null,
            unitPriceMatched: null,
            existingContainerNo: null,
            existingUnitPrice: null,
            analyzedContainerNo: null,
            analyzedUnitPrice: analyzedContainer.unitPrice,
          };
        }

        const normalizedAnalyzedContainerNo = analyzedContainer.containerNo.trim().toUpperCase();
        const existingContainer = existingContainers.find((ec) => {
          if (!ec.containerNo) return false;
          const normalizedExistingContainerNo = ec.containerNo.trim().toUpperCase();
          return normalizedExistingContainerNo === normalizedAnalyzedContainerNo;
        });

        if (!existingContainer) {
          // 기존 컨테이너가 없으면 비교 불가 (null)로 처리
          // 기존 컨테이너는 있지만 이 번호가 없으면 새로운 컨테이너 (null) - 불일치가 아님
          return {
            containerNo: analyzedContainer.containerNo,
            containerNoMatched: null, // 기존에 없는 새로운 컨테이너는 비교 불가로 처리
            unitPriceMatched: null,
            existingContainerNo: null,
            existingUnitPrice: null,
            analyzedContainerNo: analyzedContainer.containerNo,
            analyzedUnitPrice: analyzedContainer.unitPrice,
          };
        }

        const existingUnitPrice = existingContainer.unitPrice
          ? Number(existingContainer.unitPrice)
          : null;
        const analyzedUnitPrice = analyzedContainer.unitPrice ?? null;

        let unitPriceMatched: boolean | null = null;
        if (existingUnitPrice !== null && analyzedUnitPrice !== null) {
          // 단가 비교 (소수점 4자리까지 비교)
          const diff = Math.abs(existingUnitPrice - analyzedUnitPrice);
          unitPriceMatched = diff < 0.0001; // 0.0001 미만의 차이는 일치로 간주
        }

        return {
          containerNo: analyzedContainer.containerNo,
          containerNoMatched: true,
          unitPriceMatched,
          existingContainerNo: existingContainer.containerNo,
          existingUnitPrice,
          analyzedContainerNo: analyzedContainer.containerNo,
          analyzedUnitPrice,
        };
      });

      // 컨테이너 정보는 분석 시점에는 저장하지 않음 (서류 처리 완료 시점에 저장)

      // 송장 중량과 컨테이너 중량 합 비교 검증
      const invoiceWeight = responseInvoice.invoiceWeight;
      const totalContainerWeight = responseContainers.reduce((sum, container) => {
        const weight = container.weight;
        return sum + (weight !== null && weight !== undefined ? weight : 0);
      }, 0);
      
      let weightMatched: boolean | null = null;
      let weightDifference: number | null = null;
      if (invoiceWeight !== null && invoiceWeight !== undefined && totalContainerWeight > 0) {
        weightDifference = Math.abs(invoiceWeight - totalContainerWeight);
        // 0.01 MT (10kg) 이내의 차이는 일치로 간주
        weightMatched = weightDifference < 0.01;
      }

      const containerMessage =
        responseContainers.length > 0
          ? ` 컨테이너 정보 ${responseContainers.length}건을 추출했습니다.`
          : '';
      const baseMessage =
        responsePayments.length > 0
          ? `송장 및 결제 정보를 ${responsePayments.length}건 추출했습니다.${containerMessage}`
          : `송장 기본 정보를 추출했습니다.${containerMessage} 필요한 값을 확인하세요.`;

      let message = baseMessage;
      if (!contractNumberMatched) {
        message = `${baseMessage}\n※ 분석된 계약번호와 스케줄의 계약번호가 일치하지 않습니다.`;
      }
      if (weightMatched === false && weightDifference !== null) {
        const weightDiffText = weightDifference.toFixed(3);
        message = `${message}\n※ 송장 중량(${invoiceWeight?.toFixed(3)} MT)과 컨테이너 중량 합(${totalContainerWeight.toFixed(3)} MT)이 일치하지 않습니다. (차이: ${weightDiffText} MT)`;
      }

      // 반환값 준비 (Google Drive 파일인 경우 tempFilePath는 null로 설정, finally에서 삭제됨)
      const result = {
        fileName: actualFile.filename,
        originalFileName: actualFile.originalname ?? actualFile.filename,
        tempFilePath: googleDriveFileId ? null : filePath, // Google Drive 파일은 null (삭제 예정)
        invoice: responseInvoice,
        payments: responsePayments,
        containers: responseContainers,
        containerComparisons, // 컨테이너 비교 결과 추가
        rawResult,
        notes: notes ?? null,
        message,
        contractNumberExpected: expectedContractNumber,
        contractNumberExtracted: extractedContractNumber,
        contractNumberMatched,
        weightMatched, // 송장 중량과 컨테이너 중량 합 일치 여부
        totalContainerWeight, // 컨테이너 중량 합계
        weightDifference, // 중량 차이
        ...(googleDriveFileId && { googleDriveFileId }), // Google Drive 파일 ID 포함
      };

      return result;
    } catch (error) {
      this.logger.error('송장 분석 중 오류가 발생했습니다.', error as Error);
      throw error;
    } finally {
      if (uploadedFileId) {
        try {
          await this.openai.files.del(uploadedFileId);
        } catch (error) {
          this.logger.warn(`OpenAI 업로드 파일 삭제 실패: ${uploadedFileId}`, error as Error);
        }
      }
      // Google Drive 파일인 경우 서버 임시 파일 삭제 (로컬 파일은 저장 시까지 유지)
      if (googleDriveFileId && tempFilePath) {
        try {
          await this.deleteTempFile(tempFilePath);
          this.logger.log(`Google Drive 파일 분석 완료 후 임시 파일 삭제: ${tempFilePath}`);
        } catch (error) {
          this.logger.warn(`임시 파일 삭제 실패: ${tempFilePath}`, error as Error);
        }
      }
    }
  }

  /**
   * 파일명에서 컨테이너 번호, 중량, 베일 수를 추출 (fallback용)
   * 예: "(양도) E33689 연맥지폴 FREF09910500 119.820.pdf" → containerNo: FREF09910500, weight: 119.82
   */
  private parseFilenameForContainerInfo(filename: string): {
    containerNo: string | null;
    weight: number | null;
    bales: number | null;
  } {
    if (!filename || typeof filename !== 'string') {
      return { containerNo: null, weight: null, bales: null };
    }
    const base = filename.replace(/\.pdf$/i, '').trim();

    // 컨테이너 번호: 4자리 영문 + 7자리 숫자 (ISO 표준, 예: FREF09910500, HASU5080392)
    const containerMatch = base.match(/\b([A-Z]{4}\d{7})\b/i);
    const containerNo = containerMatch ? containerMatch[1].toUpperCase() : null;

    // 중량: 소수점 포함 숫자 (예: 119.820, 20.78) - 파일명 끝에 있는 경우가 많음
    const weightMatches = base.match(/\b(\d{1,4}\.\d{2,4})\b/g);
    let weight: number | null = null;
    if (weightMatches && weightMatches.length > 0) {
      // 계약번호(E33689) 등과 구분: 10 이상 1000 미만인 중량형 숫자 우선 (MT 단위)
      const candidates = weightMatches.map((m) => parseFloat(m)).filter((n) => n >= 1 && n < 1000);
      weight = candidates.length > 0 ? candidates[candidates.length - 1] : parseFloat(weightMatches[weightMatches.length - 1]);
    }

    // 베일: "60 BALES", "60랩" 등 명시적 표기만 추출 (파일명에 없는 경우 많음)
    const balesMatch = base.match(/(\d+)\s*(?:BALES?|BALE|랩|bales?|bale)/i);
    const bales = balesMatch ? parseInt(balesMatch[1], 10) : null;

    return { containerNo, weight, bales };
  }

  private buildInvoiceExtractionPrompt(order: TradeOrder) {
    const contract = order.contract;
    const contextLines: string[] = [];
    if (contract?.contractNo) {
      contextLines.push(`- Contract Number: ${contract.contractNo}`);
    }
    if (contract?.exporter) {
      contextLines.push(`- Exporter: ${contract.exporter}`);
    }
    if (contract?.exportCountry) {
      contextLines.push(`- Export Country: ${contract.exportCountry}`);
    }
    if (order.bk) {
      contextLines.push(`- Booking No.: ${order.bk}`);
    }
    if (order.bl) {
      contextLines.push(`- B/L No.: ${order.bl}`);
    }

    const contextText = contextLines.length
      ? `가능하다면 아래 힌트를 참고해 문서를 해석하세요:\n${contextLines.join('\n')}`
      : '';

    return `송장(PDF)에서 아래 JSON 스키마에 맞춰 정확한 값을 추출하세요.

**중요**: 문서에 여러 개의 INVOICE와 PACKING LIST가 있을 수 있습니다. 모든 INVOICE와 PACKING LIST에서 컨테이너 정보를 추출하여 하나의 배열에 모두 포함시켜야 합니다.

요구 스키마:
{
  "contractNumber": string | null,
  "invoice": {
    "invoiceNumber": string | null,      // 첫 번째 INVOICE의 송장번호 (여러 개가 있으면 첫 번째 것)
    "invoiceDate": string | null,          // YYYY-MM-DD 형식 (여러 개가 있으면 첫 번째 것)
    "invoiceCurrency": string | null,      // 통화 코드 (예: USD, EUR)
    "invoiceAmount": number | null,        // 모든 INVOICE의 합계 금액 (여러 개가 있으면 합산)
    "invoiceWeight": number | null,        // 모든 INVOICE의 총 중량 합계 (MT 단위로 반환, kg이면 1000으로 나눈 값)
    "unitPrice": number | null,            // 단가 (여러 개가 있으면 평균 또는 첫 번째 것)
    "destination": string | null,          // 도착지명
    "etd": string | null                   // YYYY-MM-DD 형식으로 변환
  },
  "payments": [
    {
      "sequence": number | null,          // 회차 번호(없으면 null)
      "method": string | null,            // 결제 조건 (TT, LC, DA, DP 등)
      "ratio": number | null,             // 비율 (예: 20)
      "amount": number | null,            // 금액
      "dueDate": string | null,           // YYYY-MM-DD 형식
      "dueDateReference": "ETD" | "ETA" | "BL" | "INVOICE" | null, // 'AT 90 DAYS FROM BL DATE' 같은 문구에서 기준이 있으면 지정
      "dueDateOffsetDays": number | null, // 기준일로부터 며칠 후인지 숫자로 기입
      "exchangeRate": number | null,      // 환율이 있으면 숫자로
      "result": string | null,            // 지급 완료/예정 등 텍스트
      "rawText": string | null            // 결제 조건 원문 문장
    }
  ],
  "containers": [
    {
      "containerNo": string | null,       // 컨테이너 번호 (예: ABCD1234567)
      "weight": number | null,            // 컨테이너 중량 (kg 또는 ton 단위, 숫자만 추출)
      "bales": number | null,             // 베일수 (BALE 단위, 숫자만 추출)
      "unitPrice": number | null          // 컨테이너별 단가 (톤당 가격, USD 등)
    }
  ],
  "notes": string | null
}

지침:
- **중요**: 계약번호(Contract No., Contract Number 등)와 송장번호(Invoice No., Invoice Number 등)는 완전히 다른 값입니다. 계약번호는 계약서에 명시된 계약 식별번호이고, 송장번호는 송장에 명시된 송장 식별번호입니다. 문서에서 "Contract No.", "Contract Number", "Contract Ref" 등의 키워드로 표시된 계약번호를 정확히 추출하여 "contractNumber" 필드에 입력하고, 찾을 수 없으면 null로 두세요. 송장번호는 "invoiceNumber" 필드에 입력해야 합니다.
- **여러 개의 INVOICE와 PACKING LIST 처리 (매우 중요)**: 문서에 여러 개의 INVOICE 섹션과 PACKING LIST 섹션이 있을 수 있습니다. 예를 들어 "INVOICE NO. 1", "INVOICE NO. 2" 또는 "PACKING LIST 1", "PACKING LIST 2" 등이 있을 수 있습니다. 이 경우:
  - **모든 INVOICE의 금액과 중량을 합산**하여 invoice.invoiceAmount와 invoice.invoiceWeight에 입력합니다.
  - **모든 PACKING LIST의 컨테이너를 하나의 배열에 모두 포함**시켜야 합니다. 각 PACKING LIST에서 추출한 모든 컨테이너를 containers 배열에 추가합니다.
  - 각 컨테이너는 중복되지 않도록 주의하되, 서로 다른 PACKING LIST에 같은 컨테이너 번호가 있다면 모두 포함시킵니다.
  - 각 INVOICE에 해당하는 단가가 다를 수 있으므로, 각 컨테이너의 unitPrice는 해당 컨테이너가 속한 INVOICE/PACKING LIST의 단가를 사용합니다.
- 숫자는 쉼표나 단위를 제거하고 순수 숫자로 반환합니다.
- TT AT 90 DAYS FROM BL DATE처럼 날짜 조건이 있는 경우, dueDateReference="BL", dueDateOffsetDays=90, rawText에는 원문을 입력하고, 가능한 경우 dueDate도 계산해서 채워 주세요.
- 비율과 금액은 원문이 명확하면 그대로 입력하고, 누락된 값만 인보이스 총액을 이용해 계산해 주세요.
- 결제가 한 번뿐이라면 ratio=100, amount=총금액으로 설정하고, dueDate 관련 조건이 있다면 dueDateReference와 dueDateOffsetDays도 꼭 채워 주세요.
- 날짜 표현(예: "5/8", "Aug 5", "2025.03.12")은 YYYY-MM-DD 형식으로 변환합니다.
- 문서에 "Shipped on board date", "On board date", "Shipped on board" 등으로 표기된 날짜가 있다면 이를 ETD로 간주하고 최우선으로 사용합니다. 해당 값이 없을 때만 다른 출항 관련 날짜(Departure, ETD 등)를 사용하세요.
- 결제 조건(method)은 원문 표기를 유지하되 대문자로 표준화해 주세요.
- 결과(result)는 지급 완료 여부 같은 요약 텍스트를 적절히 정리합니다.
- 환율이 텍스트로만 있으면 숫자로 변환합니다.
- 컨테이너 정보는 문서에서 컨테이너 번호(Container No., CNTR No., CNTR N#, CONTAINER NO. 등)와 각 컨테이너의 중량(Weight, Wt, Gross weight, NET WT 등)을 찾아서 추출합니다. **컨테이너 번호 추출 시 절대적으로 중요한 사항**:\n  * 컨테이너 번호는 문서에 표시된 그대로 **문자 하나하나, 숫자 하나하나 정확히** 추출해야 합니다.\n  * 숫자를 생략하거나, 문자를 생략하거나, 순서를 바꾸면 절대 안 됩니다.\n  * 잘못된 예시:\n    - "HASU5080392"를 "HASU080392"로 읽으면 안 됩니다 (숫자 "5"를 생략함)\n    - "HASU4863182"를 "HASLU863182"로 읽으면 안 됩니다 (문자와 숫자 순서 변경)\n    - "MRSU6055408"을 "MRSU0683108"로 읽으면 안 됩니다 (숫자 순서 변경)\n  * 올바른 예시:\n    - "HASU5080392"는 정확히 "HASU5080392"로 추출\n    - "MRSU8275762"는 정확히 "MRSU8275762"로 추출\n  * 컨테이너 번호는 보통 4개 문자 + 7개 숫자(예: ABCD1234567) 또는 그와 유사한 형식입니다.\n  * 각 컨테이너 번호를 추출할 때마다 문서의 해당 부분을 다시 확인하고, 모든 문자와 숫자가 정확한지 검증하세요.\n  * 중량은 MT(Metric Ton) 단위로 반환합니다. kg 단위로 표시된 경우 1000으로 나눈 값을 반환하고, ton/MT로 표시된 경우 그대로 반환합니다. 컨테이너 정보가 없으면 빈 배열 []로 반환합니다.
- **Packing List 섹션이 있으면 반드시 참조하세요 (BAF 수출사 제외)**: BAF 수출사가 아닌 경우에만, 문서에 "PACKING LIST" 섹션이 있으면 이 섹션을 우선적으로 사용하여 컨테이너 정보를 추출합니다. Packing List에는 일반적으로 컨테이너별로 상세 정보가 표로 정리되어 있습니다. 표에서 "CNTR N#" 또는 "Container No." 또는 "CONTAINER NO." 또는 "CONTAINERS NO." 컬럼에서 컨테이너 번호를 **문서에 표시된 그대로 정확히** 추출합니다. "BALES" 또는 "Bales" 또는 "bales" 또는 "Quantity" 컬럼에서 베일수를 추출합니다. **BALES 컬럼 값이 숫자만 있는 경우(예: 1080, 1086)도 그대로 bales 값으로 추출**합니다. "55 BALE", "55 BALES" 형식이면 55를 추출합니다. 중량은 "NET WT (MT)", "Gross weight", "Weight" 컬럼에서 추출하고, **DESCRIPTION 컬럼 끝에 중량이 포함된 경우(예: "... WA123.890"에서 23.890, "... WA124.000"에서 24.000)도 weight 값으로 추출**합니다. 예: "20.78 MT"에서 20.78을 weight 값으로 추출합니다. **여러 개의 PACKING LIST가 있으면 각각에서 모든 컨테이너를 추출하여 containers 배열에 모두 포함시켜야 합니다.**
- **MAERSK Bill of Lading (B/L)에서 컨테이너 정보 추출**: 문서에 "MAERSK", "BILL OF LADING", "B/L" 등의 키워드가 있는 MAERSK Bill of Lading 페이지가 있다면, 이 페이지에서 컨테이너 정보를 추출해야 합니다. **BAF 수출사인 경우, MAERSK B/L에서만 컨테이너 정보를 추출하고 PACKING LIST는 무시하세요.** 일반 수출사의 경우, PACKING LIST에서 추출하고 MAERSK B/L이 추가로 있다면 그것에서도 추출할 수 있습니다. MAERSK B/L에는 "Particulars Furnished by Shipper" 섹션에 컨테이너 번호, 베일 수(BALES), 중량(Weight, KGS) 정보가 표시되어 있습니다. 예시 형식: "MRKU5420437 ML-ES0613907: 40 DRY 9'6, 59 BALES, 23720.000 KGS"에서 컨테이너 번호 "MRKU5420437", 베일 수 "59", 중량 "23720.000" (kg 단위이므로 MT로 변환 시 23.720)을 추출합니다. "Kind of Packages; Description of goods; Marks and Numbers; Container No./Seal No." 섹션에서 각 컨테이너의 정보를 찾고, "Weight" 섹션에 전체 중량(Total Weight)이 표시되어 있을 수 있습니다. MAERSK B/L에서 추출한 컨테이너 정보도 containers 배열에 포함시켜야 합니다.
- **컨테이너별 단가 추출 (중요)**: INVOICE 섹션에서 품목별로 다른 단가가 명시되어 있는 경우, 각 컨테이너에 해당하는 단가를 추출합니다. 
  - **중량 합계 기반 매칭 방법**: INVOICE에 여러 품목이 있고 각 품목의 총 중량(Total Net weight)과 단가(Price per Ton)가 명시되어 있는 경우, Packing List의 컨테이너 그룹별 총 중량을 계산하여 INVOICE의 품목별 총 중량과 비교하여 매칭합니다.
    - 예시: INVOICE에 "Rice Straw Bales (Half-Cut Bales)" 총 중량 101.44 MT, 단가 185.00 USD/MT와 "Rice Straw Bales (Heavy Bales)" 총 중량 79.505 MT, 단가 170.00 USD/MT가 있는 경우:
      - Packing List에서 컨테이너 그룹의 총 중량을 계산합니다 (각 컨테이너의 중량을 합산).
      - 첫 번째 그룹의 총 중량이 79.505 MT (또는 근사치)이면 → Heavy Bales 단가 170.00 적용
      - 두 번째 그룹의 총 중량이 101.44 MT (또는 근사치)이면 → Half-Cut Bales 단가 185.00 적용
    - Packing List에 여러 테이블이나 그룹이 있는 경우, 각 그룹의 총 중량을 계산하여 INVOICE의 품목별 총 중량과 매칭합니다.
    - 중량이 정확히 일치하지 않아도 오차 범위 내(예: ±0.1 MT)이면 같은 품목으로 간주합니다.
  - 컨테이너별 단가를 매칭할 수 없는 경우, 전체 송장의 단가(invoice.unitPrice)를 각 컨테이너의 unitPrice로 사용합니다.
  - 단가는 톤당 가격(USD/MT)으로 반환하며, 통화 단위(USD, $ 등)는 제거하고 숫자만 추출합니다. 예: "185.00 USD/MT" 또는 "$185.00/MT"에서 185.00을 추출합니다.
- 송장 중량(invoiceWeight)도 MT 단위로 반환합니다. kg 단위로 표시된 경우 1000으로 나눈 값을 반환하고, ton/MT로 표시된 경우 그대로 반환합니다.
- JSON 이외의 텍스트는 절대 추가하지 마세요.

${contextText}`;
  }

  private normalizeInvoiceExtraction(raw: any) {
    const safeString = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const invoiceRaw = raw?.invoice ?? {};
    const paymentsRaw = Array.isArray(raw?.payments) ? raw.payments : [];

    const contractNumber = safeString(
      raw?.contractNumber ??
        raw?.contract_no ??
        raw?.contractNo ??
        raw?.contract_ref ??
        raw?.contract_reference ??
        raw?.contract ??
        invoiceRaw?.contractNumber ??
        invoiceRaw?.contract_ref ??
        invoiceRaw?.contractReference ??
        invoiceRaw?.contractNumberReference ??
        invoiceRaw?.contractName ??
        null,
    );

    const invoiceAmount = this.parseNumberOrNull(
      invoiceRaw.invoiceAmount ?? invoiceRaw.totalAmount ?? invoiceRaw.amount ?? null,
    );
    const invoiceWeight = this.parseNumberOrNull(
      invoiceRaw.invoiceWeight ?? invoiceRaw.weight ?? invoiceRaw.totalWeight ?? null,
    );
    const unitPrice = this.parseNumberOrNull(
      invoiceRaw.unitPrice ?? invoiceRaw.pricePerUnit ?? invoiceRaw.unit_price ?? null,
    );

    const invoice = {
      invoiceNumber: safeString(invoiceRaw.invoiceNumber ?? invoiceRaw.number ?? null),
      invoiceDate: safeString(invoiceRaw.invoiceDate ?? invoiceRaw.date ?? null),
      invoiceCurrency: safeString(invoiceRaw.invoiceCurrency ?? invoiceRaw.currency ?? null),
      invoiceAmount,
      invoiceWeight,
      unitPrice,
      destination: (() => {
        const destinationRaw = safeString(invoiceRaw.destination ?? invoiceRaw.port ?? null);
        if (!destinationRaw) {
          return null;
        }
        const normalized = this.normalizeDestination(destinationRaw);
        return normalized || destinationRaw;
      })(),
      etd: safeString(invoiceRaw.etd ?? invoiceRaw.etdDate ?? null),
    };

    const sanitizedPayments = paymentsRaw.map((payment: any) => ({
      sequence: payment?.sequence ?? payment?.seq ?? payment?.nth ?? null,
      dueDate: payment?.dueDate ?? payment?.due_date ?? payment?.date ?? null,
      ratio: payment?.ratio ?? payment?.percentage ?? payment?.percent ?? null,
      amount: payment?.amount ?? payment?.price ?? null,
      method: payment?.method ?? payment?.payment_method ?? null,
      exchangeRate: payment?.exchangeRate ?? payment?.exchange_rate ?? null,
      result: payment?.result ?? payment?.status ?? payment?.note ?? null,
      notes: payment?.notes ?? null,
    }));

    const containersRaw = Array.isArray(raw?.containers) ? raw.containers : [];
    const sanitizedContainers = containersRaw
      .map((container: any) => {
        const containerNo = safeString(
          container?.containerNo ??
            container?.container_no ??
            container?.containerNumber ??
            container?.container_number ??
            container?.cntrNo ??
            container?.cntr_no ??
            container?.no ??
            null,
        );
        const weight = this.parseNumberOrNull(
          container?.weight ?? container?.wt ?? container?.weightKg ?? container?.weight_kg ?? null,
        );
        const bales = this.parseNumberOrNull(
          container?.bales ?? container?.bale ?? container?.quantity ?? container?.qty ?? null,
        );
        const unitPrice = this.parseNumberOrNull(
          container?.unitPrice ?? container?.unit_price ?? container?.pricePerUnit ?? container?.price_per_unit ?? null,
        );

        // 컨테이너 번호가 있어야만 유효한 컨테이너로 간주
        if (!containerNo) {
          return null;
        }

        return {
          containerNo,
          weight,
          bales,
          unitPrice,
        };
      })
      .filter((c): c is { containerNo: string; weight: number | null; bales: number | null; unitPrice: number | null } => c !== null);

    const notes = safeString(raw?.notes ?? invoiceRaw?.notes ?? null);

    return {
      contractNumber,
      invoice,
      payments: sanitizedPayments,
      containers: sanitizedContainers,
      notes,
    };
  }

  private enrichPaymentsWithTotals(
    payments: NormalizedPayment[],
    totalAmount: number | null | undefined,
    options?: {
      etd?: string | null;
    },
  ) {
    const validTotal = totalAmount !== null && totalAmount !== undefined ? totalAmount : null;

    const mapMethod = (raw: string | null | undefined, context?: string | null): 'TT' | 'LC' | 'DA' | 'DP' => {
      const value = (raw ?? context ?? '').toUpperCase();
      if (/LC/.test(value)) return 'LC';
      if (/D\/?A/.test(value)) return 'DA';
      if (/D\/?P/.test(value)) return 'DP';
      return 'TT';
    };

    if (!payments.length) {
      const defaultFirst: NormalizedPayment = {
        sequence: 1,
        dueDate: null,
        ratio: 10,
        amount: validTotal !== null ? this.roundNumber((validTotal * 10) / 100, 2) : null,
        method: 'TT',
        exchangeRate: null,
        result: null,
        notes: null,
        paymentType: 'REGULAR',
        useRatio: true, // 기본값: 비율 사용
      };

      const defaultSecond: NormalizedPayment = {
        sequence: 2,
        dueDate: null,
        ratio: 90,
        amount: validTotal !== null ? this.roundNumber((validTotal * 90) / 100, 2) : null,
        method: 'TT',
        exchangeRate: null,
        result: null,
        notes: null,
        paymentType: 'REGULAR',
        useRatio: true, // 기본값: 비율 사용
      };

      const etdCandidate = this.parseFlexibleDate(options?.etd ?? null);
      if (etdCandidate) {
        defaultSecond.dueDate = this.addDays(etdCandidate, 90);
      }

      payments.splice(0, payments.length, defaultFirst, defaultSecond);
      return;
    }

    const sorted = [...payments].sort((a, b) => a.sequence - b.sequence);
    const results: NormalizedPayment[] = [];
    const etdCandidate = this.parseFlexibleDate(options?.etd ?? null);

    sorted.forEach((payment, index) => {
      const next: NormalizedPayment = {
        sequence: index + 1,
        dueDate: payment.dueDate ?? null,
        ratio: payment.ratio ?? null,
        amount: payment.amount ?? null,
        method: payment.method ?? null,
        exchangeRate: payment.exchangeRate ?? null,
        result: payment.result ?? null,
        notes: payment.notes ?? null,
        paymentType: payment.paymentType ?? 'REGULAR',
        useRatio: payment.useRatio !== undefined && payment.useRatio !== null ? payment.useRatio : true, // 기본값: true
      };

      next.method = mapMethod(next.method, next.result);

      if (
        (next.ratio === null || next.ratio === undefined) &&
        validTotal !== null &&
        next.amount !== null &&
        next.amount !== undefined
      ) {
        next.ratio = this.roundNumber((next.amount / validTotal) * 100, 3);
      }

      if (next.ratio === null || next.ratio === undefined) {
        if (sorted.length === 1) {
          next.ratio = 100;
        } else if (index === sorted.length - 1) {
          const assigned = results.reduce((sum, item) => sum + (item.ratio ?? 0), 0);
          next.ratio = this.roundNumber(Math.max(0, 100 - assigned), 3);
        } else {
          next.ratio = this.roundNumber(100 / sorted.length, 3);
        }
      }

      if (validTotal !== null && (next.amount === null || next.amount === undefined) && next.ratio !== null && next.ratio !== undefined) {
        next.amount = this.roundNumber((validTotal * next.ratio) / 100, 2);
      }

      if (index === 0) {
        next.dueDate = null;
      } else if (!next.dueDate) {
        if (etdCandidate) {
          next.dueDate = this.addDays(etdCandidate, 90);
        } else if (next.result) {
          next.dueDate = this.extractDueDateFromNotes(next.result);
        }
      }

      results.push(next);
    });

    payments.splice(0, payments.length, ...results);
  }

  private roundNumber(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  /**
   * 발주별 재고 집계 (판매예약 BL 조회 카드). listContainers와 동일한 판매 차감·컨 상당 정규화.
   * @param excludeReservationId 수정 중인 시트 예약 행은 시트 집계에서 제외
   */
  async aggregateStockByTradeOrderIds(
    orderIds: string[],
    excludeReservationId?: string | null,
  ): Promise<
    Record<
      string,
      {
        containerCount: number;
        totalBales: number;
        totalAvailableBales: number;
        totalReservedBales: number;
        totalCompletedBales: number;
        totalWeightMt: number;
        totalAvailableWeightMt: number;
        totalReservedWeightMt: number;
        totalCompletedWeightMt: number;
        /** 판매관리(tb) + 시트 그리드 예약 합계(베일·중량) */
        totalSheetReservationBales: number;
        totalSheetReservationWeightMt: number;
        availableContainerEquivDisplay: number;
        containerEquivOutflow: number;
      }
    >
  > {
    const unique = [...new Set(orderIds.filter(Boolean))];
    const empty = (): {
      containerCount: number;
      totalBales: number;
      totalAvailableBales: number;
      totalReservedBales: number;
      totalCompletedBales: number;
      totalWeightMt: number;
      totalAvailableWeightMt: number;
      totalReservedWeightMt: number;
      totalCompletedWeightMt: number;
      totalSheetReservationBales: number;
      totalSheetReservationWeightMt: number;
      availableContainerEquivDisplay: number;
      containerEquivOutflow: number;
    } => ({
      containerCount: 0,
      totalBales: 0,
      totalAvailableBales: 0,
      totalReservedBales: 0,
      totalCompletedBales: 0,
      totalWeightMt: 0,
      totalAvailableWeightMt: 0,
      totalReservedWeightMt: 0,
      totalCompletedWeightMt: 0,
      totalSheetReservationBales: 0,
      totalSheetReservationWeightMt: 0,
      availableContainerEquivDisplay: 0,
      containerEquivOutflow: 0,
    });

    const out: Record<string, ReturnType<typeof empty>> = {};
    unique.forEach((id) => {
      out[String(id)] = empty();
    });
    if (unique.length === 0) {
      return out;
    }

    const containers = await this.tradeContainerRepository
      .createQueryBuilder('container')
      .leftJoinAndSelect('container.order', 'order', 'order.to_deleted_at IS NULL')
      .where('order.id IN (:...orderIds)', { orderIds: unique })
      .andWhere('(container.excludeFromInventory = :excludeFalse OR container.excludeFromInventory IS NULL)', {
        excludeFalse: false,
      })
      .getMany();

    const containerIds = containers.map((c) => c.id);
    const reservedQuantities = new Map<string | number, { bales: number; weight: number }>();
    const completedQuantities = new Map<string | number, { bales: number; weight: number }>();
    const availableStockDeductQuantities = new Map<string | number, { bales: number; weight: number }>();

    if (containerIds.length > 0) {
      const salesItems = await this.salesItemRepository
        .createQueryBuilder('item')
        .leftJoinAndSelect('item.container', 'container')
        .where('item.containerId IN (:...containerIds)', { containerIds })
        .andWhere('item.containerId IS NOT NULL')
        .getMany();

      const isReservedStatus = (s: string) =>
        s === 'SALES_ITEM_RESERVED' || s === 'SALES_ITEM_SOLD';
      const isCompletedStatus = (s: string) =>
        s === 'SALES_ITEM_COMPLETED' || s === 'INVENTORY_CONSUMPTION';

      salesItems.forEach((item) => {
        if (item.status === 'SALES_ITEM_CANCELLED') {
          return;
        }
        const containerId = item.containerId;
        const currentReserved = reservedQuantities.get(containerId!) || { bales: 0, weight: 0 };
        const currentCompleted = completedQuantities.get(containerId!) || { bales: 0, weight: 0 };

        let cargoBales = 0;
        let cargoWeight = 0;
        if (item.containerType === 'CONTAINER') {
          const container = item.container;
          if (container) {
            const q = resolveContainerTypeSalesItemCargoQuantities(container, item);
            cargoBales = q.bales;
            cargoWeight = q.weight;
          }
        } else {
          cargoBales = item.cargoBales ? Number(item.cargoBales) : 0;
          cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
        }

        if (isReservedStatus(item.status ?? '')) {
          currentReserved.bales += cargoBales;
          currentReserved.weight += cargoWeight;
        } else if (isCompletedStatus(item.status ?? '')) {
          currentCompleted.bales += cargoBales;
          currentCompleted.weight += cargoWeight;
        } else if (item.status === 'INVENTORY_INBOUND') {
          currentCompleted.bales += cargoBales;
          currentCompleted.weight += cargoWeight;
        }

        const curAvailDeduct = availableStockDeductQuantities.get(containerId!) || { bales: 0, weight: 0 };
        curAvailDeduct.bales += cargoBales;
        curAvailDeduct.weight += cargoWeight;
        availableStockDeductQuantities.set(containerId!, curAvailDeduct);

        reservedQuantities.set(containerId!, currentReserved);
        completedQuantities.set(containerId!, currentCompleted);
      });
    }

    const sheetQtyByContainer = await this.loadActiveSheetReservationQtyByContainer(
      containers,
      excludeReservationId?.trim() || undefined,
    );

    type Acc = {
      containerCount: number;
      totalBales: number;
      totalAvailableBales: number;
      totalReservedBales: number;
      totalCompletedBales: number;
      totalWeightMt: number;
      totalAvailableWeightMt: number;
      totalReservedWeightMt: number;
      totalCompletedWeightMt: number;
      totalSheetReservationBales: number;
      totalSheetReservationWeightMt: number;
      availableContainerEquiv: number;
      reservedContainerEquiv: number;
      soldContainerEquiv: number;
    };

    const byOrder = new Map<string, Acc>();
    for (const id of unique) {
      byOrder.set(String(id), {
        containerCount: 0,
        totalBales: 0,
        totalAvailableBales: 0,
        totalReservedBales: 0,
        totalCompletedBales: 0,
        totalWeightMt: 0,
        totalAvailableWeightMt: 0,
        totalReservedWeightMt: 0,
        totalCompletedWeightMt: 0,
        totalSheetReservationBales: 0,
        totalSheetReservationWeightMt: 0,
        availableContainerEquiv: 0,
        reservedContainerEquiv: 0,
        soldContainerEquiv: 0,
      });
    }

    const equivFromContainer = (
      c: TradeContainer,
      reservedBales: number,
      reservedWeight: number,
      completedBales: number,
      completedWeight: number,
      availableBales: number,
      availableWeight: number,
    ) => {
      const bales = this.getEffectiveSalesBales(c);
      const weight = c.weight ? Number(c.weight) : 0;
      const useBales = bales > 0;
      const denom = useBales ? bales : weight;
      if (denom <= 0) {
        return { availableCnt: 0, reservedCnt: 0, soldCnt: 0 };
      }
      if (useBales) {
        return {
          availableCnt: availableBales / denom,
          reservedCnt: reservedBales / denom,
          soldCnt: completedBales / denom,
        };
      }
      return {
        availableCnt: availableWeight / denom,
        reservedCnt: reservedWeight / denom,
        soldCnt: completedWeight / denom,
      };
    };

    for (const container of containers) {
      const order = container.order;
      if (!order?.id) {
        continue;
      }
      const oid = String(order.id);
      const acc = byOrder.get(oid);
      if (!acc) {
        continue;
      }

      const reservedQty = reservedQuantities.get(container.id) || { bales: 0, weight: 0 };
      const completedQty = completedQuantities.get(container.id) || { bales: 0, weight: 0 };
      const availDeduct = availableStockDeductQuantities.get(container.id) || { bales: 0, weight: 0 };
      const originalBales = this.getEffectiveSalesBales(container);
      const originalWeight = container.weight ? Number(container.weight) : 0;
      const sheetQty = sheetQtyByContainer.get(String(container.id)) || { bales: 0, weight: 0 };
      const availableBales = originalBales - availDeduct.bales - sheetQty.bales;
      const availableWeight = originalWeight - availDeduct.weight - sheetQty.weight;

      const ce = equivFromContainer(
        container,
        reservedQty.bales,
        reservedQty.weight,
        completedQty.bales,
        completedQty.weight,
        availableBales,
        availableWeight,
      );

      acc.containerCount += 1;
      acc.totalBales += originalBales;
      acc.totalAvailableBales += availableBales;
      acc.totalReservedBales += reservedQty.bales;
      acc.totalCompletedBales += completedQty.bales;
      acc.totalWeightMt += originalWeight;
      acc.totalAvailableWeightMt += availableWeight;
      acc.totalReservedWeightMt += reservedQty.weight;
      acc.totalCompletedWeightMt += completedQty.weight;
      acc.totalSheetReservationBales += sheetQty.bales;
      acc.totalSheetReservationWeightMt += sheetQty.weight;
      acc.availableContainerEquiv += ce.availableCnt;
      acc.reservedContainerEquiv += ce.reservedCnt;
      acc.soldContainerEquiv += ce.soldCnt;
    }

    for (const id of unique) {
      const acc = byOrder.get(String(id))!;
      const n = acc.containerCount;
      let av = acc.availableContainerEquiv;
      let rv = acc.reservedContainerEquiv;
      const sumAvailReserved = av + rv;
      if (n > 0 && sumAvailReserved > n + 0.001) {
        const factor = n / sumAvailReserved;
        av *= factor;
        rv *= factor;
      }
      const containerEquivOutflow = acc.reservedContainerEquiv + acc.soldContainerEquiv;
      out[String(id)] = {
        containerCount: acc.containerCount,
        totalBales: acc.totalBales,
        totalAvailableBales: acc.totalAvailableBales,
        totalReservedBales: acc.totalReservedBales,
        totalCompletedBales: acc.totalCompletedBales,
        totalWeightMt: acc.totalWeightMt,
        totalAvailableWeightMt: acc.totalAvailableWeightMt,
        totalReservedWeightMt: acc.totalReservedWeightMt,
        totalCompletedWeightMt: acc.totalCompletedWeightMt,
        totalSheetReservationBales: acc.totalSheetReservationBales,
        totalSheetReservationWeightMt: acc.totalSheetReservationWeightMt,
        availableContainerEquivDisplay: av,
        containerEquivOutflow,
      };
    }

    return out;
  }

  /** 영업 베일 수 (salesBales 있으면 사용, 없으면 무역 베일 tradeBales와 동일) */
  private getEffectiveSalesBales(c: { tradeBales?: string | null; salesBales?: string | null }): number {
    return effectiveSalesBalesFromContainer(c);
  }

  /**
   * 영업일 기준으로 날짜 계산 (주말 제외)
   * Google Sheets의 WORKDAY 함수와 동일한 동작
   * @param startDate 시작 날짜
   * @param days 더할 영업일 수 (양수면 미래, 음수면 과거)
   * @returns 계산된 날짜
   */
  private addWorkdays(startDate: Date, days: number): Date {
    if (days === 0) {
      return new Date(startDate);
    }

    const result = new Date(startDate);
    let remainingDays = Math.abs(days);
    const direction = days > 0 ? 1 : -1;

    while (remainingDays > 0) {
      result.setDate(result.getDate() + direction);
      const dayOfWeek = result.getDay();
      // 토요일(6)과 일요일(0)이 아니면 영업일로 간주
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        remainingDays--;
      }
    }

    return result;
  }

  /**
   * 수출사별 결제 예정일 계산 규칙
   * 형식: "수출사코드 Workday(ETD+offset, sequence)"
   * 예: "NFS Workday(ETD+3, 1)" -> NFS 수출사의 1차 결제는 ETD+3일 후 영업일 기준
   * 
   * @param exporterCode 수출사 코드
   * @param sequence 결제 순번 (1 또는 2)
   * @param etdDate ETD 날짜
   * @returns 계산된 결제 예정일 또는 null
   */
  private calculatePaymentDueDate(
    exporterCode: string | null,
    sequence: number,
    etdDate: Date | null,
  ): Date | null {
    if (!exporterCode || !etdDate) {
      return null;
    }

    const normalizedExporter = exporterCode.trim().toUpperCase();

    // 수출사별 결제 예정일 계산 규칙 정의
    // 형식: { 수출사코드: { sequence: { offset: number, useWorkday: boolean } } }
    const paymentRules: Record<string, Record<number, { offset: number; useWorkday: boolean }>> = {
      // 예시: NFS 수출사
      // 'NFS': {
      //   1: { offset: 3, useWorkday: true },  // 1차 결제: ETD+3 영업일
      //   2: { offset: 90, useWorkday: false }, // 2차 결제: ETD+90일 (일반일)
      // },
    };

    const rule = paymentRules[normalizedExporter]?.[sequence];
    if (!rule) {
      return null; // 규칙이 없으면 자동 계산 안 함
    }

    const baseDate = this.addDays(etdDate, rule.offset);
    
    if (rule.useWorkday) {
      // Workday 계산: baseDate를 기준으로 영업일 계산
      // baseDate 자체가 영업일이 아니면 다음 영업일로 조정
      return this.addWorkdays(baseDate, 0);
    } else {
      return baseDate;
    }
  }

  private extractDueDateFromNotes(notes: string | null): Date | null {
    if (!notes) {
      return null;
    }
    const isoMatch = notes.match(/(20\d{2}-\d{2}-\d{2})/);
    if (isoMatch) {
      return this.parseFlexibleDate(isoMatch[1]);
    }
    const monthDayMatch = notes.match(/(\d{1,2})\/(\d{1,2})/);
    if (monthDayMatch) {
      const currentYear = new Date().getFullYear();
      const candidate = `${currentYear}-${monthDayMatch[1].padStart(2, '0')}-${monthDayMatch[2].padStart(2, '0')}`;
      return this.parseFlexibleDate(candidate);
    }
    return null;
  }

  async saveInvoice(orderId: string, dto: SaveInvoiceDto) {
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['contract'],
    });

    if (!order) {
      throw new NotFoundException('해당 스케줄을 찾을 수 없습니다.');
    }

    const sanitizeString = (value: string | null | undefined) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const contractNoNormalized = order.contract?.contractNo
      ? this.normalizeContractNumber(order.contract.contractNo)
      : null;

    const finalDir = contractNoNormalized ? join(FINAL_INVOICE_DIR, contractNoNormalized) : FINAL_INVOICE_DIR;

    let movedFile: { fileName: string; finalPath: string; absolutePath: string } | null = null;
    // 구글 드라이브 파일 ID가 없고 tempFilePath가 있으면 로컬 파일로 저장
    if (!dto.googleDriveFileId && dto.tempFilePath) {
      movedFile = await this.moveToFinalLocation(dto.tempFilePath, finalDir);
    }

    const existingAmount = order.invoiceAmount ? Number(order.invoiceAmount) : null;
    const existingTotal = order.totalAmount ? Number(order.totalAmount) : null;
    const totalAmountForPayments =
      dto.totalAmount ?? dto.invoiceAmount ?? existingTotal ?? existingAmount;

    const normalizedPayments = this.normalizePayments(dto.payments ?? [], 1);
    this.enrichPaymentsWithTotals(normalizedPayments, totalAmountForPayments, {
      etd: dto.etd ?? order.etdText ?? this.normalizeDateValue(order.etdDate),
    });

    try {
      await this.dataSource.transaction(async (manager) => {
        if (dto.invoiceNumber !== undefined) {
          const value = sanitizeString(dto.invoiceNumber);
          order.invoiceNumber = value ?? null;
        }

        if (dto.invoiceDate !== undefined) {
          order.invoiceDate = this.parseFlexibleDate(dto.invoiceDate ?? null);
        }

        if (dto.invoiceCurrency !== undefined) {
          const currency = sanitizeString(dto.invoiceCurrency);
          order.invoiceCurrency = currency ? currency.toUpperCase() : null;
        }

        if (dto.invoiceCurrencyName !== undefined) {
          const currencyName = sanitizeString(dto.invoiceCurrencyName);
          order.invoiceCurrencyName = currencyName ?? null;
        }

        if (dto.invoiceAmount !== undefined) {
          if (dto.invoiceAmount === null || Number.isNaN(dto.invoiceAmount)) {
            order.invoiceAmount = null;
          } else {
            order.invoiceAmount = dto.invoiceAmount.toString();
          }
        }

        // totalAmount가 명시적으로 전달된 경우에만 업데이트
        // undefined인 경우는 기존 값 유지 (invoiceAmount를 총량으로 사용하지 않음)
        if (dto.totalAmount !== undefined) {
          if (dto.totalAmount === null || Number.isNaN(dto.totalAmount)) {
            order.totalAmount = null;
          } else {
            order.totalAmount = dto.totalAmount.toString();
          }
        }

        if (dto.invoiceWeight !== undefined) {
          if (dto.invoiceWeight === null || Number.isNaN(dto.invoiceWeight)) {
            order.invoiceWeight = null;
          } else {
            order.invoiceWeight = dto.invoiceWeight.toString();
          }
        }

        if (dto.unitPrice !== undefined) {
          if (dto.unitPrice === null || Number.isNaN(dto.unitPrice)) {
            order.unitPrice = null;
          } else {
            order.unitPrice = dto.unitPrice.toString();
          }
        }

        if (dto.currencyName !== undefined) {
          order.currencyName = sanitizeString(dto.currencyName) ?? null;
        }

        if (dto.destination !== undefined) {
          const normalizedDestination = this.normalizeDestination(dto.destination ?? null);
          order.destination = normalizedDestination ? normalizedDestination : null;
        }

        if (dto.etd !== undefined) {
          const { text, date } = this.normalizeEtdInput(dto.etd ?? null);
          order.etdText = text;
          order.etdDate = date;
        }

        if (dto.etd === undefined && dto.invoiceDate !== undefined && !order.etdDate) {
          // If ETD not provided but invoice has ETD context, ensure existing value persists
          const { text, date } = this.normalizeEtdInput(order.etdText ?? null);
          order.etdText = text;
          order.etdDate = date;
        }

        if (dto.eta !== undefined) {
          order.etaDate = this.parseFlexibleDate(dto.eta ?? null);
        }

        if (dto.notes !== undefined) {
          order.notes = dto.notes?.trim() ? dto.notes.trim() : null;
        }

        if (dto.googleDriveFileId) {
          // 구글 드라이브 파일 ID 저장
          order.invoiceGoogleDriveFileId = dto.googleDriveFileId;
          // 기존 로컬 파일 경로는 null로 설정 (구글 드라이브 사용)
          order.invoiceFilePath = null;
        } else if (movedFile) {
          // 로컬 파일 저장
          order.invoiceFilePath = movedFile.finalPath;
          order.invoiceGoogleDriveFileId = null;
        }
        // 파일명은 항상 저장 (구글 드라이브 또는 로컬 파일 모두)
        if (dto.originalFileName !== undefined) {
          order.invoiceFileName = dto.originalFileName ?? (movedFile ? movedFile.fileName : null);
        }

        await manager.save(order);

        await manager.delete(TradeOrderPayment, { order: { id: order.id } as any });

        if (normalizedPayments.length && dto.payments) {
          // dto.payments와 normalizedPayments를 매칭하여 krwAmount 포함
          const paymentEntities = normalizedPayments.map((payment, index) => {
            const originalPayment = dto.payments?.[index];
            // krwAmount 계산: DTO에서 제공되면 사용, 없으면 amount * exchangeRate 계산
            let krwAmountStr: string | null = null;
            if (originalPayment?.krwAmount !== null && originalPayment?.krwAmount !== undefined) {
              krwAmountStr = this.roundNumber(originalPayment.krwAmount, 2).toString();
            } else if (payment.amount !== null && payment.amount !== undefined && payment.exchangeRate !== null && payment.exchangeRate !== undefined) {
              // REGULAR: amount * exchangeRate
              const calculatedKrwAmount = payment.amount * payment.exchangeRate;
              krwAmountStr = this.roundNumber(calculatedKrwAmount, 2).toString();
            }

            return manager.create(TradeOrderPayment, {
              order,
              sequence: payment.sequence,
              dueDate: payment.dueDate ?? null,
              ratio:
                payment.ratio !== null && payment.ratio !== undefined
                  ? payment.ratio.toString()
                  : null,
              amount:
                payment.amount !== null && payment.amount !== undefined
                  ? payment.amount.toString()
                  : null,
              method: payment.method ?? null,
              exchangeRate:
                payment.exchangeRate !== null && payment.exchangeRate !== undefined
                  ? payment.exchangeRate.toString()
                  : null,
              krwAmount: krwAmountStr,
              result: payment.result ?? null,
              paymentType: 'REGULAR', // 일반 결제
              notes: payment.notes ?? null,
              useRatio: payment.useRatio !== undefined ? payment.useRatio : true, // 기본값: true
            });
          });
          await manager.save(paymentEntities);
        }

        if (movedFile) {
          const invoiceFileRecord = manager.create(FileEntity, {
            module: 'TRADE_ORDER',
            type: 'INVOICE_DOC',
            refId: order.id,
            path: movedFile.finalPath,
            originalName: dto.originalFileName ?? movedFile.fileName,
            contentType: null,
            metadata: {
              contractNo: order.contract?.contractNo ?? null,
              orderSequence: order.sequence,
            },
          });
          await manager.save(invoiceFileRecord);
        }
      });

      this.logger.log(
        `[Invoice] 저장 완료 - orderId=${orderId}, invoiceNumber=${order.invoiceNumber ?? 'N/A'}`,
      );

      return {
        success: true,
        message: '송장 정보가 저장되었습니다.',
      };
    } catch (error) {
      if (movedFile) {
        try {
          await fs.unlink(movedFile.absolutePath);
        } catch (unlinkError) {
          this.logger.warn(
            `송장 정보 저장 실패 후 파일 삭제에 실패했습니다: ${movedFile.absolutePath}`,
            unlinkError as Error,
          );
        }
      }
      this.logger.error('송장 정보 저장 중 오류가 발생했습니다.', error as Error);
      throw error;
    }
  }

  async onModuleInit() {
    await this.loadCodeCategories([
      'PRODUCT',
      'PACKING_TYPE',
      'SHIPPING_LINE',
      'EXPORTER',
      'DESTINATION_PORT',
      'CURRENCY',
      'EXPORT_COUNTRY',
      'PAYMENT_TERMS',
    ]);
  }

  private async loadCodeCategories(categories: string[]): Promise<void> {
    await Promise.all(
      categories.map(async (category) => {
        // 모든 코드는 Code (tb_code)에서 조회
        const loader = this.codeRepository
          .find({
            where: { group: category },
            order: { order: 'ASC' },
          })
          .then((codes) => {
            this.codeCategoryCache.set(category, codes);
            return codes;
          });
        this.codeCategoryLoading.set(category, loader);

        const codes = await loader;
        switch (category) {
          case 'PRODUCT':
            this.productCodes = codes;
            break;
          case 'PACKING_TYPE':
            this.packingCodes = codes;
            break;
          case 'SHIPPING_LINE':
            this.shippingLineCodes = codes;
            break;
          case 'EXPORTER':
            this.exporterCodes = codes;
            break;
          case 'DESTINATION_PORT':
            this.destinationCodes = codes;
            break;
          case 'CURRENCY':
            this.currencyCodes = codes;
            break;
          case 'EXPORT_COUNTRY':
            this.exportCountryCodes = codes;
            break;
          case 'PAYMENT_TERMS':
            this.paymentTermsCodes = codes;
            break;
          default:
            break;
        }
      }),
    );
  }

  private getCodesByCategory(category: string): Code[] {
    const cached = this.codeCategoryCache.get(category);
    return cached ?? [];
  }

  private normalizeTokens(text: string, category: string): string[] {
    const stopWords = new Set([
      ...this.defaultStopWords,
      ...(this.categoryStopWordsMap[category] ?? []),
    ]);
    return text
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && !stopWords.has(token));
  }

  private joinTokens(tokens: string[]): string {
    return tokens.join('');
  }

  private findBestCodeMatch(value: string | null, category: string): Code | null {
    if (!value) {
      return null;
    }
    const candidates = this.getCodesByCategory(category);
    if (!candidates.length) {
      return null;
    }
 
    const normalizeSimple = (text: string) =>
      text
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const targetSimple = normalizeSimple(value);
    const targetTokens = this.normalizeTokens(value, category);
    const targetTokenKey = this.joinTokens(targetTokens);

    if (!targetSimple && !targetTokenKey) {
      return null;
    }

    const exact = candidates.find((code) => {
      const nameKey = normalizeSimple(code.name ?? '');
      const valueKey = normalizeSimple(code.value ?? '');
      return (targetSimple && (nameKey === targetSimple || valueKey === targetSimple)) || false;
    });
    if (exact) {
      return exact;
    }

    // aliases 매칭
    const aliasExact = candidates.find((code) => {
      if (!code.aliases) {
        return false;
      }
      return code.aliases
        .split(/[;,|]/)
        .map((alias) => normalizeSimple(alias))
        .some((aliasKey) => aliasKey && targetSimple && aliasKey === targetSimple);
    });
    if (aliasExact) {
      return aliasExact;
    }

    const tokenMatch = candidates
      .map((code) => {
        const candidateTokens = new Set<string>();
        this.normalizeTokens(code.value ?? '', category).forEach((token) =>
          candidateTokens.add(token),
        );
        this.normalizeTokens(code.name ?? '', category).forEach((token) =>
          candidateTokens.add(token),
        );
        if (code.aliases) {
          code.aliases
            .split(/[;,|]/)
            .map((alias) => alias.trim())
            .filter((alias) => alias.length > 0)
            .forEach((alias) => {
              this.normalizeTokens(alias, category).forEach((token) =>
                candidateTokens.add(token),
              );
            });
        }

        let score = 0;
        targetTokens.forEach((token) => {
          if (candidateTokens.has(token)) {
            score += 1;
          }
        });

        const candidateKey = this.joinTokens(Array.from(candidateTokens));
        const tokenKeyMatch = targetTokenKey && candidateKey === targetTokenKey ? 1 : 0;

        return {
          code,
          score,
          tokenKeyMatch,
          candidateTokensSize: candidateTokens.size,
        };
      })
      .filter((item) => item.score > 0 || item.tokenKeyMatch > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.tokenKeyMatch !== a.tokenKeyMatch) {
          return b.tokenKeyMatch - a.tokenKeyMatch;
        }
        return a.candidateTokensSize - b.candidateTokensSize;
      });

    if (tokenMatch.length) {
      return tokenMatch[0].code;
    }

    const partial = candidates.find((code) => {
      const nameKey = normalizeSimple(code.name ?? '');
      const valueKey = normalizeSimple(code.value ?? '');
      if (targetSimple) {
        if (nameKey.includes(targetSimple) || targetSimple.includes(nameKey)) {
          return true;
        }
        if (valueKey.includes(targetSimple) || targetSimple.includes(valueKey)) {
          return true;
        }
      }
      const aliasMatch = code.aliases
        ?.split(/[;,|]/)
        .map((alias) => normalizeSimple(alias))
        .some((alias) => alias && targetSimple && (alias.includes(targetSimple) || targetSimple.includes(alias)));
      if (aliasMatch) {
        return true;
      }
      return (
        (nameKey && targetTokenKey && nameKey.includes(targetTokenKey)) ||
        (valueKey && targetTokenKey && valueKey.includes(targetTokenKey))
      );
    });
    return partial ?? null;
  }

  private resolvePackingSource(core: NormalizedCore): string | null {
    const isContainer = (text: string) => /container(s)?/i.test(text) || /40['']? ?ft/i.test(text);
    const candidates: Array<string | null | undefined> = [core.packing, core.productName, core.notes, core.shipmentPeriod.rawText];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }
      if (isContainer(trimmed)) {
        continue;
      }
      return trimmed;
    }
    return null;
  }

  /**
   * 입고 데이터 저장/업데이트
   */
  async updateTradeOrderInbound(orderId: string, dto: UpdateTradeOrderInboundDto, userId?: number) {
    // 주문 조회
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`주문을 찾을 수 없습니다: ${orderId}`);
    }

    // 상태는 필수 (PENDING 또는 CONFIRMED)
    const status = dto.status ?? 'PENDING';

    // 기존 입고 데이터 조회 (상태별로)
    let inbound = await this.tradeOrderInboundRepository.findOne({
      where: { 
        order: { id: orderId },
        status: status,
      },
    });

    const isNew = !inbound;
    if (!inbound) {
      // 없으면 생성
      inbound = this.tradeOrderInboundRepository.create({
        order,
        status: status,
      });
    }

    // 필드 업데이트
    if (dto.doCost !== undefined) {
      inbound.doCost = dto.doCost !== null ? dto.doCost.toString() : null;
    }
    if (dto.customsFee !== undefined) {
      inbound.customsFee = dto.customsFee !== null ? dto.customsFee.toString() : null;
    }
    if (dto.quarantineAgencyFee !== undefined) {
      inbound.quarantineAgencyFee = dto.quarantineAgencyFee !== null ? dto.quarantineAgencyFee.toString() : null;
    }
    if (dto.customsDuty !== undefined) {
      inbound.customsDuty = dto.customsDuty !== null ? dto.customsDuty.toString() : null;
    }
    if (dto.additionalItem !== undefined) {
      inbound.additionalItem = dto.additionalItem !== null ? dto.additionalItem.toString() : null;
    }
    if (dto.spot !== undefined) {
      inbound.spot = dto.spot !== null ? dto.spot.toString() : null;
    }
    if (dto.fumigationQuarantine !== undefined) {
      inbound.fumigationQuarantine = dto.fumigationQuarantine !== null ? dto.fumigationQuarantine.toString() : null;
    }
    if (dto.document !== undefined) {
      inbound.document = dto.document !== null ? dto.document.toString() : null;
    }
    if (dto.igobi !== undefined) {
      inbound.igobi = dto.igobi !== null ? dto.igobi.toString() : null;
    }
    if (dto.extractionFee !== undefined) {
      inbound.extractionFee = dto.extractionFee !== null ? dto.extractionFee.toString() : null;
    }
    if (dto.sto !== undefined) {
      inbound.sto = dto.sto !== null ? dto.sto.toString() : null;
    }
    if (dto.firstTierLoadingFee !== undefined) {
      inbound.firstTierLoadingFee = dto.firstTierLoadingFee !== null ? dto.firstTierLoadingFee.toString() : null;
    }
    if (dto.fee !== undefined) {
      inbound.fee = dto.fee !== null ? dto.fee.toString() : null;
    }
    if (dto.bankFee !== undefined) {
      inbound.bankFee = dto.bankFee !== null ? dto.bankFee.toString() : null;
    }
    if (dto.quarantineWorkCost !== undefined) {
      inbound.quarantineWorkCost = dto.quarantineWorkCost !== null ? dto.quarantineWorkCost.toString() : null;
    }
    if (dto.sampleCollection !== undefined) {
      inbound.sampleCollection = dto.sampleCollection !== null ? dto.sampleCollection.toString() : null;
    }
    if (dto.quotaCost !== undefined) {
      inbound.quotaCost = dto.quotaCost !== null ? dto.quotaCost.toString() : null;
    }
    if (dto.warehouse !== undefined) {
      inbound.warehouse = dto.warehouse?.trim() || null;
    }
    if (dto.igodate !== undefined) {
      inbound.igodate = dto.igodate ? this.parseFlexibleDate(dto.igodate) : null;
    }
    if (dto.quarantineDate !== undefined) {
      inbound.quarantineDate = dto.quarantineDate ? this.parseFlexibleDate(dto.quarantineDate) : null;
    }
    if (dto.dtDate !== undefined) {
      inbound.dtDate = dto.dtDate ? this.parseFlexibleDate(dto.dtDate) : null;
    }
    if (dto.dayExchangeRate !== undefined) {
      inbound.dayExchangeRate = dto.dayExchangeRate !== null ? dto.dayExchangeRate.toString() : null;
    }
    if (dto.comparisonExchangeRate !== undefined) {
      inbound.comparisonExchangeRate = dto.comparisonExchangeRate !== null ? dto.comparisonExchangeRate.toString() : null;
    }
    if (dto.comparisonPurchaseCost !== undefined) {
      inbound.comparisonPurchaseCost = dto.comparisonPurchaseCost !== null ? dto.comparisonPurchaseCost.toString() : null;
    }
    if (dto.appliedExchangeRate !== undefined) {
      inbound.appliedExchangeRate = dto.appliedExchangeRate !== null ? dto.appliedExchangeRate.toString() : null;
    }
    if (dto.purchaseCost !== undefined) {
      inbound.purchaseCost = dto.purchaseCost !== null ? dto.purchaseCost.toString() : null;
    }
    if (dto.targetMargin !== undefined) {
      inbound.targetMargin = dto.targetMargin !== null ? dto.targetMargin.toString() : null;
    }
    if (dto.status !== undefined) {
      inbound.status = dto.status ?? 'PENDING';
      
      // TradeOrder의 inboundStatus와 salesStatus 동기화 (입고/재고 목록 일치)
      // PENDING -> INBOUND_SCHEDULED (입고 예정)
      // CONFIRMED -> INBOUND_CONFIRMED (입고 확정)
      if (dto.status === 'PENDING') {
        order.inboundStatus = 'INBOUND_SCHEDULED';
        order.salesStatus = 'INBOUND_SCHEDULED';
      } else if (dto.status === 'CONFIRMED') {
        order.inboundStatus = 'INBOUND_CONFIRMED';
        order.salesStatus = 'INBOUND_CONFIRMED';
      }
      
      // TradeOrder 저장
      await this.tradeOrderRepository.save(order);
    }

    // 영업 비고 업데이트 (BL 단위)
    if (dto.salesNotes !== undefined) {
      order.salesNotes = dto.salesNotes?.trim() ? dto.salesNotes.trim() : null;
      await this.tradeOrderRepository.save(order);
    }

    // 저장 전에 엔티티를 명시적으로 업데이트
    const saved = await this.tradeOrderInboundRepository.save(inbound);

    // 입고 확정 저장/수정 시 최종원가 재계산 (주문에 최종 가중 환율이 이미 있으면)
    if (saved.status === 'CONFIRMED') {
      await this.recalculateFinalPurchaseCostForOrder(orderId);
    }

    // 컨테이너별 예정원가 업데이트
    if (dto.containerPendingPurchaseCosts && dto.containerPendingPurchaseCosts.length > 0) {
      for (const containerCost of dto.containerPendingPurchaseCosts) {
        const container = await this.tradeContainerRepository.findOne({
          where: { id: containerCost.containerId },
        });
        if (container) {
          container.pendingPurchaseCost = containerCost.pendingPurchaseCost !== null && containerCost.pendingPurchaseCost !== undefined
            ? containerCost.pendingPurchaseCost.toString()
            : null;
          await this.tradeContainerRepository.save(container);
        }
      }
    }

    // 컨테이너별 확정원가 업데이트
    if (dto.containerConfirmedPurchaseCosts && dto.containerConfirmedPurchaseCosts.length > 0) {
      for (const containerCost of dto.containerConfirmedPurchaseCosts) {
        const container = await this.tradeContainerRepository.findOne({
          where: { id: containerCost.containerId },
        });
        if (container) {
          container.confirmedPurchaseCost = containerCost.confirmedPurchaseCost !== null && containerCost.confirmedPurchaseCost !== undefined
            ? containerCost.confirmedPurchaseCost.toString()
            : null;
          if (containerCost.stoCost !== undefined) {
            container.stoCost = containerCost.stoCost !== null ? containerCost.stoCost.toString() : null;
          }
          if (containerCost.dtCost !== undefined) {
            container.dtCost = containerCost.dtCost !== null ? containerCost.dtCost.toString() : null;
          }
          if (containerCost.workFee !== undefined) {
            container.workFee = containerCost.workFee !== null ? containerCost.workFee.toString() : null;
          }
          if (containerCost.onsiteWorkFee !== undefined) {
            container.onsiteWorkFee =
              containerCost.onsiteWorkFee !== null ? containerCost.onsiteWorkFee.toString() : null;
          }
          await this.tradeContainerRepository.save(container);
        }
      }
    }
    
    // 저장 후 DB에서 다시 로드하여 반영된 값 반환
    const reloaded = await this.tradeOrderInboundRepository.findOne({
      where: { id: saved.id },
      relations: ['order', 'order.containers'],
    });

    // 기능 이력 로그 (무역 - 입고) - 확정원가 계산 검증용 totalWeight 등 포함
    const feature = saved.status === 'CONFIRMED' ? 'TRADE_INBOUND_CONFIRMED' : 'TRADE_INBOUND_PENDING';
    const orderWithContainers =
      reloaded?.order?.containers != null
        ? reloaded.order
        : await this.tradeOrderRepository.findOne({
            where: { id: orderId },
            relations: ['containers'],
          });
    const containers = orderWithContainers?.containers ?? [];
    const containerWeightSum = containers.reduce(
      (s: number, c: { weight?: string | number | null }) =>
        s + (c.weight != null ? Number(c.weight) : 0),
      0,
    );
    const totalWeightUsed =
      order.totalAmount != null && Number(order.totalAmount) > 0
        ? Number(order.totalAmount)
        : order.invoiceWeight != null && Number(order.invoiceWeight) > 0
          ? Number(order.invoiceWeight)
          : containerWeightSum;
    const auditPayload: Record<string, unknown> = {
      orderId,
      status: saved.status,
      totalWeight: totalWeightUsed,
      totalAmount: order.totalAmount != null ? Number(order.totalAmount) : null,
      invoiceWeight: order.invoiceWeight != null ? Number(order.invoiceWeight) : null,
      containerWeightSum,
      containerCount: containers.length,
    };
    if (saved.status === 'CONFIRMED' && dto.containerConfirmedPurchaseCosts?.length) {
      auditPayload.containerConfirmedCosts = dto.containerConfirmedPurchaseCosts.map((c) => ({
        containerId: c.containerId,
        confirmedPurchaseCost: c.confirmedPurchaseCost,
      }));
    }
    await this.featureAuditLogService.create({
      domain: 'TRADE',
      feature,
      action: isNew ? 'CREATED' : 'UPDATED',
      userId: userId ?? null,
      summary: `주문 ${orderId} 입고${saved.status === 'CONFIRMED' ? ' 확정' : ' 예정'} ${isNew ? '등록' : '수정'}`,
      entityType: 'trade_order_inbound',
      entityId: typeof saved.id === 'string' ? parseInt(saved.id, 10) : saved.id,
      payload: auditPayload,
    }).catch((err) => this.logger.warn('[기능이력] 입고 로그 저장 실패', err));

    return {
      success: true,
      message: '입고 데이터가 저장되었습니다.',
      inbound: reloaded ?? saved,
    };
  }

  /**
   * 컨테이너의 STO, DT 비용 업데이트
   */
  async updateContainer(containerId: string, dto: UpdateContainerDto, userId?: number): Promise<{ success: boolean; message: string }> {
    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
      relations: ['order'],
    });

    if (!container) {
      throw new NotFoundException(`컨테이너를 찾을 수 없습니다: ${containerId}`);
    }

    // STO, DT, 창고/현장 작업비 업데이트
    if (dto.stoCost !== undefined) {
      container.stoCost = dto.stoCost !== null ? dto.stoCost.toString() : null;
    }
    if (dto.dtCost !== undefined) {
      container.dtCost = dto.dtCost !== null ? dto.dtCost.toString() : null;
    }
    if (dto.workFee !== undefined) {
      container.workFee = dto.workFee !== null ? dto.workFee.toString() : null;
    }
    if (dto.onsiteWorkFee !== undefined) {
      container.onsiteWorkFee = dto.onsiteWorkFee !== null ? dto.onsiteWorkFee.toString() : null;
    }

    // 재고 목록 제외/제외 해제
    if (dto.excludeFromInventory !== undefined) {
      container.excludeFromInventory = dto.excludeFromInventory;
    }

    // 반납여부
    if (dto.returnStatus !== undefined) {
      container.returnStatus = dto.returnStatus;
    }

    // 컨테이너 비고
    if (dto.notes !== undefined) {
      container.notes = dto.notes?.trim() ? dto.notes.trim() : null;
    }

    await this.tradeContainerRepository.save(container);

    // STO, DT, 창고/현장 작업비 변경 시 확정원가 자동 재계산 (입고 확정 상태인 경우만)
    const costFieldsUpdated =
      dto.stoCost !== undefined ||
      dto.dtCost !== undefined ||
      dto.workFee !== undefined ||
      dto.onsiteWorkFee !== undefined;
    if (costFieldsUpdated && container.order) {
      const orderWithInbounds = await this.tradeOrderRepository.findOne({
        where: { id: container.order.id },
        relations: ['inbounds'],
      });
      const hasConfirmedInbound = orderWithInbounds?.inbounds?.some((i) => i.status === 'CONFIRMED');
      if (hasConfirmedInbound) {
        try {
          await this.recalculateContainerCost(containerId);
        } catch (err) {
          this.logger.warn(`[updateContainer] 확정원가 재계산 실패 (containerId=${containerId}):`, err);
        }
      }
    }

    // 기능 이력 로그 (무역 - 재고)
    const summaryParts: string[] = [];
    if (dto.excludeFromInventory !== undefined) summaryParts.push(dto.excludeFromInventory ? '재고 목록 제외' : '재고 목록 포함');
    if (dto.returnStatus !== undefined) summaryParts.push(`반납여부 ${dto.returnStatus}`);
    if (
      dto.stoCost !== undefined ||
      dto.dtCost !== undefined ||
      dto.workFee !== undefined ||
      dto.onsiteWorkFee !== undefined
    ) {
      summaryParts.push('비용 수정');
    }
    await this.featureAuditLogService.create({
      domain: 'TRADE',
      feature: 'TRADE_INVENTORY',
      action: 'UPDATED',
      userId: userId ?? null,
      summary: `컨테이너 ${container.containerNo ?? containerId} ${summaryParts.join(', ') || '수정'}`,
      entityType: 'trade_container',
      entityId: parseInt(containerId, 10) || undefined,
      payload: { containerId, ...dto },
    }).catch((err) => this.logger.warn('[기능이력] 재고(컨테이너) 로그 저장 실패', err));

    return {
      success: true,
      message: dto.excludeFromInventory !== undefined
        ? (dto.excludeFromInventory ? '재고 목록에서 제외되었습니다.' : '재고 목록에 다시 표시됩니다.')
        : dto.returnStatus !== undefined
          ? '반납여부가 저장되었습니다.'
          : 'STO, DT, 작업비가 저장되었습니다.',
    };
  }

  /**
   * 여러 컨테이너의 반납여부를 한 번에 변경
   */
  async batchUpdateContainerReturnStatus(
    containerIds: string[],
    returnStatus: 'NOT_RETURNED' | 'RETURNED' | 'LEASED' | 'LEASED_ENDED',
    userId?: number,
  ): Promise<{ success: boolean; updatedCount: number; message: string }> {
    if (!containerIds?.length) {
      return { success: true, updatedCount: 0, message: '변경할 컨테이너가 없습니다.' };
    }

    const containers = await this.tradeContainerRepository.find({
      where: containerIds.map((id) => ({ id })),
    });

    for (const container of containers) {
      container.returnStatus = returnStatus;
    }

    await this.tradeContainerRepository.save(containers);

    // 기능 이력 로그 (무역 - 재고 일괄)
    await this.featureAuditLogService.create({
      domain: 'TRADE',
      feature: 'TRADE_INVENTORY',
      action: 'UPDATED',
      userId: userId ?? null,
      summary: `컨테이너 ${containers.length}건 반납여부 일괄 변경 → ${returnStatus}`,
      payload: { containerIds, returnStatus, count: containers.length },
    }).catch((err) => this.logger.warn('[기능이력] 재고 일괄 로그 저장 실패', err));

    return {
      success: true,
      updatedCount: containers.length,
      message: `${containers.length}건의 반납여부가 변경되었습니다.`,
    };
  }

  /**
   * 컨테이너의 확정원가 재계산 (STO, DT 비용 반영)
   */
  async recalculateContainerCost(containerId: string): Promise<{ confirmedPurchaseCost: string }> {
    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
      relations: ['order', 'order.inbounds', 'order.containers'],
    });

    if (!container) {
      throw new NotFoundException(`컨테이너를 찾을 수 없습니다: ${containerId}`);
    }

    if (!container.order) {
      throw new BadRequestException('컨테이너에 연결된 주문 정보가 없습니다.');
    }

    // 입고 확정 데이터 조회
    const confirmedInbound = container.order.inbounds?.find((inbound) => inbound.status === 'CONFIRMED');
    if (!confirmedInbound) {
      throw new BadRequestException('입고 확정 데이터가 없습니다.');
    }

    // 적용 환율 (appliedExchangeRate 또는 dayExchangeRate + 10)
    const dayExchangeRate = confirmedInbound.dayExchangeRate ? Number(confirmedInbound.dayExchangeRate) : 0;
    const appliedExchangeRate = confirmedInbound.appliedExchangeRate
      ? Number(confirmedInbound.appliedExchangeRate)
      : dayExchangeRate > 0
        ? dayExchangeRate + 10
        : 0;

    // 단가
    const unitPrice = container.unitPrice ? Number(container.unitPrice) : 0;

    // 첫 번째 부분: (적용환율 * 단가) / 1000
    const firstPart = (appliedExchangeRate * unitPrice) / 1000;

    // 주문의 총 중량 (totalAmount 또는 invoiceWeight) - 전체 비용 계산용
    // totalAmount, invoiceWeight 둘 다 없으면 컨테이너 weight 합계 fallback (입고 확정 편집과 동일 로직)
    const containerWeightSum = (container.order.containers ?? []).reduce(
      (s: number, c: { weight?: string | number | null }) => s + (c.weight != null ? Number(c.weight) : 0),
      0,
    );
    const totalWeight =
      container.order.totalAmount && Number(container.order.totalAmount) > 0
        ? Number(container.order.totalAmount)
        : container.order.invoiceWeight && Number(container.order.invoiceWeight) > 0
          ? Number(container.order.invoiceWeight)
          : containerWeightSum;

    // 컨테이너의 중량
    const containerWeight = container.weight != null ? Number(container.weight) : 0;

    // 두 번째 부분: 모든 비용 합계 / 총량 / 1000 (STO, DT는 제외)
    const customsFee = confirmedInbound.customsFee ? Number(confirmedInbound.customsFee) : 0;
    const firstTierLoadingFee = confirmedInbound.firstTierLoadingFee ? Number(confirmedInbound.firstTierLoadingFee) : 0;
    const doCost = confirmedInbound.doCost ? Number(confirmedInbound.doCost) : 0;
    const quarantineAgencyFee = confirmedInbound.quarantineAgencyFee ? Number(confirmedInbound.quarantineAgencyFee) : 0;
    const customsDuty = confirmedInbound.customsDuty ? Number(confirmedInbound.customsDuty) : 0;
    const additionalItem = confirmedInbound.additionalItem ? Number(confirmedInbound.additionalItem) : 0;
    const bankFee = confirmedInbound.bankFee ? Number(confirmedInbound.bankFee) : 0;
    const quarantineWorkCost = confirmedInbound.quarantineWorkCost ? Number(confirmedInbound.quarantineWorkCost) : 0;
    const spot = confirmedInbound.spot ? Number(confirmedInbound.spot) : 0;
    const document = confirmedInbound.document ? Number(confirmedInbound.document) : 0;
    // 컨테이너 수량: DB 필드(quantity) 사용하지 않고 실제 컨테이너 개수 계산
    const qty = container.order.containers?.length ?? 0;
    const igobi = confirmedInbound.igobi ? Number(confirmedInbound.igobi) * qty : 0;
    const extractionFee = confirmedInbound.extractionFee ? Number(confirmedInbound.extractionFee) : 0;
    const fumigationQuarantine = confirmedInbound.fumigationQuarantine ? Number(confirmedInbound.fumigationQuarantine) : 0;
    const fee = confirmedInbound.fee ? Number(confirmedInbound.fee) : 0;
    const sampleCollection = confirmedInbound.sampleCollection ? Number(confirmedInbound.sampleCollection) : 0;

    // 모든 항목 합계 (쿼터 비용 제외, STO, DT 제외 - 컨테이너별로 별도 계산)
    const sum =
      customsFee +
      firstTierLoadingFee +
      doCost +
      quarantineAgencyFee +
      customsDuty +
      additionalItem +
      bankFee +
      quarantineWorkCost +
      spot +
      document +
      igobi +
      extractionFee +
      fumigationQuarantine +
      fee +
      sampleCollection;

    // 두 번째 부분: 전체 비용 합계 / 전체 중량 / 1000
    let secondPart = 0;
    if (totalWeight > 0) {
      secondPart = sum / totalWeight / 1000;
    }

    // 컨테이너별 STO, DT, 창고·현장 작업비 (kg당): (STO + DT + 창고작업비 + 현장작업비) / 컨테이너 중량 / 1000
    const containerStoCost = container.stoCost != null && container.stoCost !== '' 
      ? Number(container.stoCost) 
      : 0;
    const containerDtCost = container.dtCost != null && container.dtCost !== '' 
      ? Number(container.dtCost) 
      : 0;
    const containerWorkFee = container.workFee != null && container.workFee !== '' 
      ? Number(container.workFee) 
      : 0;
    const containerOnsiteWorkFee =
      container.onsiteWorkFee != null && container.onsiteWorkFee !== ''
        ? Number(container.onsiteWorkFee)
        : 0;
    
    let stoDtWorkCostPerKg = 0;
    if (containerWeight > 0) {
      stoDtWorkCostPerKg =
        (containerStoCost + containerDtCost + containerWorkFee + containerOnsiteWorkFee) / containerWeight / 1000;
    }

    // 쿼터 비용
    const quotaCost = confirmedInbound.quotaCost ? Number(confirmedInbound.quotaCost) : 0;

    // 확정원가 = 첫 번째 부분 + 두 번째 부분 + 쿼터 비용 + 컨테이너별 STO, DT, 창고·현장 작업비
    const confirmedPurchaseCost = firstPart + secondPart + quotaCost + stoDtWorkCostPerKg;

    // 컨테이너의 확정원가 업데이트
    container.confirmedPurchaseCost = confirmedPurchaseCost.toString();
    await this.tradeContainerRepository.save(container);

    return {
      confirmedPurchaseCost: confirmedPurchaseCost.toString(),
    };
  }

  /**
   * REGULAR 결제만으로 가중 평균 환율 계산 (원화합/외화합)
   */
  private computeFinalWeightedExchangeRateFromPayments(payments: TradeOrderPayment[]): number | null {
    const regular = (payments ?? []).filter(
      (p) => (p.paymentType?.trim() || 'REGULAR') === 'REGULAR' && p.amount != null && p.amount !== '' && Number(p.amount) > 0,
    );
    if (regular.length === 0) return null;
    let sumKrw = 0;
    let sumAmount = 0;
    for (const p of regular) {
      const amt = Number(p.amount);
      const krw = p.krwAmount != null && p.krwAmount !== '' ? Number(p.krwAmount) : amt * (p.exchangeRate ? Number(p.exchangeRate) : 0);
      if (Number.isFinite(amt) && amt > 0 && Number.isFinite(krw)) {
        sumAmount += amt;
        sumKrw += krw;
      }
    }
    if (sumAmount <= 0) return null;
    return sumKrw / sumAmount;
  }

  /**
   * 주문의 최종 가중 환율을 결제에서 계산해 주문에 저장
   */
  private async updateOrderFinalWeightedExchangeRate(orderId: string): Promise<void> {
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['payments'],
    });
    if (!order) return;
    const rate = this.computeFinalWeightedExchangeRateFromPayments(order.payments ?? []);
    order.finalWeightedExchangeRate = rate != null ? this.roundNumber(rate, 6).toString() : null;
    await this.tradeOrderRepository.save(order);
    this.logger.log(`[최종 가중 환율] orderId=${orderId}, rate=${rate ?? 'null'}`);
  }

  /**
   * 주문의 모든 컨테이너에 대해 최종원가 계산 (확정원가 + 환율 차이 반영)
   * 조건: 입고 확정 존재, 주문에 최종 가중 환율 있음
   */
  private async recalculateFinalPurchaseCostForOrder(orderId: string): Promise<void> {
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['containers', 'inbounds'],
    });
    if (!order?.containers?.length) return;
    const confirmedInbound = order.inbounds?.find((i) => i.status === 'CONFIRMED');
    if (!confirmedInbound) return;

    let finalRate: number | null = order.finalWeightedExchangeRate != null && order.finalWeightedExchangeRate !== ''
      ? Number(order.finalWeightedExchangeRate)
      : null;
    if (finalRate == null || !Number.isFinite(finalRate)) {
      const payments = await this.tradeOrderPaymentRepository.find({ where: { order: { id: orderId } } });
      finalRate = this.computeFinalWeightedExchangeRateFromPayments(payments);
    }
    if (finalRate == null || !Number.isFinite(finalRate)) return;

    const dayRate = confirmedInbound.dayExchangeRate ? Number(confirmedInbound.dayExchangeRate) : 0;
    const confirmedRate = confirmedInbound.appliedExchangeRate
      ? Number(confirmedInbound.appliedExchangeRate)
      : dayRate > 0 ? dayRate + 10 : 0;

    for (const container of order.containers) {
      const confirmedCost = container.confirmedPurchaseCost != null && container.confirmedPurchaseCost !== ''
        ? Number(container.confirmedPurchaseCost)
        : null;
      if (confirmedCost == null || !Number.isFinite(confirmedCost)) continue;
      const unitPrice = container.unitPrice != null && container.unitPrice !== '' ? Number(container.unitPrice) : 0;
      const delta = (unitPrice / 1000) * (finalRate - confirmedRate);
      const finalCost = confirmedCost + delta;
      container.finalPurchaseCost = this.roundNumber(finalCost, 6).toString();
      await this.tradeContainerRepository.save(container);
    }
    this.logger.log(`[최종원가 반영] orderId=${orderId}, containers=${order.containers.length}`);
  }

  /**
   * 주문의 최종 가중 환율 및 컨테이너 최종원가 초기화 (결제 전부 삭제 시)
   */
  private async clearFinalPurchaseCostForOrder(orderId: string): Promise<void> {
    const order = await this.tradeOrderRepository.findOne({
      where: { id: orderId },
      relations: ['containers'],
    });
    if (!order) return;
    order.finalWeightedExchangeRate = null;
    await this.tradeOrderRepository.save(order);
    for (const c of order.containers ?? []) {
      c.finalPurchaseCost = null;
      await this.tradeContainerRepository.save(c);
    }
    this.logger.log(`[최종원가 초기화] orderId=${orderId}`);
  }

  /**
   * 컨테이너 상세 정보 및 판매 이력 조회
   */
  async getContainer(containerId: string) {
    this.logger.log(`[입고 확정 재고 상세 조회 시작] 컨테이너 ID: ${containerId}`);

    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
      relations: [
        'order',
        'order.contract',
        'order.inbounds',
        'order.managerUser',
      ],
    });

    if (!container) {
      this.logger.warn(`[입고 확정 재고 상세 조회] 컨테이너를 찾을 수 없음: ${containerId}`);
      throw new NotFoundException('컨테이너를 찾을 수 없습니다.');
    }

    this.logger.log(
      `[입고 확정 재고 상세 조회] 컨테이너 조회 완료: ${container.containerNo || containerId}, 전체중량(co_weight): ${container.weight ?? 'null'} (DB 저장 단위: 톤)`,
    );

    // 판매 이력 조회
    this.logger.log(`[입고 확정 재고 상세 조회] 판매 이력 조회 시작 - 컨테이너 ID: ${containerId} (타입: ${typeof containerId})`);
    
    // containerId를 숫자로 변환 시도 (문자열일 수 있음)
    const containerIdNum = typeof containerId === 'string' ? parseInt(containerId, 10) : containerId;
    this.logger.log(`[입고 확정 재고 상세 조회] 컨테이너 ID 변환: ${containerId} -> ${containerIdNum} (타입: ${typeof containerIdNum})`);
    
    // 먼저 전체 판매 항목 조회 (디버깅용)
    const allSalesItemsDebug = await this.salesItemRepository.find({
      where: { containerId: containerIdNum.toString() },
      relations: ['sales'],
    });
    this.logger.log(
      `[입고 확정 재고 상세 조회] 전체 판매 항목 (디버깅) - 컨테이너 ID: ${containerIdNum}, 총 개수: ${allSalesItemsDebug.length}\n${allSalesItemsDebug.map((item, index) => 
        `  ${index + 1}. ID: ${item.id}, 상태: ${item.status}, 컨테이너ID: ${item.containerId} (타입: ${typeof item.containerId})`
      ).join('\n')}`,
    );
    
    const salesItems = await this.salesItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.sales', 'sales')
      .leftJoinAndSelect('sales.customer', 'customer')
      .leftJoinAndSelect('sales.registeredByUser', 'registeredByUser')
      .where('item.containerId = :containerId', { containerId: containerIdNum.toString() })
      .andWhere('item.status != :cancelledStatus', { cancelledStatus: 'SALES_ITEM_CANCELLED' })
      .orderBy('COALESCE(sales.createdAt, item.createdAt)', 'DESC') // sales.createdAt이 null이면 item.createdAt 사용
      .addOrderBy('item.createdAt', 'DESC') // item.createdAt을 보조 정렬
      .getMany();

    // 디버깅: 조회된 판매 항목 수와 상태 로그
    this.logger.log(
      `[입고 확정 재고 상세 조회] 판매 이력 조회 완료 - 컨테이너 ID: ${containerId}, 판매 항목 수: ${salesItems.length}`,
    );
    
    if (salesItems.length > 0) {
      this.logger.log(
        `[입고 확정 재고 상세 조회] 판매 항목 상세:\n${salesItems.map((item, index) => 
          `  ${index + 1}. ID: ${item.id}, 상태: ${item.status}, 고객ID: ${item.sales?.customerId ?? 'null'}, 베일: ${item.cargoBales ?? 'null'}, 중량: ${item.cargoWeight ?? 'null'}, 생성일: ${item.createdAt?.toISOString() ?? 'null'}`
        ).join('\n')}`,
      );
    } else {
      this.logger.warn(`[입고 확정 재고 상세 조회] 판매 이력이 없음 - 컨테이너 ID: ${containerId}`);
      
      // 전체 판매 항목 조회 (취소 포함) - 디버깅용
      const allSalesItems = await this.salesItemRepository.find({
        where: { containerId },
        relations: ['sales', 'sales.customer'],
      });
      this.logger.log(
        `[입고 확정 재고 상세 조회] 전체 판매 항목 (취소 포함): ${allSalesItems.length}개\n${allSalesItems.map((item, index) => 
          `  ${index + 1}. ID: ${item.id}, 상태: ${item.status}, 고객ID: ${item.sales?.customerId ?? 'null'}`
        ).join('\n')}`,
      );
    }

    // 코드 정보 조회
    const codeCategories = [
      'EXPORT_COUNTRY',
      'PRODUCT',
      'PACKING_TYPE',
      'DESTINATION_PORT',
      'EXPORTER',
      'SHIPPING_LINE',
      'TRADE_GRADE',
      'SALES_GRADE',
      'WAREHOUSE',
      'SALES_ITEM_STATUS',
      'CONTAINER_RETURN_STATUS',
    ];

    const codes = await this.codeRepository.find({
      where: {
        group: In(codeCategories),
      },
    });

    const codeMap = new Map<string, Map<string, string>>();
    codeCategories.forEach((category) => {
      codeMap.set(category, new Map());
    });

    codes.forEach((code) => {
      const category = code.group;
      const key = (code.value ?? code.name ?? '').trim().toUpperCase();
      const label = (code.name ?? code.value ?? '').trim();
      if (category && key) {
        const categoryMap = codeMap.get(category);
        if (categoryMap) {
          categoryMap.set(key, label || key);
        }
      }
    });

    const getCodeName = (category: string, value?: string | null) => {
      if (!value) return null;
      const map = codeMap.get(category);
      if (!map) return null;
      return map.get(value.trim().toUpperCase()) ?? null;
    };

    const order = container.order;
    const contract = order?.contract;
    const latestInbound = order?.inbounds && order.inbounds.length > 0
      ? [...order.inbounds].sort((a, b) => {
          const aDate = a.createdAt?.getTime() || 0;
          const bDate = b.createdAt?.getTime() || 0;
          return bDate - aDate;
        })[0]
      : null;
    const confirmedInbound = order?.inbounds?.find((i) => i.status === 'CONFIRMED');
    const appliedExchangeRate = confirmedInbound?.appliedExchangeRate != null && confirmedInbound.appliedExchangeRate !== ''
      ? Number(confirmedInbound.appliedExchangeRate)
      : latestInbound?.appliedExchangeRate != null && latestInbound.appliedExchangeRate !== ''
        ? Number(latestInbound.appliedExchangeRate)
        : null;
    const finalWeightedExchangeRate = order?.finalWeightedExchangeRate != null && order.finalWeightedExchangeRate !== ''
      ? Number(order.finalWeightedExchangeRate)
      : null;
    const dayExchangeRate = confirmedInbound?.dayExchangeRate != null && confirmedInbound.dayExchangeRate !== ''
      ? Number(confirmedInbound.dayExchangeRate)
      : latestInbound?.dayExchangeRate != null && latestInbound.dayExchangeRate !== ''
        ? Number(latestInbound.dayExchangeRate)
        : null;

    // 판매 이력 데이터 변환
    const salesHistory = salesItems.map((item) => {
      const sales = item.sales;
      const customer = sales?.customer;
      
      // 판매 수량 계산 (재고 입고는 음수로 저장되어 있음)
      let soldBales = 0;
      let soldWeight = 0;
      
      if (item.containerType === 'CONTAINER') {
        const q = resolveContainerTypeSalesItemCargoQuantities(container, item);
        soldBales = q.bales;
        soldWeight = q.weight;
      } else {
        soldBales = item.cargoBales ? Number(item.cargoBales) : 0;
        soldWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
      }
      
      // 재고 입고는 음수로 저장·반환 (합계 시 차감). 재고 소모는 양수.

      // 재고 입고/소모 구분
      const isInventoryAdjustment = item.status === 'INVENTORY_INBOUND' || item.status === 'INVENTORY_CONSUMPTION' || (item.status === 'SALES_ITEM_COMPLETED' && customer === null);
      const displayCustomerName = isInventoryAdjustment 
        ? (item.status === 'INVENTORY_INBOUND' ? '재고 입고' : item.status === 'INVENTORY_CONSUMPTION' ? '재고 소모' : '재고 소모')
        : (customer?.companyName ?? customer?.ceo ?? '-');
      const displayStatusName = item.status === 'INVENTORY_INBOUND' 
        ? '재고 입고'
        : item.status === 'INVENTORY_CONSUMPTION'
        ? '재고 소모'
        : (getCodeName('SALES_ITEM_STATUS', item.status) ?? item.status ?? null);

      const salesUnitPriceNum = item.salesUnitPrice ? Number(item.salesUnitPrice) : null;
      const purchaseCost = container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : null;
      const margin =
        salesUnitPriceNum != null && purchaseCost != null ? salesUnitPriceNum - purchaseCost : null;

      return {
        id: item.id,
        salesId: sales?.id ?? null,
        salesNumber: sales?.id ?? null,
        customerId: customer?.id ?? null,
        customerName: displayCustomerName,
        status: item.status ?? null,
        statusName: displayStatusName,
        containerType: item.containerType ?? null,
        cargoBales: soldBales,
        cargoWeight: soldWeight,
        salesUnitPriceStage: item.salesUnitPriceStage ?? null,
        salesUnitPrice: salesUnitPriceNum,
        margin,
        stoCost: container.stoCost ? Number(container.stoCost) : null,
        dtCost: container.dtCost ? Number(container.dtCost) : null,
        workFee: container.workFee ? Number(container.workFee) : null,
        onsiteWorkFee: container.onsiteWorkFee ? Number(container.onsiteWorkFee) : null,
        reservationDate: sales?.reservationDate ? this.formatDate(sales.reservationDate) : null,
        salesDate: sales?.salesDate ? this.formatDate(sales.salesDate) : null,
        createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        registeredBy: sales?.registeredBy ?? null,
        registeredByName: sales?.registeredByUser?.name ?? null,
        notes: item.reservationNotes ?? null, // 비고 추가
      };
    });

    const result = {
      container: {
        id: container.id,
        containerNo: container.containerNo,
        tradeBales: container.tradeBales ? Number(container.tradeBales) : null,
        salesBales: container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : null),
        bales: this.getEffectiveSalesBales(container) || null, // 영업 기준(표시용)
        weight: container.weight ? Number(container.weight) : null,
        appliedExchangeRate,
        finalWeightedExchangeRate,
        dayExchangeRate,
        product: container.product ?? null,
        productName: getCodeName('PRODUCT', container.product ?? contract?.productName) ?? container.product ?? contract?.productName ?? null,
        tradeGrade: container.tradeGrade ?? order?.grade ?? null,
        tradeGradeName: getCodeName('TRADE_GRADE', container.tradeGrade ?? order?.grade) ?? container.tradeGrade ?? order?.grade ?? null,
        salesGrade: container.salesGrade ?? null,
        salesGradeName: getCodeName('SALES_GRADE', container.salesGrade) ?? container.salesGrade ?? null,
        packingType: container.packingType ?? contract?.packingType ?? null,
        packingTypeName: getCodeName('PACKING_TYPE', container.packingType ?? contract?.packingType) ?? container.packingType ?? contract?.packingType ?? null,
        pendingPurchaseCost: container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : null,
        confirmedPurchaseCost: container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : null,
        finalPurchaseCost: container.finalPurchaseCost ? Number(container.finalPurchaseCost) : null,
        stoCost: container.stoCost ?? null,
        dtCost: container.dtCost ?? null,
        workFee: container.workFee ?? null,
        onsiteWorkFee: container.onsiteWorkFee ?? null,
        inventoryStatus: container.inventoryStatus ?? null,
        orderId: order?.id ?? null,
        contractNo: contract?.contractNo ?? null,
        sequence: container.sequence ?? null,
        bk: order?.bk ?? null,
        bl: order?.bl ?? null,
        etaDate: order?.etaDate ? this.formatDate(order.etaDate) : null,
        exportCountry: contract?.exportCountry ?? null,
        exportCountryName: getCodeName('EXPORT_COUNTRY', contract?.exportCountry) ?? contract?.exportCountry ?? null,
        exporter: contract?.exporter ?? null,
        exporterName: getCodeName('EXPORTER', contract?.exporter) ?? contract?.exporter ?? null,
        shippingLine: order?.shippingLine ?? null,
        shippingLineName: getCodeName('SHIPPING_LINE', order?.shippingLine) ?? order?.shippingLine ?? null,
        destination: contract?.destination ?? null,
        destinationName: getCodeName('DESTINATION_PORT', contract?.destination) ?? contract?.destination ?? null,
        inboundWarehouse: latestInbound?.warehouse ?? null,
        inboundWarehouseName: getCodeName('WAREHOUSE', latestInbound?.warehouse) ?? latestInbound?.warehouse ?? null,
        inboundIgodate: latestInbound?.igodate ? this.formatDate(latestInbound.igodate) : null,
        inboundQuarantineDate: latestInbound?.quarantineDate ? this.formatDate(latestInbound.quarantineDate) : null,
        inboundDtDate: latestInbound?.dtDate ? this.formatDate(latestInbound.dtDate) : null,
        returnStatus: container.returnStatus ?? 'NOT_RETURNED',
        returnStatusName: getCodeName('CONTAINER_RETURN_STATUS', container.returnStatus ?? 'NOT_RETURNED') ?? (container.returnStatus ?? 'NOT_RETURNED'),
        notes: container.notes ?? null,
        /** BL(주문) 영업 비고 - 컨테이너 비고 없을 때 fallback 표시용 */
        orderSalesNotes: order?.salesNotes ?? null,
      },
      salesHistory,
    };

    this.logger.log(
      `[입고 확정 재고 상세 조회 완료] 컨테이너 ID: ${containerId}, 판매 이력 수: ${salesHistory.length}, 반환 데이터 준비 완료`,
    );

    return result;
  }

  /**
   * 재고 입고/소모 조정
   */
  async adjustContainerInventory(
    containerId: string,
    dto: { type: 'INBOUND' | 'CONSUMPTION'; bales?: number | null; weight?: number | null; salesUnitPrice?: number | null; stoCost?: number | null; dtCost?: number | null; notes?: string | null },
    userId?: number,
  ) {
    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
      relations: ['order'],
    });

    if (!container) {
      throw new NotFoundException('컨테이너를 찾을 수 없습니다.');
    }

    if (dto.type === 'INBOUND') {
      // 재고 입고: 전체 수량은 변경하지 않고, 가용 수량만 증가
      // 판매 수량을 음수로 처리하여 가용 수량 계산 시 차감되도록 함
      const SalesEntity = (await import('../sales/entities/sales.entity')).Sales;
      const salesRepository = this.dataSource.getRepository(SalesEntity);
      
      // 가상 판매 생성 (고객 없음, 재고 입고 표시용)
      const virtualSales = salesRepository.create({
        customerId: null,
        reservationDate: new Date(),
        salesDate: new Date(),
        registeredBy: userId || null,
      });
      const savedSales = await salesRepository.save(virtualSales);

      // 판매 항목 생성 (재고 입고는 음수로 저장하여 가용 수량 계산 시 차감)
      const salesItem = this.salesItemRepository.create({
        salesId: savedSales.id,
        containerId: container.id,
        containerType: 'CONTAINER',
        cargoBales: dto.bales != null ? (-dto.bales).toString() : null, // 음수로 저장
        cargoWeight: dto.weight != null ? (-dto.weight).toString() : null, // 음수로 저장
        salesUnitPrice: null,
        stoCost: null,
        dtCost: null,
        status: 'INVENTORY_INBOUND', // 재고 입고 전용 상태
        reservationNotes: dto.notes || null, // 비고 저장
      });
      await this.salesItemRepository.save(salesItem);

      // 재고 상태 재계산 (판매 수량에 음수가 추가되어 가용 수량 증가)
      await this.updateContainerInventoryStatusAfterSalesChange(container.id);

      await this.featureAuditLogService.create({
        domain: 'TRADE',
        feature: 'TRADE_INVENTORY',
        action: 'CREATED',
        userId: userId ?? null,
        summary: `컨테이너 ${container.containerNo ?? containerId} 재고 입고 (베일 ${dto.bales ?? '-'} / 중량 ${dto.weight ?? '-'})`,
        entityType: 'trade_container',
        entityId: parseInt(container.id, 10) || undefined,
        payload: { containerId, type: 'INBOUND', bales: dto.bales, weight: dto.weight },
      }).catch((err) => this.logger.warn('[기능이력] 재고 입고 로그 저장 실패', err));

      return {
        success: true,
        message: '재고 입고가 완료되었습니다.',
        container: {
          id: container.id,
          tradeBales: container.tradeBales ? Number(container.tradeBales) : null,
          salesBales: container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : null,
          bales: this.getEffectiveSalesBales(container) || null, // 영업 기준(표시용)
          weight: container.weight ? Number(container.weight) : null, // 전체 수량은 변경하지 않음
        },
        salesItem: {
          id: salesItem.id,
          salesId: savedSales.id,
        },
      };
    } else if (dto.type === 'CONSUMPTION') {
      // 재고 소모: 전체 수량은 변경하지 않고, 가용 수량만 감소
      // 판매 수량을 양수로 처리하여 가용 수량 계산 시 차감
      try {
        const SalesEntity = (await import('../sales/entities/sales.entity')).Sales;
        const salesRepository = this.dataSource.getRepository(SalesEntity);
        
        // 가상 판매 생성 (고객 없음, 재고 소모 표시용)
        const virtualSales = salesRepository.create({
          customerId: null,
          reservationDate: new Date(),
          salesDate: new Date(),
          registeredBy: userId || null,
        });
        const savedSales = await salesRepository.save(virtualSales);

        // 판매 항목 생성 (재고 소모는 양수로 저장하여 가용 수량 계산 시 차감)
        const salesItem = this.salesItemRepository.create({
          salesId: savedSales.id,
          containerId: container.id,
          containerType: 'CONTAINER',
          cargoBales: dto.bales != null ? dto.bales.toString() : null, // 양수로 저장
          cargoWeight: dto.weight != null ? dto.weight.toString() : null, // 양수로 저장 (톤 단위)
          salesUnitPrice: null,
          stoCost: null,
          dtCost: null,
          status: 'INVENTORY_CONSUMPTION', // 재고 소모 전용 상태
          reservationNotes: dto.notes || null, // 비고 저장
        });
        await this.salesItemRepository.save(salesItem);

        // 재고 상태 재계산 (판매 수량에 양수가 추가되어 가용 수량 감소)
        await this.updateContainerInventoryStatusAfterSalesChange(container.id);

        await this.featureAuditLogService.create({
          domain: 'TRADE',
          feature: 'TRADE_INVENTORY',
          action: 'CREATED',
          userId: userId ?? null,
          summary: `컨테이너 ${container.containerNo ?? containerId} 재고 소모 (베일 ${dto.bales ?? '-'} / 중량 ${dto.weight ?? '-'})`,
          entityType: 'trade_container',
          entityId: parseInt(container.id, 10) || undefined,
          payload: { containerId, type: 'CONSUMPTION', bales: dto.bales, weight: dto.weight },
        }).catch((err) => this.logger.warn('[기능이력] 재고 소모 로그 저장 실패', err));

        return {
          success: true,
          message: '재고 소모가 완료되었습니다.',
          container: {
            id: container.id,
            tradeBales: container.tradeBales ? Number(container.tradeBales) : null,
          salesBales: container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : null,
          bales: this.getEffectiveSalesBales(container) || null, // 영업 기준(표시용)
            weight: container.weight ? Number(container.weight) : null, // 전체 수량은 변경하지 않음
          },
          salesItem: {
            id: salesItem.id,
            salesId: savedSales.id,
          },
        };
      } catch (error) {
        this.logger.error(`[재고 소모 오류] 컨테이너 ID: ${containerId}, 오류: ${error.message}`, error.stack);
        throw new BadRequestException(`재고 소모 중 오류가 발생했습니다: ${error.message}`);
      }
    }

    throw new BadRequestException('잘못된 조정 타입입니다.');
  }

  /**
   * 판매 이력 변경 후 재고 상태 업데이트
   */
  private async updateContainerInventoryStatusAfterSalesChange(containerId: string): Promise<void> {
    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
    });

    if (!container) {
      return;
    }

    // 컨테이너의 모든 판매 항목 조회 (취소 제외)
    const salesItems = await this.salesItemRepository.find({
      where: { containerId },
    });

    // 판매 수량 계산
    let soldBales = 0;
    let soldWeight = 0;
    let hasReservedOnly = true;
    let hasCompleted = false;
    let hasInProgress = false; // SALES_ITEM_SOLD(판매) 등 미하차 항목이 있는지

    salesItems.forEach((item) => {
      // 취소된 판매는 제외
      if (item.status === 'SALES_ITEM_CANCELLED') {
        return;
      }

      // 재고 입고/소모는 판매 수량 계산에 포함 (음수/양수로 처리)
      // 재고 입고는 음수로 저장되어 판매 수량에서 차감됨 (가용 수량 증가)
      // 재고 소모는 양수로 저장되어 판매 수량에 추가됨 (가용 수량 감소)

      // 판매예약이 아닌 항목이 있으면 hasReservedOnly = false
      // 재고 입고/소모는 판매예약이 아니므로 hasReservedOnly = false
      if (item.status !== 'SALES_ITEM_RESERVED') {
        hasReservedOnly = false;
      }

      // 판매완료가 있으면 hasCompleted = true
      // 재고 소모는 판매완료 상태이므로 hasCompleted = true
      if (item.status === 'SALES_ITEM_COMPLETED' || item.status === 'INVENTORY_CONSUMPTION') {
        hasCompleted = true;
      }

      // SALES_ITEM_SOLD(판매) = 하차 전 → 아직 판매 완료 아님
      if (item.status === 'SALES_ITEM_SOLD' || item.status === 'SALES_ITEM_RESERVED') {
        hasInProgress = true;
      }

      if (item.containerType === 'CONTAINER') {
        const q = resolveContainerTypeSalesItemCargoQuantities(container, item);
        soldBales += q.bales;
        soldWeight += q.weight;
      } else {
        const cargoBales = item.cargoBales ? Number(item.cargoBales) : 0;
        const cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
        soldBales += cargoBales;
        soldWeight += cargoWeight;
      }
    });

    // 가용 수량 계산 (영업 베일 기준)
    // 재고 입고/소모로 인해 가용 수량이 마이너스가 되거나 전체 수량보다 커질 수 있음
    const originalBales = this.getEffectiveSalesBales(container);
    const originalWeight = container.weight ? Number(container.weight) : 0;
    const availableBales = originalBales - soldBales; // Math.max 제거: 마이너스 허용
    const availableWeight = originalWeight - soldWeight; // Math.max 제거: 마이너스 허용

    // 부동소수점 오차 및 톤/kg 혼용 시 소수점 오차 허용 (0.001 톤 = 1kg)
    const EPSILON = 0.001;
    const isBalesZeroOrNegative = availableBales <= EPSILON;
    const isWeightZeroOrNegative = availableWeight <= EPSILON;

    this.logger.log(
      `[재고 상태 업데이트] 컨테이너 ID: ${containerId}, 원본: 베일=${originalBales}, 중량=${originalWeight}(톤), ` +
        `판매합계: 베일=${soldBales}, 중량=${soldWeight}, 가용: 베일=${availableBales}, 중량=${availableWeight}, ` +
        `isBalesZeroOrNegative=${isBalesZeroOrNegative}, isWeightZeroOrNegative=${isWeightZeroOrNegative}`,
    );

    // 재고 상태 결정
    let inventoryStatus: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null = null;

    // 모두 판매됨 판단: 가용 0 이하 = 다 나감 (음수·과다 판매 포함, epsilon으로 부동소수점 처리)
    const hasOriginalBales = originalBales > 0;
    const hasOriginalWeight = originalWeight > 0;
    const isSoldOut =
      (hasOriginalBales && isBalesZeroOrNegative && (!hasOriginalWeight || isWeightZeroOrNegative)) ||
      (hasOriginalWeight && isWeightZeroOrNegative && (!hasOriginalBales || isBalesZeroOrNegative)) ||
      (hasOriginalBales && hasOriginalWeight && isBalesZeroOrNegative && isWeightZeroOrNegative);

    if (soldBales > 0 || soldWeight > 0) {
      // 판매가 있음
      if (hasReservedOnly && salesItems.length > 0) {
        // 판매예약만 있음
        if (isSoldOut) {
          inventoryStatus = 'RESERVED';
        } else {
          inventoryStatus = 'PARTIALLY_RESERVED';
        }
      } else if (isSoldOut) {
        // 판매(확정)가 있고 모두 판매됨
        // SALES_ITEM_SOLD(판매)가 남아 있으면 하차 전 → 판매중. 모두 COMPLETED/재고소모여야 판매 완료
        if (hasCompleted && !hasInProgress) {
          inventoryStatus = 'SOLD_OUT';
        } else {
          inventoryStatus = 'SELLING';
        }
      } else {
        // 부분 판매
        if (hasCompleted) {
          inventoryStatus = 'PARTIALLY_SOLD_COMPLETED';
        } else {
          inventoryStatus = 'PARTIALLY_SOLD';
        }
      }
    } else {
      // 판매 없음
      inventoryStatus = 'AVAILABLE';
    }

    // 재고 상태 업데이트
    await this.tradeContainerRepository.update(containerId, { inventoryStatus });

    this.logger.debug(
      `[재고 상태 업데이트] 컨테이너 ID: ${containerId}, 판매수량: ${soldBales}/${soldWeight}, 가용수량: ${availableBales}/${availableWeight}, 상태: ${inventoryStatus}`,
    );
  }
  /**
   * 판매예약 시트 BL — 상품·영업등급(선택)만 조회, 입고상태·ETA·가용·등급 필터는 서버에서 반영한 목록 1회 반환.
   */
  async listSheetBlDropdownOptions(
    rawProductCode: string,
    rawSalesGrade?: string,
  ): Promise<SheetBlOptionRow[]> {
    const productCode = (rawProductCode ?? '').trim();
    if (!productCode) {
      return [];
    }
    const orders = await this.loadBookingOrdersForSheetBlOneProduct(productCode);
    if (orders.length === 0) {
      return [];
    }
    const byProduct = buildBlOptionsByProductCodeFromOrders(orders);
    let rows = byProduct[productCode] ?? [];
    const g = (rawSalesGrade ?? '').trim();
    if (g) {
      rows = filterSheetBlOptionsBySalesGrade(rows, g);
    }
    return rows;
  }

  private async loadBookingOrdersForSheetBlOneProduct(productCode: string): Promise<any[]> {
    const filteredOrders = await this.tradeOrderRepository
      .createQueryBuilder('order')
      .innerJoinAndSelect('order.contract', 'contract')
      .leftJoinAndSelect('contract.createdBy', 'contractCreatedBy')
      .leftJoinAndSelect('order.managerUser', 'managerUser')
      .leftJoinAndSelect('order.containers', 'containers')
      .leftJoinAndSelect('order.payments', 'payments')
      .leftJoinAndSelect('order.bookingTempPayments', 'bookingTempPayments')
      .leftJoinAndSelect('order.inbounds', 'inbounds')
      .where('order.to_deleted_at IS NULL')
      .andWhere('contract.tc_deleted_at IS NULL')
      .andWhere('TRIM(contract.tc_product_name) = :productCode', { productCode })
      .andWhere(
        "(NULLIF(TRIM(order.to_bk), '') IS NOT NULL OR NULLIF(TRIM(order.to_bl), '') IS NOT NULL)",
      )
      .andWhere(
        '(order.to_sales_status IS NULL OR order.to_sales_status IN (:...inboundSt))',
        {
          inboundSt: ['INBOUND_PENDING', 'INBOUND_SCHEDULED', 'INBOUND_CONFIRMED'],
        },
      )
      .orderBy('contract.tc_contract_no', 'ASC')
      .addOrderBy('order.to_sequence', 'ASC')
      .addOrderBy('order.to_sequence_sub', 'ASC')
      .addOrderBy('order.to_created_at', 'DESC')
      .getMany();

    if (filteredOrders.length === 0) {
      return [];
    }

    return this.finalizeBookingOrderListForApi(filteredOrders, {
      includeOrdersWithAllContainersExcluded: false,
      skipSalesStatusRowFilter: true,
      inboundStatusesMerged: true,
      finalizeListLogTag: 'sheetBlDropdown',
    });
  }

  private async finalizeBookingOrderListForApi(
    filteredOrders: TradeOrder[],
    opts: {
      salesStatus?: string;
      includeOrdersWithAllContainersExcluded: boolean;
      skipSalesStatusRowFilter?: boolean;
      inboundStatusesMerged?: boolean;
      /** 기본 listTradeOrders — 시트 BL 옵션 경로는 sheetBlDropdown */
      finalizeListLogTag?: 'listTradeOrders' | 'sheetBlDropdown';
    },
  ): Promise<any[]> {
    const salesStatus = opts.salesStatus;
    const includeOrdersWithAllContainersExcluded = opts.includeOrdersWithAllContainersExcluded;
    const skipSalesStatusRowFilter = opts.skipSalesStatusRowFilter === true;
    const inboundStatusesMerged = opts.inboundStatusesMerged === true;

    // 코드 정보 조회
    const codeCategories = [
      'EXPORT_COUNTRY',
      'PRODUCT',
      'PACKING_TYPE',
      'CURRENCY',
      'DESTINATION_PORT',
      'EXPORTER',
      'PAYMENT_TERMS',
      'SHIPPING_LINE',
      'TRADE_GRADE',
      'TRADE_ORDER_STATUS',
    ];

    const codes = await this.codeRepository.find({
      where: {
        group: In(codeCategories),
      },
    });

    const codeMap = new Map<string, Map<string, string>>();
    const normalizeKey = (value: string) => value.trim().toUpperCase();

    codes.forEach((code) => {
      if (!code.value) {
        return;
      }
      if (!codeMap.has(code.group)) {
        codeMap.set(code.group, new Map());
      }
      codeMap.get(code.group)!.set(normalizeKey(code.value), code.name);
    });

    const getCodeName = (category: string, value?: string | null) => {
      if (!value) {
        return null;
      }
      const map = codeMap.get(category);
      if (!map) {
        return null;
      }
      return map.get(normalizeKey(value)) ?? null;
    };

    const getCurrencyDisplay = (value?: string | null, fallback?: string | null) => {
      if (value && value.trim()) {
        return value.trim();
      }
      if (fallback && fallback.trim()) {
        const mapped = getCodeName('CURRENCY', fallback);
        return mapped ?? fallback.trim();
      }
      return null;
    };

    // 주문 목록에 포함된 모든 컨테이너 ID 수집 → 판매 수량 집계 (통관 전 재고 컨 상당 계산용)
    const orderListContainerIds = filteredOrders.flatMap((o) => (o.containers || []).map((c) => c.id));
    const reservedQuantitiesOrderList = new Map<string | number, { bales: number; weight: number }>();
    const completedQuantitiesOrderList = new Map<string | number, { bales: number; weight: number }>();
    const availableStockDeductOrderList = new Map<string | number, { bales: number; weight: number }>();
    if (orderListContainerIds.length > 0) {
      const salesItemsOrderList = await this.salesItemRepository
        .createQueryBuilder('item')
        .leftJoinAndSelect('item.container', 'container')
        .where('item.containerId IN (:...orderListContainerIds)', { orderListContainerIds })
        .andWhere('item.containerId IS NOT NULL')
        .getMany();
      const isReservedStatus = (s: string) =>
        s === 'SALES_ITEM_RESERVED' || s === 'SALES_ITEM_SOLD';
      const isCompletedStatus = (s: string) =>
        s === 'SALES_ITEM_COMPLETED' || s === 'INVENTORY_CONSUMPTION';
      salesItemsOrderList.forEach((item) => {
        if (item.status === 'SALES_ITEM_CANCELLED') return;
        const containerId = item.containerId;
        const currentReserved = reservedQuantitiesOrderList.get(containerId) || { bales: 0, weight: 0 };
        const currentCompleted = completedQuantitiesOrderList.get(containerId) || { bales: 0, weight: 0 };
        let cargoBales = 0;
        let cargoWeight = 0;
        if (item.containerType === 'CONTAINER') {
          const container = item.container;
          if (container) {
            const q = resolveContainerTypeSalesItemCargoQuantities(container, item);
            cargoBales = q.bales;
            cargoWeight = q.weight;
          }
        } else {
          cargoBales = item.cargoBales ? Number(item.cargoBales) : 0;
          cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
        }
        if (isReservedStatus(item.status ?? '')) {
          currentReserved.bales += cargoBales;
          currentReserved.weight += cargoWeight;
        } else if (isCompletedStatus(item.status ?? '')) {
          currentCompleted.bales += cargoBales;
          currentCompleted.weight += cargoWeight;
        } else if (item.status === 'INVENTORY_INBOUND') {
          currentCompleted.bales += cargoBales;
          currentCompleted.weight += cargoWeight;
        }
        const curAd = availableStockDeductOrderList.get(containerId) || { bales: 0, weight: 0 };
        curAd.bales += cargoBales;
        curAd.weight += cargoWeight;
        availableStockDeductOrderList.set(containerId, curAd);
        reservedQuantitiesOrderList.set(containerId, currentReserved);
        completedQuantitiesOrderList.set(containerId, currentCompleted);
      });
    }

    // 판매관리(tb) 베일·톤 + 판매예약 시트 그리드(컨 단위) — loadActiveSheetReservationQtyByContainer 와 동일 규칙
    const allContainersForSheet: TradeContainer[] = [];
    for (const o of filteredOrders) {
      for (const c of o.containers || []) {
        if (!(c as TradeContainer & { order?: TradeOrder }).order) {
          (c as TradeContainer & { order?: TradeOrder }).order = o;
        }
        allContainersForSheet.push(c);
      }
    }
    const sheetQtyByContainerForOrderList =
      allContainersForSheet.length > 0
        ? await this.loadActiveSheetReservationQtyByContainer(allContainersForSheet)
        : new Map<string, { bales: number; weight: number }>();
    const gridBlProductTotalsForOrderList = await this.loadGridSheetReservationTotalsByBlProduct();
    const tbSalesMgmtTotalsByOrder = await this.loadTbSalesMgmtReservationTotalsByOrder(filteredOrders);
    const sheetTotalsByOrderForInbound = new Map<string, { bales: number; weight: number }>();
    for (const o of filteredOrders) {
      const k = String(o.id);
      const t = tbSalesMgmtTotalsByOrder.get(k) || { bales: 0, weight: 0 };
      sheetTotalsByOrderForInbound.set(k, { bales: t.bales, weight: t.weight });
    }
    this.mergeGridSheetReservationIntoOrderTotals(
      filteredOrders,
      sheetTotalsByOrderForInbound,
      gridBlProductTotalsForOrderList,
    );
    for (const [k, v] of sheetTotalsByOrderForInbound.entries()) {
      sheetTotalsByOrderForInbound.set(k, {
        bales: this.roundNumber(v.bales, 6),
        weight: this.roundNumber(v.weight, 6),
      });
    }

    const salesMgmtInboundDisplayByOrder = new Map<
      string,
      { weightMtForInbound: number; balesFallbackForInbound: number }
    >();
    for (const o of filteredOrders) {
      const k = String(o.id);
      const t = tbSalesMgmtTotalsByOrder.get(k) || { bales: 0, weight: 0 };
      salesMgmtInboundDisplayByOrder.set(k, this.computeSalesMgmtInboundDisplayByWeight(o, t));
    }

    // 주문 기준으로 결과 매핑 (getTradeOrder와 유사한 로직)
    const result: any[] = [];
      
    for (const order of filteredOrders) {
      const contract = order.contract;
      if (!contract) {
        this.logger.warn(`[listTradeOrders] 주문 ID ${order.id}에 연결된 계약이 없습니다.`);
        continue;
      }

      if (!skipSalesStatusRowFilter) {
      // 입고 대기/입고 예정 중복 방지: 요청한 salesStatus와 실제 주문의 salesStatus가 일치하는 경우만 포함
      if (salesStatus === 'INBOUND_PENDING') {
        if (order.salesStatus === 'INBOUND_SCHEDULED' || order.salesStatus === 'INBOUND_CONFIRMED') {
          continue; // 입고 예정·입고 확정 주문은 입고 대기 목록에서 제외
        }
      } else if (salesStatus === 'INBOUND_SCHEDULED') {
        if (order.salesStatus !== 'INBOUND_SCHEDULED') {
          continue; // 입고 예정이 아닌 주문은 입고 예정 목록에서 제외
        }
      }

      }

      const contractId = String(contract.id);
      const contractNo = contract.contractNo ?? null;
      const contractStatus = contract.status ?? null;

      const exportCountryCode = contract.exportCountry ?? null;
      const productCode = contract.productName ?? null;
      const exporterCode = contract.exporter ?? null;
      const shippingLineCode = order.shippingLine ?? null;
      const shippingLineName = getCodeName('SHIPPING_LINE', shippingLineCode) ?? shippingLineCode ?? null;

      const currencyCode = order.currency ?? contract.currency ?? null;
      const resolvedCurrencyName = getCurrencyDisplay(null, currencyCode);

      const gradeCode = contract.grade ?? null;
      const gradeLabel = gradeCode && gradeCode.trim()
        ? getCodeName('TRADE_GRADE', gradeCode) ?? gradeCode
        : null;

      const packingCode = contract.packingType ?? null;
      const packingName = getCodeName('PACKING_TYPE', packingCode);

      const orderManagerUser = order.managerUser
        ? {
            id: order.managerUser.id,
            name: order.managerUser.name,
            email: order.managerUser.email,
          }
        : null;
      const contractManagerUser = contract.createdBy
        ? {
            id: contract.createdBy.id,
            name: contract.createdBy.name,
            email: contract.createdBy.email,
          }
        : null;
      const managerUser = orderManagerUser || contractManagerUser;

      const orderDestinationCode = order.destination ?? null;
      const contractDestinationCode = contract.destination ?? null;
      const finalDestinationCode = orderDestinationCode || contractDestinationCode;
      const finalDestinationName = orderDestinationCode
        ? getCodeName('DESTINATION_PORT', orderDestinationCode) ?? orderDestinationCode
        : (getCodeName('DESTINATION_PORT', contractDestinationCode) ?? contractDestinationCode ?? null);

      const containers = order.containers?.map((c) => {
        const originalBales = this.getEffectiveSalesBales(c);
        const originalWeight = c.weight ? Number(c.weight) : 0;
        const reservedQty = reservedQuantitiesOrderList.get(c.id) || { bales: 0, weight: 0 };
        const completedQty = completedQuantitiesOrderList.get(c.id) || { bales: 0, weight: 0 };
        const availDeduct = availableStockDeductOrderList.get(c.id) || { bales: 0, weight: 0 };
        const sheetQty = sheetQtyByContainerForOrderList.get(String(c.id)) || { bales: 0, weight: 0 };
        const availableBales = originalBales - availDeduct.bales - sheetQty.bales;
        const availableWeight = originalWeight - availDeduct.weight - sheetQty.weight;
        return {
        id: String(c.id),
        containerNo: c.containerNo ?? null,
        product: c.product ?? null,
        tradeGrade: c.tradeGrade ?? null,
        salesGrade: c.salesGrade ?? null,
        packing: c.packingType ?? null,
        packingType: c.packingType ?? null,
        currency: c.currency ?? null,
        unitPrice: c.unitPrice ? Number(c.unitPrice) : null,
        weight: c.weight ? Number(c.weight) : null,
        tradeBales: c.tradeBales ? Number(c.tradeBales) : null,
        salesBales: c.salesBales != null && c.salesBales !== '' ? Number(c.salesBales) : (c.tradeBales ? Number(c.tradeBales) : null),
        pendingPurchaseCost: c.pendingPurchaseCost ?? null,
        confirmedPurchaseCost: c.confirmedPurchaseCost ?? null,
        stoCost: c.stoCost ?? null,
        dtCost: c.dtCost ?? null,
        workFee: c.workFee ?? null,
        onsiteWorkFee: c.onsiteWorkFee ?? null,
        sequence: c.sequence ?? null,
        excludeFromInventory: c.excludeFromInventory === true,
        inventoryStatus: c.inventoryStatus ?? null,
        // 통관 전 재고 컨 상당 계산용 (주간 재고·입고예정재고 상세와 동일: 베일 우선, 없으면 중량)
        bales: originalBales,
        availableBales,
        reservedBales: reservedQty.bales,
        completedBales: completedQty.bales,
        availableWeight,
        reservedWeight: reservedQty.weight,
        completedWeight: completedQty.weight,
        /** 판매관리(tb)+그리드 예약 ACTIVE (listContainers와 동일, 가용 차감에 반영됨) */
        sheetReservationBales: sheetQty.bales,
        sheetReservationWeight: sheetQty.weight,
      };
      }) || [];

      if ((inboundStatusesMerged || salesStatus === 'INBOUND_CONFIRMED' || salesStatus === 'INBOUND_SCHEDULED' || salesStatus === 'INBOUND_PENDING') && !includeOrdersWithAllContainersExcluded && order.containers && order.containers.length > 0) {
        const allExcluded = order.containers.every((c) => c.excludeFromInventory === true);
        if (allExcluded) continue;
      }

      result.push({
        id: String(order.id),
        contractId,
        contractNo,
        sequence: order.sequence ?? 1,
        sequenceSub: order.sequenceSub ?? 0,
        newOld: contract.newOld ?? null,
        commissionMonth: order.commissionMonth ?? contract.commissionMonth ?? null,
        commissionDollar: order.commissionDollar ?? contract.commissionDollar ?? null,
        managerUser,
        orderDate: contract.orderDate ? this.normalizeDateValue(contract.orderDate) : null,
        exportCountryCode,
        exportCountryName: getCodeName('EXPORT_COUNTRY', exportCountryCode) ?? exportCountryCode ?? null,
        exporterCode,
        exporterName: getCodeName('EXPORTER', exporterCode) ?? exporterCode ?? null,
        productCode,
        productName: getCodeName('PRODUCT', productCode) ?? productCode ?? null,
        quota: order?.quota ?? contract.quota ?? null, // 주문별 쿼터 (현물과 동일)
        fumigation: contract.fumigation ?? null,
        spot: order?.spot ?? null, // 현물은 주문 레벨
        customsDuty: contract.customsDuty ?? null,
        shippingLineCode: shippingLineCode,
        shippingLineName: shippingLineName,
        shippingLine: shippingLineCode,
        quantity: order.quantity ? Number(order.quantity) : (contract.quantity ? Number(contract.quantity) : null),
        grade: gradeLabel ?? gradeCode ?? null,
        gradeCode,
        bk: order.bk ?? null,
        bl: order.bl ?? null,
        packingCode,
        packing: packingName ?? packingCode ?? null,
        currencyCode,
        currencyName: resolvedCurrencyName,
        currency: currencyCode,
        unitPrice: contract.unitPrice ? Number(contract.unitPrice) : null,
        totalAmount: null,
        destinationCode: finalDestinationCode,
        destinationName: finalDestinationName,
        destination: finalDestinationCode,
        finalDestination: order.finalDestination ?? null,
        finalDestinationCode: null,
        finalDestinationName: null,
        finalDestinationArrivalDate: order.finalDestinationArrivalDate ? this.normalizeDateValue(order.finalDestinationArrivalDate) : null,
        etdText: order.etdText ?? null,
        etdDate: order.etdDate ? this.normalizeDateValue(order.etdDate) : null,
        etdApi: order.etdApiDate ? this.normalizeDateValue(order.etdApiDate) : null,
        etaDate: order.etaDate ? this.normalizeDateValue(order.etaDate) : null,
        notes: order.notes ?? contract.notes ?? null,
        salesNotes: order.salesNotes ?? null,
        invoiceNumber: order.invoiceNumber ?? null,
        invoiceDate: order.invoiceDate ? this.normalizeDateValue(order.invoiceDate) : null,
        invoiceCurrency: order.invoiceCurrency ?? null,
        invoiceCurrencyName: order.invoiceCurrency ? getCodeName('CURRENCY', order.invoiceCurrency) : null,
        invoiceAmount: order.invoiceAmount ? Number(order.invoiceAmount) : null,
        invoiceWeight: order.invoiceWeight ? Number(order.invoiceWeight) : null,
        invoiceFilePath: order.invoiceFilePath ?? null,
        invoiceFileName: order.invoiceFileName ?? null,
        invoiceGoogleDriveFileId: order.invoiceGoogleDriveFileId ?? null,
        contractGoogleDriveFileId: contract.contractGoogleDriveFileId ?? null,
        contractFileName: contract.contractFileName ?? null,
        certificateRequest: order.certificateRequest ?? null,
        certificateNumber: order.certificateNumber ?? null,
        // hasOriginalShipment가 없지만 originalShipment가 있으면 자동으로 'Y'로 설정 (기존 데이터 호환성)
        hasOriginalShipment: order.hasOriginalShipment ?? (order.originalShipment ? 'Y' : null),
        originalShipment: order.originalShipment ? this.normalizeDateValue(order.originalShipment) : null,
        doGoogleDriveFileId: order.doGoogleDriveFileId ?? null,
        doFileName: order.doFileName ?? null,
        customsCertificateGoogleDriveFileId: order.customsCertificateGoogleDriveFileId ?? null,
        customsCertificateFileName: order.customsCertificateFileName ?? null,
        customsCertificateGoogleDriveFileId2: order.customsCertificateGoogleDriveFileId2 ?? null,
        customsCertificateFileName2: order.customsCertificateFileName2 ?? null,
        customsDate: order.customsDate ? this.normalizeDateValue(order.customsDate) : null,
        customsScheduledDate: order.customsScheduledDate ? this.normalizeDateValue(order.customsScheduledDate) : null,
        quarantineDate: order.quarantineDate ? this.normalizeDateValue(order.quarantineDate) : null,
        status: order.status ?? 'BOOKING', // 기존 status 필드 (호환성 유지)
        tradeStatus: order.tradeStatus ?? order.status ?? 'BOOKING', // 무역 상태 (fallback: status)
        tradeStatusName: getCodeName('TRADE_ORDER_STATUS', order.tradeStatus ?? order.status ?? 'BOOKING') ?? (order.tradeStatus ?? order.status ?? 'BOOKING'), // 무역 상태 이름
        salesStatus: order.salesStatus ?? null, // 영업 상태
        financeStatus: order.financeStatus ?? null, // 재무 상태
        excludeFromLogistics: order.excludeFromLogistics === true, // 물류관리 목록 제외 여부
        shipBack: order.shipBack === true, // 쉽백(반송) 여부
        contractStatus: contract.status ?? 'ORDER',
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        payments: order.payments?.slice().sort((a, b) => a.sequence - b.sequence).map((payment) => ({
          id: payment.id,
          sequence: payment.sequence,
          dueDate: this.normalizeDateValue(payment.dueDate),
          ratio: payment.ratio ? Number(payment.ratio) : null,
          amount: payment.amount ? Number(payment.amount) : null,
          method: payment.method ?? null,
          exchangeRate: payment.exchangeRate ? Number(payment.exchangeRate) : null,
          krwAmount: payment.krwAmount ? Number(payment.krwAmount) : null,
          result: payment.result ?? payment.notes ?? null,
          paymentType: payment.paymentType ?? 'REGULAR', // 결제 유형 (기본값: REGULAR)
          notes: payment.notes ?? null,
          useRatio: payment.useRatio !== undefined ? payment.useRatio : true, // 기본값: true
        })) ?? [],
        // 입고관리(BL 단위) 화면에서 컨테이너 분배 오차 없이 표시하기 위한 주문 단위 합계
        sheetReservationBalesByBl:
          (sheetTotalsByOrderForInbound.get(String(order.id))?.bales ?? 0) || 0,
        sheetReservationWeightByBl:
          (sheetTotalsByOrderForInbound.get(String(order.id))?.weight ?? 0) || 0,
        /** 판매관리(tb) 예약: 입고 화면은 중량(MT) 환산 합(베일은 BL 중량/베일 비율로 톤화). 폴백만 베일 */
        salesMgmtReservationBalesByBl:
          (salesMgmtInboundDisplayByOrder.get(String(order.id))?.balesFallbackForInbound ?? 0) || 0,
        salesMgmtReservationWeightMtByBl:
          (salesMgmtInboundDisplayByOrder.get(String(order.id))?.weightMtForInbound ?? 0) || 0,
        /** 판매예약 시트 그리드(예약등록) 컨 단위 합 — 그대로 컨 상당에 가산 */
        gridSheetReservationContainerUnits: (() => {
          const bl = this.normalizeBlForSheetMatch(order.bl);
          const product = (contract.productName ?? '').trim();
          if (!bl || !product) return 0;
          return gridBlProductTotalsForOrderList.get(`${bl}|${product}`) ?? 0;
        })(),
        bookingTempWeightMt:
          order.bookingTempWeightMt != null && String(order.bookingTempWeightMt).trim() !== ''
            ? Number(order.bookingTempWeightMt)
            : null,
        bookingTempInvoiceAmount:
          order.bookingTempInvoiceAmount != null && String(order.bookingTempInvoiceAmount).trim() !== ''
            ? Number(order.bookingTempInvoiceAmount)
            : null,
        bookingTempPayments: (() => {
          const raw = order.bookingTempPayments;
          if (!raw?.length) {
            return [];
          }
          return raw
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((p) => ({
              id: String(p.id),
              sequence: p.sequence,
              dueDate: this.normalizeDateValue(p.dueDate),
              ratio: p.ratio != null && p.ratio !== '' ? Number(p.ratio) : null,
              amount: p.amount != null && p.amount !== '' ? Number(p.amount) : null,
              method: p.method ?? null,
              exchangeRate:
                p.exchangeRate != null && p.exchangeRate !== '' ? Number(p.exchangeRate) : null,
              krwAmount: p.krwAmount != null && p.krwAmount !== '' ? Number(p.krwAmount) : null,
              result: p.result ?? null,
              notes: p.notes ?? null,
            }));
        })(),
        containers: containers,
        // pendingInbound 매핑 (getTradeOrder와 동일한 로직)
        pendingInbound: order.inbounds?.find((inbound) => inbound.status === 'PENDING')
          ? (() => {
              const pendingInbound = order.inbounds.find((inbound) => inbound.status === 'PENDING');
              return {
                id: pendingInbound.id,
                warehouse: pendingInbound.warehouse ?? null,
                igodate: pendingInbound.igodate ? this.normalizeDateValue(pendingInbound.igodate) : null,
                quarantineDate: pendingInbound.quarantineDate ? this.normalizeDateValue(pendingInbound.quarantineDate) : null,
                dtDate: pendingInbound.dtDate ? this.normalizeDateValue(pendingInbound.dtDate) : null,
                targetMargin: pendingInbound.targetMargin ? Number(pendingInbound.targetMargin) : null,
                customsFee: pendingInbound.customsFee ? Number(pendingInbound.customsFee) : null,
                firstTierLoadingFee: pendingInbound.firstTierLoadingFee ? Number(pendingInbound.firstTierLoadingFee) : null,
                doCost: pendingInbound.doCost ? Number(pendingInbound.doCost) : null,
                quarantineAgencyFee: pendingInbound.quarantineAgencyFee ? Number(pendingInbound.quarantineAgencyFee) : null,
                customsDuty: pendingInbound.customsDuty ? Number(pendingInbound.customsDuty) : null,
                additionalItem: pendingInbound.additionalItem ? Number(pendingInbound.additionalItem) : null,
                bankFee: pendingInbound.bankFee ? Number(pendingInbound.bankFee) : null,
                quarantineWorkCost: pendingInbound.quarantineWorkCost ? Number(pendingInbound.quarantineWorkCost) : null,
                spot: pendingInbound.spot ? Number(pendingInbound.spot) : null,
                document: pendingInbound.document ? Number(pendingInbound.document) : null,
                igobi: pendingInbound.igobi ? Number(pendingInbound.igobi) : null,
                extractionFee: pendingInbound.extractionFee ? Number(pendingInbound.extractionFee) : null,
                sto: pendingInbound.sto ? Number(pendingInbound.sto) : null,
                fumigationQuarantine: pendingInbound.fumigationQuarantine ? Number(pendingInbound.fumigationQuarantine) : null,
                fee: pendingInbound.fee ? Number(pendingInbound.fee) : null,
                sampleCollection: pendingInbound.sampleCollection ? Number(pendingInbound.sampleCollection) : null,
                quotaCost: pendingInbound.quotaCost ? Number(pendingInbound.quotaCost) : null,
                comparisonExchangeRate: pendingInbound.comparisonExchangeRate ? Number(pendingInbound.comparisonExchangeRate) : null,
                comparisonPurchaseCost: pendingInbound.comparisonPurchaseCost ? Number(pendingInbound.comparisonPurchaseCost) : null,
                createdAt: pendingInbound.createdAt,
                updatedAt: pendingInbound.updatedAt,
              };
            })()
          : null,
        // confirmedInbound 매핑 (getTradeOrder와 동일한 로직)
        confirmedInbound: order.inbounds?.find((inbound) => inbound.status === 'CONFIRMED')
          ? (() => {
              const confirmedInbound = order.inbounds.find((inbound) => inbound.status === 'CONFIRMED');
              return {
                id: confirmedInbound.id,
                warehouse: confirmedInbound.warehouse ?? null,
                igodate: confirmedInbound.igodate ? this.normalizeDateValue(confirmedInbound.igodate) : null,
                quarantineDate: confirmedInbound.quarantineDate ? this.normalizeDateValue(confirmedInbound.quarantineDate) : null,
                dtDate: confirmedInbound.dtDate ? this.normalizeDateValue(confirmedInbound.dtDate) : null,
                targetMargin: confirmedInbound.targetMargin ? Number(confirmedInbound.targetMargin) : null,
                customsFee: confirmedInbound.customsFee ? Number(confirmedInbound.customsFee) : null,
                firstTierLoadingFee: confirmedInbound.firstTierLoadingFee ? Number(confirmedInbound.firstTierLoadingFee) : null,
                doCost: confirmedInbound.doCost ? Number(confirmedInbound.doCost) : null,
                quarantineAgencyFee: confirmedInbound.quarantineAgencyFee ? Number(confirmedInbound.quarantineAgencyFee) : null,
                customsDuty: confirmedInbound.customsDuty ? Number(confirmedInbound.customsDuty) : null,
                additionalItem: confirmedInbound.additionalItem ? Number(confirmedInbound.additionalItem) : null,
                bankFee: confirmedInbound.bankFee ? Number(confirmedInbound.bankFee) : null,
                quarantineWorkCost: confirmedInbound.quarantineWorkCost ? Number(confirmedInbound.quarantineWorkCost) : null,
                spot: confirmedInbound.spot ? Number(confirmedInbound.spot) : null,
                document: confirmedInbound.document ? Number(confirmedInbound.document) : null,
                igobi: confirmedInbound.igobi ? Number(confirmedInbound.igobi) : null,
                extractionFee: confirmedInbound.extractionFee ? Number(confirmedInbound.extractionFee) : null,
                sto: confirmedInbound.sto ? Number(confirmedInbound.sto) : null,
                fumigationQuarantine: confirmedInbound.fumigationQuarantine ? Number(confirmedInbound.fumigationQuarantine) : null,
                fee: confirmedInbound.fee ? Number(confirmedInbound.fee) : null,
                sampleCollection: confirmedInbound.sampleCollection ? Number(confirmedInbound.sampleCollection) : null,
                quotaCost: confirmedInbound.quotaCost ? Number(confirmedInbound.quotaCost) : null,
                dayExchangeRate: confirmedInbound.dayExchangeRate ? Number(confirmedInbound.dayExchangeRate) : null,
                comparisonExchangeRate: confirmedInbound.comparisonExchangeRate ? Number(confirmedInbound.comparisonExchangeRate) : null,
                appliedExchangeRate: confirmedInbound.appliedExchangeRate && 
                  typeof confirmedInbound.appliedExchangeRate === 'string' && 
                  confirmedInbound.appliedExchangeRate.trim() !== '' 
                  ? Number(confirmedInbound.appliedExchangeRate) 
                  : (confirmedInbound.appliedExchangeRate != null && typeof confirmedInbound.appliedExchangeRate !== 'string'
                      ? Number(confirmedInbound.appliedExchangeRate)
                      : null),
                purchaseCost: confirmedInbound.purchaseCost ? Number(confirmedInbound.purchaseCost) : null,
                createdAt: confirmedInbound.createdAt,
                updatedAt: confirmedInbound.updatedAt,
              };
            })()
          : null,
      });
    }

    const logTag = opts.finalizeListLogTag ?? 'listTradeOrders';
    this.logger.log(`[${logTag}] 부킹 목록 가공 반환 - 개수: ${result.length}`);
    return result;
  }


}
