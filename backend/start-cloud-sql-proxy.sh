#!/bin/bash
# Cloud SQL Proxy 실행 스크립트
# 사용법: ./start-cloud-sql-proxy.sh

INSTANCE_CONNECTION_NAME="balmy-ground-470504-p0:asia-northeast3:ccbio"
LOCAL_PORT=5433

echo "=== Cloud SQL Proxy 시작 ==="
echo "인스턴스: $INSTANCE_CONNECTION_NAME"
echo "로컬 포트: $LOCAL_PORT (로컬 PostgreSQL과 충돌 방지)"
echo ""

# macOS quarantine 속성 제거 (Gatekeeper 경고 방지)
if [ -f "./cloud-sql-proxy" ]; then
    xattr -d com.apple.quarantine "./cloud-sql-proxy" 2>/dev/null
fi

# 포트 5433을 사용하는 기존 프로세스 확인 및 종료
EXISTING_PID=$(lsof -ti :$LOCAL_PORT 2>/dev/null)
if [ ! -z "$EXISTING_PID" ]; then
    echo "포트 $LOCAL_PORT를 사용하는 기존 프로세스(PID: $EXISTING_PID)를 종료합니다..."
    kill $EXISTING_PID 2>/dev/null
    sleep 1
    
    # 프로세스가 여전히 실행 중인지 확인
    if kill -0 $EXISTING_PID 2>/dev/null; then
        echo "프로세스가 종료되지 않았습니다. 강제 종료합니다..."
        kill -9 $EXISTING_PID 2>/dev/null
    fi
    echo "기존 프로세스가 종료되었습니다."
    echo ""
fi

# 서비스 계정 키 파일이 있으면 사용
if [ -f "service-account-key.json" ]; then
    echo "서비스 계정 키 파일을 사용합니다."
    export GOOGLE_APPLICATION_CREDENTIALS="service-account-key.json"
    ./cloud-sql-proxy "$INSTANCE_CONNECTION_NAME" --port=$LOCAL_PORT
else
    echo "서비스 계정 키 파일이 없습니다. gcloud 인증을 사용합니다."
    echo "gcloud가 설치되어 있지 않다면 서비스 계정 키 파일을 생성하세요."
    echo ""
    ./cloud-sql-proxy "$INSTANCE_CONNECTION_NAME" --port=$LOCAL_PORT
fi

echo ""
echo "이 터미널을 열어두세요. 종료하려면 Ctrl+C를 누르세요."

