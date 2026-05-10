import { Injectable, UnauthorizedException, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';
import { WarehouseService } from '../warehouse/warehouse.service';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  private oauth2Clients = new Map<number, any>(); // 사용자별 OAuth2Client 캐시

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private warehouseService: WarehouseService,
  ) {}

  private handleGoogleApiError(userId: number, error: any, context: string) {
    const status = error?.response?.status ?? error?.code ?? error?.status;
    const errorMessage = error?.response?.data?.error?.message ?? error?.response?.data?.error ?? error?.message ?? 'Google API 요청 처리 중 오류가 발생했습니다.';
    const errorDetails = error?.response?.data?.error?.details?.[0]?.reason;

    this.logger.error(`[${context}] Google API 에러 - userId: ${userId}, status: ${status}, message: ${errorMessage}, details: ${errorDetails}`);

    if (status === 401 || errorMessage?.toString().includes('invalid authentication credentials')) {
      this.logger.warn(`[${context}] Google 인증 만료 또는 취소 - userId: ${userId}`);
      throw new UnauthorizedException('Google 인증이 만료되었습니다. 구글 로그인을 다시 진행해 주세요.');
    }

    if (status === 403) {
      this.logger.warn(`[${context}] Google 접근 권한 부족 - userId: ${userId}, reason: ${errorDetails}`);
      
      // Sheets API 관련 권한 오류인지 확인
      if (context === 'writeCustomersToSheet' || errorMessage?.toString().includes('sheets') || errorDetails === 'insufficientPermissions') {
        throw new ForbiddenException('Google Sheets API 접근 권한이 없습니다. 구글 로그인을 다시 진행하여 Sheets API 권한을 승인해 주세요.');
      }
      
      throw new ForbiddenException('Google 파일에 접근 권한이 없습니다. 파일 공유 설정을 확인하거나 구글 로그인을 다시 진행해 주세요.');
    }

    throw error;
  }

  /**
   * 사용자의 구글 드라이브 API 클라이언트 생성
   * 사용자별로 OAuth2Client를 생성하여 토큰 갱신 시 올바른 사용자 토큰이 업데이트되도록 함
   */
  private async getDriveClient(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 구글 토큰이 있는지 확인
    const userWithTokens = await this.usersService.findByIdWithTokens(userId);
    if (!userWithTokens?.googleAccessToken) {
      throw new UnauthorizedException('구글 드라이브 접근 권한이 없습니다. 구글 로그인을 다시 해주세요.');
    }

    // 리프레시 토큰이 없으면 토큰 갱신 불가능 - 액세스 토큰이 만료되면 사용 불가
    if (!userWithTokens.googleRefreshToken) {
      this.logger.warn(`[getDriveClient] 리프레시 토큰 없음 - userId: ${userId}, 토큰 갱신 불가`);
      // 액세스 토큰이 만료되었을 가능성이 높으므로 재로그인 필요
      throw new UnauthorizedException('Google Drive 인증이 만료되었습니다. 구글 로그인을 다시 진행해 주세요.');
    }

    // 사용자별 OAuth2Client가 이미 있으면 재사용
    let oauth2Client = this.oauth2Clients.get(userId);
    
    if (!oauth2Client) {
      // 새로운 OAuth2Client 생성
      oauth2Client = new google.auth.OAuth2(
        this.configService.get<string>('GOOGLE_CLIENT_ID'),
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
        this.configService.get<string>('GOOGLE_CALLBACK_URL'),
      );

      // 토큰 만료 시 자동 갱신 리스너 등록
      oauth2Client.on('tokens', async (tokens: any) => {
        if (tokens.access_token) {
          try {
            // 현재 사용자의 리프레시 토큰 가져오기
            const currentUserTokens = await this.usersService.findByIdWithTokens(userId);
            await this.usersService.updateGoogleTokens(userId, {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || currentUserTokens?.googleRefreshToken,
            });
            this.logger.log(`[getDriveClient] 토큰 자동 갱신 완료 - userId: ${userId}`);
          } catch (error) {
            this.logger.error(`[getDriveClient] 토큰 자동 갱신 실패 - userId: ${userId}`, error);
          }
        }
      });

      // 캐시에 저장
      this.oauth2Clients.set(userId, oauth2Client);
    }

    // OAuth2 클라이언트에 최신 토큰 설정
    // (토큰이 갱신되었을 수 있으므로 매번 최신 토큰으로 업데이트)
    oauth2Client.setCredentials({
      access_token: userWithTokens.googleAccessToken,
      refresh_token: userWithTokens.googleRefreshToken,
    });

    // 리프레시 토큰이 있으므로 토큰 갱신 시도
    // expiry_date가 없거나 만료된 경우 갱신 시도
    try {
      const credentials = oauth2Client.credentials;
      const shouldRefresh = !credentials.expiry_date || credentials.expiry_date <= Date.now();
      
      if (shouldRefresh) {
        this.logger.log(`[getDriveClient] 토큰 갱신 시도 - userId: ${userId}, expiry_date: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : '없음'}`);
        const tokenResponse = await oauth2Client.refreshAccessToken();
        this.logger.log(`[getDriveClient] 토큰 갱신 성공 - userId: ${userId}`);
        
        // 갱신된 토큰을 DB에 저장
        if (tokenResponse.credentials.access_token) {
        await this.usersService.updateGoogleTokens(userId, {
            accessToken: tokenResponse.credentials.access_token,
            refreshToken: tokenResponse.credentials.refresh_token || userWithTokens.googleRefreshToken,
        });
          this.logger.log(`[getDriveClient] 갱신된 토큰 DB 저장 완료 - userId: ${userId}`);
        }
      } else {
        this.logger.log(`[getDriveClient] 토큰 유효 - userId: ${userId}, 만료 시간: ${new Date(credentials.expiry_date).toISOString()}`);
      }
    } catch (refreshError: any) {
      this.logger.error(`[getDriveClient] 토큰 갱신 실패 - userId: ${userId}`, refreshError);
      // 리프레시 토큰이 만료되었거나 유효하지 않은 경우
      if (refreshError?.message?.includes('invalid_grant') || 
          refreshError?.message?.includes('invalid_token') ||
          refreshError?.code === 401) {
        throw new UnauthorizedException('Google Drive 인증이 만료되었습니다. 구글 로그인을 다시 진행해 주세요.');
      }
      // 다른 에러는 무시하고 계속 진행 (API 호출 시 자동 갱신 시도)
    }

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * 사용자의 구글 시트 API 클라이언트 생성
   */
  private async getSheetsClient(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 구글 토큰이 있는지 확인
    const userWithTokens = await this.usersService.findByIdWithTokens(userId);
    if (!userWithTokens?.googleAccessToken) {
      throw new UnauthorizedException('구글 시트 접근 권한이 없습니다. 구글 로그인을 다시 해주세요.');
    }

    // 리프레시 토큰이 없으면 토큰 갱신 불가능
    if (!userWithTokens.googleRefreshToken) {
      this.logger.warn(`[getSheetsClient] 리프레시 토큰 없음 - userId: ${userId}`);
      throw new UnauthorizedException('Google Sheets 인증이 만료되었습니다. 구글 로그인을 다시 진행해 주세요.');
    }

    // 사용자별 OAuth2Client가 이미 있으면 재사용
    let oauth2Client = this.oauth2Clients.get(userId);
    
    if (!oauth2Client) {
      oauth2Client = new google.auth.OAuth2(
        this.configService.get<string>('GOOGLE_CLIENT_ID'),
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
        this.configService.get<string>('GOOGLE_CALLBACK_URL'),
      );

      oauth2Client.on('tokens', async (tokens: any) => {
        if (tokens.access_token) {
          try {
            const currentUserTokens = await this.usersService.findByIdWithTokens(userId);
            await this.usersService.updateGoogleTokens(userId, {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || currentUserTokens?.googleRefreshToken,
            });
            this.logger.log(`[getSheetsClient] 토큰 자동 갱신 완료 - userId: ${userId}`);
          } catch (error) {
            this.logger.error(`[getSheetsClient] 토큰 자동 갱신 실패 - userId: ${userId}`, error);
          }
        }
      });

      this.oauth2Clients.set(userId, oauth2Client);
    }

    oauth2Client.setCredentials({
      access_token: userWithTokens.googleAccessToken,
      refresh_token: userWithTokens.googleRefreshToken,
    });

    // 토큰 갱신 시도
    try {
      const credentials = oauth2Client.credentials;
      const shouldRefresh = !credentials.expiry_date || credentials.expiry_date <= Date.now();
      
      if (shouldRefresh) {
        this.logger.log(`[getSheetsClient] 토큰 갱신 시도 - userId: ${userId}`);
        const tokenResponse = await oauth2Client.refreshAccessToken();
        this.logger.log(`[getSheetsClient] 토큰 갱신 성공 - userId: ${userId}`);
        
        if (tokenResponse.credentials.access_token) {
          await this.usersService.updateGoogleTokens(userId, {
            accessToken: tokenResponse.credentials.access_token,
            refreshToken: tokenResponse.credentials.refresh_token || userWithTokens.googleRefreshToken,
          });
          this.logger.log(`[getSheetsClient] 갱신된 토큰 DB 저장 완료 - userId: ${userId}`);
        }
      }
    } catch (refreshError: any) {
      this.logger.error(`[getSheetsClient] 토큰 갱신 실패 - userId: ${userId}`, refreshError);
      if (refreshError?.message?.includes('invalid_grant') || 
          refreshError?.message?.includes('invalid_token') ||
          refreshError?.code === 401) {
        throw new UnauthorizedException('Google Sheets 인증이 만료되었습니다. 구글 로그인을 다시 진행해 주세요.');
      }
    }

    return google.sheets({ version: 'v4', auth: oauth2Client });
  }

  /**
   * 공유 드라이브의 루트 폴더 ID 찾기 (캐시 지원)
   */
  private rootFolderCache = new Map<string, string[]>(); // driveId -> rootFolderIds[]

  private async findRootFolders(
    drive: any,
    driveId: string,
  ): Promise<string[]> {
    // 캐시 확인
    if (this.rootFolderCache.has(driveId)) {
      const cached = this.rootFolderCache.get(driveId)!;
      this.logger.log(`[findRootFolders] 캐시된 루트 폴더 ID 사용 - driveId: ${driveId}, rootFolderIds: ${JSON.stringify(cached)}`);
      return cached;
    }

    this.logger.log(`[findRootFolders] 루트 폴더 찾기 시작 - driveId: ${driveId}`);
    
    try {
      // 공유 드라이브의 모든 폴더를 조회
      let allFolders: any[] = [];
      let nextPageToken: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 10; // 최대 10페이지 (10000개 폴더)
      
      do {
        const foldersResponse = await drive.files.list({
          q: `mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'nextPageToken, files(id, name, parents)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          driveId: driveId,
          corpora: 'drive',
          pageSize: 1000,
          pageToken: nextPageToken,
        });
        
        const folders = foldersResponse.data.files || [];
        allFolders = allFolders.concat(folders);
        nextPageToken = foldersResponse.data.nextPageToken || undefined;
        pageCount++;
        
        this.logger.log(`[findRootFolders] 폴더 조회 페이지 ${pageCount}: ${folders.length}개 폴더 (누적: ${allFolders.length}개)`);
      } while (nextPageToken && pageCount < maxPages);
      
      this.logger.log(`[findRootFolders] 공유 드라이브의 모든 폴더 수: ${allFolders.length}`);
      
      // 모든 폴더의 ID 수집
      const allFolderIds = new Set(allFolders.map((f: any) => f.id));
      
      // 모든 폴더의 parents를 수집 (어떤 폴더가 다른 폴더의 자식인지 확인)
      const parentFolderIds = new Set<string>();
      allFolders.forEach((folder: any) => {
        if (folder.parents && Array.isArray(folder.parents)) {
          folder.parents.forEach((parentId: string) => {
            parentFolderIds.add(parentId);
          });
        }
      });
      
      // 다른 폴더의 parent로 나타나지 않는 폴더 = 루트 폴더
      const rootFolders = allFolders.filter((folder: any) => 
        !parentFolderIds.has(folder.id)
      );
      
      const rootFolderIds = rootFolders.map((f: any) => f.id);
      
      this.logger.log(`[findRootFolders] 루트 폴더 찾기 완료 - driveId: ${driveId}, 루트 폴더 수: ${rootFolderIds.length}, IDs: ${JSON.stringify(rootFolderIds.slice(0, 5))}...`);
      
      // 캐시에 저장
      if (rootFolderIds.length > 0) {
        this.rootFolderCache.set(driveId, rootFolderIds);
      }
      
      return rootFolderIds;
    } catch (error) {
      this.logger.error(`[findRootFolders] 루트 폴더 찾기 실패 - driveId: ${driveId}`, error);
      return [];
    }
  }

  /**
   * 파일 목록 조회 (파일과 폴더 모두 포함)
   */
  async listFiles(
    userId: number,
    query?: string,
    pageSize = 10,
    pageToken?: string,
    folderId?: string,
    driveId?: string,
  ) {
    this.logger.log(`[listFiles] 요청 시작 - userId: ${userId}, driveId: ${driveId || '내 드라이브'}, folderId: ${folderId || '루트'}, query: ${query || '없음'}, pageSize: ${pageSize}`);
    
    const drive = await this.getDriveClient(userId);

    const params: any = {
      pageSize,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, parents, driveId)',
      orderBy: 'folder,modifiedTime desc', // 폴더를 먼저 표시
      supportsAllDrives: true, // 공유 드라이브 지원
      includeItemsFromAllDrives: true, // 모든 드라이브의 항목 포함
    };

    // 공유 드라이브 지정
    if (driveId) {
      params.driveId = driveId;
      params.corpora = 'drive'; // 특정 드라이브만 조회
      this.logger.log(`[listFiles] 공유 드라이브 모드 - driveId: ${driveId}`);
    } else {
      params.corpora = 'user'; // 내 드라이브만 조회
      this.logger.log(`[listFiles] 내 드라이브 모드`);
    }

    // 쿼리 조건 구성
    let qConditions: string[] = [];
    
    // 검색 모드가 아닐 때: 현재 폴더의 직접적인 자식만 조회
    // 검색 모드일 때: 전체 드라이브에서 검색
    const isSearchMode = !!query;
    
    if (!isSearchMode) {
      // 검색 모드가 아닐 때: 현재 폴더의 직접적인 자식만 조회
      if (folderId) {
        // 특정 폴더의 직접 자식만
        qConditions.push(`'${folderId}' in parents`);
        this.logger.log(`[listFiles] 폴더의 직접 자식 조회 - folderId: ${folderId}`);
      } else {
        // 루트 폴더의 직접 자식만
        if (driveId) {
          // 공유 드라이브: 드라이브 ID를 루트 폴더 ID로 사용
          // Google Drive API 문서에 따르면, 공유 드라이브의 루트 폴더 ID는 드라이브 ID와 동일함
          qConditions.push(`'${driveId}' in parents`);
          this.logger.log(`[listFiles] 공유 드라이브 루트 조회 - driveId를 루트 폴더 ID로 사용: ${driveId}`);
        } else {
          // 내 드라이브: 'root' 사용
          qConditions.push(`'root' in parents`);
          this.logger.log(`[listFiles] 내 드라이브 루트 조회 - 'root' 사용`);
        }
      }
    } else {
      // 검색 모드: 전체 드라이브에서 검색 (parents 조건 없음)
      // driveId가 있으면 해당 드라이브만, 없으면 내 드라이브만
      this.logger.log(`[listFiles] 검색 모드 - 전체 드라이브에서 검색`);
    }

    // 검색 쿼리 추가
    if (query) {
      qConditions.push(`name contains '${query}'`);
    }

    // 휴지통에 있는 파일 제외
    qConditions.push(`trashed=false`);

    // 쿼리 조건이 반드시 있어야 함
    if (qConditions.length > 0) {
      params.q = qConditions.join(' and ');
      this.logger.log(`[listFiles] 쿼리 조건: ${params.q}`);
    } else {
      // 쿼리 조건이 없으면 전체 조회 (검색 모드에서만 발생 가능)
      this.logger.log(`[listFiles] 쿼리 조건 없음 (전체 조회 - 검색 모드)`);
    }

    if (pageToken) {
      params.pageToken = pageToken;
      this.logger.log(`[listFiles] 페이지 토큰 사용: ${pageToken.substring(0, Math.min(20, pageToken.length))}...`);
    }

    this.logger.log(`[listFiles] Google Drive API 호출 파라미터: ${JSON.stringify(params, null, 2)}`);

    let response;
    try {
      response = await drive.files.list(params);
    } catch (error: any) {
      // 401 에러 발생 시 토큰 갱신 후 재시도
      const status = error?.response?.status ?? error?.code;
      if (status === 401 || error?.message?.includes('invalid authentication credentials')) {
        this.logger.warn(`[listFiles] 401 에러 발생 - 토큰 갱신 후 재시도 - userId: ${userId}`);
        // OAuth2Client 캐시 제거하여 새로 생성
        this.oauth2Clients.delete(userId);
        try {
          // 새로운 클라이언트로 재시도 (리프레시 토큰이 없으면 여기서 에러 발생)
          const retryDrive = await this.getDriveClient(userId);
          response = await retryDrive.files.list(params);
          this.logger.log(`[listFiles] 재시도 성공 - userId: ${userId}`);
        } catch (retryError: any) {
          // UnauthorizedException이면 재시도 불가능 (리프레시 토큰 없음)
          if (retryError instanceof UnauthorizedException) {
            throw retryError;
          }
          // 다른 에러는 원래 에러를 던짐
          throw error;
        }
      } else {
        throw error;
      }
    }
    const files = response.data.files || [];
    
    // 파일과 폴더를 구분해서 로그
    const folders = files.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');
    const actualFiles = files.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');
    
    this.logger.log(`[listFiles] Google Drive API 응답 - 전체: ${files.length}개 (폴더: ${folders.length}개, 파일: ${actualFiles.length}개), nextPageToken: ${response.data.nextPageToken ? '있음' : '없음'}`);
    
    if (files.length > 0) {
      this.logger.log(`[listFiles] 응답 항목 목록 (최대 20개):`);
      files.slice(0, 20).forEach((file: any, index: number) => {
        const type = file.mimeType === 'application/vnd.google-apps.folder' ? '폴더' : '파일';
        this.logger.log(`  [${index + 1}] [${type}] id: ${file.id}, name: ${file.name}, mimeType: ${file.mimeType}, parents: ${JSON.stringify(file.parents || [])}`);
      });
      if (files.length > 20) {
        this.logger.log(`  ... 외 ${files.length - 20}개 더 있음`);
      }
    } else {
      this.logger.log(`[listFiles] 응답 항목 목록이 비어있습니다.`);
    }
    
    this.logger.log(`[listFiles] 최종 반환 - 전체: ${files.length}개 (폴더: ${folders.length}개, 파일: ${actualFiles.length}개)`);
    
    return {
      files,
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * 파일 메타데이터 조회
   */
  async getFileMetadata(userId: number, fileId: string) {
    this.logger.log(`[getFileMetadata] 파일 메타데이터 조회 시작 - userId: ${userId}, fileId: ${fileId}`);
    
    try {
      const drive = await this.getDriveClient(userId);
      
      const fileMetadataResponse = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, parents',
        supportsAllDrives: true,
      });
      
      const fileMetadata = fileMetadataResponse.data;
      this.logger.log(`[getFileMetadata] 파일 메타데이터 조회 완료 - id: ${fileMetadata.id}, name: ${fileMetadata.name}`);
      
      return fileMetadata;
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`[getFileMetadata] 파일 메타데이터 조회 실패 - userId: ${userId}, fileId: ${fileId}`, err);
      this.handleGoogleApiError(userId, error, 'getFileMetadata');
    }
  }

  /**
   * 파일 다운로드
   */
  async downloadFile(userId: number, fileId: string) {
    this.logger.log(`[downloadFile] 파일 다운로드 시작 - userId: ${userId}, fileId: ${fileId}`);
    
    try {
      const drive = await this.getDriveClient(userId);
      this.logger.log(`[downloadFile] Drive 클라이언트 생성 완료`);

      // 파일 메타데이터 조회
      this.logger.log(`[downloadFile] 파일 메타데이터 조회 시작 - fileId: ${fileId}`);
      const metadataStart = Date.now();
      
      const fileMetadataResponse = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size',
        supportsAllDrives: true, // 공유 드라이브 지원
      });
      
      const metadataDuration = Date.now() - metadataStart;
      const fileMetadata = fileMetadataResponse.data;
      this.logger.log(`[downloadFile] 파일 메타데이터 조회 완료 - ${metadataDuration}ms 소요`);
      this.logger.log(`[downloadFile] 파일 정보 - id: ${fileMetadata.id}, name: ${fileMetadata.name}, mimeType: ${fileMetadata.mimeType}, size: ${fileMetadata.size}`);

      // 파일 다운로드
      this.logger.log(`[downloadFile] 파일 스트림 다운로드 시작 - fileId: ${fileId}`);
      const streamStart = Date.now();
      
      const fileStreamResponse = await drive.files.get(
        { 
          fileId, 
          alt: 'media',
          supportsAllDrives: true, // 공유 드라이브 지원
        },
        { responseType: 'stream' },
      );
      
      const streamDuration = Date.now() - streamStart;
      this.logger.log(`[downloadFile] 파일 스트림 다운로드 완료 - ${streamDuration}ms 소요`);

      this.logger.log(`[downloadFile] 파일 다운로드 성공 - 총 소요 시간: ${Date.now() - metadataStart}ms`);
      
      return {
        metadata: fileMetadata,
        stream: fileStreamResponse.data,
      };
    } catch (error: any) {
      const err = error as Error;
      this.logger.error(`[downloadFile] 파일 다운로드 실패 - userId: ${userId}, fileId: ${fileId}`, err);
      this.logger.error(`[downloadFile] 에러 메시지: ${err.message}`);
      this.logger.error(`[downloadFile] 에러 스택: ${err.stack}`);
      
      // Google API 에러 상세 정보
      if (error.response) {
        this.logger.error(`[downloadFile] API 응답 상태: ${error.response.status}`);
        this.logger.error(`[downloadFile] API 응답 데이터: ${JSON.stringify(error.response.data)}`);
      }
      
      // 파일을 찾을 수 없는 경우
      if (err.message.includes('File not found') || err.message.includes('404')) {
        this.logger.error(`[downloadFile] 파일을 찾을 수 없습니다. 가능한 원인:`);
        this.logger.error(`[downloadFile] 1. 파일 ID가 잘못되었을 수 있습니다: ${fileId}`);
        this.logger.error(`[downloadFile] 2. 사용자(userId: ${userId})가 해당 파일에 접근 권한이 없을 수 있습니다.`);
        this.logger.error(`[downloadFile] 3. 파일이 삭제되었거나 이동되었을 수 있습니다.`);
        this.logger.error(`[downloadFile] 4. 공유 드라이브의 파일인 경우, 올바른 드라이브 컨텍스트가 필요할 수 있습니다.`);
        throw new NotFoundException(`파일을 찾을 수 없습니다: ${fileId}. 파일 ID를 확인하거나 접근 권한을 확인해주세요.`);
      }
      
      throw error;
    }
  }

  /**
   * 파일 업로드
   */
  async uploadFile(
    userId: number,
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    folderId?: string,
    driveId?: string,
  ) {
    const drive = await this.getDriveClient(userId);

    const fileMetadata: any = {
      name: fileName,
    };

    if (folderId) {
      fileMetadata.parents = [folderId];
    } else if (driveId) {
      // 공유 드라이브의 루트에 업로드
      fileMetadata.parents = [driveId];
    }

    const media = {
      mimeType,
      body: fileBuffer,
    };

    const params: any = {
      requestBody: fileMetadata,
      media,
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink',
      supportsAllDrives: true,
    };

    if (driveId) {
      params.driveId = driveId;
    }

    const response = await drive.files.create(params);
    return response.data;
  }

  /**
   * 파일 삭제
   */
  async deleteFile(userId: number, fileId: string) {
    const drive = await this.getDriveClient(userId);
    await drive.files.delete({ fileId });
    return { success: true };
  }

  /**
   * 폴더 생성
   */
  async createFolder(
    userId: number,
    folderName: string,
    parentFolderId?: string,
    driveId?: string,
  ) {
    const drive = await this.getDriveClient(userId);

    const fileMetadata: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    } else if (driveId) {
      // 공유 드라이브의 루트에 폴더 생성
      fileMetadata.parents = [driveId];
    }

    const params: any = {
      requestBody: fileMetadata,
      fields: 'id, name, mimeType, modifiedTime, webViewLink',
      supportsAllDrives: true,
    };

    if (driveId) {
      params.driveId = driveId;
    }

    try {
      const response = await drive.files.create(params);
      this.logger.log(`[createFolder] 폴더 생성 완료 - userId: ${userId}, folderName: ${folderName}, folderId: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.handleGoogleApiError(userId, error, 'createFolder');
      throw error;
    }
  }

  /**
   * 특정 폴더 내에서 폴더 찾기 (이름으로)
   */
  async findFolderByName(
    userId: number,
    folderName: string,
    parentFolderId?: string,
    driveId?: string,
  ) {
    const drive = await this.getDriveClient(userId);

    let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
    
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const params: any = {
      q: query,
      fields: 'files(id, name, modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };

    if (driveId) {
      params.driveId = driveId;
      params.corpora = 'drive';
    } else {
      params.corpora = 'user';
    }

    try {
      const response = await drive.files.list(params);
      const folders = response.data.files || [];
      
      if (folders.length > 0) {
        // 첫 번째 매칭 폴더 반환
        this.logger.log(`[findFolderByName] 폴더 찾음 - userId: ${userId}, folderName: ${folderName}, folderId: ${folders[0].id}`);
        return folders[0];
      }
      
      this.logger.log(`[findFolderByName] 폴더 없음 - userId: ${userId}, folderName: ${folderName}`);
      return null;
    } catch (error) {
      this.handleGoogleApiError(userId, error, 'findFolderByName');
      throw error;
    }
  }

  /**
   * 폴더 찾기 또는 생성 (상차업체별 폴더 관리용)
   */
  async findOrCreateCompanyFolder(
    userId: number,
    companyName: string,
    rootFolderId?: string,
    driveId?: string,
  ) {
    // 먼저 폴더 찾기
    const existingFolder = await this.findFolderByName(
      userId,
      companyName,
      rootFolderId,
      driveId,
    );

    if (existingFolder) {
      return existingFolder.id;
    }

    // 폴더가 없으면 생성
    const newFolder = await this.createFolder(
      userId,
      companyName,
      rootFolderId,
      driveId,
    );

    return newFolder.id;
  }

  /**
   * 상차업체별 폴더에 파일 업로드 (VehicleDispatch 전용)
   * 환경 변수로 설정된 루트 폴더 내에 상차업체별 폴더를 자동 생성/찾아서 업로드
   */
  async uploadFileForVehicleDispatch(
    userId: number,
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    warehouseId: number,
  ) {
    // 환경 변수에서 루트 폴더 ID 가져오기
    const rootFolderId = this.configService.get<string>('GOOGLE_DRIVE_VEHICLE_DISPATCH_ROOT_FOLDER_ID');
    const driveId = this.configService.get<string>('GOOGLE_DRIVE_VEHICLE_DISPATCH_DRIVE_ID');

    if (!rootFolderId && !driveId) {
      throw new NotFoundException('GOOGLE_DRIVE_VEHICLE_DISPATCH_ROOT_FOLDER_ID 또는 GOOGLE_DRIVE_VEHICLE_DISPATCH_DRIVE_ID 환경 변수가 설정되지 않았습니다.');
    }

    // 상차업체 정보 조회
    const warehouse = await this.warehouseService.findOne(warehouseId);
    if (!warehouse) {
      throw new NotFoundException(`상차업체를 찾을 수 없습니다. (ID: ${warehouseId})`);
    }

    // 상차업체별 폴더 찾기 또는 생성
    const companyFolderId = await this.findOrCreateCompanyFolder(
      userId,
      warehouse.name,
      rootFolderId || undefined,
      driveId || undefined,
    );

    // 파일 업로드
    return this.uploadFile(
      userId,
      fileName,
      mimeType,
      fileBuffer,
      companyFolderId,
      driveId || undefined,
    );
  }

  /**
   * 폴더 목록 조회
   */
  async listFolders(userId: number, driveId?: string) {
    const drive = await this.getDriveClient(userId);

    const params: any = {
      q: "mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };

    if (driveId) {
      params.driveId = driveId;
      params.corpora = 'drive';
    } else {
      params.corpora = 'user';
    }

    let response;
    try {
      response = await drive.files.list(params);
    } catch (error: any) {
      // 401 에러 발생 시 토큰 갱신 후 재시도
      const status = error?.response?.status ?? error?.code;
      if (status === 401 || error?.message?.includes('invalid authentication credentials')) {
        this.logger.warn(`[listFolders] 401 에러 발생 - 토큰 갱신 후 재시도 - userId: ${userId}`);
        // OAuth2Client 캐시 제거하여 새로 생성
        this.oauth2Clients.delete(userId);
        try {
          // 새로운 클라이언트로 재시도 (리프레시 토큰이 없으면 여기서 에러 발생)
          const retryDrive = await this.getDriveClient(userId);
          response = await retryDrive.files.list(params);
          this.logger.log(`[listFolders] 재시도 성공 - userId: ${userId}`);
        } catch (retryError: any) {
          // UnauthorizedException이면 재시도 불가능 (리프레시 토큰 없음)
          if (retryError instanceof UnauthorizedException) {
            throw retryError;
          }
          // 다른 에러는 원래 에러를 던짐
          throw error;
        }
      } else {
        throw error;
      }
    }
    return response.data.files || [];
  }

  /**
   * 공유 드라이브 목록 조회
   */
  async listSharedDrives(userId: number) {
    this.logger.log(`[listSharedDrives] 요청 시작 - userId: ${userId}`);
    const drive = await this.getDriveClient(userId);

    try {
      let response;
      try {
        response = await drive.drives.list({
          pageSize: 100,
        });
      } catch (error: any) {
        // 401 에러 발생 시 토큰 갱신 후 재시도
        const status = error?.response?.status ?? error?.code;
        if (status === 401 || error?.message?.includes('invalid authentication credentials')) {
          this.logger.warn(`[listSharedDrives] 401 에러 발생 - 토큰 갱신 후 재시도 - userId: ${userId}`);
          // OAuth2Client 캐시 제거하여 새로 생성
          this.oauth2Clients.delete(userId);
          try {
            // 새로운 클라이언트로 재시도 (리프레시 토큰이 없으면 여기서 에러 발생)
            const retryDrive = await this.getDriveClient(userId);
            response = await retryDrive.drives.list({
        pageSize: 100,
      });
            this.logger.log(`[listSharedDrives] 재시도 성공 - userId: ${userId}`);
          } catch (retryError: any) {
            // UnauthorizedException이면 재시도 불가능 (리프레시 토큰 없음)
            if (retryError instanceof UnauthorizedException) {
              throw retryError;
            }
            // 다른 에러는 원래 에러를 던짐
            throw error;
          }
        } else {
          throw error;
        }
      }

      const sharedDrives = (response.data.drives || []).map((drive) => ({
        id: drive.id,
        name: drive.name,
        type: 'shared' as const, // 공유 드라이브 타입 표시
      }));

      // 내 드라이브를 맨 앞에 추가
      const allDrives = [
        {
          id: 'my-drive', // 내 드라이브는 ID가 없으므로 특별한 값 사용
          name: '내 드라이브',
          type: 'my' as const, // 내 드라이브 타입 표시
        },
        ...sharedDrives,
      ];

      this.logger.log(`[listSharedDrives] 드라이브 목록 조회 완료 - 총 ${allDrives.length}개 (내 드라이브 1개 + 공유 드라이브 ${sharedDrives.length}개)`);
      if (sharedDrives.length > 0) {
        this.logger.log(`[listSharedDrives] 공유 드라이브 목록:`);
        sharedDrives.forEach((drive, index) => {
          this.logger.log(`  [${index + 1}] id: ${drive.id}, name: ${drive.name}`);
        });
      } else {
        this.logger.warn(`[listSharedDrives] ⚠️ 공유 드라이브가 없거나 접근 권한이 없습니다.`);
      }
      return allDrives;
    } catch (error) {
      this.logger.error(`[listSharedDrives] 공유 드라이브 목록 조회 실패:`, error);
      // 에러가 발생해도 내 드라이브는 항상 반환
      return [
        {
          id: 'my-drive',
          name: '내 드라이브',
          type: 'my' as const,
        },
      ];
    }
  }

  /**
   * Google Sheets에 고객 데이터 쓰기
   * @param userId 사용자 ID
   * @param spreadsheetId 구글 시트 ID
   * @param customers 고객 데이터 배열
   * @param sheetGid 특정 시트 탭의 gid (선택사항, 없으면 첫 번째 시트 사용)
   */
  async writeCustomersToSheet(
    userId: number,
    spreadsheetId: string,
    customers: Array<{
      companyName: string;
      ceo: string;
      phone: string;
      region: string;
      city: string;
      address: string;
      addressDetail: string;
      postalCode: string;
      species: string;
      feeding: string;
      chamchamStatus: string;
      operations: string;
    }>,
    sheetGid?: string,
  ) {
    const sheets = await this.getSheetsClient(userId);

    try {
      // 시트 정보 가져오기
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      // 특정 gid가 지정된 경우 해당 시트 찾기, 없으면 첫 번째 시트 사용
      let targetSheet = spreadsheet.data.sheets?.[0];
      if (sheetGid) {
        const foundSheet = spreadsheet.data.sheets?.find(
          (sheet) => sheet.properties?.sheetId?.toString() === sheetGid,
        );
        if (foundSheet) {
          targetSheet = foundSheet;
        } else {
          this.logger.warn(`[writeCustomersToSheet] 지정된 gid(${sheetGid})의 시트를 찾을 수 없어 첫 번째 시트를 사용합니다.`);
        }
      }

      const sheetName = targetSheet?.properties?.title || 'Sheet1';

      // 기존 데이터 지우기 (첫 번째 줄은 유지하고 두 번째 줄부터 지우기)
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A2:Z10000`,
      });

      // 헤더 행 생성 (첫 번째 열은 빈 칸)
      const headers = [
        '', // A열: 빈 칸
        '순번', // B열: 순번
        '시/도', // C열: 지역정보
        '상세주소', // D열: 상세주소
        '업체명', // E열: 업체명
        '대표자', // F열: 대표자
        '연락처', // G열: 연락처
      ];

      // 데이터 행 생성 (인덱스는 1부터 시작)
      const rows = customers.map((customer, index) => [
        '', // A열: 빈 칸
        index + 1, // B열: 순번 (1부터 시작)
        customer.region || '', // C열: 시/도 (지역정보)
        customer.address || customer.addressDetail || '', // D열: 상세주소 (주소가 있으면 주소, 없으면 상세주소)
        customer.companyName || '', // E열: 업체명
        customer.ceo || '', // F열: 대표자
        customer.phone || '', // G열: 연락처
      ]);

      // 헤더가 이미 있으면 헤더를 다시 쓰지 않고 데이터만 업데이트
      // 헤더가 없으면 헤더도 함께 작성
      const values = rows.length > 0 ? rows : [];

      if (values.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A2`, // 두 번째 줄부터 시작
          valueInputOption: 'RAW',
          requestBody: {
            values,
          },
        });
      }

      this.logger.log(`[writeCustomersToSheet] 고객 데이터 시트 반영 완료 - userId: ${userId}, 시트 ID: ${spreadsheetId}, 고객 수: ${customers.length}`);

      return {
        success: true,
        message: `${customers.length}명의 고객 데이터가 시트에 반영되었습니다.`,
      };
    } catch (error) {
      this.handleGoogleApiError(userId, error, 'writeCustomersToSheet');
      throw error;
    }
  }
}

