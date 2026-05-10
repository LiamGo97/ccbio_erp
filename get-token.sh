#!/bin/bash
# 브라우저에서 토큰을 가져와서 curl 명령어로 실행하는 스크립트

echo "📋 토큰을 가져오는 방법:"
echo "1. 브라우저에서 로그인"
echo "2. 개발자 도구(F12) 열기"
echo "3. Application 탭 > Cookies > http://localhost:3000 (또는 현재 도메인)"
echo "4. 'token' 쿠키의 Value를 복사"
echo ""
echo "또는 Console에서 다음 명령어 실행:"
echo "document.cookie.split('; ').find(r => r.startsWith('token='))?.split('=')[1]"
echo ""
read -p "토큰을 입력하세요: " TOKEN

if [ -z "$TOKEN" ]; then
  echo "❌ 토큰이 입력되지 않았습니다."
  exit 1
fi

# 오늘 날짜
TODAY=$(date +%Y%m%d)

echo ""
echo "🚀 오늘($TODAY) 전송 결과 조회 중..."
echo ""

curl -X GET "http://localhost:3001/api/aligo/sms/list?start_date=${TODAY}&page=1&page_size=50" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq
