import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS 설정 - 여러 프론트엔드 도메인 지원 (SSO용)
  const port = process.env.PORT || 3001;
  const swaggerUrl = `http://localhost:${port}`;
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [process.env.FRONTEND_URL || 'http://localhost:3000'];

  app.enableCors({
    origin: (origin, callback) => {
      // 개발 환경에서는 모든 origin 허용 (Swagger UI 포함)
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }

      // origin이 없으면 통과 (서버 간 내부 호출 등)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Cloud Run 환경: 같은 도메인에서 오는 요청은 모두 허용
      // (프론트엔드와 백엔드가 같은 서비스에서 서빙되므로)
      if (origin.includes('run.app')) {
        callback(null, true);
        return;
      }

      // Swagger 또는 허용 목록에 있으면 통과
      if (
        origin === swaggerUrl ||
        origin.startsWith(swaggerUrl) ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Client-Path'],
  });

  // 전역 Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        console.error('[ValidationPipe] 검증 실패:', JSON.stringify(errors, null, 2));
        return new BadRequestException({
          message: 'Validation failed',
          errors: errors,
        });
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Serve Next.js static files in production
  if (process.env.NODE_ENV === 'production') {
    // frontend/out is copied to /app/backend/frontend/out in Dockerfile
    // Use absolute path to ensure correct location in Docker container
    const frontendPath = process.env.FRONTEND_PATH || join('/app/backend', 'frontend', 'out');
    const fs = require('fs');
    
    // Check if frontend build exists
    console.log(`🔍 Checking frontend path: ${frontendPath}`);
    console.log(`   __dirname: ${__dirname}`);
    console.log(`   Current working directory: ${process.cwd()}`);
    
    // List all possible paths
    const appDir = '/app';
    const backendDir = '/app/backend';
    const frontendDir = '/app/frontend';
    
    console.log(`📁 Directory structure check:`);
    if (fs.existsSync(appDir)) {
      console.log(`   /app contents: ${fs.readdirSync(appDir).join(', ')}`);
    }
    if (fs.existsSync(backendDir)) {
      console.log(`   /app/backend contents: ${fs.readdirSync(backendDir).join(', ')}`);
    }
    if (fs.existsSync(frontendDir)) {
      console.log(`   /app/frontend contents: ${fs.readdirSync(frontendDir).join(', ')}`);
    }
    
    if (!fs.existsSync(frontendPath)) {
      console.error(`❌ Frontend build not found at: ${frontendPath}`);
    } else {
      console.log(`✅ Frontend build found at: ${frontendPath}`);
      const indexPath = join(frontendPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log(`✅ index.html found at: ${indexPath}`);
      } else {
        console.error(`❌ index.html not found at: ${indexPath}`);
        console.error(`   Frontend directory contents: ${fs.readdirSync(frontendPath).join(', ')}`);
      }
    }
    
    // Serve static assets and allow extension-less .html resolution (e.g. /auth/callback -> auth/callback/index.html)
    app.useStaticAssets(frontendPath, {
      index: false,
      extensions: ['html'],
    });
    app.setBaseViewsDir(frontendPath);
    
    // Serve exported Next.js HTML for any non-API route, falling back to index.html
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }

      const cleanPath = req.path.split('?')[0];
      const trimmed =
        !cleanPath || cleanPath === '/' ? '' : cleanPath.replace(/\/+$/, '');
      const relative = trimmed.replace(/^\//, '');

      const candidateFiles: string[] = [];
      if (relative) {
        // e.g. /auth/callback -> auth/callback.html
        candidateFiles.push(join(frontendPath, `${relative}.html`));
        // e.g. /auth/callback or /auth/callback/ -> auth/callback/index.html
        candidateFiles.push(join(frontendPath, relative, 'index.html'));
      }

      const indexPath = join(frontendPath, 'index.html');
      candidateFiles.push(indexPath);

      for (const filePath of candidateFiles) {
        if (fs.existsSync(filePath)) {
          if (filePath !== indexPath) {
            console.log(`📄 Serving static page for ${req.path}: ${filePath}`);
          }
          return res.sendFile(filePath);
        }
      }

      console.error(`❌ No matching static file for ${req.path}, fallback failed`);
      return res.status(404).send('Page not found');
    });
  }

  // Swagger 설정
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CCBio ERP API')
    .setDescription('CCBio ERP 및 내부 시스템을 위한 백엔드 API 문서')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'JWT access token을 입력하세요. (예: Bearer <token>)',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'CCBio ERP API Docs',
  });

  await app.listen(port, '0.0.0.0'); // 모든 네트워크 인터페이스에서 접근 가능하도록 설정
  const serverUrl = process.env.SERVER_URL || `http://localhost:${port}`;
  console.log(`🚀 Server is running on: ${serverUrl}/api`);
  console.log(`📘 Swagger docs available at: ${serverUrl}/api/docs`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  console.error('Error stack:', error.stack);
  process.exit(1);
});

