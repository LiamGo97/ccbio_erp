'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/schedules/date-picker';
import { Loader2, X, Phone, Building2, Search, Trash2, Save, CirclePlus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { CollectionListItem, useCollectByCustomer, useUpdateCollection, useDeleteCollection } from '@/lib/hooks/use-collections';
import { useCustomerLedger } from '@/lib/hooks/use-customer-ledger';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import api from '@/lib/api';

interface CollectionFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionListItem | null;
  onSuccess?: () => void;
}

interface CollectionFormData {
  customerId: string;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod: string;
  /** 정산 전 선수금 여부 (백엔드 연동 전 UI만) */
  isPrepayment: boolean;
  /** 공급자: ''=선택 안 함, '0'=공급자 없음(수금만), 그 외=공급자 ID (백엔드 연동 전 UI만) */
  supplierId: string;
  notes: string;
}

interface CompanySearchResult {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
}

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (num % 1 === 0) return num.toLocaleString('ko-KR');
  return num.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function CollectionFormDrawer({
  open,
  onOpenChange,
  collection,
  onSuccess,
}: CollectionFormDrawerProps) {
  const isMobile = useIsMobile();
  const isEditMode = !!collection;
  const { data: suppliers = [] } = useSuppliers({ status: true });
  const collectMutation = useCollectByCustomer();
  const updateMutation = useUpdateCollection();
  const deleteMutation = useDeleteCollection();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [amountDisplayValue, setAmountDisplayValue] = React.useState<string>('');

  // 고객 정보 상태
  const [phone, setPhone] = React.useState('');
  const [companyName, setCompanyName] = React.useState('');
  const [ceo, setCeo] = React.useState('');

  // 업체명 검색 상태
  const [companySearchOpen, setCompanySearchOpen] = React.useState(false);
  const [companySearchTerm, setCompanySearchTerm] = React.useState('');
  const [companySearchResults, setCompanySearchResults] = React.useState<CompanySearchResult[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = React.useState(false);
  const [companySearchError, setCompanySearchError] = React.useState<string | null>(null);
  const [companySearchAttempted, setCompanySearchAttempted] = React.useState(false);

  // 전화번호 검색 상태
  const [phoneSearchOpen, setPhoneSearchOpen] = React.useState(false);
  const [phoneSearchTerm, setPhoneSearchTerm] = React.useState('');
  const [phoneSearchResults, setPhoneSearchResults] = React.useState<CompanySearchResult[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = React.useState(false);
  const [phoneSearchError, setPhoneSearchError] = React.useState<string | null>(null);
  const [phoneSearchAttempted, setPhoneSearchAttempted] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CollectionFormData>({
    defaultValues: {
      customerId: '',
      collectionAmount: 0,
      collectionDate: new Date().toISOString().slice(0, 10),
      collectionMethod: '',
      isPrepayment: false,
      supplierId: '',
      notes: '',
    },
  });

  const selectedCustomerId = watch('customerId');
  const collectionDate = watch('collectionDate');

  // 거래처 선택 시 현재 잔액 조회 (수금 금액 입력 시 참고용)
  const { data: ledger, isLoading: ledgerLoading } = useCustomerLedger(
    selectedCustomerId || undefined,
  );

  // 전화번호 포맷팅 함수
  const formatPhone = React.useCallback((rawPhone: string): string => {
    if (!rawPhone) return '';
    const digits = rawPhone.replace(/[^0-9]/g, '');
    if (digits.startsWith('02')) {
      if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }, []);

  // 고객 정보 조회
  const performLookup = React.useCallback(
    async (rawPhone: string) => {
      const phoneValue = rawPhone?.trim();
      if (!phoneValue) {
        return;
      }
      const formattedPhone = formatPhone(phoneValue);
      setPhone(formattedPhone);
      try {
        const response = await api.get('/consultations/lookup', {
          params: { phone: phoneValue },
        });
        const result = response.data;
        if (result.customer) {
          setValue('customerId', result.customer.id, { shouldValidate: true });
          setCompanyName(result.customer.companyName ?? '');
          setCeo(result.customer.ceo ?? '');
        } else {
          // 고객이 없으면 customerId만 초기화
          setValue('customerId', '', { shouldValidate: true });
        }
      } catch (error: unknown) {
        console.error('고객 조회 오류:', error);
        toast({
          title: '조회 실패',
          description: '고객 조회 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    },
    [formatPhone, setValue, toast],
  );

  // 수금/환불 금액 입력값 포맷팅 (콤마 포함, 음수 허용)
  const formatAmountInput = (value: string): string => {
    // 마이너스 기호가 있는지 확인 (시작 부분에만 허용)
    const hasMinus = value.includes('-');
    const minusCount = (value.match(/-/g) || []).length;
    const isNegative = hasMinus && (value.startsWith('-') || (minusCount === 1 && value.indexOf('-') === 0));
    
    // 숫자와 소수점만 추출
    let cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const integerPart = parts[0] || '';
    const decimalPart = parts.length > 1 ? '.' + parts.slice(1).join('').slice(0, 2) : '';
    
    // 빈 값이면 마이너스만 반환
    if (!integerPart && !decimalPart) {
      return isNegative ? '-' : '';
    }
    
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (isNegative ? '-' : '') + formattedInteger + decimalPart;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = formatAmountInput(rawValue);
    setAmountDisplayValue(formatted);
    const cleanedValue = formatted.replace(/,/g, '');
    const numValue = cleanedValue ? parseFloat(cleanedValue) : 0;
    setValue('collectionAmount', numValue, { shouldValidate: true });
  };

  // 업체명 검색 핸들러
  const resetCompanySearchState = React.useCallback(() => {
    setCompanySearchResults([]);
    setCompanySearchError(null);
    setCompanySearchTerm('');
    setCompanySearchLoading(false);
    setCompanySearchAttempted(false);
  }, []);

  const handleCompanySearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setCompanySearchOpen(nextOpen);
      if (!nextOpen) {
        resetCompanySearchState();
      } else {
        // 팝업 열 때 현재 업체명을 검색어로 설정
        if (companyName) {
          setCompanySearchTerm(companyName);
        }
      }
    },
    [resetCompanySearchState, companyName],
  );

  const handleCompanySearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const keyword = companySearchTerm.trim();
      if (keyword.length < 2) {
        setCompanySearchError('두 글자 이상 입력해주세요.');
        setCompanySearchResults([]);
        setCompanySearchAttempted(false);
        return;
      }
      setCompanySearchAttempted(true);
      setCompanySearchLoading(true);
      setCompanySearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/company', {
          params: { keyword },
        });
        setCompanySearchResults(response.data);
        if (response.data.length === 0) {
          setCompanySearchError('일치하는 업체가 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setCompanySearchError(message);
        setCompanySearchResults([]);
      } finally {
        setCompanySearchLoading(false);
      }
    },
    [companySearchTerm],
  );

  const handleSelectCompany = React.useCallback(
    (item: CompanySearchResult) => {
      handleCompanySearchOpenChange(false);
      if (item.id) {
        setValue('customerId', item.id, { shouldValidate: true });
      }
      if (item.companyName) {
        setCompanyName(item.companyName);
      }
      if (item.ceo) {
        setCeo(item.ceo);
      }
      if (item.phone) {
        setPhone(formatPhone(item.phone));
      } else {
        toast({
          title: '전화번호 정보 없음',
          description: '선택한 업체에는 전화번호가 없어 기본 정보만 채웠습니다.',
        });
      }
      // 같은 전화번호를 가진 여러 고객이 있을 때 performLookup은 첫 번째 고객만 반환.
      // 검색 결과에서 선택한 고객(item)을 그대로 사용.
    },
    [handleCompanySearchOpenChange, setValue, formatPhone, toast],
  );

  // 전화번호 검색 핸들러
  const resetPhoneSearchState = React.useCallback(() => {
    setPhoneSearchResults([]);
    setPhoneSearchError(null);
    setPhoneSearchTerm('');
    setPhoneSearchLoading(false);
    setPhoneSearchAttempted(false);
  }, []);

  const handlePhoneSearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setPhoneSearchOpen(nextOpen);
      if (!nextOpen) {
        resetPhoneSearchState();
      } else {
        // 팝업 열 때 현재 전화번호를 검색어로 설정
        if (phone) {
          setPhoneSearchTerm(phone);
        }
      }
    },
    [resetPhoneSearchState, phone],
  );

  const handlePhoneSearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const phoneValue = phoneSearchTerm.trim();
      if (!phoneValue) {
        setPhoneSearchError('전화번호를 입력해주세요.');
        setPhoneSearchResults([]);
        setPhoneSearchAttempted(false);
        return;
      }
      setPhoneSearchAttempted(true);
      setPhoneSearchLoading(true);
      setPhoneSearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/phone', {
          params: { phone: phoneValue },
        });
        setPhoneSearchResults(response.data);
        if (response.data.length === 0) {
          setPhoneSearchError('일치하는 고객이 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setPhoneSearchError(message);
        setPhoneSearchResults([]);
      } finally {
        setPhoneSearchLoading(false);
      }
    },
    [phoneSearchTerm],
  );

  const handleSelectPhone = React.useCallback(
    (item: CompanySearchResult) => {
      handlePhoneSearchOpenChange(false);
      if (item.id) {
        setValue('customerId', item.id, { shouldValidate: true });
      }
      if (item.companyName) {
        setCompanyName(item.companyName);
      }
      if (item.ceo) {
        setCeo(item.ceo);
      }
      if (item.phone) {
        setPhone(formatPhone(item.phone));
      }
      // 같은 전화번호를 가진 여러 고객이 있을 때 performLookup은 첫 번째 고객만 반환.
      // 검색 결과에서 선택한 고객(item)을 그대로 사용.
    },
    [handlePhoneSearchOpenChange, setValue, formatPhone],
  );

  // Drawer가 열릴 때마다 폼 초기화
  React.useEffect(() => {
    if (open) {
      if (isEditMode && collection) {
        // 수정 모드
        reset({
          customerId: collection.customerId,
          collectionAmount: collection.collectionAmount,
          collectionDate: collection.collectionDate,
          collectionMethod: collection.collectionMethod || '',
          isPrepayment: collection.isPrepayment ?? false,
          supplierId: '', // 수정 시에도 UI만 표시, 추후 API에서 받아서 채울 수 있음
          notes: collection.notes || '',
        });
        setAmountDisplayValue(formatAmountInput(String(collection.collectionAmount)));
        setCompanyName(collection.customerName || '');
        setPhone('');
        setCeo('');
      } else {
        // 입력 모드
        reset({
          customerId: '',
          collectionAmount: 0,
          collectionDate: new Date().toISOString().slice(0, 10),
          collectionMethod: '',
          isPrepayment: false,
          supplierId: '',
          notes: '',
        });
        setAmountDisplayValue('');
        setPhone('');
        setCompanyName('');
        setCeo('');
      }
    }
  }, [open, isEditMode, collection, reset]);

  const onSubmit = async (data: CollectionFormData) => {
    if (!data.customerId) {
      toast({
        title: '오류',
        description: '고객을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!data.collectionAmount || data.collectionAmount === 0) {
      toast({
        title: '오류',
        description: '수금/환불 금액을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!data.collectionDate) {
      toast({
        title: '오류',
        description: '수금일을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (isEditMode && collection) {
        // 수정
        const supplierIdParam =
          data.supplierId === '' ? undefined : data.supplierId === '0' ? 0 : Number(data.supplierId);
        await updateMutation.mutateAsync({
          receivableId: collection.receivableId,
          collectionId: collection.id,
          collectionAmount: data.collectionAmount,
          collectionDate: data.collectionDate,
          collectionMethod: data.collectionMethod || null,
          supplierId: supplierIdParam,
          notes: data.notes || null,
          isPrepayment: data.isPrepayment,
        });

        toast({
          title: '수정 완료',
          description: '수금이 성공적으로 수정되었습니다.',
        });
      } else {
        // 입력
        const supplierIdParam =
          data.supplierId === '' ? undefined : data.supplierId === '0' ? 0 : Number(data.supplierId);
        await collectMutation.mutateAsync({
          customerId: data.customerId,
          collectionAmount: data.collectionAmount,
          collectionDate: data.collectionDate,
          collectionMethod: data.collectionMethod || null,
          supplierId: supplierIdParam,
          notes: data.notes || null,
          isPrepayment: data.isPrepayment,
        });

        toast({
          title: '등록 완료',
          description: '수금이 성공적으로 등록되었습니다.',
        });
      }

      onOpenChange(false);
      reset();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('수금 처리 실패:', error);
      toast({
        title: '오류',
        description: error?.response?.data?.message || '수금 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!collection) return;

    try {
      await deleteMutation.mutateAsync({
        receivableId: collection.receivableId,
        collectionId: collection.id,
      });

      toast({
        title: '삭제 완료',
        description: '수금이 성공적으로 삭제되었습니다.',
      });

      setDeleteDialogOpen(false);
      onOpenChange(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('수금 삭제 실패:', error);
      toast({
        title: '오류',
        description: error?.response?.data?.message || '수금 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const isSubmitting = collectMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // 텍스트 선택(더블클릭 등) 허용 — 버튼/입력은 제외
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDeleteDialogOpen(false);
        return;
      }
      if (companySearchOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCompanySearchOpenChange(false);
        return;
      }
      if (phoneSearchOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handlePhoneSearchOpenChange(false);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    onOpenChange,
    deleteDialogOpen,
    companySearchOpen,
    phoneSearchOpen,
    handleCompanySearchOpenChange,
    handlePhoneSearchOpenChange,
  ]);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="flex h-full flex-col"
          style={{
            width: isMobile ? '100%' : '900px',
            maxWidth: '90vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="shrink-0 border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle>{isEditMode ? '수금 수정' : '수금 입력'}</DrawerTitle>
                <DrawerDescription>
                  {isEditMode ? '수금 정보를 수정합니다.' : '고객의 수금을 등록합니다.'}
                </DrawerDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="닫기"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DrawerHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
              {/* 고객 정보 - 한 줄에 3개 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">전화번호</Label>
                    <div className="flex gap-2">
                      <Input
                        id="phone"
                        placeholder="010-1234-5678"
                        value={phone}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPhone(value);
                          if (value.trim()) {
                            performLookup(value);
                          } else {
                            setValue('customerId', '', { shouldValidate: true });
                            setCompanyName('');
                            setCeo('');
                          }
                        }}
                        disabled={isEditMode || isSubmitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handlePhoneSearchOpenChange(true)}
                        title="전화번호로 검색"
                        disabled={isEditMode || isSubmitting}
                        aria-label="전화번호로 검색"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">업체명 / 농장명</Label>
                    <div className="flex gap-2">
                      <Input
                        id="companyName"
                        placeholder="업체명 또는 농장명"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        disabled={isEditMode || isSubmitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleCompanySearchOpenChange(true)}
                        title="업체명으로 검색"
                        disabled={isEditMode || isSubmitting}
                        aria-label="업체명으로 검색"
                      >
                        <Building2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ceo">대표자</Label>
                    <Input
                      id="ceo"
                      placeholder="대표자명"
                      value={ceo}
                      onChange={(e) => setCeo(e.target.value)}
                      disabled={isEditMode || isSubmitting}
                    />
                  </div>
                </div>
                {errors.customerId && (
                  <p className="text-xs text-destructive">고객을 선택해주세요.</p>
                )}
              </div>

              {/* 현재 잔액: 거래처 선택 시 표시 */}
              {selectedCustomerId && (
                <div className="rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-muted-foreground">현재 잔액</span>
                    {ledgerLoading ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        조회 중
                      </span>
                    ) : ledger ? (
                      <span
                        className={
                          ledger.currentBalance > 0
                            ? 'text-lg font-semibold text-red-600 dark:text-red-400'
                            : ledger.currentBalance < 0
                              ? 'text-lg font-semibold text-green-600 dark:text-green-400'
                              : 'text-lg font-semibold text-muted-foreground'
                        }
                      >
                        {ledger.currentBalance >= 0 ? '' : '-'}
                        {formatNumber(Math.abs(ledger.currentBalance))}원
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                  {ledger && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      양수: 미수금, 음수: 선수/과납 · 해당 금액을 참고해 수금액을 입력하세요.
                    </p>
                  )}
                </div>
              )}

              {/* 수금 정보 - 한 줄에 3개 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">수금 정보</h3>
                <div className="grid grid-cols-3 gap-4">
                  {/* 수금 금액 */}
                  <div className="space-y-2">
                    <Label htmlFor="collectionAmount">
                      수금/환불 금액 <span className="text-destructive">*</span>
                      <span className="text-xs text-muted-foreground ml-2">(환불은 음수로 입력)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="collectionAmount"
                        type="text"
                        inputMode="decimal"
                        value={amountDisplayValue}
                        onChange={handleAmountChange}
                        placeholder="0"
                        className="pr-12"
                        disabled={isSubmitting}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        원
                      </span>
                    </div>
                    {errors.collectionAmount && (
                      <p className="text-xs text-destructive">{errors.collectionAmount.message}</p>
                    )}
                  </div>

                  {/* 수금일 */}
                  <div className="space-y-2">
                    <Label>
                      수금일 <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      value={collectionDate}
                      onChange={(value) => setValue('collectionDate', value || '', { shouldValidate: true })}
                      disabled={isSubmitting}
                    />
                    {errors.collectionDate && (
                      <p className="text-xs text-destructive">{errors.collectionDate.message}</p>
                    )}
                  </div>

                  {/* 수금 방법 */}
                  <div className="space-y-2">
                    <Label htmlFor="collectionMethod">수금 방법</Label>
                    <Select
                      value={watch('collectionMethod') || undefined}
                      onValueChange={(value) => setValue('collectionMethod', value === '__none__' ? '' : value)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="collectionMethod">
                        <SelectValue placeholder="수금 방법을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안 함</SelectItem>
                        <SelectItem value="현금">현금</SelectItem>
                        <SelectItem value="계좌이체">계좌이체</SelectItem>
                        <SelectItem value="어음">어음</SelectItem>
                        <SelectItem value="수표">수표</SelectItem>
                        <SelectItem value="기타">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplierId">공급자</Label>
                    <Select
                      value={watch('supplierId') || 'none'}
                      onValueChange={(value) => setValue('supplierId', value === 'none' ? '' : value)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="supplierId">
                        <SelectValue placeholder="선택 안 함" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">선택 안 함</SelectItem>
                        <SelectItem value="0">공급자 없음 (수금만)</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="isPrepayment">선수금</Label>
                    <div className="flex h-10 items-center">
                      <Switch
                        id="isPrepayment"
                        checked={watch('isPrepayment')}
                        onCheckedChange={(checked) =>
                          setValue('isPrepayment', checked, { shouldDirty: true, shouldValidate: true })
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 비고 */}
              <div className="space-y-2">
                <Label htmlFor="notes">비고</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="필요시 거래명세서 번호 등을 기록할 수 있습니다."
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <DrawerFooter className="shrink-0 border-t">
              <div className="flex items-center justify-end gap-2 w-full">
                {/* 취소 → 삭제(수정 모드일 때만) → 등록/수정 */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  취소
                </Button>
                {isEditMode && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={isSubmitting}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    삭제
                  </Button>
                )}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : isEditMode ? (
                    <Save className="mr-1.5 h-4 w-4" />
                  ) : (
                    <CirclePlus className="mr-1.5 h-4 w-4" />
                  )}
                  {isEditMode ? '수정' : '등록'}
                </Button>
              </div>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수금 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 수금을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 업체명 검색 Dialog */}
      <Dialog open={companySearchOpen} onOpenChange={handleCompanySearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>업체명으로 고객 검색</DialogTitle>
            <DialogDescription>업체명 또는 대표자명을 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompanySearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={companySearchTerm}
                onChange={(e) => setCompanySearchTerm(e.target.value)}
                placeholder="업체명 또는 대표자명"
                autoFocus
              />
              <Button type="submit" disabled={companySearchLoading}>
                {companySearchLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-1.5 h-4 w-4" />
                )}
                검색
              </Button>
            </div>
            {companySearchError && (
              <p className="text-sm text-destructive">{companySearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {companySearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : companySearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {companySearchAttempted ? '검색 결과가 없습니다.' : '업체명을 입력해 검색하세요.'}
                </div>
              ) : (
                companySearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectCompany(item)}
                  >
                    <p className="font-medium">{item.companyName || '업체명 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(item.phone ?? '') || '전화번호 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 전화번호 검색 Dialog */}
      <Dialog open={phoneSearchOpen} onOpenChange={handlePhoneSearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>전화번호로 고객 검색</DialogTitle>
            <DialogDescription>전화번호를 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePhoneSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={phoneSearchTerm}
                onChange={(e) => setPhoneSearchTerm(e.target.value)}
                placeholder="010-1234-5678"
                autoFocus
              />
              <Button type="submit" disabled={phoneSearchLoading}>
                {phoneSearchLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-1.5 h-4 w-4" />
                )}
                검색
              </Button>
            </div>
            {phoneSearchError && (
              <p className="text-sm text-destructive">{phoneSearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {phoneSearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : phoneSearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {phoneSearchAttempted ? '검색 결과가 없습니다.' : '전화번호를 입력해 검색하세요.'}
                </div>
              ) : (
                phoneSearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectPhone(item)}
                  >
                    <p className="font-medium">{formatPhone(item.phone ?? '') || '전화번호 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.companyName || '업체명 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
