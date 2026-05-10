/**
 * 로그인 JWT 쿠키 이름.
 * localhost에서는 포트가 달라도 쿠키가 도메인(localhost) 기준으로 공유되므로,
 * 다른 앱(예: 이커머스 4000)과 같은 이름('token')을 쓰면 서로 덮어쓰여
 * 새로고침/다른 탭 이동 시 로그아웃되는 현상이 발생할 수 있음.
 * ERP 전용 이름으로 분리함.
 */
export const AUTH_TOKEN_COOKIE_NAME = 'ccbio_erp_token';
