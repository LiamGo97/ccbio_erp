/**
 * 패킹 값 계산 유틸리티
 * 
 * 계산 규칙:
 * - 일반적으로: 패킹 = 베일
 * - Small bale인 경우:
 *   - 파키스탄/베트남: 패킹 = 베일 / 18
 *   - 미국: 패킹 = 베일 / 20
 *   - 그 외 나라: 패킹 = 베일 / 24
 */

/**
 * 패킹 값 계산
 * @param bales 베일 수량
 * @param packingType 패킹 타입 (예: "Small bale", "small_bale")
 * @param exportCountryCode 수출국 코드 (예: "PAKISTAN" (파키스탄), "VIETNAM" (베트남), "USA" (미국))
 * @returns 계산된 패킹 값 (null이면 null 반환)
 */
export function calculatePacking(
  bales: number | null | undefined,
  packingType: string | null | undefined,
  exportCountryCode: string | null | undefined,
): number | null {
  // 베일이 없으면 패킹도 없음
  if (bales === null || bales === undefined) {
    return null;
  }

  // 패킹 타입이 Small bale이 아닌 경우: 패킹 = 베일
  const normalizedPackingType = packingType?.trim().toLowerCase();
  const isSmallBale = 
    normalizedPackingType === 'small bale' || 
    normalizedPackingType === 'small_bale';

  if (!isSmallBale) {
    return bales;
  }

  // Small bale인 경우: 수출국에 따라 나눗셈
  const normalizedCountryCode = exportCountryCode?.trim().toUpperCase();
  const isPakistanOrVietnam = 
    normalizedCountryCode === 'PAKISTAN' || // 파키스탄
    normalizedCountryCode === 'VIETNAM';    // 베트남
  const isUnitedStates = 
    normalizedCountryCode === 'USA';        // 미국

  if (isPakistanOrVietnam) {
    return bales / 18;
  } else if (isUnitedStates) {
    return bales / 20;
  } else {
    return bales / 24;
  }
}
