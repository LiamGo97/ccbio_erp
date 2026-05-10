# Cloud Run 배포 복구 가이드

## 현재 구성 (프록시 방식)

- **deploy.sh**: VPC connector 제거 (`--clear-vpc-connector`), 알리고 API는 프록시(34.64.145.126) 경유
- Cloud SQL: Unix 소켓 정상 동작
- 배포 실패 원인: `vpc-egress=all-traffic` + Cloud SQL Unix 소켓 충돌

## 복구 방법

### 1. 배포 스크립트 복원

```bash
cp deploy_backup/deploy_프록시복구_20250316.sh deploy.sh
chmod +x deploy.sh
./deploy.sh
```

### 2. VPC connector가 있는 서비스에서 배포 시

기존에 `aligo-connector`(all-traffic)가 설정된 경우, deploy.sh의 `--clear-vpc-connector --vpc-egress=private-ranges-only`가 자동으로 제거합니다.

### 3. 트래픽 수동 전환 (배포 실패 시)

```bash
# 리비전 목록 확인
gcloud run revisions list --service ccbio-erp --region asia-northeast3 --project balmy-ground-470504-p0

# VPC 없는 리비전으로 트래픽 전환 (예: ccbio-erp-00420-fr5)
gcloud run services update-traffic ccbio-erp --to-revisions=ccbio-erp-00420-fr5=100 --region asia-northeast3 --project balmy-ground-470504-p0
```

### 4. VPC connector 사용 시 (프록시 미사용)

- 알리고 고정 IP 직접 사용: VPC connector `aligo-connector` 필요
- **주의**: `vpc-egress=all-traffic` 사용 시 Cloud SQL Unix 소켓과 충돌 → 앱 시작 실패

## 배포 스크립트 목록

| 파일 | 용도 |
|------|------|
| deploy.sh | 메인 배포 (VPC 제거, 프록시 방식) |
| deploy_backup/deploy_프록시복구_*.sh | deploy.sh 백업 |
| deploy_알리고설정으로 백업.sh | 프록시 방식 (VPC 옵션 없음) |
| deploy-cloud-run.sh | 최소 환경 변수만 사용 |
