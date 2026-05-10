// 오늘 전송 결과 목록 조회 테스트 스크립트
// 브라우저 개발자 도구(F12) > Console에서 실행하세요

// 오늘 날짜를 YYYYMMDD 형식으로 생성
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const todayStr = `${year}${month}${day}`;

console.log(`오늘 날짜: ${todayStr}`);

// API 호출
async function getTodaySmsList() {
  try {
    // 현재 호스트 기반으로 API URL 설정
    const protocol = window.location.protocol;
    const host = window.location.host;
    let apiUrl;
    
    if (host.includes('run.app')) {
      apiUrl = `${protocol}//${host}/api`;
    } else if (host.includes('localhost')) {
      apiUrl = 'http://localhost:3001/api';
    } else {
      apiUrl = `http://${host.split(':')[0]}:3001/api`;
    }
    
    const url = `${apiUrl}/aligo/sms/list?start_date=${todayStr}&page=1&page_size=50`;
    console.log(`API URL: ${url}`);
    
    // 쿠키에서 토큰 가져오기
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('token='))
      ?.split('=')[1];
    
    if (!token) {
      console.error('❌ 토큰을 찾을 수 없습니다. 먼저 로그인해주세요.');
      return;
    }
    
    console.log(`토큰: ${token.substring(0, 20)}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 호출 실패: ${response.status}`, errorText);
      return;
    }
    
    const data = await response.json();
    console.log('✅ 성공!', data);
    
    // 결과 요약
    if (data.list && data.list.length > 0) {
      console.log(`\n📊 오늘 전송 결과: 총 ${data.list.length}건`);
      console.table(data.list.map(item => ({
        '발신번호': item.sender,
        '수신번호': item.receiver,
        '타입': item.type || item.msg_type,
        '상태': item.status || item.sms_state,
        '발송일시': item.reg_date || item.send_date,
        '메시지': item.msg ? item.msg.substring(0, 30) + '...' : '',
      })));
    } else {
      console.log('📭 오늘 전송된 메시지가 없습니다.');
    }
    
    return data;
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
}

// 실행
getTodaySmsList();
