/**
 * SMS·미리보기: 업체명 + 대표(님) 토큰. 상호와 대표가 같으면 중복 기재하지 않음.
 * - {customerCompanyName}: 별도 상호가 있고 대표와 다를 때만; 없으면 ''.
 * - {customerName}: '님'에 붙는 수신(대표) 이름; 상호만 있으면 상호, 대표만 있으면 대표, 둘 다 없으면 '고객'.
 */
export function getSmsAddresseeTokens(params: {
  companyName?: string | null;
  ceo?: string | null;
}): { customerCompanyName: string; customerName: string } {
  const co = String(params.companyName ?? '').trim();
  const ce = String(params.ceo ?? '').trim();

  if (co && ce) {
    if (co === ce) {
      return { customerCompanyName: '', customerName: co };
    }
    return { customerCompanyName: co, customerName: ce };
  }
  if (co && !ce) {
    return { customerCompanyName: '', customerName: co };
  }
  if (!co && ce) {
    return { customerCompanyName: '', customerName: ce };
  }
  return { customerCompanyName: '', customerName: '고객' };
}

/** "안녕하세요  " 같이 company 토큰이 비었을 때 생기는 이중 공백 정리 */
export function normalizeSmsGreetingLineBreaks(message: string): string {
  return message.replace(/(안녕하세요)\s{2,}/g, '$1 ');
}

/** "안녕하세요" 한 줄(업체·님) — 토큰 replace 후 붙이기/템플릿 없는 fallback 둘 다 */
export function buildInvoiceSmsGreetingLine(tokens: {
  customerCompanyName: string;
  customerName: string;
}): string {
  const cc = (tokens.customerCompanyName ?? '').trim();
  const nm = (tokens.customerName ?? '고객').trim() || '고객';
  if (cc && nm) {
    return `안녕하세요 ${cc} ${nm}님`;
  }
  if (cc) {
    return `안녕하세요 ${cc}님`;
  }
  return `안녕하세요 ${nm}님`;
}
