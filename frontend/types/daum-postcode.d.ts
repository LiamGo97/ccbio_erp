/** Daum 우편번호 스크립트(https://postcode.map.daum.net/guide) 콜백 데이터 */
export interface DaumPostcodeData {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: 'R' | 'J';
  bname: string;
  buildingName: string;
  apartment: 'Y' | 'N';
  zonecode: string;
  /** 법정동 코드(최대 10자리) */
  bcode?: string;
  sido: string;
  sigungu: string;
}

export interface DaumPostcodeInstance {
  embed: (element: HTMLElement) => void;
}

export interface DaumPostcodeConfig {
  oncomplete: (data: DaumPostcodeData) => void;
  width: string;
  height: string;
  submitMode?: boolean;
}

export type DaumPostcodeConstructor = new (config: DaumPostcodeConfig) => DaumPostcodeInstance;

declare global {
  interface Window {
    daum?: {
      Postcode: DaumPostcodeConstructor;
    };
  }
}
