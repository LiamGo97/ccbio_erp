'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { auth, User } from '@/lib/auth';
import api from '@/lib/api';
import { Send, Loader2, Database, MessageSquare } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  error?: string;
}

export default function DataChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const authed = auth.isAuthenticated();
    if (!authed) {
      router.push('/login');
      return;
    }

    const fetchUser = async () => {
      const userData = await auth.getCurrentUser();
      if (!userData) {
        router.push('/login');
        return;
      }
      setUser(userData);
      setLoading(false);
    };

    fetchUser();
  }, [router]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || sending) return;

    setQuestion('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setSending(true);

    try {
      const { data } = await api.post<{
        answer: string;
        sql?: string;
        error?: string;
      }>('/data-chat/query', { question: q });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          sql: data.sql,
          error: data.error,
        },
      ]);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
        : null;
      const errorMsg = Array.isArray(msg) ? msg.join(', ') : msg ?? '요청 처리 중 오류가 발생했습니다.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `오류: ${errorMsg}`,
          error: errorMsg,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">데이터 챗봇</h1>
          <p className="text-muted-foreground mt-1">
            자연어로 질문하면 ERP 데이터를 조회해 답변합니다. (예: 이번 달 매출 합계, 고객 수 등)
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              대화
            </CardTitle>
            <CardDescription>
              CCBio ERP 데이터베이스(고객, 판매, 배송, 거래명세서, 채권 등)에 대해 질문하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-[300px] max-h-[500px] overflow-y-auto rounded-lg border bg-muted/30 p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Database className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm">예시 질문:</p>
                  <ul className="mt-2 text-sm space-y-1">
                    <li>• 이번 달 발행된 거래명세서 건수는?</li>
                    <li>• 채권 잔액이 100만원 이상인 고객 목록</li>
                    <li>• 지역별 고객 수</li>
                  </ul>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
                        {msg.sql && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground">
                              실행된 SQL 보기
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded bg-muted-foreground/10 p-2 text-xs">
                              {msg.sql}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">조회 중...</span>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="질문을 입력하세요..."
                className="min-h-[80px] resize-none"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
              />
              <Button type="submit" disabled={sending || !question.trim()} size="icon" className="shrink-0 h-[80px] w-12">
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
