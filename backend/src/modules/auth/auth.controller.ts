import { Controller, Get, Post, Req, Body, UseGuards, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const user = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.name,
    );
    const result = await this.authService.login(user);
    return result;
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateEmailPassword(
      loginDto.email,
      loginDto.password,
    );
    const result = await this.authService.login(user);
    return result;
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Google OAuth 시작
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    try {
      if (!req.user) {
        throw new Error('구글 인증 정보를 받지 못했습니다.');
      }

    const user = await this.authService.validateGoogleUser(req.user);
    const result = await this.authService.login(user);

    // 프론트엔드로 리다이렉트 (토큰 포함)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(
      `${frontendUrl}/auth/callback?token=${result.access_token}`,
    );
    } catch (error) {
      console.error('구글 로그인 콜백 에러:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(error.message || '로그인에 실패했습니다.')}`,
      );
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    return req.user;
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  async verifyToken(@Req() req) {
    // SSO용 토큰 검증 엔드포인트
    // 다른 시스템에서 토큰 유효성 확인 시 사용
    return {
      valid: true,
      user: req.user,
    };
  }

  @Get('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req) {
    // JWT는 stateless이므로 클라이언트에서 토큰 삭제
    return { message: 'Logged out successfully' };
  }
}

