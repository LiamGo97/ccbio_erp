export interface CustomerOperation {
  operation: string; // 'COMPANY' | 'BEEF' | 'DAIRY'
  operationSub?: string | null; // 'INTEGRATED' | 'BREEDING' | 'FATTENING' | 'RAISING' | 'MILKING' | 'DRY_MILKING' | null
  herdSize?: number | null;
}

