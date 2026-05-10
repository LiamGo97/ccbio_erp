#!/bin/bash

# Cloud Run 배포 스크립트 (이미 빌드된 Artifact Registry 이미지 사용)
# 사용법: ./deploy.sh

set -e

PROJECT_ID="balmy-ground-470504-p0"
REGION="asia-northeast3"  # 도메인 매핑 지원 리전
SERVICE_NAME="ccbio-erp"
REPOSITORY="ccbio-repo"
IMAGE_NAME="asia-northeast3-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:latest"
CLOUD_SQL_REGION="asia-northeast3"  # Cloud SQL 인스턴스 리전 (서비스 리전과 다를 수 있음)
CLOUD_SQL_CONNECTION="${PROJECT_ID}:${CLOUD_SQL_REGION}:ccbio"

# Cloud SQL 연결 정보 (로컬용에서 Cloud Run용으로 변환)
# 로컬: postgresql://ccbio_user:Gfi007728%40@127.0.0.1:5433/ccbio_erp
# Cloud Run: Unix 소켓 사용
DB_USER="ccbio_user"
DB_PASSWORD="Gfi007728%40"  # URL 인코딩된 @ (%40)
DB_NAME="ccbio_erp"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION}"

echo "☁️  Deploying to Cloud Run..."
echo "   Image: ${IMAGE_NAME}"
echo "   Service: ${SERVICE_NAME}"
echo "   Region: ${REGION}"
echo "   Cloud SQL: ${CLOUD_SQL_CONNECTION}"
echo ""

# 환경 변수 설정 (.env 파일에서 읽어오기)
if [ -f "backend/.env" ]; then
  echo "📖 backend/.env 파일에서 환경 변수 로드 중..."
  while IFS= read -r line; do
    line=$(echo "$line" | sed 's/#.*$//' | xargs)
    if [[ -n "$line" && "$line" == *"="* && "$line" != "DATABASE_URL="* && "$line" != "GOOGLE_CALLBACK_URL="* ]]; then
      export "$line"
    fi
  done < <(grep -v '^[[:space:]]*#' backend/.env | grep -v '^#' | grep -v '^$')
fi

# 기본값 설정
JWT_SECRET=${JWT_SECRET:-"your-jwt-secret-change-this"}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-""}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-""}
SEARATES_API_KEY=${SEARATES_API_KEY:-""}
OPENAI_API_KEY=${OPENAI_API_KEY:-""}
ALIGO_API_KEY=${ALIGO_API_KEY:-""}
ALIGO_USER_ID=${ALIGO_USER_ID:-""}
ALIGO_SENDER=${ALIGO_SENDER:-""}

# 알리고: VPC connector + Cloud NAT(34.64.60.50)로 직접 API 호출 (알리고 화이트리스트 등록됨)
ALIGO_USE_PROXY=${ALIGO_USE_PROXY:-"false"}
ALIGO_PROXY_URL=${ALIGO_PROXY_URL:-""}

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION}"

echo "📋 환경 변수:"
echo "   DATABASE_URL: ${DATABASE_URL}"
echo "   JWT_SECRET: ${JWT_SECRET:0:10}..."
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
fi
if [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  echo "   GOOGLE_CLIENT_SECRET: 설정됨"
fi
if [ -n "$ALIGO_API_KEY" ]; then
  echo "   ALIGO_API_KEY: 설정됨"
fi
echo "   ALIGO_USE_PROXY: ${ALIGO_USE_PROXY}"
if [ "$ALIGO_USE_PROXY" = "true" ]; then
  echo "   ALIGO_PROXY_URL: ${ALIGO_PROXY_URL}"
fi
echo ""

# 기존 서비스 URL 조회
CURRENT_SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)' 2>/dev/null || true)

if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ] && [ -z "$GOOGLE_CALLBACK_URL" ]; then
  if [ -n "$CURRENT_SERVICE_URL" ]; then
    GOOGLE_CALLBACK_URL="${CURRENT_SERVICE_URL}/api/auth/google/callback"
  else
    TEMP_SERVICE_URL="https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app"
    GOOGLE_CALLBACK_URL="${TEMP_SERVICE_URL}/api/auth/google/callback"
  fi
fi

FRONTEND_URL=${FRONTEND_URL:-${CURRENT_SERVICE_URL:-""}}

# Cloud Run 배포 (PORT는 Cloud Run이 자동 설정)
ENV_VARS="NODE_ENV=production,DATABASE_URL=${DATABASE_URL},JWT_SECRET=${JWT_SECRET}"
if [ -n "$FRONTEND_URL" ]; then ENV_VARS="${ENV_VARS},FRONTEND_URL=${FRONTEND_URL}"; fi
if [ -n "$GOOGLE_CLIENT_ID" ]; then ENV_VARS="${ENV_VARS},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"; fi
if [ -n "$GOOGLE_CLIENT_SECRET" ]; then ENV_VARS="${ENV_VARS},GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}"; fi
if [ -n "$GOOGLE_CALLBACK_URL" ]; then ENV_VARS="${ENV_VARS},GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}"; fi
if [ -n "$SEARATES_API_KEY" ]; then ENV_VARS="${ENV_VARS},SEARATES_API_KEY=${SEARATES_API_KEY}"; fi
if [ -n "$OPENAI_API_KEY" ]; then ENV_VARS="${ENV_VARS},OPENAI_API_KEY=${OPENAI_API_KEY}"; fi
if [ -n "$ALIGO_API_KEY" ]; then ENV_VARS="${ENV_VARS},ALIGO_API_KEY=${ALIGO_API_KEY}"; fi
if [ -n "$ALIGO_USER_ID" ]; then ENV_VARS="${ENV_VARS},ALIGO_USER_ID=${ALIGO_USER_ID}"; fi
if [ -n "$ALIGO_SENDER" ]; then ENV_VARS="${ENV_VARS},ALIGO_SENDER=${ALIGO_SENDER}"; fi
if [ -n "$ALIGO_USE_PROXY" ]; then ENV_VARS="${ENV_VARS},ALIGO_USE_PROXY=${ALIGO_USE_PROXY}"; fi
if [ -n "$ALIGO_PROXY_URL" ]; then ENV_VARS="${ENV_VARS},ALIGO_PROXY_URL=${ALIGO_PROXY_URL}"; fi
if [ -n "$EXTERNAL_API_KEY" ]; then ENV_VARS="${ENV_VARS},EXTERNAL_API_KEY=${EXTERNAL_API_KEY}"; fi

# VPC connector 사용: Cloud Run → aligo-connector → Cloud NAT(34.64.60.50) → 알리고 API
# startup-probe: DB 연결 등으로 앱 시작이 느릴 수 있어 대기 시간 확대 (최대 300초)
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0 \
  --add-cloudsql-instances ${CLOUD_SQL_CONNECTION} \
  --set-env-vars "${ENV_VARS}" \
  --cpu-boost \
  --execution-environment gen2 \
  --project ${PROJECT_ID} \
  --vpc-connector projects/balmy-ground-470504-p0/locations/asia-northeast3/connectors/aligo-connector \
  --vpc-egress=all-traffic \
  --startup-probe="initialDelaySeconds=90,periodSeconds=10,failureThreshold=24,timeoutSeconds=5,httpGet.port=8080,httpGet.path=/api/health"

echo ""
echo "✅ Deployment complete!"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --project ${PROJECT_ID} --format 'value(status.url)')
echo "📋 Service URL: ${SERVICE_URL}"

if [ -n "$SERVICE_URL" ]; then
  echo ""
  echo "🔄 환경 변수 업데이트 중..."
  UPDATE_VARS="FRONTEND_URL=${SERVICE_URL}"
  if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
    UPDATE_VARS="${UPDATE_VARS},GOOGLE_CALLBACK_URL=${SERVICE_URL}/api/auth/google/callback"
  fi
  gcloud run services update ${SERVICE_NAME} --region ${REGION} --update-env-vars "${UPDATE_VARS}" --project ${PROJECT_ID}
fi

# 커스텀 도메인 매핑
CUSTOM_DOMAIN="erp.ccbio.co.kr"
if [ -n "$CUSTOM_DOMAIN" ]; then
  echo ""
  echo "🌐 커스텀 도메인 매핑 확인..."
  if gcloud beta run domain-mappings describe ${CUSTOM_DOMAIN} --region ${REGION} --project ${PROJECT_ID} &>/dev/null; then
    echo "   ✅ 도메인 매핑이 이미 존재합니다."
  else
    echo "   도메인 매핑 생성 중..."
    gcloud beta run domain-mappings create --service ${SERVICE_NAME} --domain ${CUSTOM_DOMAIN} --platform managed --region ${REGION} --project ${PROJECT_ID}
  fi
fi