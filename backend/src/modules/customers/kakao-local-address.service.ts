import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const KAKAO_ADDRESS_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/address.json';

/** 카카오 주소 검색 documents[].address (지번 상세) */
export type KakaoJibunAddress = {
  address_name?: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
  region_3depth_name?: string;
  region_3depth_h_name?: string;
  h_code?: string;
  b_code?: string;
};

export type KakaoAddressSearchDoc = {
  address_name?: string;
  address_type?: string;
  address?: KakaoJibunAddress;
  road_address?: {
    address_name?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
  };
};

@Injectable()
export class KakaoLocalAddressService {
  private readonly logger = new Logger(KakaoLocalAddressService.name);

  constructor(private readonly config: ConfigService) {}

  getRestApiKey(): string | undefined {
    const v = this.config.get<string>('KAKAO_REST_API_KEY');
    return v?.trim() || undefined;
  }

  /**
   * 카카오 로컬 주소 검색 (도로명·지번은 응답 documents[].road_address / address)
   */
  async searchAddress(query: string, size = 10): Promise<{
    documents: KakaoAddressSearchDoc[];
    meta?: { total_count?: number; pageable_count?: number; is_end?: boolean };
  }> {
    const key = this.getRestApiKey();
    if (!key) {
      throw new Error('KAKAO_REST_API_KEY is not configured');
    }
    const q = query.trim();
    if (!q) {
      throw new Error('search query is empty');
    }

    const { status, data } = await axios.get(KAKAO_ADDRESS_SEARCH_URL, {
      params: { query: q, size },
      headers: { Authorization: `KakaoAK ${key}` },
      timeout: 15000,
      validateStatus: () => true,
    });

    if (status !== 200) {
      this.logger.warn(`Kakao address API HTTP ${status}: ${JSON.stringify(data).slice(0, 300)}`);
      throw new Error(`Kakao address API failed with status ${status}`);
    }

    if (!data || !Array.isArray(data.documents)) {
      throw new Error('Kakao address API: unexpected response shape');
    }

    return {
      documents: data.documents as KakaoAddressSearchDoc[],
      meta: data.meta,
    };
  }
}
