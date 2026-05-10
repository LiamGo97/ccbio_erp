import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private storage: Storage;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    // Cloud Run에서는 자동으로 인증됨
    // 로컬에서는 GOOGLE_APPLICATION_CREDENTIALS 또는 gcloud auth 사용
    this.storage = new Storage({
      projectId: this.configService.get('GCP_PROJECT_ID', 'balmy-ground-470504-p0'),
    });
    this.bucketName = this.configService.get('GCS_BUCKET_NAME', 'ccbio-erp-files');
  }

  /**
   * 파일 업로드 (Public URL 반환)
   */
  async uploadFile(
    file: Express.Multer.File,
    folderPath: string = 'uploads',
    makePublic: boolean = true,
  ): Promise<{ url: string; path: string }> {
    const timestamp = Date.now();
    const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${folderPath}/${timestamp}-${sanitizedFileName}`;
    
    const bucket = this.storage.bucket(this.bucketName);
    const fileStream = bucket.file(fileName);

    // 파일 업로드
    await new Promise<void>((resolve, reject) => {
      const stream = fileStream.createWriteStream({
        metadata: {
          contentType: file.mimetype,
        },
        resumable: false, // 작은 파일은 resumable 업로드 불필요
      });

      stream.on('error', (err) => {
        this.logger.error('GCS 업로드 오류:', err);
        reject(err);
      });

      stream.on('finish', () => {
        resolve();
      });

      stream.end(file.buffer);
    });

    // Public 접근 권한 설정
    // Uniform bucket-level access가 활성화된 경우 파일별 공개 설정 불가
    // 버킷 자체가 공개적으로 접근 가능하도록 설정되어 있어야 함
    if (makePublic) {
      try {
        // Uniform bucket-level access가 비활성화된 경우에만 개별 파일 공개 설정 가능
        await fileStream.makePublic();
      } catch (error: any) {
        if (error?.message?.includes('uniform bucket-level access')) {
          // Uniform bucket-level access 사용 시: 버킷 레벨 권한 사용
          this.logger.log(`Uniform bucket-level access 활성화됨 - 버킷 레벨 공개 권한 사용`);
        } else {
          this.logger.warn(`파일을 Public으로 설정하는 중 오류 발생: ${error}`);
        }
        // Public 설정 실패해도 계속 진행 (이미 업로드는 완료됨)
      }
    }

    const url = makePublic
      ? `https://storage.googleapis.com/${this.bucketName}/${fileName}`
      : await this.getSignedUrl(fileName);

    this.logger.log(`GCS 파일 업로드 완료: ${fileName}`);
    return {
      url,
      path: fileName,
    };
  }

  /**
   * Signed URL 생성 (Private 파일용)
   */
  async getSignedUrl(fileName: string, expirationMinutes: number = 60): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expirationMinutes * 60 * 1000,
    });

    return url;
  }

  /**
   * 파일 삭제 (파일이 없으면 무시)
   */
  async deleteFile(fileName: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);
    try {
      await file.delete();
      this.logger.log(`GCS 파일 삭제: ${fileName}`);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 404) {
        this.logger.log(`GCS 파일 없음(이미 삭제됨): ${fileName}`);
        return;
      }
      throw err;
    }
  }

  /**
   * 파일 다운로드
   */
  async downloadFile(fileName: string): Promise<Buffer> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Public URL 생성 (path → 전체 URL)
   */
  getPublicUrl(path: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${path}`;
  }

  /**
   * 파일 존재 여부 확인
   */
  async fileExists(fileName: string): Promise<boolean> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileName);
    const [exists] = await file.exists();
    return exists;
  }
}

