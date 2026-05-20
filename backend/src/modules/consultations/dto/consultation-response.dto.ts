export interface ConsultationResponse {
  id: string;
  customerId: string | null;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region: string | null;
  customerPostalCode: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  addressDetail: string | null;
  species: string | null;
  operation: string | null;
  herdSize: string | null;
  feeding: string | null;
  chamchamStatus: string | null;
  inquiryProduct: string | null;
  consultationDate: string | null;
  startedAt: string | null;
  endedAt: string | null;
  type: string | null;
  source: string | null;
  inOut: string | null;
  productName: string | null;
  grade: string | null;
  requestedWeight: string | null;
  deliveryRegion: string | null;
  deliveryPostalCode: string | null;
  deliveryAddress: string | null;
  deliveryAddressDetail: string | null;
  deliveryCity: string | null;
  proposedPrice: string | null;
  hasUnloading: boolean;
  hasHandling: boolean;
  notes: string | null;
  managerId: number | null;
  managerName: string | null;
  replyStatus: string | null;
  replyAssigneeId: number | null;
  replyAssigneeName: string | null;
  mainProduct: string | null;
  arrivalPrice: string | null;
  operations?: ConsultationCustomerOperation[];
  products?: ConsultationProductResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationCustomerOperation {
  operation: string;
  operationSub?: string | null;
  herdSize?: number | null;
}

export interface ConsultationCustomerQuickSearchResult {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region: string | null;
  customerPostalCode: string | null;
  customerAddress: string | null;
  customerAddressRoad?: string | null;
  customerAddressJibun?: string | null;
  customerLegalBCode?: string | null;
  customerAddressDefaultType?: string | null;
  customerCity: string | null;
  addressDetail: string | null;
  species: string | null;
  feeding: string | null;
  chamchamStatus: string | null;
  operations?: ConsultationCustomerOperation[];
}

export interface ConsultationProductResponse {
  id: number;
  productCategoryId: number | null;
  productName: string | null;
  grade: string | null;
  packingType: string | null;
  requestedWeight: string | null;
  requestedVehicle: string | null;
  order: number;
}

export interface ConsultationListResponse {
  data: ConsultationResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConsultationCustomerSnapshot {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region: string | null;
  customerPostalCode: string | null;
  customerAddress: string | null;
  customerAddressRoad?: string | null;
  customerAddressJibun?: string | null;
  customerLegalBCode?: string | null;
  customerAddressDefaultType?: string | null;
  customerCity: string | null;
  addressDetail: string | null;
  species: string | null;
  operation: string | null;
  herdSize: string | null;
  feeding: string | null;
  chamchamStatus: string | null;
  inquiryProduct: string | null;
  operations?: ConsultationCustomerOperation[];
}

export interface ConsultationLookupResponse {
  customer: ConsultationCustomerSnapshot | null;
  consultations: ConsultationResponse[];
}

