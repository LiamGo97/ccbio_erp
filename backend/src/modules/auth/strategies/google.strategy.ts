import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error(
        'Google OAuth 설정이 누락되었습니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL을 확인하세요.',
      );
    }

    const scopes = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets', // Google Sheets API 접근 권한
    ];
    
    console.log('=== Google OAuth Strategy 설정 ===');
    console.log('Scope:', scopes);
    console.log('accessType: offline (리프레시 토큰 수신을 위해 필요)');
    console.log('prompt: consent (매번 동의 화면 표시)');
    console.log('approval_prompt: force (리프레시 토큰 수신을 위해 필요)');
    
    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: scopes,
      accessType: 'offline', // 리프레시 토큰을 받기 위해 필요
      prompt: 'consent', // 매번 동의 화면 표시 (리프레시 토큰을 받기 위해)
      approval_prompt: 'force', // 구버전 호환 (리프레시 토큰 수신을 위해 필요)
      session: false, // 세션 사용 안 함 (매번 새로운 인증)
    });
  }

  /**
   * OAuth URL 생성 시 prompt=consent를 강제로 추가
   * passport-google-oauth20에서 prompt 옵션이 제대로 작동하지 않을 수 있어서 오버라이드
   */
  authenticate(req: any, options?: any): void {
    // 기본 authenticate 호출
    super.authenticate(req, {
      ...options,
      prompt: 'consent', // 강제로 consent 추가
      accessType: 'offline', // 강제로 offline 추가
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      if (!profile) {
        return done(new Error('구글 프로필 정보가 없습니다.'), null);
      }

      // 프로필 구조 디버깅
      console.log('=== Google OAuth Callback ===');
      console.log('AccessToken:', accessToken ? `있음 (길이: ${accessToken.length})` : '없음 ❌');
      console.log('RefreshToken:', refreshToken ? `있음 (길이: ${refreshToken.length}) ✅` : '없음 ❌');
      
      if (refreshToken) {
        console.log('✅✅✅ Refresh Token 수신 성공! ✅✅✅');
      } else {
        console.warn('❌❌❌ Refresh Token 수신 실패! ❌❌❌');
      }

      const { id, name, emails, photos, displayName } = profile;
      
      // 이메일 추출 (다양한 구조 지원)
      let email: string | null = null;
      if (emails && Array.isArray(emails) && emails.length > 0) {
        email = emails[0].value || emails[0];
      } else if (profile.email) {
        email = profile.email;
      }
      
      if (!email) {
        console.error('이메일을 찾을 수 없습니다. 프로필:', JSON.stringify(profile, null, 2));
        return done(new Error('이메일 정보를 가져올 수 없습니다.'), null);
      }

      // 이름 추출
      let fullName: string;
      if (displayName) {
        fullName = displayName;
      } else if (name) {
        if (typeof name === 'string') {
          fullName = name;
        } else if (name.givenName && name.familyName) {
          fullName = `${name.givenName} ${name.familyName}`;
        } else {
          fullName = name.givenName || name.familyName || email.split('@')[0] || 'User';
        }
      } else {
        fullName = email.split('@')[0] || 'User';
      }

      // 사진 추출
      let picture: string | null = null;
      if (photos && Array.isArray(photos) && photos.length > 0) {
        picture = photos[0].value || photos[0] || null;
      } else if (profile.photos && Array.isArray(profile.photos) && profile.photos.length > 0) {
        picture = profile.photos[0].value || profile.photos[0] || null;
      }
      
      const user = {
        id: id || profile.id,
        email,
        name: fullName,
        picture,
        accessToken: accessToken || undefined, // 구글 드라이브 API 접근을 위해 저장
        refreshToken: refreshToken || undefined, // 토큰 갱신을 위해 저장
      };
      
      console.log('=== 생성된 user 객체 ===');
      console.log('ID:', user.id);
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Picture:', user.picture ? '있음' : '없음');
      console.log('AccessToken:', user.accessToken ? '있음 ✅' : '없음 ❌');
      console.log('RefreshToken:', user.refreshToken ? '있음 ✅✅✅' : '없음 ❌❌❌');
      
      // refresh token이 없으면 경고 로그
      if (!refreshToken) {
        console.warn('⚠️⚠️⚠️ Google OAuth에서 refresh token을 받지 못했습니다! ⚠️⚠️⚠️');
        console.warn('⚠️ 이는 정상적인 경우일 수 있습니다 (이미 승인한 앱의 경우).');
        console.warn('⚠️ refresh token을 받으려면 Google 계정 설정에서 앱 권한을 취소하고 다시 승인해야 합니다.');
        console.warn('⚠️ 또는 GCP 콘솔에서 OAuth 동의 화면을 다시 설정해야 할 수 있습니다.');
      } else {
        console.log('✅✅✅ Refresh Token이 정상적으로 수신되었습니다! ✅✅✅');
      }
      
      done(null, user);
    } catch (error) {
      console.error('GoogleStrategy validate 에러:', error);
      console.error('프로필 데이터:', JSON.stringify(profile, null, 2));
      done(error, null);
    }
  }
}

