import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private rolesService: RolesService,
  ) {}

  async validateGoogleUser(profile: any): Promise<User> {
    try {
      console.log('=== AuthService.validateGoogleUser 시작 ===');
      
      if (!profile) {
        throw new Error('구글 프로필 정보가 없습니다.');
      }

      // GoogleStrategy에서 이미 변환된 user 객체를 받거나, 원본 profile을 받을 수 있음
      // 두 가지 경우를 모두 처리
      let email: string;
      let name: string;
      let picture: string | null;
      let googleId: string;
      let accessToken: string | undefined;
      let refreshToken: string | undefined;

      // 이미 변환된 user 객체인 경우 (email 필드가 직접 있음)
      if (profile.email) {
        email = profile.email;
        name = profile.name || 'User';
        picture = profile.picture || null;
        googleId = profile.id;
        accessToken = profile.accessToken;
        refreshToken = profile.refreshToken;
      } 
      // 원본 profile 객체인 경우 (emails 배열)
      else if (profile.emails && profile.emails[0] && profile.emails[0].value) {
        email = profile.emails[0].value;
        name = profile.displayName || profile.name?.givenName + ' ' + profile.name?.familyName || 'User';
        picture = profile.photos?.[0]?.value || null;
        googleId = profile.id;
        accessToken = profile.accessToken;
        refreshToken = profile.refreshToken;
      } else {
        throw new Error('이메일 정보를 가져올 수 없습니다.');
      }

      console.log('=== AuthService에서 DB 저장 전 ===');
      console.log('Email:', email);
      console.log('AccessToken:', accessToken ? '있음 ✅' : '없음 ❌');
      console.log('RefreshToken:', refreshToken ? '있음 ✅✅✅' : '없음 ❌❌❌');

      const user = await this.usersService.findOrCreate({
      email,
      name,
      picture,
        googleId,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken,
    });

      console.log('=== AuthService에서 DB 저장 후 ===');
      console.log('User ID:', user.id);
      console.log('User Email:', user.email);
      console.log('최종 저장된 RefreshToken:', user.googleRefreshToken ? '있음 ✅✅✅' : '없음 ❌❌❌');

      // 구글 로그인 시에도 역할 자동 할당하지 않음
      // 관리자가 승인 후 적절한 역할을 부여해야 함

      return user;
    } catch (error) {
      console.error('validateGoogleUser 에러:', error);
      console.error('프로필 데이터:', JSON.stringify(profile, null, 2));
      throw error;
    }
  }

  async login(user: User) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    };
  }

  async validateUser(userId: number | string): Promise<User | null> {
    const id = typeof userId === 'string' ? Number(userId) : userId;
    if (Number.isNaN(id)) {
      return null;
    }
    return this.usersService.findById(id);
  }

  async validateEmailPassword(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email, true);
    if (!user || !user.password) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return user;
  }

  async register(email: string, password: string, name?: string): Promise<User> {
    const user = await this.usersService.createWithPassword({ email, password, name });
    
    // 회원가입 시 역할 자동 할당하지 않음
    // 관리자가 승인 후 적절한 역할을 부여해야 함
    
    return user;
  }

}

