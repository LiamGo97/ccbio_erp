/**
 * 결제조건일 계산 유틸리티
 * 
 * 결제조건 타입에 따라 거래명세서 발행일로부터 결제조건일을 계산합니다.
 */

export type PaymentTermsType = 
  | 'DAYS' 
  | 'THIS_MONTH_DAY' 
  | 'NEXT_MONTH_DAY' 
  | 'THIS_MONTH_END' 
  | 'NEXT_MONTH_END';

/**
 * 날짜에 일수 추가
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 날짜에 월 추가
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * 해당 월의 N일 반환
 */
function getMonthDay(date: Date, day: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), day);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 해당 월의 마지막일 반환
 */
function getMonthEnd(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  // 다음 달의 0일 = 이번 달의 마지막일
  const result = new Date(year, month + 1, 0);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 결제조건일 계산
 * 
 * @param issuedAt 거래명세서 발행일
 * @param paymentTermsType 결제조건 타입
 * @param paymentTermsValue 결제조건 값 (일수 또는 일자)
 * @returns 계산된 결제조건일
 */
export function calculatePaymentDueDate(
  issuedAt: Date,
  paymentTermsType: PaymentTermsType = 'DAYS',
  paymentTermsValue?: number,
): Date {
  // 발행일을 Date 객체로 변환 (시간 제거)
  const baseDate = new Date(issuedAt);
  baseDate.setHours(0, 0, 0, 0);

  switch (paymentTermsType) {
    case 'DAYS': {
      // 발행일 + 일수 (기본값: 7일)
      // paymentTermsValue가 0이거나 null/undefined면 기본값 7일 사용
      const days = paymentTermsValue && paymentTermsValue > 0 ? paymentTermsValue : 7;
      return addDays(baseDate, days);
    }

    case 'THIS_MONTH_DAY': {
      // 이번달 N일
      const day = paymentTermsValue ?? 1;
      const result = getMonthDay(baseDate, day);
      // 발행일보다 이전이면 다음 달로
      if (result < baseDate) {
        return addMonths(result, 1);
      }
      return result;
    }

    case 'NEXT_MONTH_DAY': {
      // 다음달 N일
      const day = paymentTermsValue ?? 1;
      const nextMonth = addMonths(baseDate, 1);
      nextMonth.setHours(0, 0, 0, 0);
      return getMonthDay(nextMonth, day);
    }

    case 'THIS_MONTH_END': {
      // 이번달 마지막일
      const monthEnd = getMonthEnd(baseDate);
      // 발행일보다 이전이면 다음 달 마지막일로
      if (monthEnd < baseDate) {
        return getMonthEnd(addMonths(baseDate, 1));
      }
      return monthEnd;
    }

    case 'NEXT_MONTH_END': {
      // 다음달 마지막일
      const nextMonth = addMonths(baseDate, 1);
      nextMonth.setHours(0, 0, 0, 0);
      const monthEnd = getMonthEnd(nextMonth);
      monthEnd.setHours(0, 0, 0, 0);
      return monthEnd;
    }

    default: {
      // 기본값: 발행일 + 7일
      return addDays(baseDate, 7);
    }
  }
}
