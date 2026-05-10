'use client';

import * as React from 'react';
import { FileSpreadsheet, Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AxiosError } from 'axios';

/** `/customers/import/excel/inspect` 응답 (다른 모듈에서 재사용 시 export 유지) */
export type CustomerExcelInspectResult = {
  fileSheets: string[];
  usedSheet: string;
  headerRow: number;
  headerScore: number;
  headers: string[];
  fieldToHeader: Record<string, string | null>;
  unrecognizedHeaders: string[];
  dataRowCount: number;
  sampleRows: Array<Record<string, unknown>>;
  issues: Array<{
    excelRow: number;
    kind: string;
    message: string;
    phoneRaw?: string | null;
  }>;
  issueSummary: { noPhone: number; totalIssueRows: number };
  hint?: string;
};

const INSPECT_FIELD_LABELS: Record<string, string> = {
  phone: '전화·연락처',
  feeding: '급여',
  livestockCol: '축종·축정(단독 열)',
  operationCol: '운영·축종/운영',
  herdCount: '두수',
  remarks: '비고',
  ceo: '이름·대표',
  companyName: '농장명·업체',
  address: '주소',
};

type ExcelSnapshot = {
  feeding?: string | null;
  operation?: string | null;
  herdCount?: number | null;
  remarks?: string | null;
  ceo?: string | null;
  companyName?: string | null;
  address?: string | null;
};

type PreviewUpdate = {
  excelRow: number;
  phone: string;
  customerId: string;
  excel: ExcelSnapshot;
  current: {
    companyName?: string | null;
    ceo?: string | null;
    phone?: string | null;
    feeding?: string | null;
    operationSummary?: string | null;
    livestockCount?: number | null;
    remarks?: string | null;
    address?: string | null;
  };
  willApply: Record<string, unknown>;
  warnings: string[];
};

type PreviewCreate = {
  excelRow: number;
  phone: string;
  excel: ExcelSnapshot;
  willApply: Record<string, unknown>;
  warnings: string[];
};

type PreviewSkipped = {
  kind: string;
  excelRow: number;
  phone?: string | null;
  excel: ExcelSnapshot;
  reason: string;
  matches?: Array<{ id: string; companyName?: string | null; ceo?: string | null; phone?: string | null }>;
};

type PreviewResponse = {
  sheetName: string;
  totalRows: number;
  summary: {
    updateCount: number;
    createCount: number;
    skippedCount: number;
  };
  updates: PreviewUpdate[];
  creates: PreviewCreate[];
  skipped: PreviewSkipped[];
};

const FIELD_LABELS: Record<string, string> = {
  feeding: '급여방식(코드)',
  feedingMethod: '급여방식(몰 코드)',
  feedingMethodRaw: '급여방식(원문)',
  livestockCount: '두수',
  livestockTypes: '축종(농장/축산)',
  remarks: '비고',
  ceo: '이름',
  companyName: '농장명',
  address: '기본주소',
  addressRoad: '도로명주소',
  addressJibun: '지번주소',
  addressDefaultType: '기본주소구분',
  operations: '운영형태(행)',
  operationMethod: '운영방식(농장/축산)',
  operationMethodRaw: '운영방식(원문)',
};

/** 고객 수정 화면 농장/축산 · operationMethod 저장값과 동일 (DB OPERATION_SUBTYPE cd_value 계열) */
const OPERATION_METHOD_PREVIEW_LABELS: Record<string, string> = {
  BREEDING: '번식',
  FATTENING: '비육',
  RAISING: '육성',
  BATCH: '일괄',
  MILKING: '착유',
};

const LIVESTOCK_TYPE_PREVIEW_LABELS: Record<string, string> = {
  HANWOO: '한우',
  NAKWOO: '낙우',
  YUKWOO: '육우',
  ETC: '기타',
};

const SKIPPED_MATCH_LABELS: Record<string, string> = {
  no_phone: '전화번호 없음·무효',
  duplicate_row: '파일 내 동일 번호 중복',
  ambiguous_db: 'DB에 동일 번호 다수',
  no_excel_changes: '갱신할 엑셀 값 없음',
};

function formatCodesWithLabels(raw: string, map: Record<string, string>): string {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((code) => {
      const label = map[code];
      if (!label) return code;
      return `${label} (${code})`;
    })
    .join(', ');
}

function formatPreviewFieldDisplay(key: string, v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (!s) return '';
  if (key === 'operationMethod') {
    return formatCodesWithLabels(s, OPERATION_METHOD_PREVIEW_LABELS);
  }
  if (key === 'livestockTypes') {
    return formatCodesWithLabels(s, LIVESTOCK_TYPE_PREVIEW_LABELS);
  }
  return s;
}

function formatWillApply(w: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(w)) {
    if (v === undefined) continue;
    const label = FIELD_LABELS[k] ?? k;
    if (k === 'operations' && Array.isArray(v)) {
      parts.push(`${label}: ${JSON.stringify(v)}`);
    } else {
      parts.push(`${label}: ${formatPreviewFieldDisplay(k, v)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '(변경 없음)';
}

export function CustomerEventSmsExcelDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}) {
  const { open, onOpenChange, onApplied } = props;
  const [file, setFile] = React.useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [applyLoading, setApplyLoading] = React.useState(false);
  const [inspectResult, setInspectResult] = React.useState<CustomerExcelInspectResult | null>(null);
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [previewAcknowledged, setPreviewAcknowledged] = React.useState(false);
  const [applyErrors, setApplyErrors] = React.useState<Array<{ excelRow: number; phone?: string; message: string }>>(
    [],
  );
  const [structureOpen, setStructureOpen] = React.useState(true);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setInspectResult(null);
      setPreview(null);
      setPreviewLoading(false);
      setApplyLoading(false);
      setConfirmOpen(false);
      setPreviewAcknowledged(false);
      setApplyErrors([]);
      setStructureOpen(true);
    }
  }, [open]);

  const runPreview = async () => {
    if (!file) {
      toast({ title: '파일 선택', description: '엑셀 파일을 선택해주세요.', variant: 'destructive' });
      return;
    }
    setPreviewLoading(true);
    setInspectResult(null);
    setPreview(null);
    setPreviewAcknowledged(false);
    setApplyErrors([]);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data: inspected } = await api.post<CustomerExcelInspectResult>(
        '/customers/import/excel/inspect',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setInspectResult(inspected);

      const { data } = await api.post<PreviewResponse>('/customers/import/event-sms/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);

      const phoneWarn =
        inspected.issueSummary.noPhone > 0
          ? ` · 전화 누락·무효 ${inspected.issueSummary.noPhone}건(점검)`
          : '';
      toast({
        title: '미리보기 완료',
        description: `구조: ${inspected.usedSheet} · 데이터 ${inspected.dataRowCount}행${phoneWarn} — DB 반영 예정: 수정 ${data.summary.updateCount} · 신규 ${data.summary.createCount} · 제외 ${data.summary.skippedCount}`,
      });
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message?: string | string[] }>;
      const msg = ax.response?.data?.message;
      toast({
        title: '미리보기 실패',
        description: Array.isArray(msg) ? msg.join(', ') : msg ?? (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const runApply = async () => {
    if (!file || !preview) return;
    setApplyLoading(true);
    setApplyErrors([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{
        updateCount: number;
        createCount: number;
        skippedCount: number;
        updated: number;
        created: number;
        skipped: number;
        errors: Array<{ excelRow: number; phone?: string; message: string }>;
      }>('/customers/import/event-sms/apply', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const errCount = data.errors?.length ?? 0;
      if (errCount > 0) {
        setApplyErrors(data.errors);
        toast({
          title: '반영 실패',
          description: `저장 중 ${errCount}건이 오류로 끝났습니다. 이 작업은 전부 성공한 경우에만 완료로 처리합니다. 오류가 난 행보다 앞선 일부는 이미 DB에 반영되었을 수 있으니 목록을 확인한 뒤 파일을 고쳐 다시 시도하세요.`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: '반영 성공',
        description: `수정 ${data.updated}건 · 신규 ${data.created}건 · 제외(미리보기와 동일) ${data.skipped}건을 모두 정상 처리했습니다.`,
      });
      onApplied?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message?: string | string[] }>;
      const msg = ax.response?.data?.message;
      toast({
        title: '반영 실패',
        description: Array.isArray(msg) ? msg.join(', ') : msg ?? (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setApplyLoading(false);
      setConfirmOpen(false);
    }
  };

  const canApply = Boolean(file && preview && previewAcknowledged && !applyLoading);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pr-14">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 shrink-0" />
              고객 엑셀 (구조 점검 · 미리보기 · 반영)
            </DialogTitle>
            <DialogDescription className="text-left leading-relaxed">
              고객 목록의 <strong>엑셀 가져오기</strong> 버튼으로 여는 화면입니다. <strong>미리보기</strong> 한 번으로 파일
              구조 점검과 DB 매칭(수정·신규·제외)을 함께 확인합니다. 반영 전 아래 확인란에 체크한 뒤{' '}
              <strong>DB 반영</strong>을 누르세요. 빈 칸은 DB를 덮어쓰지 않습니다. 운영방식은 화면에 저장되는 코드(예:{' '}
              <code className="rounded bg-muted px-1 text-[11px]">FATTENING</code>=비육)로 보이며, 괄호 안이 DB·폼에 넣는
              값입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-shrink-0 space-y-3 border-b px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="max-w-[min(100%,280px)] text-sm file:mr-2 file:rounded file:border file:bg-muted file:px-2 file:py-1"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setInspectResult(null);
                  setPreview(null);
                  setPreviewAcknowledged(false);
                  setApplyErrors([]);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void runPreview()}
                disabled={!file || previewLoading}
              >
                {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                미리보기 (점검 + DB 매칭)
              </Button>
            </div>
            {inspectResult ? (
              <Collapsible open={structureOpen} onOpenChange={setStructureOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 text-left text-xs font-medium text-foreground hover:underline"
                  >
                    {structureOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    1단계 — 파일 구조 점검 · 시트 {inspectResult.usedSheet}, 헤더 {inspectResult.headerRow}행, 데이터{' '}
                    {inspectResult.dataRowCount}행
                    {inspectResult.issueSummary.noPhone > 0 ? (
                      <span className="ml-1 text-amber-700 dark:text-amber-400">
                        (전화 문제 {inspectResult.issueSummary.noPhone}건)
                      </span>
                    ) : null}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="mt-2 max-h-[200px] rounded-md border border-border p-3 text-xs">
                    <div className="space-y-3 pr-3">
                      <section>
                        <h4 className="mb-1 font-medium text-foreground">필드 ↔ 인식된 열</h4>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {Object.entries(inspectResult.fieldToHeader).map(([k, v]) => (
                            <li key={k}>
                              <span className="font-medium text-foreground">{INSPECT_FIELD_LABELS[k] ?? k}</span>
                              {' → '}
                              {v ? (
                                <span className="text-emerald-700 dark:text-emerald-400">{v}</span>
                              ) : (
                                '— (미인식)'
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                      {inspectResult.unrecognizedHeaders.length > 0 ? (
                        <section>
                          <h4 className="mb-1 font-medium text-foreground">미인식 열</h4>
                          <p className="text-muted-foreground">{inspectResult.unrecognizedHeaders.join(' · ')}</p>
                        </section>
                      ) : null}
                      {inspectResult.issues.length > 0 ? (
                        <section>
                          <h4 className="mb-1 font-medium text-foreground">전화번호 문제 (최대 20건)</h4>
                          <ul className="max-h-24 space-y-0.5 overflow-auto text-muted-foreground">
                            {inspectResult.issues.slice(0, 20).map((it) => (
                              <li key={`${it.excelRow}-${it.kind}`}>
                                {it.excelRow}행 — {it.message}
                                {it.phoneRaw != null && it.phoneRaw !== '' ? ` (값: ${it.phoneRaw})` : ''}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      {inspectResult.hint ? (
                        <p className="text-muted-foreground">{inspectResult.hint}</p>
                      ) : null}
                    </div>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {preview ? (
              <p className="text-xs text-muted-foreground">
                2단계 — DB 매칭: 시트 {preview.sheetName} · 데이터 행 {preview.totalRows} · 업데이트{' '}
                {preview.summary.updateCount} · 신규 {preview.summary.createCount} · 제외 {preview.summary.skippedCount}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {!preview ? (
              <p className="text-sm text-muted-foreground">
                파일을 선택한 뒤 <strong>미리보기 (점검 + DB 매칭)</strong>를 누르세요. 열 예: 전화번호, 급여, 축종/운영,
                두수, 비고, 이름, 농장명, 주소
              </p>
            ) : (
              <Tabs defaultValue="updates" className="w-full">
                <TabsList className="mb-3 h-auto flex-wrap justify-start gap-1">
                  <TabsTrigger value="updates">업데이트 ({preview.updates.length})</TabsTrigger>
                  <TabsTrigger value="creates">신규 추가 ({preview.creates.length})</TabsTrigger>
                  <TabsTrigger value="skipped">제외 ({preview.skipped.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="updates" className="mt-0">
                  <div className="max-h-[min(50vh,420px)] overflow-auto rounded-md border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                        <tr>
                          <th className="p-2 font-medium">행</th>
                          <th className="p-2 font-medium">전화</th>
                          <th className="p-2 font-medium">기존 요약</th>
                          <th className="p-2 font-medium">반영 내용</th>
                          <th className="p-2 font-medium min-w-[140px]">매칭·결과</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.updates.map((u) => (
                          <tr key={`${u.excelRow}-${u.customerId}`} className="border-t align-top">
                            <td className="p-2 tabular-nums">{u.excelRow}</td>
                            <td className="p-2 whitespace-nowrap">{u.phone}</td>
                            <td className="p-2 text-muted-foreground">
                              <div className="space-y-0.5">
                                <div>
                                  {(u.current.companyName || u.current.ceo || '-').toString()}
                                  <span className="ml-1 text-[10px] opacity-70">ID {u.customerId}</span>
                                </div>
                                <div>급여: {u.current.feeding ?? '-'}</div>
                                <div>운영: {u.current.operationSummary ?? '-'}</div>
                                <div>두수: {u.current.livestockCount ?? '-'}</div>
                              </div>
                            </td>
                            <td className="p-2">
                              <div className="text-foreground leading-snug">{formatWillApply(u.willApply)}</div>
                              {u.warnings.length > 0 ? (
                                <div className="mt-1 flex items-start gap-1 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                  <span>{u.warnings.join(' ')}</span>
                                </div>
                              ) : null}
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium text-emerald-800 dark:text-emerald-300">매칭 성공</div>
                              <div className="mt-0.5 text-muted-foreground">
                                전화번호로 기존 고객 1명 확정
                                <span className="ml-1 font-mono text-[10px] opacity-80">ID {u.customerId}</span>
                              </div>
                              {u.warnings.length > 0 ? (
                                <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                  참고 경고 {u.warnings.length}건 — 반영 내용 열
                                </div>
                              ) : (
                                <div className="mt-1 text-[11px] text-muted-foreground">경고 없음</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
                <TabsContent value="creates" className="mt-0">
                  <div className="max-h-[min(50vh,420px)] overflow-auto rounded-md border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                        <tr>
                          <th className="p-2 font-medium">행</th>
                          <th className="p-2 font-medium">전화</th>
                          <th className="p-2 font-medium">반영 내용</th>
                          <th className="p-2 font-medium min-w-[140px]">매칭·결과</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.creates.map((c) => (
                          <tr key={c.excelRow} className="border-t align-top">
                            <td className="p-2 tabular-nums">{c.excelRow}</td>
                            <td className="p-2 whitespace-nowrap">{c.phone}</td>
                            <td className="p-2">
                              <div>{formatWillApply(c.willApply)}</div>
                              {c.warnings.length > 0 ? (
                                <div className="mt-1 flex items-start gap-1 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                  <span>{c.warnings.join(' ')}</span>
                                </div>
                              ) : null}
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium text-sky-800 dark:text-sky-300">신규 등록 예정</div>
                              <div className="mt-0.5 text-muted-foreground">동일 전화번호 고객 없음 (매칭 없음)</div>
                              {c.warnings.length > 0 ? (
                                <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                  참고 경고 {c.warnings.length}건 — 반영 내용 열
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
                <TabsContent value="skipped" className="mt-0">
                  <div className="max-h-[min(50vh,420px)] overflow-auto rounded-md border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                        <tr>
                          <th className="p-2 font-medium">행</th>
                          <th className="p-2 font-medium">전화</th>
                          <th className="p-2 font-medium">사유</th>
                          <th className="p-2 font-medium min-w-[140px]">매칭·결과</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.skipped.map((s, idx) => (
                          <tr key={`${s.excelRow}-${idx}`} className="border-t align-top">
                            <td className="p-2 tabular-nums">{s.excelRow}</td>
                            <td className="p-2 whitespace-nowrap">{s.phone ?? '-'}</td>
                            <td className="p-2">
                              <div>{s.reason}</div>
                              {s.matches && s.matches.length > 0 ? (
                                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                                  {s.matches.map((m) => (
                                    <li key={m.id}>
                                      ID {m.id} · {m.companyName || m.ceo || '(이름 없음)'}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium text-destructive">처리 제외</div>
                              <div className="mt-0.5 text-muted-foreground">
                                {SKIPPED_MATCH_LABELS[s.kind] ?? s.kind}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          {applyErrors.length > 0 ? (
            <div className="flex-shrink-0 border-t border-destructive/40 bg-destructive/5 px-6 py-3">
              <p className="mb-2 text-sm font-medium text-destructive">직전 반영 시 저장 오류 ({applyErrors.length}건)</p>
              <ScrollArea className="max-h-32 text-xs">
                <ul className="space-y-1 pr-3 text-muted-foreground">
                  {applyErrors.map((e, i) => (
                    <li key={`${e.excelRow}-${i}`}>
                      {e.excelRow}행{e.phone ? ` · ${e.phone}` : ''} — {e.message}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          ) : null}

          <DialogFooter className="flex flex-col items-stretch gap-3 border-t px-6 py-4 sm:flex-col">
            {preview ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
                <Checkbox
                  id="customer-excel-preview-ack"
                  checked={previewAcknowledged}
                  onCheckedChange={(v) => setPreviewAcknowledged(v === true)}
                />
                <Label htmlFor="customer-excel-preview-ack" className="cursor-pointer text-left text-sm font-normal leading-snug">
                  위 <strong>구조 점검</strong>과 <strong>미리보기</strong>(수정·신규·제외) 내용을 확인했고, DB에 반영해도
                  된다고 판단했습니다.
                </Label>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
              <Button type="button" disabled={!canApply} onClick={() => setConfirmOpen(true)}>
                {applyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                DB 반영
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DB에 반영할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              지금 선택한 파일로 서버에서 다시 읽어, 미리보기와 같은 규칙으로 저장합니다. 오류가 한 건이라도 나면 이번 작업은{' '}
              <strong>실패</strong>로 안내하며, 그 전에 처리된 행은 이미 저장되었을 수 있습니다. 네트워크 오류 시에도 내용이
              일부만 반영됐을 수 있으니 목록을 확인하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyLoading}>취소</AlertDialogCancel>
            <Button type="button" disabled={applyLoading} onClick={() => void runApply()}>
              {applyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              반영 실행
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
