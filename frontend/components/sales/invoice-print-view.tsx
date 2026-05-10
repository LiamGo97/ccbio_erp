'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

/** 거래명세서 품목 규격란: HEAVY_BALE / HEAVY_BALES(및 Heavy bales 등)만 헤로 표시 */
function abbreviateHeavyPackingSpec(spec: string): string {
  const key = spec.trim().toUpperCase().replace(/\s+/g, '_');
  if (key === 'HEAVY_BALE' || key === 'HEAVY_BALES') return '헤';
  return spec;
}

export interface InvoicePrintViewProps {
  // 공급자 정보
  supplier: {
    serialNumber: string; // 거래명세서 번호
    tel: string;
    businessRegistrationNumber: string;
    name: string; // 대표자명
    companyName: string;
    address: string;
  };
  // 공급받는자 정보
  recipient: {
    companyName: string;
    ceo?: string;
    address?: string;
    phone?: string;
  };
  // 거래명세서 정보
  invoice: {
    invoiceNumber: string;
    issuedAt: string | Date;
    items: Array<{
      date?: string; // MM/dd 형식
      productName: string;
      specification?: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      amount: number;
      vatAmount: number;
    }>;
    subtotal: number;
    vatAmount: number;
    total: number;
    totalQuantity: number;
    previousBalance?: number | null; // 전일잔액 (선입금은 음수, 채권 잔액은 양수 가능)
    currentBalance?: number | null; // 금일잔액 (순잔액) = total + previousBalance
  };
}

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return phone;
};

// 숫자를 한글로 변환하는 함수
const numberToKorean = (num: number): string => {
  if (num === 0) return '영';
  
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const units = ['', '십', '백', '천'];
  const bigUnits = ['', '만', '억', '조'];

  const numStr = Math.floor(num).toString();
  const len = numStr.length;
  let result = '';

  // 4자리씩 그룹으로 나누어 처리
  const groups: string[] = [];
  for (let i = len; i > 0; i -= 4) {
    const start = Math.max(0, i - 4);
    groups.unshift(numStr.slice(start, i));
  }

  groups.forEach((group, groupIndex) => {
    const groupNum = parseInt(group);
    if (groupNum === 0) return;

    const groupLen = group.length;
    let groupResult = '';

    for (let i = 0; i < groupLen; i++) {
      const digit = parseInt(group[i]);
      const pos = groupLen - i - 1;

      if (digit === 0) continue;

      if (pos === 0) {
        // 일의 자리
        groupResult += digits[digit];
      } else if (pos === 1) {
        // 십의 자리
        if (digit === 1) {
          groupResult += '십';
        } else {
          groupResult += digits[digit] + '십';
        }
      } else if (pos === 2) {
        // 백의 자리
        if (digit === 1) {
          groupResult += '백';
        } else {
          groupResult += digits[digit] + '백';
        }
      } else if (pos === 3) {
        // 천의 자리
        if (digit === 1) {
          groupResult += '천';
        } else {
          groupResult += digits[digit] + '천';
        }
      }
    }

    // 만, 억, 조 단위 추가
    const bigUnitIndex = groups.length - groupIndex - 1;
    if (bigUnitIndex > 0 && groupResult) {
      groupResult += bigUnits[bigUnitIndex];
    }

    result += groupResult;
  });

  return result || '영';
};

// 금액을 한글로 변환 (예: 5805450 -> "오백팔십만오천사백오십원 정")
const formatAmountInKorean = (amount: number): string => {
  const korean = numberToKorean(amount);
  return `${korean}원`;
};

// 숫자 포맷팅 함수 (3자리 콤마, 소수점 이하 0 제거)
const formatNumber = (num: number | null | undefined): string => {
  if (num == null || isNaN(num)) return '-';
  // 소수점 이하 0 제거
  const cleaned = parseFloat(num.toString());
  // 3자리 콤마 추가
  return cleaned.toLocaleString('ko-KR');
};

export const InvoicePrintView = React.forwardRef<HTMLDivElement, InvoicePrintViewProps>(
  ({ supplier, recipient, invoice }, ref) => {
    // 발행일을 MM/dd 형식으로 변환
    const formatItemDate = (date?: string | Date | null): string => {
      if (!date) {
        const issuedDate = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date();
        return format(issuedDate, 'MM/dd', { locale: ko });
      }
      if (typeof date === 'string' && date.includes('/')) {
        return date; // 이미 MM/dd 형식
      }
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return format(dateObj, 'MM/dd', { locale: ko });
    };

    // 수량 포맷팅 (소수점 처리)
    const formatQuantity = (qty: number | null | undefined, unit: string): string => {
      // 숫자로 변환
      const numQty = typeof qty === 'number' ? qty : (qty != null ? Number(qty) : 0);
      if (isNaN(numQty) || numQty === 0) return '-';
      // 소수점 이하 0 제거 후 콤마 추가
      const formatted = parseFloat(numQty.toFixed(4)).toString();
      return `${parseFloat(formatted).toLocaleString('ko-KR')} ${unit}`;
    };

    // 최대 10개 행 표시 (빈 행 포함)
    const maxRows = 10;
    const itemRows = invoice.items.slice(0, maxRows);
    const emptyRows = Math.max(0, maxRows - invoice.items.length);

    return (
      <div
        ref={ref}
        data-invoice-print-view="true"
        style={{
          //minHeight: '800px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          lineHeight: '1.6',
          overflow: 'visible',
          backgroundColor: '#ffffff',
          padding: '12px',
          boxShadow: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* 상단 레이아웃: 왼쪽 제목 + 네모칸, 오른쪽 공급자 테이블 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px' }}>
          {/* 왼쪽: 거래명세서 제목 + 하단 네모칸 */}
          <div style={{ flex: '0.9' }}>
            {/* 거래명세서 제목 */}
            <div style={{ marginBottom: '0px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: 'bold', letterSpacing: '3px' }}>
                거래명세서
              </h1>
            </div>

            {/* 하단 네모칸 (공급받는자 정보) */}
            <div>
              <div className="custom" style={{ width: '100%', border: '2px solid #000', padding: '4px' }}>
                <div style={{ fontSize: '14px'}}>
                  <p style={{ fontWeight: '600', fontSize: '14px' }}>
                    {recipient.companyName || '-'}
                    {recipient.ceo && recipient.ceo !== recipient.companyName && (
                      <span style={{ fontWeight: '500', marginLeft: '4px' }}> / {recipient.ceo}</span>
                    )}
                  </p>
                  {recipient.address && (
                    <p style={{ fontSize: '12px' }}>{recipient.address}</p>
                  )}
                  {recipient.phone && (
                    <p style={{ fontSize: '12px' }}>☎ {formatPhone(recipient.phone)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 공급자 정보 (테이블 형식) */}
          <div style={{ flex: '1.1', position: 'relative', overflow: 'visible' }}>
            <table
              style={{ fontSize: '12px', borderCollapse: 'collapse', border: '1px solid #000', width: '100%' }}
            >
              <tbody>
                <tr>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '2px',
                      textAlign: 'center',
                      fontWeight: '800',
                      verticalAlign: 'middle',
                      writingMode: 'vertical-rl',
                      textOrientation: 'upright',
                      //width: '40px',
                    }}
                    rowSpan={4}
                  >
                    공 급 자
                  </td>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '4px 6px 2px 6px',
                      fontWeight: '800',
                      width: '90px',
                      verticalAlign: 'middle',
                    }}
                  >
                    일련번호
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}>{supplier.serialNumber}</td>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '4px 6px 2px 6px',
                      fontWeight: '800',
                      width: '40px',
                      verticalAlign: 'middle',
                    }}
                  >
                    TEL
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}>{supplier.tel}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', fontWeight: '800', verticalAlign: 'middle' }}>사업자등록번호</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}>{supplier.businessRegistrationNumber}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', fontWeight: '800', verticalAlign: 'middle' }}>성명</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}>{supplier.name}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', fontWeight: '800', verticalAlign: 'middle' }}>상호</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }} colSpan={3}>
                    {supplier.companyName}
                  </td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', fontWeight: '800', verticalAlign: 'middle' }}>주소</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }} colSpan={3}>
                    {supplier.address}
                  </td>
                </tr>
              </tbody>
            </table>
            {/* 도장 레이어 (테이블 위에 absolute positioned) */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                overflow: 'visible',
                zIndex: 10,
              }}
            >
              
                <img
                  src="/stamps/stamp.png"
                  alt="도장"
                  style={{
                    position: 'absolute',
                    width: '60px',
                    height: '60px',
                    top: 'calc(50% - 6px)',
                    right: '0px',
                    transform: 'translateY(-50%)',
                    zIndex: 10,
                    mixBlendMode: 'multiply',
                    objectFit: 'contain',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
             
            </div>
          </div>
        </div>

        {/* 총액 표시 */}
        <div
          className="price"
          style={{
            //marginBottom: '16px',
            marginTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop:'0px',
            paddingBottom: '0px',
            borderBottom: '2px solid #000',
          }}
        >
          <div>
            <span style={{ fontWeight: '600', fontSize: '16px' }}>금 액</span>
            <span style={{ marginLeft: '16px', fontSize: '18px', fontWeight: 'bold' }}>
              {formatAmountInKorean(invoice.total)}
            </span>
            <span style={{ marginLeft: '8px', fontSize: '18px', fontWeight: 'bold' }}>정
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '3px' }}>(₩{formatNumber(invoice.total)})</div>
        </div>

        {/* 품목 목록 테이블 */}
        <div style={{ marginTop: '8px' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #000' }}>
                <th
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'center',
                    fontWeight: '600',
                    width: '8%',
                    verticalAlign: 'middle',
                  }}
                >
                  일자
                </th>
                <th
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'center',
                    fontWeight: '600',
                    width: '32%',
                    verticalAlign: 'middle',
                  }}
                >
                  품목명
                </th>
                <th
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'center',
                    fontWeight: '600',
                    width: '15%',
                    verticalAlign: 'middle',
                  }}
                >
                  수량(단위포함)
                </th>
                <th
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'center',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                >
                  단가
                </th>
                <th
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'center',
                    fontWeight: '600',
                    width: '18%',
                    verticalAlign: 'middle',
                  }}
                >
                  공급가액
                </th>
                <th
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'center',
                    fontWeight: '600',
                    width: '15%',
                    verticalAlign: 'middle',
                  }}
                >
                  부가세
                </th>
              </tr>
            </thead>
            <tbody>
              {/* 데이터 행들 */}
              {itemRows.map((item, index) => {
                const itemDate = formatItemDate(item.date);
                const productNameWithSpec =
                  item.specification
                    ? `${item.productName} [${abbreviateHeavyPackingSpec(String(item.specification))}]`
                    : item.productName;

                return (
                  <tr key={index} style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', textAlign: 'center', verticalAlign: 'middle' }}>{itemDate}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}>{productNameWithSpec}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {formatQuantity(item.quantity, item.unit)}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {item.unitPrice != null && item.unitPrice !== 0 
                        ? formatNumber(item.unitPrice) 
                        : '-'}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {item.amount != null && item.amount !== 0 
                        ? formatNumber(item.amount) 
                        : '-'}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {item.vatAmount != null && item.vatAmount !== 0 ? formatNumber(item.vatAmount) : ''}
                    </td>
                  </tr>
                );
              })}

              {/* 빈 행 추가 */}
              {Array.from({ length: emptyRows }).map((_, index) => (
                <tr key={`empty-${index}`} style={{ height: '26px' }}>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px 2px 6px', verticalAlign: 'middle' }}></td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>

        {/* 하단 요약 영역 */}
        <div style={{ marginTop: '8px' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}
          >
            <tbody>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    width: '8%',
                  }}
                >
                  수량
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '10%',
                    verticalAlign: 'middle',
                  }}
                >
                  {invoice.totalQuantity != null && invoice.totalQuantity !== undefined
                    ? formatNumber(parseFloat(Number(invoice.totalQuantity).toFixed(4)))
                    : '-'}
                </td>
                
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '10%',
                    verticalAlign: 'middle',
                  }}
                >
                  공급가액
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                >
                  {formatNumber(invoice.subtotal)}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '8%',
                    verticalAlign: 'middle',
                  }}
                >
                  부가세
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                >
                  {invoice.vatAmount != null && invoice.vatAmount !== 0 ? formatNumber(invoice.vatAmount) : '0'}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '8%',
                    verticalAlign: 'middle',
                  }}
                >
                  합계
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                >
                  {formatNumber(invoice.total)}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '8%',
                    verticalAlign: 'middle',
                  }}
                >
                  인수
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                >
                  인
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
              <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '10%',
                    verticalAlign: 'middle',
                  }}
                  colSpan={2}
                >
                  전일잔액(일자)
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                  colSpan={2}
                >
                  {invoice.previousBalance != null && invoice.previousBalance !== undefined
                    ? invoice.previousBalance < 0 
                      ? '-' + formatNumber(Math.abs(invoice.previousBalance))
                      : invoice.previousBalance > 0
                      ? formatNumber(invoice.previousBalance)
                      : '0'
                    : '-'}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px 2px 6px',
                    fontWeight: '600',
                    textAlign: 'center',
                    width: '10%',
                    verticalAlign: 'middle',
                  }}
                  colSpan={2}
                >
                  금일잔액(순잔액)
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                  colSpan={2}
                >
                  {(() => {
                    // 금일잔액 = 합계 + 전일잔액
                    const balance = invoice.currentBalance != null && invoice.currentBalance !== undefined
                      ? invoice.currentBalance
                      : Number(invoice.total) + Number(invoice.previousBalance || 0);
                    // balance가 유효한 숫자인지 확인
                    if (balance != null && balance !== undefined && !isNaN(balance)) {
                      return formatNumber(balance);
                    }
                    // fallback: 합계만 표시
                    return formatNumber(invoice.total);
                  })()}
                </td>
                <td style={{
                    border: '1px solid #000',
                    backgroundColor: '#ffffff',
                    padding: '4px 6px 2px 6px',
                    textAlign: 'right',
                    fontWeight: '600',
                    width: '12%',
                    verticalAlign: 'middle',
                  }}
                  colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

InvoicePrintView.displayName = 'InvoicePrintView';

