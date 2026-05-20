'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

const SITE_TITLE = 'CCBio ERP';

/** 경로별 페이지 제목 (탭에 표시). 경로는 선행 슬래시 없이 저장 */
const PATH_TITLES: Record<string, string> = {
  '': '홈',
  dashboard: '대시보드',
  'dashboard/users': '사용자 관리',
  login: '로그인',
  register: '회원가입',
  'pending-approval': '승인 대기',
  'auth/callback': '인증',
  // 무역
  trade: '무역',
  'trade/management': '구매관리',
  'trade/contract-confirmed': '계약',
  'trade/order': '발주',
  // 물류
  logistics: '물류',
  'logistics/management': '물류관리',
  'logistics/booking': '부킹',
  'logistics/documents': '서류 처리',
  'logistics/documents-processing': '서류 처리',
  'logistics/do-processing': 'DO 처리',
  'logistics/customs-processing': '통관 처리',
  'logistics/eta-update-history': 'ETA 정보 갱신 이력',
  // 영업
  sales: '판매관리',
  'sales/dashboard': '대시보드',
  'sales/invoice-management': '거래명세서 관리',
  'sales/product-reservations': '판매예약',
  'sales/product-reservations-sheet': '판매예약',
  'sales/quotation-sheet': '견적서',
  'sales/management-v2': '판매관리 (신규)',
  'sales/management-v2/sales': '판매관리 (신규)',
  'sales/inventory/pending': '입고예정재고',
  'sales/inventory/confirmed': '입고확정재고',
  'sales/transport-management/transport': '운송관리',
  'sales/transport-management/by-driver': '기사별 운송',
  'sales/transport-management/mismatch': '판매·운송 불일치',
  // 재무
  finance: '재무',
  'finance/payment-management': '결제관리',
  'finance/payment-pending': '결제 대기',
  'finance/payment-completed': '결제 완료',
  'finance/prepayments': '선입금 관리',
  'finance/receivables': '채권관리',
  'finance/receivables/expected': '입금예상액',
  'finance/receivables/warning-config': '채권 경고 설정',
  'finance/receivables/collect': '수금 관리',
  'finance/receivables/ledger': '거래처관리대장',
  'finance/receivables/sms-batch-history': '채권 경고 문자 발송 이력',
  // 재고/입고
  inventory: '재고 관리',
  'inventory/pending': '입고예정재고',
  'inventory/confirmed': '입고확정재고',
  inbound: '입고 관리',
  'inbound/pending': '입고 대기',
  'inbound/scheduled': '입고 예정',
  'inbound/confirmed': '입고 확정',
  // 배차/운송
  transport: '운송',
  'transport/dashboard': '대시보드',
  'transport/dispatch-management': '배차관리',
  'transport/dispatch-request': '배차요청',
  'transport/dispatch-dispatching': '배차중',
  'transport/dispatch-completed': '배차완료',
  'transport/dispatch-rescheduled': '일정조정',
  'transport/dispatch-failed': '배차실패',
  'transport/loading': '상차중',
  'transport/loading-completed': '상차완료',
  'transport/unloading-completed': '하차완료',
  'vehicle-dispatch': '배차 관리',
  'vehicle-dispatch-user': '배차 관리',
  'vehicle-dispatch-warehouse': '배차 관리',
  'loading-company/loading-management': '상차관리',
  'dispatch-company/dispatch-management': '배차관리',
  // 창고/업체
  warehouses: '창고 관리',
  'warehouse-igobi': '창고 이고비 관리',
  'warehouse-employees': '직원 관리',
  suppliers: '공급자 관리',
  customers: '고객 관리',
  'customers/dashboard': '고객 현황',
  'dispatch-companies': '배차 업체 관리',
  'dispatch-company-employees': '배차 업체 직원 관리',
  'unloading-companies': '하차 업체 관리',
  // 스케줄/기타
  schedules: '스케줄 관리',
  consultations: '상담 관리',
  'consultations/dashboard': '재고 대시보드',
  'consultations/stats': '상담 통계',
  codes: '코드 관리',
  users: '사용자 관리',
  'users/permissions': '권한 관리',
  'settings/company-info': '회사 정보 관리',
  'settings/inbound-defaults': '입고 기본 설정',
  'google-drive': '구글 드라이브',
  'safe-freight-rates': '안전운임 요금표 관리',
  'settings/legal-admin-master': '법정동 마스터',
  'organic-certifications': '유기축산 인증 관리',
  'free-time': 'FT 관리',
  // SMS
  'sms-templates': 'SMS 템플릿 관리',
  'sms-senders': 'SMS 발신자 관리',
  'sms-history': 'SMS 발송 이력',
  'sms-management': 'SMS 관리',
  'sms-test': 'SMS 발송 테스트',
};

function getTitleForPath(pathname: string): string | null {
  const path = pathname.replace(/^\//, '').replace(/\/$/, '') || '';
  return PATH_TITLES[path] ?? null;
}

/**
 * 현재 경로에 따라 브라우저 탭 제목을 "페이지제목 | CCBio ERP" 로 동기화합니다.
 * (React Query Devtools 등이 타이틀을 덮어쓰는 경우를 위해 지연 재적용)
 */
export function PageTitleSync() {
  const pathname = usePathname();
  const titleRef = useRef<string>(SITE_TITLE);

  const applyTitle = () => {
    const pageTitle = getTitleForPath(pathname ?? '');
    const title = pageTitle ? `${pageTitle} | ${SITE_TITLE}` : SITE_TITLE;
    titleRef.current = title;
    document.title = title;
  };

  useLayoutEffect(() => {
    applyTitle();
    // 다른 스크립트(예: React Query Devtools)가 타이틀을 덮어쓴 뒤 다시 우리 값으로 복구
    const t1 = setTimeout(applyTitle, 100);
    const t2 = setTimeout(applyTitle, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  return null;
}
