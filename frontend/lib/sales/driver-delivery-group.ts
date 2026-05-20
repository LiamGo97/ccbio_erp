import type { DriverDeliverySummary, SalesDelivery } from '@/lib/hooks/use-sales-delivery';
import { salesUnloadingMainLine } from '@/lib/sales-unloading-display';

export const UNASSIGNED_DRIVER_KEY = '__UNASSIGNED__';

export interface DriverDeliveryGroup {
  key: string;
  vehicleNumber: string;
  driverName: string;
  driverContact: string;
  label: string;
  deliveryCount: number;
  transportFeeSum: number;
  deliveries: SalesDelivery[];
}

function normalizePart(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizePhone(value?: string | null): string {
  return (value ?? '').replace(/[^0-9]/g, '');
}

/** 차량번호·기사명·연락처 조합으로 그룹 키 생성 */
export function buildDriverGroupKey(delivery: SalesDelivery): string {
  const vehicle = normalizePart(delivery.vehicleNumber);
  const name = normalizePart(delivery.driverName);
  const phone = normalizePhone(delivery.driverContact);
  if (!vehicle && !name && !phone) return UNASSIGNED_DRIVER_KEY;
  return `${vehicle}|${name}|${phone}`;
}

/** 차량번호·기사명·연락처 중 하나라도 있으면 true (미입력 건 제외용) */
export function hasDriverDispatchInfo(delivery: SalesDelivery): boolean {
  return buildDriverGroupKey(delivery) !== UNASSIGNED_DRIVER_KEY;
}

export function buildDriverGroupLabel(
  vehicleNumber: string,
  driverName: string,
  driverContact: string,
): string {
  if (!vehicleNumber && !driverName && !driverContact) return '미입력';
  const parts = [vehicleNumber, driverName, driverContact].filter(Boolean);
  return parts.join(' · ');
}

export type DriverDeliveryAddressSlice = {
  unloadingAddressDetail?: string | null;
  sales?: {
    unloadingAddressRoad?: string | null;
    unloadingAddressJibun?: string | null;
    unloadingAddress?: string | null;
    unloadingAddressDetail?: string | null;
  } | null;
};

export type LoadingContainerTypeFilter = 'CARGO' | 'CONTAINER';

function normalizeContainerTypeToken(raw: string): LoadingContainerTypeFilter | null {
  const upper = raw.trim().toUpperCase();
  if (upper === 'CARGO' || upper === '카고') return 'CARGO';
  if (upper === 'CONTAINER' || upper === '컨테이너') return 'CONTAINER';
  return null;
}

/** 상차/판매 항목 타입 집계 문자열 → CARGO / CONTAINER 배열 (중복 제거) */
export function parseLoadingContainerTypes(types?: string | null): LoadingContainerTypeFilter[] {
  if (!types?.trim()) return [];
  const seen = new Set<LoadingContainerTypeFilter>();
  for (const part of types.split(',')) {
    const normalized = normalizeContainerTypeToken(part);
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

/**
 * 활성 필터가 없으면 전체.
 * 카고·컨테이너가 한 운송에 함께 있으면(loadingContainerTypes = "CARGO,CONTAINER")
 * 카고 필터·컨테이너 필터 각각에서 모두 표시됨 (OR).
 */
export function deliveryMatchesContainerTypeFilter(
  delivery: Pick<DriverDeliverySummary, 'loadingContainerTypes'>,
  activeFilters: ReadonlySet<LoadingContainerTypeFilter>,
): boolean {
  if (activeFilters.size === 0) return true;
  const types = parseLoadingContainerTypes(delivery.loadingContainerTypes);
  const effective: LoadingContainerTypeFilter[] =
    types.length > 0 ? types : ['CONTAINER'];
  return effective.some((t) => activeFilters.has(t));
}

/** 기사 그룹 내 모든 운송의 타입 합집합 */
export function getGroupContainerTypes(
  deliveries: Pick<DriverDeliverySummary, 'loadingContainerTypes'>[],
): LoadingContainerTypeFilter[] {
  const seen = new Set<LoadingContainerTypeFilter>();
  for (const d of deliveries) {
    for (const t of parseLoadingContainerTypes(d.loadingContainerTypes)) {
      seen.add(t);
    }
  }
  return seen.size > 0 ? [...seen] : ['CONTAINER'];
}

export function isMixedContainerTypeGroup(
  deliveries: Pick<DriverDeliverySummary, 'loadingContainerTypes'>[],
): boolean {
  const types = getGroupContainerTypes(deliveries);
  return types.includes('CARGO') && types.includes('CONTAINER');
}

/** 기사 목록 노출: 그룹 타입 중 필터와 겹치면 표시 (혼합 그룹은 카고/컨테이너 필터 모두 통과) */
export function groupMatchesContainerTypeFilter(
  deliveries: Pick<DriverDeliverySummary, 'loadingContainerTypes'>[],
  activeFilters: ReadonlySet<LoadingContainerTypeFilter>,
): boolean {
  if (activeFilters.size === 0) return true;
  const groupTypes = getGroupContainerTypes(deliveries);
  return groupTypes.some((t) => activeFilters.has(t));
}

export type DriverGroupWithDeliveries = {
  key: string;
  vehicleNumber: string;
  driverName: string;
  driverContact: string;
  label: string;
  deliveryCount: number;
  transportFeeSum: number;
  deliveries: DriverDeliverySummary[];
};

/**
 * 기사 그룹·운송 건 필터.
 * - 기사 목록: 그룹에 카고·컨테이너가 섞여 있으면 카고/컨테이너 필터 각각에 기사 표시.
 * - 혼합 그룹: 해당 기사의 운송 건 전체 유지 (한 건에 혼합 타입이어도 동일).
 * - 단일 타입 그룹: 선택한 타입 운송만 남김.
 */
export function filterDriverGroupsByContainerTypes<G extends DriverGroupWithDeliveries>(
  groups: G[],
  activeFilters: ReadonlySet<LoadingContainerTypeFilter>,
): G[] {
  if (activeFilters.size === 0) return groups;
  const result: G[] = [];
  for (const group of groups) {
    if (!groupMatchesContainerTypeFilter(group.deliveries, activeFilters)) continue;

    const mixedGroup = isMixedContainerTypeGroup(group.deliveries);
    const deliveries = mixedGroup
      ? group.deliveries
      : group.deliveries.filter((d) => deliveryMatchesContainerTypeFilter(d, activeFilters));

    if (deliveries.length === 0) continue;

    const transportFeeSum = deliveries.reduce((sum, item) => {
      const fee = item.transportFee != null ? Number(item.transportFee) : 0;
      return sum + (Number.isNaN(fee) ? 0 : fee);
    }, 0);
    result.push({
      ...group,
      deliveries,
      deliveryCount: deliveries.length,
      transportFeeSum,
    });
  }
  return result;
}

/** 상차 항목 타입 집계 문자열(CARGO,CONTAINER) → 화면 라벨 */
export function formatLoadingContainerTypes(types?: string | null): string {
  const parsed = parseLoadingContainerTypes(types);
  if (parsed.length === 0) return '-';
  const labels = parsed.map((t) => (t === 'CARGO' ? '카고' : '컨테이너'));
  return labels.join('·');
}

export function getUnloadingAddressLine(delivery: DriverDeliveryAddressSlice): string {
  const main = salesUnloadingMainLine(delivery.sales);
  const detail =
    delivery.sales?.unloadingAddressDetail?.trim() ||
    delivery.unloadingAddressDetail?.trim() ||
    '';
  return [main, detail].filter(Boolean).join(' ');
}

export function groupDeliveriesByDriver(deliveries: SalesDelivery[]): DriverDeliveryGroup[] {
  const map = new Map<string, SalesDelivery[]>();

  for (const d of deliveries) {
    const key = buildDriverGroupKey(d);
    const list = map.get(key) ?? [];
    list.push(d);
    map.set(key, list);
  }

  const groups: DriverDeliveryGroup[] = [];

  for (const [key, items] of map.entries()) {
    const first = items[0];
    const vehicleNumber = (first?.vehicleNumber ?? '').trim();
    const driverName = (first?.driverName ?? '').trim();
    const driverContact = (first?.driverContact ?? '').trim();
    const transportFeeSum = items.reduce((sum, item) => {
      const fee = item.transportFee != null ? Number(item.transportFee) : 0;
      return sum + (Number.isNaN(fee) ? 0 : fee);
    }, 0);

    groups.push({
      key,
      vehicleNumber,
      driverName,
      driverContact,
      label: buildDriverGroupLabel(vehicleNumber, driverName, driverContact),
      deliveryCount: items.length,
      transportFeeSum,
      deliveries: items,
    });
  }

  groups.sort((a, b) => {
    if (a.key === UNASSIGNED_DRIVER_KEY) return 1;
    if (b.key === UNASSIGNED_DRIVER_KEY) return -1;
    return a.label.localeCompare(b.label, 'ko');
  });

  return groups;
}
