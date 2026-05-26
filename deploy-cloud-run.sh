#!/bin/bash

# Cloud Run 배포 스크립트 (Artifact Registry 사용)
# 사용법: ./deploy-cloud-run.sh

set -e

PROJECT_ID="balmy-ground-470504-p0"
REGION="asia-northeast3"
SERVICE_NAME="ccbio-erp"
REPOSITORY="ccbio-repo"
IMAGE_NAME="asia-northeast3-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:latest"
CLOUD_SQL_CONNECTION="balmy-ground-470504-p0:asia-northeast3:ccbio"

echo "☁️  Deploying to Cloud Run..."
echo "   Image: ${IMAGE_NAME}"
echo "   Service: ${SERVICE_NAME}"
echo "   Region: ${REGION}"
echo "   Cloud SQL: ${CLOUD_SQL_CONNECTION}"
echo ""

# Cloud Run 배포
# 환경 변수는 --set-env-vars 또는 Secret Manager로 설정
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
  --set-env-vars "NODE_ENV=production" \
  --project ${PROJECT_ID}

echo ""
echo "✅ Deployment complete!"
echo "📋 Service URL:"
gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)'

echo ""
echo "⚠️  다음 환경 변수들을 설정해야 합니다:"
echo "   - DATABASE_URL"
echo "   - JWT_SECRET"
echo "   - GOOGLE_CLIENT_ID"
echo "   - GOOGLE_CLIENT_SECRET"
echo "   - FRONTEND_URL"
echo "   - ALIGO_API_KEY (알리고 API 키)"
echo "   - ALIGO_USER_ID (알리고 사용자 ID)"
echo "   - ALIGO_SENDER (알리고 발신번호, 선택사항)"
echo "   - CRON_SECRET (Cloud Scheduler → POST /api/internal/cron/eta-update)"
echo "   - CRON_ETA_UPDATE_MAX_ORDERS (선택, 1회 최대 건수, 0=제한없음)"
echo ""
echo "설정 방법:"
echo "  gcloud run services update ${SERVICE_NAME} \\"
echo "    --region ${REGION} \\"
echo "    --update-env-vars KEY1=value1,KEY2=value2"

