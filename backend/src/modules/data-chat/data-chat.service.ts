import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import OpenAI from 'openai';
import { CCBIO_ERP_SCHEMA } from './ccbio-erp-schema';

const DANGEROUS_PATTERNS = [
  /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE)\b/i,
  /;\s*DROP/i,
  /;\s*DELETE/i,
  /;\s*UPDATE/i,
];

const MAX_RETRIES = 2;
const QUERY_TIMEOUT_MS = 30_000;

export interface DataChatRequest {
  question: string;
}

export interface DataChatResponse {
  answer: string;
  sql?: string;
  rawRows?: unknown[];
  error?: string;
}

@Injectable()
export class DataChatService implements OnModuleInit {
  private readonly logger = new Logger(DataChatService.name);
  private openai?: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn('OPENAI_API_KEY가 설정되어 있지 않습니다. 데이터 챗봇이 동작하지 않습니다.');
    }
  }

  onModuleInit() {
    if (!this.openai) {
      this.logger.warn('[DataChat] OpenAI 미설정 - 데이터 챗봇 비활성화');
    }
  }

  private validateSql(sql: string): void {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
      throw new BadRequestException('SELECT 쿼리만 실행할 수 있습니다.');
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        throw new BadRequestException('허용되지 않은 SQL 문이 포함되어 있습니다.');
      }
    }
  }

  private extractSqlFromResponse(text: string): string | null {
    const codeBlockMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    const selectMatch = text.match(/(SELECT[\s\S]+?)(?=;|$)/i);
    if (selectMatch) {
      return selectMatch[1].trim() + (text.includes(';') ? ';' : '');
    }
    return null;
  }

  async chat(dto: DataChatRequest): Promise<DataChatResponse> {
    if (!this.openai) {
      throw new BadRequestException('OPENAI_API_KEY가 설정되지 않아 데이터 챗봇을 사용할 수 없습니다.');
    }

    const { question } = dto;
    if (!question?.trim()) {
      throw new BadRequestException('질문을 입력해 주세요.');
    }

    let lastError: string | undefined;
    let sql: string | null = null;
    let rawRows: unknown[] = [];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const sqlPrompt = `당신은 PostgreSQL 데이터베이스 전문가입니다.
아래 스키마를 참고하여, 사용자 질문에 맞는 SELECT 쿼리만 생성하세요.
반드시 PostgreSQL 문법을 사용하고, 쿼리만 출력하세요 (설명 없이).
코드 블록으로 감싸지 말고, 순수 SQL만 반환하세요.

**중요 - 테이블 별칭 규칙**:
- JOIN/서브쿼리 시 테이블 별칭(alias)을 사용하세요.
- **지정한 별칭을 쿼리 전체에서 동일하게 사용**하세요. FROM tb_container c 라면 SELECT/WHERE/GROUP BY 모두 c.컬럼명 사용. (c로 정의했는데 co, t 등 다른 별칭을 쓰면 "missing FROM-clause entry" 에러 발생)
- 모든 컬럼 참조에 "별칭.컬럼명" 형식으로 명시하세요.

${CCBIO_ERP_SCHEMA}

사용자 질문: ${question}

SELECT 쿼리:`;

        const sqlCompletion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'PostgreSQL SELECT 쿼리만 생성합니다. INSERT, UPDATE, DELETE, DROP 등은 절대 사용하지 않습니다. 테이블 별칭을 지정하면 쿼리 전체에서 그 별칭만 사용하세요 (예: FROM tb_container c 인 경우 SELECT c.co_id, COUNT(c.co_id) - co나 다른 별칭 사용 금지). 모든 컬럼 참조에 "별칭.컬럼명" 형식 사용. 쿼리만 출력하고 설명은 하지 않습니다.',
            },
            { role: 'user', content: sqlPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        });

        const sqlText = sqlCompletion.choices[0]?.message?.content?.trim();
        if (!sqlText) {
          throw new Error('GPT가 SQL을 생성하지 않았습니다.');
        }

        sql = this.extractSqlFromResponse(sqlText) || sqlText;
        this.validateSql(sql);

        const result = await Promise.race([
          this.dataSource.query(sql),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('쿼리 실행 시간 초과')), QUERY_TIMEOUT_MS),
          ),
        ]);
        rawRows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? [];
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;
        this.logger.warn(`[DataChat] SQL 실행 실패 (attempt ${attempt + 1}): ${msg}`);

        if (attempt < MAX_RETRIES && this.openai) {
          const retryPrompt = `이전 SQL 실행이 실패했습니다.
에러: ${msg}
원본 질문: ${question}

**수정 시 유의**:
- "missing FROM-clause entry for table X": FROM에 정의한 별칭만 사용. (예: FROM tb_container c 인데 co.co_id 사용 → c.co_id로 수정)
- "ambiguous": 모든 컬럼에 "별칭.컬럼명" 명시

수정된 SELECT 쿼리만 다시 생성하세요 (설명 없이):`;

          const retryCompletion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'PostgreSQL SELECT 쿼리만 생성합니다. "missing FROM-clause entry for table X" 에러 시: FROM에 정의한 별칭만 사용하세요. (예: FROM tb_container c 인데 SELECT co.co_id 사용 시 에러 - c.co_id로 수정). "ambiguous" 에러 시 모든 컬럼에 "별칭.컬럼명" 명시. 에러를 반영해 수정된 쿼리를 출력합니다.',
              },
              { role: 'user', content: retryPrompt },
            ],
            temperature: 0.1,
            max_tokens: 1024,
          });

          const retrySqlText = retryCompletion.choices[0]?.message?.content?.trim();
          if (retrySqlText) {
            sql = this.extractSqlFromResponse(retrySqlText) || retrySqlText;
            this.validateSql(sql);
          }
        } else {
          break;
        }
      }
    }

    if (lastError && rawRows.length === 0) {
      return {
        answer: `쿼리 실행 중 오류가 발생했습니다: ${lastError}`,
        sql: sql ?? undefined,
        error: lastError,
      };
    }

    const summaryPrompt = `당신은 데이터 분석가입니다.
사용자 질문: "${question}"
실행된 SQL 결과 (최대 50행): ${JSON.stringify(rawRows.slice(0, 50))}

위 결과를 바탕으로 사용자 질문에 대한 답변을 한국어로 간결하게 작성하세요.
숫자는 적절히 포맷하고, 표 형태가 적절하면 마크다운 테이블로 정리하세요.`;

    const summaryCompletion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '데이터 결과를 바탕으로 사용자 질문에 대한 답변을 한국어로 작성합니다.',
        },
        { role: 'user', content: summaryPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });

    const answer = summaryCompletion.choices[0]?.message?.content?.trim() ?? '결과를 요약할 수 없습니다.';

    return {
      answer,
      sql: sql ?? undefined,
      rawRows: rawRows.length > 0 ? rawRows.slice(0, 100) : undefined,
    };
  }
}
