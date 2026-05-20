/** 기사별 운송 목록 API — 운송 건 요약 */
export class DriverDeliverySummaryDto {
  id!: string;
  orderNumber?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverContact?: string | null;
  transportFee?: number | null;
  status?: string | null;
  /** 상차 항목 기준 타입 (CARGO,CONTAINER 등 콤마 구분, 혼합 시 둘 다) */
  loadingContainerTypes?: string | null;
  unloadingAddressDetail?: string | null;
  sales?: {
    unloadingAddressRoad?: string | null;
    unloadingAddressJibun?: string | null;
    unloadingAddress?: string | null;
    unloadingAddressDetail?: string | null;
  } | null;
}

export class DriverDeliveryGroupDto {
  key!: string;
  vehicleNumber!: string;
  driverName!: string;
  driverContact!: string;
  label!: string;
  deliveryCount!: number;
  transportFeeSum!: number;
  deliveries!: DriverDeliverySummaryDto[];
}

export class DriverDeliveryGroupsResponseDto {
  groups!: DriverDeliveryGroupDto[];
  totalDeliveries!: number;
  totalDrivers!: number;
}
