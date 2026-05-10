'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateCustomer,
  useUpdateCustomer,
  CreateCustomerDto,
  UpdateCustomerDto,
} from '@/lib/hooks/use-customers';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useRegions } from '@/lib/hooks/use-regions';
import { useCities } from '@/lib/hooks/use-cities';
import { Loader2, X, MapPin, Save, Plus, Folder, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { useIsMobile } from '@/hooks/use-mobile';
import { resolveDefaultAddressKind } from '@/lib/customer-default-address-kind';
import { isBusinessMemberType, isNonBusinessMemberType } from '@/lib/is-business-member-type';
import { useUsers } from '@/lib/hooks/use-users';
import type { Customer } from '@/lib/hooks/use-customers';
import type { CustomerOperation } from '@/lib/hooks/customer-operation.dto';
import { useGoogleDriveFileMetadata, type GoogleDriveFile } from '@/lib/hooks/use-google-drive';
import { GoogleDriveFilePicker } from '@/components/google-drive/google-drive-file-picker';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import type { DaumPostcodeData } from '@/types/daum-postcode';

export interface CustomerFormData {
  region?: string;
  postalCode?: string;
  address?: string;
  addressRoad?: string;
  addressJibun?: string;
  addressDefaultType?: string;
  legalBCode?: string;
  addressDetail?: string;
  city?: string;
  companyName?: string;
  ceo?: string;
  phone?: string;
  customerType?: string;
  memberType?: string;
  businessRegistrationNumber?: string;
  businessCertGoogleDriveFileId?: string;
  businessCertFileName?: string;
  residentRegistrationNumber?: string;
  farmManagementCertGoogleDriveFileId?: string;
  farmManagementCertFileName?: string;
  refundBankName?: string;
  refundAccountNumber?: string;
  refundDepositor?: string;
  /** 담당자 us_id, Select는 문자열, 미선택 `__none__` */
  salesManagerUserId?: string;
  mallUserId?: string;
  species?: string;
  operation?: string;
  herdSize?: string;
  feeding?: string;
  livestockTypes?: string;
  operationMethod?: string;
  feedingMethod?: string;
  livestockCount?: string;
  chamchamStatus?: string;
  chamcharmMemberStatus?: string;
  eventSmsResponded?: boolean;
  remarks?: string;
}

export interface CustomerFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  mode: 'create' | 'edit';
  onCancel?: () => void;
}

type LocalOperationRow = {
  id: string;
  operation: string;
  operationSub: string | null;
  herdSize: number | null;
};

const LIVESTOCK_TYPE_OPTIONS = [
  { value: 'HANWOO', label: '한우' },
  { value: 'NAKWOO', label: '낙우' },
  { value: 'YUKWOO', label: '육우' },
  { value: 'ETC', label: '기타' },
] as const;

const OPERATION_METHOD_OPTIONS = [
  { value: 'BREEDING', label: '번식' },
  { value: 'FATTENING', label: '비육' },
  { value: 'RAISING', label: '육성' },
  { value: 'BATCH', label: '일괄' },
  { value: 'MILKING', label: '착유' },
] as const;

const FEEDING_METHOD_OPTIONS = [
  { value: 'SELF_MIX', label: '자가배합(배합기)' },
  { value: 'DIRECT', label: '직접급여' },
  { value: 'TMF', label: 'TMF' },
] as const;

function FormField({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <div className="text-xs font-normal text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function CustomerFormDrawer({
  open,
  onOpenChange,
  customer,
  mode,
  onCancel,
}: CustomerFormDrawerProps) {
  const isMobile = useIsMobile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
  } = useForm<CustomerFormData>({
    defaultValues: {
      region: '',
      postalCode: '',
      address: '',
      addressRoad: '',
      addressJibun: '',
      addressDefaultType: '',
      legalBCode: '',
      addressDetail: '',
      city: '',
      companyName: '',
      ceo: '',
      phone: '',
      customerType: 'FARM',
      memberType: '__none__',
      businessRegistrationNumber: '',
      businessCertGoogleDriveFileId: '',
      businessCertFileName: '',
      residentRegistrationNumber: '',
      farmManagementCertGoogleDriveFileId: '',
      farmManagementCertFileName: '',
      refundBankName: '',
      refundAccountNumber: '',
      refundDepositor: '',
      salesManagerUserId: '__none__',
      mallUserId: '',
      species: '',
      operation: '',
      herdSize: '',
      feeding: '',
      livestockTypes: '',
      operationMethod: '',
      feedingMethod: '',
      livestockCount: '',
      chamchamStatus: '',
      chamcharmMemberStatus: '',
      eventSmsResponded: false,
      remarks: '',
    },
  });

  const createCustomerMutation = useCreateCustomer();
  const updateCustomerMutation = useUpdateCustomer();
  const [isClient, setIsClient] = React.useState(false);
  const [addressModalOpen, setAddressModalOpen] = React.useState(false);
  const addressContentRef = React.useRef<HTMLDivElement | null>(null);
  const [businessCertFile, setBusinessCertFile] = React.useState<GoogleDriveFile | null>(null);
  const [businessCertPickerOpen, setBusinessCertPickerOpen] = React.useState(false);
  const [businessCertPreviewOpen, setBusinessCertPreviewOpen] = React.useState(false);
  const [farmCertFile, setFarmCertFile] = React.useState<GoogleDriveFile | null>(null);
  const [farmCertPickerOpen, setFarmCertPickerOpen] = React.useState(false);
  const [farmCertPreviewOpen, setFarmCertPreviewOpen] = React.useState(false);

  const shouldFetchBusinessCertMetadata = open && mode === 'edit' && !!customer?.businessCertGoogleDriveFileId;
  const { data: existingBusinessCertMetadata } = useGoogleDriveFileMetadata(
    customer?.businessCertGoogleDriveFileId || null,
    shouldFetchBusinessCertMetadata,
  );

  const shouldFetchFarmCertMetadata = open && mode === 'edit' && !!customer?.farmManagementCertGoogleDriveFileId;
  const { data: existingFarmCertMetadata } = useGoogleDriveFileMetadata(
    customer?.farmManagementCertGoogleDriveFileId || null,
    shouldFetchFarmCertMetadata,
  );

  const { data: regions } = useRegions();
  const watchedRegion = watch('region');
  const selectedRegion =
    watchedRegion && String(watchedRegion).trim() !== '' ? watchedRegion : '__none__';
  const selectedRegionId = React.useMemo(() => {
    const name = watchedRegion?.trim();
    if (name && regions?.length) {
      const hit = regions.find((r) => r.name === name);
      if (hit != null) return hit.id;
    }
    if (mode === 'edit' && customer?.regionId != null) {
      const id = Number(customer.regionId);
      if (!Number.isNaN(id)) return id;
    }
    return undefined;
  }, [watchedRegion, regions, mode, customer?.regionId, customer?.id]);
  const { data: cities } = useCities(selectedRegionId);
  const watchedCity = watch('city');
  const watchedPostalCode = watch('postalCode');

  React.useEffect(() => {
    if (!open || mode !== 'edit' || customer?.regionId == null || !regions?.length) return;
    const cur = getValues('region')?.trim();
    if (cur) return;
    const r = regions.find((x) => x.id === Number(customer.regionId));
    if (r?.name) setValue('region', r.name, { shouldDirty: false });
  }, [open, mode, customer?.id, customer?.regionId, regions, getValues, setValue]);

  React.useEffect(() => {
    if (!open || mode !== 'edit' || customer?.cityId == null || !cities?.length) return;
    const cur = getValues('city')?.trim();
    if (cur) return;
    const c = cities.find((x) => x.id === Number(customer.cityId));
    if (c?.name) setValue('city', c.name, { shouldDirty: false });
  }, [open, mode, customer?.id, customer?.cityId, cities, getValues, setValue]);

  const { data: speciesCodes } = useCodesByCategory('SPECIES');
  const { data: operationCodes } = useCodesByCategory('OPERATION_TYPE');
  const { data: operationSubCodes } = useCodesByCategory('OPERATION_SUBTYPE');
  const { data: feedingCodes } = useCodesByCategory('FEEDING_METHOD');
  const { data: chamchamCodes } = useCodesByCategory('CHAMCHAM_STATUS');
  const { data: chamcharmMemberCodes } = useCodesByCategory('CHAMCHARM_MEMBER_STATUS');
  const { data: customerTypeCodes } = useCodesByCategory('CUSTOMER_TYPE');
  const { data: memberTypeCodes } = useCodesByCategory('MEMBER_TYPE');
  const { data: usersData } = useUsers({
    limit: 1000,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
    roleCode: 'ROLE_SALES',
  });
  const salesUsers = React.useMemo(() => {
    const list = usersData?.data ?? [];
    return [...list].sort((a, b) => {
      const an = (a.name || a.email || '').toLowerCase();
      const bn = (b.name || b.email || '').toLowerCase();
      return an.localeCompare(bn, 'ko');
    });
  }, [usersData]);

  const [operations, setOperations] = React.useState<LocalOperationRow[]>([
    { id: '1', operation: '', operationSub: null, herdSize: null },
  ]);
  const [pendingCityName, setPendingCityName] = React.useState<string | null>(null);

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'SELECT' ||
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
      target.tagName === 'SELECT' ||
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
      e.preventDefault();
      if (businessCertPreviewOpen) {
        setBusinessCertPreviewOpen(false);
        return;
      }
      if (farmCertPreviewOpen) {
        setFarmCertPreviewOpen(false);
        return;
      }
      if (businessCertPickerOpen) {
        setBusinessCertPickerOpen(false);
        return;
      }
      if (farmCertPickerOpen) {
        setFarmCertPickerOpen(false);
        return;
      }
      if (addressModalOpen) {
        setAddressModalOpen(false);
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, businessCertPreviewOpen, businessCertPickerOpen, farmCertPreviewOpen, farmCertPickerOpen, addressModalOpen, onOpenChange]);

  const formatPhone = React.useCallback((input: string) => {
    if (!input) return '';
    const digits = input.replace(/[^0-9]/g, '');
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }, []);

  const formatResidentId = React.useCallback((input: string) => {
    const d = input.replace(/[^0-9]/g, '');
    if (d.length <= 6) return d;
    return `${d.slice(0, 6)}-${d.slice(6, 13)}`;
  }, []);

  const resolveCustomerTypeValue = React.useCallback(
    (raw?: string | null) => {
      if (!raw) return 'FARM';
      const codes = customerTypeCodes ?? [];
      const byName = codes.find((c) => (c.name ?? '').trim() === raw.trim());
      const byValue = codes.find((c) => (c.value ?? '').trim() === raw.trim());
      if (byName?.value) return byName.value;
      if (byValue?.value) return byValue.value;
      return raw;
    },
    [customerTypeCodes],
  );

  const resolveMemberTypeValue = React.useCallback(
    (raw?: string | null) => {
      if (!raw) return '__none__';
      const codes = memberTypeCodes ?? [];
      const byName = codes.find((c) => (c.name ?? '').trim() === raw.trim());
      const byValue = codes.find((c) => (c.value ?? '').trim() === raw.trim());
      if (byName?.value) return byName.value;
      if (byValue?.value) return byValue.value;
      if (raw === 'NON_BUSINESS' || raw === 'BUSINESS') return raw;
      return '__none__';
    },
    [memberTypeCodes],
  );

  const operationOptions = React.useMemo(() => {
    return (operationCodes ?? [])
      .map((c) => ({
        value: c.value ?? c.name ?? '',
        label: c.name ?? c.value ?? '',
      }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [operationCodes]);

  const operationSubOptions = React.useMemo(() => {
    return (operationSubCodes ?? [])
      .map((c) => ({
        value: c.value ?? c.name ?? '',
        label: c.name ?? c.value ?? '',
      }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [operationSubCodes]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && customer) {
      reset({
        region:
          customer.region?.trim() ||
          customer.legalSidoName?.trim() ||
          '',
        postalCode: customer.postalCode || '',
        address: customer.address?.trim() || '',
        addressRoad: customer.addressRoad || '',
        addressJibun: customer.addressJibun || '',
        addressDefaultType: customer.addressDefaultType || '',
        legalBCode: customer.legalBCode?.trim().replace(/\s/g, '') || '',
        addressDetail: customer.addressDetail || '',
        city: customer.city?.trim() || customer.legalSigunguName?.trim() || '',
        companyName: customer.companyName || '',
        ceo: customer.ceo || '',
        phone: formatPhone(customer.phone || ''),
        customerType: resolveCustomerTypeValue(customer.customerType),
        memberType: resolveMemberTypeValue(customer.memberType),
        businessRegistrationNumber: isBusinessMemberType(resolveMemberTypeValue(customer.memberType))
          ? customer.businessRegistrationNumber?.trim() || ''
          : '',
        businessCertGoogleDriveFileId: customer.businessCertGoogleDriveFileId?.trim() || '',
        businessCertFileName: customer.businessCertFileName?.trim() || '',
        residentRegistrationNumber: customer.residentRegistrationNumber?.trim() || '',
        farmManagementCertGoogleDriveFileId: customer.farmManagementCertGoogleDriveFileId?.trim() || '',
        farmManagementCertFileName: customer.farmManagementCertFileName?.trim() || '',
        refundBankName: customer.refundBankName?.trim() || '',
        refundAccountNumber: customer.refundAccountNumber?.trim() || '',
        refundDepositor: customer.refundDepositor?.trim() || '',
        salesManagerUserId:
          customer.salesManagerUserId != null
            ? String(customer.salesManagerUserId)
            : '__none__',
        mallUserId: customer.mallUserId?.toString().trim() || '',
        species: customer.species || undefined,
        operation: customer.operation || undefined,
        herdSize: customer.herdSize || undefined,
        feeding: customer.feeding || undefined,
        livestockTypes: customer.livestockTypes || '',
        operationMethod: customer.operationMethod || '',
        feedingMethod: customer.feedingMethod || '',
        livestockCount:
          customer.livestockCount !== undefined && customer.livestockCount !== null
            ? String(customer.livestockCount)
            : '',
        chamchamStatus: customer.chamchamStatus || '',
        chamcharmMemberStatus: customer.chamcharmMemberStatus || '',
        eventSmsResponded: customer.eventSmsResponded === true,
        remarks: customer.remarks?.trim() || '',
      });
      if (customer.operations && customer.operations.length > 0) {
        const operationNameToValue = new Map(operationOptions.map((opt) => [opt.label, opt.value]));
        const operationSubNameToValue = new Map(
          operationSubOptions.map((opt) => [opt.label, opt.value]),
        );
        setOperations(
          customer.operations.map((op, index) => ({
            id: `operation-${index}`,
            operation: operationNameToValue.get(op.operation || '') || op.operation || '',
            operationSub: op.operationSub
              ? operationSubNameToValue.get(op.operationSub) || op.operationSub
              : null,
            herdSize: op.herdSize ?? null,
          })),
        );
      } else if (customer.operation) {
        setOperations([
          {
            id: '1',
            operation: customer.operation ?? '',
            operationSub: null,
            herdSize: customer.herdSize ? parseInt(customer.herdSize, 10) || null : null,
          },
        ]);
      } else {
        setOperations([{ id: '1', operation: '', operationSub: null, herdSize: null }]);
      }

      // 사업자등록증 파일 표시 (저장된 fileId → 메타데이터 우선, 없으면 fileName으로 fallback)
      const rawCertId = customer.businessCertGoogleDriveFileId?.trim() || '';
      if (rawCertId && existingBusinessCertMetadata) {
        setBusinessCertFile(existingBusinessCertMetadata);
      } else if (rawCertId) {
        const fallbackName = customer.businessCertFileName?.trim() || rawCertId;
        setBusinessCertFile({ id: rawCertId, name: fallbackName, mimeType: '' } as GoogleDriveFile);
      } else {
        setBusinessCertFile(null);
      }

      const rawFarmId = customer.farmManagementCertGoogleDriveFileId?.trim() || '';
      if (rawFarmId && existingFarmCertMetadata) {
        setFarmCertFile(existingFarmCertMetadata);
      } else if (rawFarmId) {
        const fallbackName = customer.farmManagementCertFileName?.trim() || rawFarmId;
        setFarmCertFile({ id: rawFarmId, name: fallbackName, mimeType: '' } as GoogleDriveFile);
      } else {
        setFarmCertFile(null);
      }
    } else {
      reset({
        region: '',
        postalCode: '',
        address: '',
        addressRoad: '',
        addressJibun: '',
        addressDefaultType: '',
        legalBCode: '',
        addressDetail: '',
        city: '',
        companyName: '',
        ceo: '',
        phone: '',
        customerType: 'FARM',
        memberType: '__none__',
        businessRegistrationNumber: '',
        businessCertGoogleDriveFileId: '',
        businessCertFileName: '',
        residentRegistrationNumber: '',
        farmManagementCertGoogleDriveFileId: '',
        farmManagementCertFileName: '',
        refundBankName: '',
        refundAccountNumber: '',
        refundDepositor: '',
        salesManagerUserId: '__none__',
        mallUserId: '',
        species: undefined,
        operation: undefined,
        herdSize: undefined,
        feeding: undefined,
        livestockTypes: '',
        operationMethod: '',
        feedingMethod: '',
        livestockCount: '',
        chamchamStatus: '',
        chamcharmMemberStatus: '',
        eventSmsResponded: false,
        remarks: '',
      });
      setOperations([{ id: '1', operation: '', operationSub: null, herdSize: null }]);
      setBusinessCertFile(null);
      setFarmCertFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    mode,
    customer?.id,
    existingBusinessCertMetadata,
    existingFarmCertMetadata,
    formatPhone,
    resolveCustomerTypeValue,
    resolveMemberTypeValue,
    reset,
  ]);

  React.useEffect(() => {
    if (!pendingCityName) {
      return;
    }
    if (!cities || cities.length === 0) {
      return;
    }
    const matched = cities.find((c) => c.name === pendingCityName);
    if (matched) {
      setValue('city', matched.name, { shouldDirty: true, shouldValidate: true });
      setPendingCityName(null);
    }
  }, [pendingCityName, cities, setValue]);

  const addOperation = React.useCallback(() => {
    setOperations((prev) => [
      ...prev,
      { id: Date.now().toString(), operation: '', operationSub: null, herdSize: null },
    ]);
  }, []);

  const removeOperation = React.useCallback((id: string) => {
    setOperations((prev) => (prev.length > 1 ? prev.filter((op) => op.id !== id) : prev));
  }, []);

  const updateOperation = React.useCallback(
    (id: string, field: 'operation' | 'operationSub' | 'herdSize', value: string | number | null) => {
      setOperations((prev) =>
        prev.map((op) => {
          if (op.id !== id) return op;
          if (field === 'herdSize') {
            return {
              ...op,
              herdSize:
                value === '' || value === null
                  ? null
                  : typeof value === 'number'
                    ? value
                    : parseInt(String(value), 10) || null,
            };
          }
          if (field === 'operationSub') {
            return {
              ...op,
              operationSub: value === '__none__' || value === '' ? null : String(value),
            };
          }
          return { ...op, operation: String(value), operationSub: null };
        }),
      );
    },
    [],
  );

  const onSubmit = async (data: CustomerFormData) => {
    setIsSubmitting(true);
    try {
      const validOperations: CustomerOperation[] = operations
        .filter((op) => op.operation)
        .map((op) => ({
          operation: op.operation,
          operationSub: op.operationSub || null,
          herdSize: op.herdSize ?? null,
        }));
      const memberTypeRaw = data.memberType;
      const memberTypeEmpty = !memberTypeRaw || memberTypeRaw === '__none__';
      const submitData: CreateCustomerDto | UpdateCustomerDto = {
        ...data,
        address:
          mode === 'edit'
            ? (data.address ?? '').trim()
            : data.address?.trim() || undefined,
        addressRoad: data.addressRoad?.trim() || undefined,
        addressJibun: data.addressJibun?.trim() || undefined,
        addressDefaultType: (() => {
          const explicit = data.addressDefaultType?.trim();
          if (explicit) return explicit;
          const inferred = resolveDefaultAddressKind({
            address: data.address,
            addressRoad: data.addressRoad,
            addressJibun: data.addressJibun,
            addressDefaultType: '',
          } as Customer);
          if (inferred) return inferred;
          return mode === 'edit' ? '' : undefined;
        })(),
        memberType: memberTypeEmpty ? (mode === 'edit' ? '' : undefined) : memberTypeRaw,
        businessRegistrationNumber:
          memberTypeRaw === 'BUSINESS'
            ? data.businessRegistrationNumber?.trim() || (mode === 'edit' ? '' : undefined)
            : mode === 'edit'
              ? ''
              : undefined,
        businessCertGoogleDriveFileId:
          memberTypeRaw === 'BUSINESS'
            ? businessCertFile?.id || data.businessCertGoogleDriveFileId?.trim() || (mode === 'edit' ? '' : undefined)
            : mode === 'edit'
              ? ''
              : undefined,
        businessCertFileName:
          memberTypeRaw === 'BUSINESS'
            ? businessCertFile?.name || data.businessCertFileName?.trim() || (mode === 'edit' ? '' : undefined)
            : mode === 'edit'
              ? ''
              : undefined,
        mallUserId: data.mallUserId?.trim() || (mode === 'edit' ? '' : undefined),
        livestockTypes: data.livestockTypes?.trim() || (mode === 'edit' ? '' : undefined),
        operationMethod: data.operationMethod?.trim() || (mode === 'edit' ? '' : undefined),
        feedingMethod: data.feedingMethod?.trim() || (mode === 'edit' ? '' : undefined),
        livestockCount:
          data.livestockCount && data.livestockCount.trim() !== ''
            ? Number(data.livestockCount)
            : mode === 'edit'
              ? null
              : undefined,
        legalBCode:
          data.legalBCode?.trim().replace(/\s/g, '') || (mode === 'edit' ? '' : undefined),
        remarks: data.remarks?.trim() || (mode === 'edit' ? '' : undefined),
        chamcharmMemberStatus:
          mode === 'edit'
            ? data.chamcharmMemberStatus?.trim()
              ? data.chamcharmMemberStatus.trim()
              : ''
            : data.chamcharmMemberStatus?.trim() || undefined,
        operations: validOperations.length > 0 ? validOperations : undefined,
        residentRegistrationNumber: data.residentRegistrationNumber?.trim() || (mode === 'edit' ? '' : undefined),
        farmManagementCertGoogleDriveFileId:
          farmCertFile?.id || data.farmManagementCertGoogleDriveFileId?.trim() || (mode === 'edit' ? '' : undefined),
        farmManagementCertFileName:
          farmCertFile?.name || data.farmManagementCertFileName?.trim() || (mode === 'edit' ? '' : undefined),
        refundBankName: data.refundBankName?.trim() || (mode === 'edit' ? '' : undefined),
        refundAccountNumber: data.refundAccountNumber?.trim() || (mode === 'edit' ? '' : undefined),
        refundDepositor: data.refundDepositor?.trim() || (mode === 'edit' ? '' : undefined),
        salesManagerUserId: (() => {
          const v = data.salesManagerUserId;
          if (!v || v === '__none__') {
            return mode === 'edit' ? null : undefined;
          }
          const n = parseInt(String(v), 10);
          if (!Number.isFinite(n) || n < 1) {
            return mode === 'edit' ? null : undefined;
          }
          return n;
        })(),
      };
      if (mode === 'create') {
        await createCustomerMutation.mutateAsync(submitData as CreateCustomerDto);
        toast({
          title: '고객이 추가되었습니다.',
          description: `${data.companyName || data.ceo || data.phone} 고객 정보를 등록했습니다.`,
        });
      } else if (customer) {
        await updateCustomerMutation.mutateAsync({
          id: customer.id,
          data: submitData as UpdateCustomerDto,
        });
        toast({
          title: '고객 정보가 수정되었습니다.',
          description: `${data.companyName || data.ceo || customer.companyName || customer.ceo || '고객'} 정보를 업데이트했습니다.`,
        });
      }
      onOpenChange(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const message =
        err?.response?.data?.message ?? err?.message ?? '고객 정보를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: '고객 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const memberTypeWatch = watch('memberType');
  const showBusinessRegistrationField = isBusinessMemberType(memberTypeWatch);
  const showNonBusinessIdentityField = isNonBusinessMemberType(memberTypeWatch);

  React.useEffect(() => {
    if (!showBusinessRegistrationField) {
      setBusinessCertFile(null);
      setBusinessCertPickerOpen(false);
      setBusinessCertPreviewOpen(false);
    }
  }, [showBusinessRegistrationField]);

  const selectedSpecies = watch('species') || '__none__';
  const selectedFeeding = watch('feeding') || '__none__';
  const selectedChamchamStatus = watch('chamchamStatus') || '__none__';
  const selectedChamcharmMemberStatus = watch('chamcharmMemberStatus') || '__none__';
  const watchedLivestockTypes = watch('livestockTypes');
  const selectedLivestockTypes = React.useMemo(
    () =>
      String(watchedLivestockTypes || '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    [watchedLivestockTypes],
  );
  const watchedOperationMethods = watch('operationMethod');
  const selectedOperationMethods = React.useMemo(
    () =>
      String(watchedOperationMethods || '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    [watchedOperationMethods],
  );
  const selectedFeedingMethod = watch('feedingMethod') || '__none__';
  const addrForKind = watch('address');
  const addrRoadK = watch('addressRoad');
  const addrJibunK = watch('addressJibun');
  const addrDefTypeK = watch('addressDefaultType');
  /** 쇼핑몰과 동일: 도로명/지번 중 기본 주소. 명시값 없으면 주소 조합으로 추론 */
  const defaultAddrKind = React.useMemo(
    () =>
      resolveDefaultAddressKind({
        address: addrForKind,
        addressRoad: addrRoadK,
        addressJibun: addrJibunK,
        addressDefaultType: addrDefTypeK,
      } as Customer),
    [addrForKind, addrRoadK, addrJibunK, addrDefTypeK],
  );
  const roadTrim = (addrRoadK || '').trim();
  const jibunTrim = (addrJibunK || '').trim();

  React.useEffect(() => {
    if (!open) return;
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => {
      const existingScript = document.querySelector(
        'script[src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"]',
      );
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, [open]);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  const closeAddressSearch = React.useCallback(() => {
    setAddressModalOpen(false);
  }, []);

  const handleAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }
    const contentElement = addressContentRef.current;
    if (!contentElement) {
      toast({
        title: '오류',
        description: '주소 검색 UI를 불러올 수 없습니다.',
        className: 'border border-red-300 text-red-600',
      });
      return;
    }
    contentElement.innerHTML = '';
    const Postcode = window.daum.Postcode;
    new Postcode({
      oncomplete: (data: DaumPostcodeData) => {
        let roadLine = (data.roadAddress || '').trim();
        let extraAddress = '';
        if (data.userSelectedType === 'R') {
          if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
            extraAddress += data.bname;
          }
          if (data.buildingName !== '' && data.apartment === 'Y') {
            extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
          }
          if (extraAddress !== '') {
            extraAddress = ' (' + extraAddress + ')';
          }
        }
        if (roadLine) {
          roadLine = roadLine + extraAddress;
        }
        const jibunLine = (data.jibunAddress || '').trim();
        const bcode = (data.bcode ?? '').replace(/\D/g, '').slice(0, 10);
        const legacyOneLine = jibunLine || roadLine;
        setValue('postalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
        setValue('legalBCode', bcode, { shouldDirty: true, shouldValidate: true });
        setValue('address', legacyOneLine, { shouldDirty: true, shouldValidate: true });
        setValue('addressRoad', roadLine, { shouldDirty: true, shouldValidate: true });
        setValue('addressJibun', jibunLine, { shouldDirty: true, shouldValidate: true });
        setValue('addressDefaultType', data.userSelectedType === 'R' ? 'ROAD' : 'JIBUN', {
          shouldDirty: true,
          shouldValidate: true,
        });
        if (data.sido && regions) {
          const matchedRegion = regions.find((r) => r.name === data.sido);
          if (matchedRegion) {
            setValue('region', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
          } else {
            setValue('region', data.sido, { shouldDirty: true, shouldValidate: true });
          }
        }
        if (data.sigungu) {
          setPendingCityName(data.sigungu);
          const regionId = regions?.find((r) => r.name === data.sido)?.id;
          if (regionId && cities) {
            const matchedCity = cities.find((c) => c.name === data.sigungu);
            if (matchedCity) {
              setValue('city', matchedCity.name, { shouldDirty: true, shouldValidate: true });
              setPendingCityName(null);
            } else {
              setValue('city', data.sigungu, { shouldDirty: true, shouldValidate: true });
            }
          } else {
            setValue('city', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
          }
        }
        closeAddressSearch();
      },
      width: '100%',
      height: '100%',
    }).embed(contentElement);
    setAddressModalOpen(true);
  }, [setValue, closeAddressSearch, regions, cities]);

  const toggleLivestockType = React.useCallback(
    (code: string, checked: boolean) => {
      const current = String(getValues('livestockTypes') || '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const next = checked ? Array.from(new Set([...current, code])) : current.filter((v) => v !== code);
      setValue('livestockTypes', next.join(','), { shouldDirty: true, shouldValidate: true });
    },
    [getValues, setValue],
  );

  const toggleOperationMethod = React.useCallback(
    (code: string, checked: boolean) => {
      const current = String(getValues('operationMethod') || '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const next = checked ? Array.from(new Set([...current, code])) : current.filter((v) => v !== code);
      setValue('operationMethod', next.join(','), { shouldDirty: true, shouldValidate: true });
    },
    [getValues, setValue],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="flex h-full flex-col"
        style={{
          width: isMobile ? '100%' : '800px',
          maxWidth: '96vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="shrink-0 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>{mode === 'create' ? '고객 추가' : '고객 수정'}</DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 고객을 추가합니다. 상세 화면과 동일한 항목 순서·배치입니다.'
                  : '고객 정보를 수정합니다. 상세 화면과 동일한 항목 순서·배치입니다.'}
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-2">
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex min-h-0 flex-1 flex-col"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            onDoubleClick={handleDoubleClick}
          >
            <div className="min-h-0 w-full flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-6 p-6 pt-4">
                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">기본 정보</h3>
                      <p className="text-xs text-muted-foreground">
                        업체 및 연락처 관련 기본 정보를 입력합니다.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                      <FormField label="고객 구분">
                        <Select
                          value={watch('customerType') || 'FARM'}
                          onValueChange={(value) => setValue('customerType', value, { shouldDirty: true })}
                        >
                          <SelectTrigger className="h-9 w-full text-sm">
                            <SelectValue placeholder="농가/유통" />
                          </SelectTrigger>
                          <SelectContent>
                            {(customerTypeCodes ?? []).map((code) => (
                              <SelectItem key={code.id} value={code.value ?? code.name ?? ''}>
                                {code.name ?? code.value ?? ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="업체명(상호)">
                        <Input id="companyName" className="text-sm" {...register('companyName')} />
                      </FormField>
                      <FormField label="대표자">
                        <Input id="ceo" className="text-sm" {...register('ceo')} />
                      </FormField>
                      <FormField label="연락처">
                        <Input
                          id="phone"
                          className="text-sm"
                          placeholder="010-1234-5678"
                          {...register('phone', {
                            onChange: (e) => {
                              const formatted = formatPhone(e.target.value);
                              setValue('phone', formatted, { shouldDirty: true, shouldValidate: true });
                            },
                          })}
                        />
                      </FormField>
                      <FormField label="구 참참회원 여부">
                        <Select
                          value={selectedChamchamStatus || '__none__'}
                          onValueChange={(value) =>
                            setValue('chamchamStatus', (value === '__none__' ? undefined : value) as never, {
                              shouldDirty: true,
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-full text-sm">
                            <SelectValue placeholder="구 참참회원 여부" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {chamchamCodes?.map((code) => (
                              <SelectItem key={code.id} value={code.name}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="신규 참참회원 여부">
                        <Select
                          value={selectedChamcharmMemberStatus || '__none__'}
                          onValueChange={(value) =>
                            setValue(
                              'chamcharmMemberStatus',
                              (value === '__none__' ? undefined : value) as never,
                              { shouldDirty: true },
                            )
                          }
                        >
                          <SelectTrigger className="h-9 w-full text-sm">
                            <SelectValue placeholder="신규 참참회원 여부" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {(chamcharmMemberCodes ?? []).map((code) => (
                              <SelectItem key={code.id} value={code.name}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="회원 구분">
                        <Select
                          value={watch('memberType') || '__none__'}
                          onValueChange={(value) => {
                            const next = value === '__none__' ? undefined : value;
                            setValue('memberType', next, { shouldDirty: true });
                            if (!isNonBusinessMemberType(next)) {
                              setValue('residentRegistrationNumber', '', { shouldDirty: true });
                            }
                            if (next !== 'BUSINESS') {
                              setValue('businessRegistrationNumber', '', { shouldDirty: true });
                              setValue('businessCertGoogleDriveFileId', '', { shouldDirty: true });
                              setValue('businessCertFileName', '', { shouldDirty: true });
                              setBusinessCertFile(null);
                            }
                          }}
                        >
                          <SelectTrigger id="memberType" className="h-9 w-full text-sm">
                            <SelectValue placeholder="비사업자 / 사업자" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {(memberTypeCodes ?? []).map((code) => (
                              <SelectItem key={code.id} value={code.value ?? code.name ?? ''}>
                                {code.name ?? code.value ?? ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="영업 담당자">
                        <Select
                          value={watch('salesManagerUserId') || '__none__'}
                          onValueChange={(v) =>
                            setValue('salesManagerUserId', v === '__none__' ? '__none__' : v, { shouldDirty: true })
                          }
                        >
                          <SelectTrigger className="h-9 w-full text-sm" id="salesManagerUserId">
                            <SelectValue placeholder="담당자 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {salesUsers.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>
                                {u.name?.trim() || u.email}
                                {u.name?.trim() && u.email ? ` · ${u.email}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>
                  </section>

                  <Separator />

                  {showNonBusinessIdentityField ? (
                    <>
                      <section className="space-y-2.5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">비사업자 본인 확인</h3>
                          <p className="text-xs text-muted-foreground">비사업자인 경우 주민등록번호를 등록합니다.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                          <FormField label="주민등록번호" className="md:col-span-2">
                            <Input
                              id="residentRegistrationNumber"
                              className="font-mono text-sm tracking-tight"
                              placeholder="13자리 (하이픈 자동)"
                              maxLength={14}
                              autoComplete="off"
                              inputMode="numeric"
                              {...register('residentRegistrationNumber', {
                                onChange: (e) => {
                                  const formatted = formatResidentId(e.target.value);
                                  setValue('residentRegistrationNumber', formatted, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                },
                              })}
                            />
                          </FormField>
                        </div>
                      </section>
                      <Separator />
                    </>
                  ) : null}

                  {showBusinessRegistrationField ? (
                    <>
                      <section className="space-y-2.5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">사업자 정보</h3>
                          <p className="text-xs text-muted-foreground">
                            사업자등록번호와 사업자등록증 파일을 확인합니다.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                          <FormField label="사업자등록번호">
                            <Input
                              id="businessRegistrationNumber"
                              className="font-mono text-sm tracking-tight"
                              placeholder="예: 123-45-67890"
                              {...register('businessRegistrationNumber')}
                            />
                          </FormField>
                          <div className="sm:col-span-2 md:col-span-3">
                            <FormField label="사업자등록증 파일 (Google Drive)">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setBusinessCertPickerOpen(true)}
                                  disabled={isSubmitting}
                                  className="flex-1 min-w-0 justify-start"
                                >
                                  <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">
                                    {businessCertFile ? businessCertFile.name : '파일 선택'}
                                  </span>
                                </Button>
                                {businessCertFile ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => setBusinessCertPreviewOpen(true)}
                                      disabled={isSubmitting}
                                      title="미리보기"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => {
                                        setBusinessCertFile(null);
                                        setValue('businessCertGoogleDriveFileId', '', { shouldDirty: true });
                                        setValue('businessCertFileName', '', { shouldDirty: true });
                                      }}
                                      disabled={isSubmitting}
                                      title="선택 해제"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                              {businessCertFile ? (
                                <p className="text-xs text-muted-foreground mt-1 truncate" title={businessCertFile.name}>
                                  선택된 파일: {businessCertFile.name}
                                </p>
                              ) : null}
                            </FormField>
                          </div>
                        </div>
                      </section>

                      <Separator />
                    </>
                  ) : null}

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">농업경영체등록증</h3>
                      <p className="text-xs text-muted-foreground">
                        사업자·비사업자 구분과 관계없이 구글 드라이브에서 등록증 파일을 연결합니다.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                      <div className="md:col-span-2 sm:col-span-2">
                        <FormField label="파일 (Google Drive)">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setFarmCertPickerOpen(true)}
                              disabled={isSubmitting}
                              className="flex-1 min-w-0 justify-start"
                            >
                              <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {farmCertFile ? farmCertFile.name : '파일 선택'}
                              </span>
                            </Button>
                            {farmCertFile ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => setFarmCertPreviewOpen(true)}
                                  disabled={isSubmitting}
                                  title="미리보기"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    setFarmCertFile(null);
                                    setValue('farmManagementCertGoogleDriveFileId', '', { shouldDirty: true });
                                    setValue('farmManagementCertFileName', '', { shouldDirty: true });
                                  }}
                                  disabled={isSubmitting}
                                  title="선택 해제"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                          {farmCertFile ? (
                            <p
                              className="text-xs text-muted-foreground mt-1 truncate"
                              title={farmCertFile.name}
                            >
                              선택된 파일: {farmCertFile.name}
                            </p>
                          ) : null}
                        </FormField>
                      </div>
                    </div>
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">환불 계좌</h3>
                      <p className="text-xs text-muted-foreground">환불 시 입금받을 계좌를 등록합니다.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                      <FormField label="은행">
                        <Input
                          id="refundBankName"
                          className="text-sm"
                          placeholder="예: 국민은행"
                          autoComplete="off"
                          {...register('refundBankName')}
                        />
                      </FormField>
                      <FormField label="계좌번호" className="md:col-span-2">
                        <Input
                          id="refundAccountNumber"
                          className="font-mono text-sm tracking-tight"
                          placeholder="계좌번호"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={32}
                          {...register('refundAccountNumber')}
                        />
                      </FormField>
                      <FormField label="예금주">
                        <Input
                          id="refundDepositor"
                          className="text-sm"
                          placeholder="이름"
                          autoComplete="off"
                          {...register('refundDepositor')}
                        />
                      </FormField>
                    </div>
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">농장/축산 정보</h3>
                      <p className="text-xs text-muted-foreground">
                        축종/운영방식/급여방식/두수 정보를 입력합니다.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <FormField label="축종">
                        <div className="flex flex-wrap items-center gap-4 min-h-9">
                          {LIVESTOCK_TYPE_OPTIONS.map((opt) => (
                            <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={selectedLivestockTypes.includes(opt.value)}
                                onCheckedChange={(v) => toggleLivestockType(opt.value, v === true)}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </FormField>
                      <FormField label="운영방식">
                        <div className="flex flex-wrap items-center gap-4 min-h-9">
                          {OPERATION_METHOD_OPTIONS.map((opt) => (
                            <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={selectedOperationMethods.includes(opt.value)}
                                onCheckedChange={(v) => toggleOperationMethod(opt.value, v === true)}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </FormField>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                        <FormField label="급여방식">
                          <Select
                            value={selectedFeedingMethod}
                            onValueChange={(value) =>
                              setValue('feedingMethod', value === '__none__' ? '' : value, {
                                shouldDirty: true,
                                shouldValidate: true,
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-full text-sm">
                              <SelectValue placeholder="급여방식 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                              {FEEDING_METHOD_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                        <FormField label="두수">
                          <Input
                            id="livestockCount"
                            type="number"
                            min={0}
                            className="text-sm"
                            placeholder="예: 88"
                            {...register('livestockCount')}
                          />
                        </FormField>
                      </div>
                    </div>
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">주소 정보 (신규)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        우편번호·법정동코드·도로명·지번·상세주소입니다. 도로명·지번 중{' '}
                        <span className="text-foreground/90">기본</span>으로 쓸 주소를 선택할 수 있습니다.{' '}
                        지역·주소는 아래 「기존 주소」에서 입력합니다.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                        <FormField label="우편번호">
                          <div className="flex gap-2">
                            <Input
                              id="postalCode"
                              className="cursor-pointer bg-muted text-sm"
                              placeholder="우편번호"
                              readOnly
                              {...register('postalCode')}
                              onClick={handleAddressSearch}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 shrink-0"
                              title="주소검색"
                              onClick={handleAddressSearch}
                            >
                              <MapPin className="h-4 w-4" />
                            </Button>
                          </div>
                        </FormField>
                        <FormField label="법정동코드">
                          <Input
                            id="legalBCode"
                            className="font-mono text-sm tracking-tight"
                            placeholder="10자리"
                            maxLength={10}
                            {...register('legalBCode')}
                          />
                        </FormField>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="도로명 주소" className="min-w-0">
                          <div
                            className={cn(
                              'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                              'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                            )}
                          >
                            <Input
                              id="addressRoad"
                              className={cn(
                                'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                                'focus-visible:ring-0',
                              )}
                              placeholder="주소검색 시 입력됩니다"
                              readOnly
                              {...register('addressRoad')}
                              onClick={handleAddressSearch}
                            />
                            <label
                              className={cn(
                                'flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-l border-border bg-muted/60 px-2.5 text-xs text-foreground sm:px-3 sm:text-sm',
                                !roadTrim && 'pointer-events-none cursor-not-allowed opacity-50',
                              )}
                            >
                              <input
                                type="radio"
                                name="customerAddressDefaultKind"
                                className="h-3.5 w-3.5 shrink-0 accent-primary sm:h-4 sm:w-4"
                                checked={defaultAddrKind === 'ROAD'}
                                disabled={!roadTrim}
                                onChange={() =>
                                  setValue('addressDefaultType', 'ROAD', {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                              />
                              기본
                            </label>
                          </div>
                        </FormField>
                        <FormField label="지번 주소" className="min-w-0">
                          <div
                            className={cn(
                              'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                              'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                            )}
                          >
                            <Input
                              id="addressJibun"
                              className={cn(
                                'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                                'focus-visible:ring-0',
                              )}
                              placeholder="주소검색 시 입력됩니다"
                              readOnly
                              {...register('addressJibun')}
                              onClick={handleAddressSearch}
                            />
                            <label
                              className={cn(
                                'flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-l border-border bg-muted/60 px-2.5 text-xs text-foreground sm:px-3 sm:text-sm',
                                !jibunTrim && 'pointer-events-none cursor-not-allowed opacity-50',
                              )}
                            >
                              <input
                                type="radio"
                                name="customerAddressDefaultKind"
                                className="h-3.5 w-3.5 shrink-0 accent-primary sm:h-4 sm:w-4"
                                checked={defaultAddrKind === 'JIBUN'}
                                disabled={!jibunTrim}
                                onChange={() =>
                                  setValue('addressDefaultType', 'JIBUN', {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                              />
                              기본
                            </label>
                          </div>
                        </FormField>
                        <div className="md:col-span-2">
                          <FormField label="상세주소">
                            <Input
                              id="addressDetail"
                              className="text-sm"
                              placeholder="상세주소"
                              {...register('addressDetail')}
                            />
                          </FormField>
                        </div>
                      </div>
                    </div>
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">비고</h3>
                      <p className="text-xs text-muted-foreground">
                        담당자·내부 공유용 메모입니다. 목록 검색에도 포함됩니다.
                      </p>
                    </div>
                    <Textarea
                      className="min-h-[100px] text-sm"
                      placeholder="비고를 입력하세요"
                      rows={5}
                      {...register('remarks')}
                    />
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">추가 정보</h3>
                      <p className="text-xs text-muted-foreground">
                        이벤트 응답 및 축종/사료형태 정보를 입력합니다.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                      <FormField label="이벤트 SMS 응답">
                        <div className="flex h-9 items-center gap-2 pt-0.5">
                          <Checkbox
                            id="eventSmsResponded"
                            checked={watch('eventSmsResponded')}
                            onCheckedChange={(v) =>
                              setValue('eventSmsResponded', v === true, { shouldDirty: true })
                            }
                          />
                          <Label htmlFor="eventSmsResponded" className="cursor-pointer text-sm font-normal">
                            참여 고객
                          </Label>
                        </div>
                      </FormField>
                      <FormField label="축종">
                        <Select
                          value={selectedSpecies}
                          onValueChange={(value) =>
                            setValue('species', (value === '__none__' ? undefined : value) as never, {
                              shouldDirty: true,
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-full text-sm">
                            <SelectValue placeholder="축종을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {speciesCodes?.map((code) => (
                              <SelectItem key={code.id} value={code.name}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField label="사료형태">
                        <Select
                          value={selectedFeeding}
                          onValueChange={(value) =>
                            setValue('feeding', (value === '__none__' ? undefined : value) as never, {
                              shouldDirty: true,
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-full text-sm">
                            <SelectValue placeholder="급여방식을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안함</SelectItem>
                            {feedingCodes?.map((code) => (
                              <SelectItem key={code.id} value={code.name}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">운영형태</h3>
                        <p className="text-xs text-muted-foreground">
                          주요 운영방식과 세부 유형, 사육두수 정보를 입력합니다.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={addOperation}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        추가
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {operations.map((op) => (
                        <div
                          key={op.id}
                          className="relative space-y-3 rounded-lg border bg-card/40 p-3"
                        >
                          {operations.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-2 top-2 h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => removeOperation(op.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                            <FormField label="운영방식">
                              <Select
                                value={op.operation || '__none__'}
                                onValueChange={(v) =>
                                  updateOperation(op.id, 'operation', v === '__none__' ? '' : v)
                                }
                              >
                                <SelectTrigger className="h-9 w-full text-sm">
                                  <SelectValue placeholder="선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {operationOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormField>
                            <FormField label="세부 유형">
                              <Select
                                value={op.operationSub || '__none__'}
                                onValueChange={(v) =>
                                  updateOperation(op.id, 'operationSub', v === '__none__' ? null : v)
                                }
                                disabled={!op.operation || op.operation === 'COMPANY'}
                              >
                                <SelectTrigger className="h-9 w-full text-sm">
                                  <SelectValue
                                    placeholder={op.operation === 'COMPANY' ? '세부 유형 없음' : '선택하세요'}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">선택 안함</SelectItem>
                                  {operationSubOptions
                                    .filter((opt) => {
                                      if (op.operation === 'BEEF') {
                                        return ['INTEGRATED', 'BREEDING', 'FATTENING', 'RAISING'].includes(opt.value);
                                      }
                                      if (op.operation === 'DAIRY') {
                                        return ['MILKING', 'DRY_MILKING'].includes(opt.value);
                                      }
                                      return false;
                                    })
                                    .map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </FormField>
                            <FormField label="사육두수">
                              <Input
                                type="number"
                                className="text-sm"
                                placeholder="사육두수"
                                value={op.herdSize ?? ''}
                                onChange={(e) =>
                                  updateOperation(
                                    op.id,
                                    'herdSize',
                                    e.target.value ? parseInt(e.target.value, 10) : null,
                                  )
                                }
                              />
                            </FormField>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <Separator />

                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">기존 주소 (레거시)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        전환 전 시스템·연동용 지역과 주소입니다. 상세주소는 위 「주소 정보 (신규)」의
                        상세주소와 동일 필드이므로 한 곳에서만 수정하면 됩니다.
                      </p>
                    </div>
                    <div className="space-y-3 rounded-md border border-amber-500/35 bg-muted/30 p-3">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                        <FormField label="지역">
                          <Select
                            value={selectedRegion}
                            onValueChange={(value) => {
                              setValue('region', (value === '__none__' ? undefined : value) as never, {
                                shouldDirty: true,
                              });
                              if (value === '__none__') {
                                setValue('city', undefined as never, { shouldDirty: true });
                                setPendingCityName(null);
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 w-full text-sm">
                              <SelectValue placeholder="지역" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                              {selectedRegion !== '__none__' &&
                                regions?.length &&
                                !regions.some((r) => r.name === selectedRegion) && (
                                  <SelectItem value={selectedRegion}>{selectedRegion} (등록값)</SelectItem>
                                )}
                              {regions?.map((region) => (
                                <SelectItem key={region.id} value={region.name}>
                                  {region.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                        <FormField label="시/군/구">
                          <Select
                            value={
                              watchedCity && String(watchedCity).trim() !== ''
                                ? watchedCity
                                : '__none__'
                            }
                            onValueChange={(value) =>
                              setValue('city', (value === '__none__' ? undefined : value) as never, {
                                shouldDirty: true,
                              })
                            }
                            disabled={selectedRegionId == null}
                          >
                            <SelectTrigger className="h-9 w-full text-sm">
                              <SelectValue
                                placeholder={
                                  selectedRegionId != null ? '시/군/구' : '지역 선택 후'
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">선택 안함</SelectItem>
                              {watchedCity?.trim() &&
                                cities?.length &&
                                !cities.some((c) => c.name === watchedCity) && (
                                  <SelectItem value={watchedCity}>{watchedCity} (등록값)</SelectItem>
                                )}
                              {cities?.map((city, index) => {
                                const cityKey =
                                  city?.id != null && city.id !== undefined
                                    ? `city-${city.id}`
                                    : `city-${selectedRegionId ?? 'all'}-${index}`;
                                return (
                                  <SelectItem key={cityKey} value={city.name}>
                                    {city.name}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </FormField>
                        <FormField label="우편번호" className="sm:col-span-2 md:col-span-2">
                          <div className="flex gap-2">
                            <Input
                              id="legacyPostalCode"
                              className="cursor-pointer bg-muted text-sm"
                              placeholder="우편번호"
                              readOnly
                              value={watchedPostalCode || ''}
                              onClick={handleAddressSearch}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 shrink-0"
                              title="주소검색"
                              onClick={handleAddressSearch}
                            >
                              <MapPin className="h-4 w-4" />
                            </Button>
                          </div>
                        </FormField>
                        <FormField label="기존 주소" className="sm:col-span-2 md:col-span-4">
                          <Input
                            id="legacyAddress"
                            className="text-sm"
                            placeholder="기존 시스템에서 쓰던 주소 한 줄"
                            {...register('address')}
                          />
                        </FormField>
                      </div>
                    </div>
                  </section>

                  {mode === 'edit' && customer ? (
                    <>
                      <Separator />
                      <section className="space-y-2.5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">기록</h3>
                          <p className="text-xs text-muted-foreground">
                            생성·수정일은 시스템 관리에 참고하세요.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                          <FormField label="생성일">
                            <p className="text-sm font-medium text-foreground break-all">
                              {customer.createdAt ? new Date(customer.createdAt).toLocaleString() : '-'}
                            </p>
                          </FormField>
                          <FormField label="최종 수정일">
                            <p className="text-sm font-medium text-foreground break-all">
                              {customer.updatedAt ? new Date(customer.updatedAt).toLocaleString() : '-'}
                            </p>
                          </FormField>
                        </div>
                      </section>
                    </>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DrawerFooter className="shrink-0 border-t border-border">
            <div className="flex w-full justify-end gap-2">
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onCancel?.();
                  }}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" />
                    {mode === 'create' ? '추가' : '수정'}
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
        <GoogleDriveFilePicker
          open={businessCertPickerOpen}
          onOpenChange={setBusinessCertPickerOpen}
          onSelect={(file) => {
            setBusinessCertFile(file);
            setValue('businessCertGoogleDriveFileId', file.id || '', { shouldDirty: true });
            setValue('businessCertFileName', file.name || '', { shouldDirty: true });
          }}
          acceptMimeTypes={[
            'application/pdf',
            'image/*',
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ]}
          title="사업자등록증 파일 선택"
          description="구글 드라이브에서 사업자등록증 파일을 선택하세요."
        />
        <GoogleDriveFilePreview
          open={businessCertPreviewOpen}
          onOpenChange={setBusinessCertPreviewOpen}
          file={businessCertFile}
        />
        <GoogleDriveFilePicker
          open={farmCertPickerOpen}
          onOpenChange={setFarmCertPickerOpen}
          onSelect={(file) => {
            setFarmCertFile(file);
            setValue('farmManagementCertGoogleDriveFileId', file.id || '', { shouldDirty: true });
            setValue('farmManagementCertFileName', file.name || '', { shouldDirty: true });
          }}
          acceptMimeTypes={[
            'application/pdf',
            'image/*',
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ]}
          title="농업경영체등록증 파일 선택"
          description="구글 드라이브에서 농업경영체등록증 파일을 선택하세요."
        />
        <GoogleDriveFilePreview
          open={farmCertPreviewOpen}
          onOpenChange={setFarmCertPreviewOpen}
          file={farmCertFile}
        />
        {isClient &&
          createPortal(
            <div
              style={{
                pointerEvents: addressModalOpen ? 'auto' : 'none',
                opacity: addressModalOpen ? 1 : 0,
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 11000,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                transition: 'opacity 0.15s ease-in-out',
              }}
              onClick={closeAddressSearch}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '500px',
                  height: '600px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '20px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">주소 검색</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={closeAddressSearch}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div ref={addressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
              </div>
            </div>,
            document.body,
          )}
      </DrawerContent>
    </Drawer>
  );
}
