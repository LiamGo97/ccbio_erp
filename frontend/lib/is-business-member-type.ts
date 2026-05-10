/**
 * 이커머스 회원구분: 사업자 여부.
 * - API 응답: tb_code 한글명(예: 사업자) 또는 cd_value(BUSINESS)
 * - 폼 Select: cd_value NON_BUSINESS | BUSINESS
 */
export function isBusinessMemberType(memberType: string | null | undefined): boolean {
  const t = (memberType ?? '').trim();
  if (!t || t === '__none__') return false;
  if (t === 'BUSINESS' || t === '사업자') return true;
  if (t === 'NON_BUSINESS' || t === '비사업자') return false;
  return false;
}

/** 이커머스 회원구분: 비사업자(주민번호 등) */
export function isNonBusinessMemberType(memberType: string | null | undefined): boolean {
  const t = (memberType ?? '').trim();
  if (!t || t === '__none__') return false;
  if (t === 'NON_BUSINESS' || t === '비사업자') return true;
  return false;
}
