# Google Cloud Storage (GCS) 설정 가이드

## 1. GCS 버킷 생성

### GCP 콘솔에서 생성
1. [Google Cloud Console](https://console.cloud.google.com/storage) 접속
2. **Storage** > **Buckets** 클릭
3. **CREATE BUCKET** 버튼 클릭
4. 설정:
   - **Name**: `ccbio-erp-files` (또는 원하는 이름, 전역적으로 고유해야 함)
   - **Location type**: `Region`
   - **Location**: `asia-northeast3` (서울)
   - **Storage class**: `Standard`
   - **Access control**: `Uniform` (권장)
   - **Public access**: 필요시 설정

### gcloud CLI로 생성
```bash
gsutil mb -p balmy-ground-470504-p0 -c STANDARD -l asia-northeast3 gs://ccbio-erp-files
```

## 2. 환경 변수 설정

### backend/.env 또는 backend/.env.local
```env
GCP_PROJECT_ID=balmy-ground-470504-p0
GCS_BUCKET_NAME=ccbio-erp-files
```

### Cloud Run 환경 변수 추가
```bash
gcloud run services update ccbio-erp \
  --region asia-northeast3 \
  --update-env-vars "GCP_PROJECT_ID=balmy-ground-470504-p0,GCS_BUCKET_NAME=ccbio-erp-files" \
  --project balmy-ground-470504-p0
```

## 3. 로컬 개발 환경 인증 설정

### 방법 1: gcloud CLI 인증 (권장)
```bash
gcloud auth application-default login
```

### 방법 2: 서비스 계정 키 파일 사용
1. GCP 콘솔 > IAM & Admin > Service Accounts
2. 서비스 계정 생성 또는 기존 계정 선택
3. 키 생성 (JSON 다운로드)
4. 환경 변수 설정:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"
```

## 4. Cloud Run 서비스 계정 권한 설정

Cloud Run 서비스 계정에 Storage 권한 부여:

```bash
# 서비스 계정 이메일 확인
gcloud run services describe ccbio-erp \
  --region asia-northeast3 \
  --format 'value(spec.template.spec.serviceAccountName)'

# Storage 권한 부여 (프로젝트 번호 확인 필요)
# PROJECT_NUMBER는 GCP 콘솔에서 확인
gcloud projects add-iam-policy-binding balmy-ground-470504-p0 \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

또는 버킷별 권한 부여:

```bash
gsutil iam ch serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com:roles/storage.objectAdmin gs://ccbio-erp-files
```

## 5. 사용 예시

### 파일 업로드
```typescript
import { StorageService } from './modules/storage/storage.service';

// MMS 이미지 업로드 예시
const { url, path } = await this.storageService.uploadFile(
  file,
  'mms-images', // 폴더 경로
  true, // Public 접근 허용
);

// url: https://storage.googleapis.com/ccbio-erp-files/mms-images/1234567890-image.jpg
// path: mms-images/1234567890-image.jpg
```

### Private 파일 업로드 후 Signed URL 생성
```typescript
const { path } = await this.storageService.uploadFile(file, 'private-files', false);
const signedUrl = await this.storageService.getSignedUrl(path, 60); // 60분 유효
```

### 파일 삭제
```typescript
await this.storageService.deleteFile('mms-images/1234567890-image.jpg');
```

## 6. 파일 경로 구조 예시

```
ccbio-erp-files/
├── mms-images/
│   ├── 1701234567890-image1.jpg
│   └── 1701234567891-image2.jpg
├── uploads/
│   └── ...
└── ...
```

## 참고사항

- **Cloud Run**: 자동으로 서비스 계정 사용 (추가 인증 설정 불필요)
- **로컬 개발**: `gcloud auth application-default login` 또는 서비스 계정 키 필요
- **Public URL**: `https://storage.googleapis.com/BUCKET_NAME/PATH`
- **비용**: GB당 약 $0.020 (표준 스토리지)

