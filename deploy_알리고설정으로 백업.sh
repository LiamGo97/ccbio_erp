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
  # .env 파일에서 필요한 변수만 추출 (주석과 빈 줄 제외)
  # 1. 주석 줄 제거 (^[[:space:]]*# 또는 ^#)
  # 2. 빈 줄 제거
  # 3. DATABASE_URL과 GOOGLE_CALLBACK_URL 제외
  # 4. 인라인 주석 제거 (KEY=VALUE # 주석 형식)
  # 5. = 기호가 있는 줄만 선택 (유효한 환경 변수만)
  while IFS= read -r line; do
    # 인라인 주석 제거 (KEY=VALUE # 주석)
    line=$(echo "$line" | sed 's/#.*$//' | xargs)
    # 빈 줄이 아니고 = 기호가 있으면 export
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
# Cloud Run은 동적 IP를 사용하므로 알리고 API IP 등록이 어려움
# 프록시 서버를 사용하면 IP 등록 문제를 해결할 수 있음
ALIGO_USE_PROXY=${ALIGO_USE_PROXY:-"true"}  # Cloud Run에서는 기본적으로 프록시 사용
ALIGO_PROXY_URL=${ALIGO_PROXY_URL:-"http://34.64.145.126:3000"}  # 프록시 서버 URL
# GOOGLE_CALLBACK_URL은 배포 후 Cloud Run URL로 자동 설정됨

# DATABASE_URL은 Cloud Run용으로 강제 설정 (로컬용 URL 덮어쓰기)
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
if [ -n "$SEARATES_API_KEY" ]; then
  echo "   SEARATES_API_KEY: 설정됨"
fi
if [ -n "$OPENAI_API_KEY" ]; then
  echo "   OPENAI_API_KEY: 설정됨"
fi
if [ -n "$ALIGO_API_KEY" ]; then
  echo "   ALIGO_API_KEY: 설정됨"
fi
if [ -n "$ALIGO_USER_ID" ]; then
  echo "   ALIGO_USER_ID: ${ALIGO_USER_ID}"
fi
if [ -n "$ALIGO_SENDER" ]; then
  echo "   ALIGO_SENDER: ${ALIGO_SENDER}"
fi
if [ -n "$ALIGO_USE_PROXY" ]; then
  echo "   ALIGO_USE_PROXY: ${ALIGO_USE_PROXY}"
  if [ "$ALIGO_USE_PROXY" = "true" ]; then
    echo "   ALIGO_PROXY_URL: ${ALIGO_PROXY_URL}"
  fi
fi
echo ""

# 기존 서비스 URL 조회 (있을 경우)
CURRENT_SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)' 2>/dev/null || true)

# GOOGLE_CALLBACK_URL 기본값 설정 (기존 서비스 URL 기반)
# GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET이 있으면 GOOGLE_CALLBACK_URL도 필수
if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ] && [ -z "$GOOGLE_CALLBACK_URL" ]; then
  if [ -n "$CURRENT_SERVICE_URL" ]; then
    GOOGLE_CALLBACK_URL="${CURRENT_SERVICE_URL}/api/auth/google/callback"
  else
    # 첫 배포 시 임시 URL 설정 (배포 후 실제 URL로 업데이트됨)
    # 리전별 기본 URL 형식 사용
    TEMP_SERVICE_URL="https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app"
    GOOGLE_CALLBACK_URL="${TEMP_SERVICE_URL}/api/auth/google/callback"
    echo "   ⚠️  GOOGLE_CALLBACK_URL이 설정되지 않아 임시 URL 사용: ${GOOGLE_CALLBACK_URL}"
    echo "   배포 후 실제 서비스 URL로 자동 업데이트됩니다."
  fi
fi

# FRONTEND_URL 설정 (기존 서비스 URL이 있으면 사용, 없으면 배포 후 업데이트)
FRONTEND_URL=${FRONTEND_URL:-${CURRENT_SERVICE_URL:-""}}

# Artifact Registry 이미지는 리전 간 접근 가능하므로 복사 불필요
# 필요시 이미지 경로만 업데이트 (현재는 asia-northeast3 이미지를 asia-northeast1에서도 사용 가능)

# Cloud Run 배포
ENV_VARS="NODE_ENV=production,DATABASE_URL=${DATABASE_URL},JWT_SECRET=${JWT_SECRET}"
if [ -n "$FRONTEND_URL" ]; then
  ENV_VARS="${ENV_VARS},FRONTEND_URL=${FRONTEND_URL}"
fi
if [ -n "$GOOGLE_CLIENT_ID" ]; then
  ENV_VARS="${ENV_VARS},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
fi
if [ -n "$GOOGLE_CLIENT_SECRET" ]; then
  ENV_VARS="${ENV_VARS},GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}"
fi
if [ -n "$GOOGLE_CALLBACK_URL" ]; then
  ENV_VARS="${ENV_VARS},GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}"
fi
if [ -n "$SEARATES_API_KEY" ]; then
  ENV_VARS="${ENV_VARS},SEARATES_API_KEY=${SEARATES_API_KEY}"
fi
if [ -n "$OPENAI_API_KEY" ]; then
  ENV_VARS="${ENV_VARS},OPENAI_API_KEY=${OPENAI_API_KEY}"
fi
if [ -n "$ALIGO_API_KEY" ]; then
  ENV_VARS="${ENV_VARS},ALIGO_API_KEY=${ALIGO_API_KEY}"
fi
if [ -n "$ALIGO_USER_ID" ]; then
  ENV_VARS="${ENV_VARS},ALIGO_USER_ID=${ALIGO_USER_ID}"
fi
if [ -n "$ALIGO_SENDER" ]; then
  ENV_VARS="${ENV_VARS},ALIGO_SENDER=${ALIGO_SENDER}"
fi
if [ -n "$ALIGO_USE_PROXY" ]; then
  ENV_VARS="${ENV_VARS},ALIGO_USE_PROXY=${ALIGO_USE_PROXY}"
fi
if [ -n "$ALIGO_PROXY_URL" ]; then
  ENV_VARS="${ENV_VARS},ALIGO_PROXY_URL=${ALIGO_PROXY_URL}"
fi

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
  --project ${PROJECT_ID}

echo ""
echo "✅ Deployment complete!"
echo "📋 Service URL:"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)')
echo "   ${SERVICE_URL}"

# FRONTEND_URL 및 GOOGLE_CALLBACK_URL 업데이트 (항상 Cloud Run URL로 설정)
if [ -n "$SERVICE_URL" ]; then
  echo ""
  echo "🔄 환경 변수 업데이트 중..."
  
  UPDATE_VARS="FRONTEND_URL=${SERVICE_URL}"
  # GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET이 있으면 GOOGLE_CALLBACK_URL도 업데이트
  if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
    UPDATE_VARS="${UPDATE_VARS},GOOGLE_CALLBACK_URL=${SERVICE_URL}/api/auth/google/callback"
  fi
  
  if gcloud run services update ${SERVICE_NAME} \
    --region ${REGION} \
    --update-env-vars "${UPDATE_VARS}" \
    --project ${PROJECT_ID} 2>&1; then
    echo "   ✅ FRONTEND_URL이 ${SERVICE_URL}로 설정되었습니다."
    if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
      echo "   ✅ GOOGLE_CALLBACK_URL이 ${SERVICE_URL}/api/auth/google/callback로 설정되었습니다."
    fi
  else
    echo "   ⚠️  환경 변수 업데이트 실패. 수동으로 설정해주세요:"
    echo "   gcloud run services update ${SERVICE_NAME} \\"
    echo "     --region ${REGION} \\"
    echo "     --update-env-vars \"${UPDATE_VARS}\" \\"
    echo "     --project ${PROJECT_ID}"
  fi
fi

echo ""
echo "⚠️  JWT_SECRET과 Google OAuth 정보를 확인하세요:"
echo "   gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(spec.template.spec.containers[0].env)'"

# 커스텀 도메인 매핑
CUSTOM_DOMAIN="erp.ccbio.co.kr"

if [ -n "$CUSTOM_DOMAIN" ]; then
  echo ""
  echo "🌐 커스텀 도메인 매핑 중..."
  echo "   도메인: ${CUSTOM_DOMAIN}"
  
  # 도메인 매핑이 이미 있는지 확인 (beta 명령어 사용)
  if gcloud beta run domain-mappings describe ${CUSTOM_DOMAIN} \
    --region ${REGION} \
    --project ${PROJECT_ID} &>/dev/null; then
    echo "   ✅ 도메인 매핑이 이미 존재합니다."
    
    # CNAME 값 확인
    CNAME_VALUE=$(gcloud beta run domain-mappings describe ${CUSTOM_DOMAIN} \
      --region ${REGION} \
      --project ${PROJECT_ID} \
      --format 'value(status.resourceRecords[0].rrdata)' 2>/dev/null || echo "")
    
    if [ -n "$CNAME_VALUE" ]; then
      echo ""
      echo "📋 가비아 DNS 설정 확인:"
      echo "   타입: CNAME"
      echo "   호스트: erp"
      echo "   값: ${CNAME_VALUE}"
    fi
  else
    # 새 도메인 매핑 생성 (beta 명령어 사용)
    echo "   도메인 매핑 생성 중..."
    if gcloud beta run domain-mappings create \
      --service ${SERVICE_NAME} \
      --domain ${CUSTOM_DOMAIN} \
      --platform managed \
      --region ${REGION} \
      --project ${PROJECT_ID} 2>&1; then
      echo "   ✅ 도메인 매핑 생성 완료!"
      echo ""
      
      # CNAME 값 조회
      sleep 2  # 도메인 매핑 생성 후 잠시 대기
      CNAME_VALUE=$(gcloud beta run domain-mappings describe ${CUSTOM_DOMAIN} \
        --region ${REGION} \
        --project ${PROJECT_ID} \
        --format 'value(status.resourceRecords[0].rrdata)' 2>/dev/null || echo "ghs.googlehosted.com")
      
      echo "📋 가비아 DNS 설정:"
      echo "   1. 가비아 DNS 관리 페이지 접속"
      echo "   2. ccbio.co.kr 도메인 선택"
      echo "   3. DNS 관리 > 레코드 추가"
      echo "   4. 설정 값:"
      echo "      - 타입: CNAME"
      echo "      - 호스트: erp"
      echo "      - 값: ${CNAME_VALUE}"
      echo ""
      echo "   ⏰ DNS 전파 시간: 24-48시간 소요될 수 있습니다."
      echo "   🔒 SSL 인증서는 GCP에서 자동으로 발급됩니다."
    else
      echo "   ⚠️  도메인 매핑 생성 실패. GCP 콘솔에서 수동으로 설정하세요."
      echo "   또는 아래 명령어로 다시 시도하세요:"
      echo "   gcloud beta run domain-mappings create \\"
      echo "     --service ${SERVICE_NAME} \\"
      echo "     --domain ${CUSTOM_DOMAIN} \\"
      echo "     --platform managed \\"
      echo "     --region ${REGION} \\"
      echo "     --project ${PROJECT_ID}"
    fi
  fi
fi

