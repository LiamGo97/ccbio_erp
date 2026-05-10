/**
 * 영업 담당자: 이름 + 로그인(이메일) 표기.
 * · 이름·이메일 둘 다 있으면 `이름 · email@...`
 * · 이름만 / 이메일만 있으면 해당 값만, 없으면 '—'
 */
export function formatSalesManagerDisplay(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const n = name?.trim() ?? '';
  const e = email?.trim() ?? '';
  if (n && e) {
    if (n === e) return n;
    return `${n} · ${e}`;
  }
  if (e) return e;
  if (n) return n;
  return '—';
}
