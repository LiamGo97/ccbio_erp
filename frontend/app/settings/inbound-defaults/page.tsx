'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import {
  useInboundDefaults,
  useInboundDefaultsHistory,
  useUpdateInboundDefaults,
} from '@/lib/hooks/use-inbound-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, DollarSign, History } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/components/ui/use-toast';

const formatExchangeRate = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  const str = typeof value === 'object' ? String(value) : String(value);
  if (str.trim() === '') return '-';
  const num = parseFloat(str.replace(/,/g, ''));
  return Number.isFinite(num)
    ? num.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : '-';
};

export default function InboundDefaultsPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const { data: defaults, isLoading } = useInboundDefaults();
  const { data: history = [], isLoading: isHistoryLoading } =
    useInboundDefaultsHistory();
  const updateMutation = useUpdateInboundDefaults();

  const [usdInput, setUsdInput] = React.useState('1400');
  const [eurInput, setEurInput] = React.useState('1550');

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  React.useEffect(() => {
    if (defaults != null) {
      const usd = defaults.defaultExchangeRateUsd;
      const eur = defaults.defaultExchangeRateEur;
      setUsdInput(
        usd != null && Number.isFinite(usd) ? String(usd) : '1400',
      );
      setEurInput(
        eur != null && Number.isFinite(eur) ? String(eur) : '1550',
      );
    }
  }, [defaults]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const usdNum = parseFloat(usdInput.replace(/,/g, ''));
    const eurNum = parseFloat(eurInput.replace(/,/g, ''));
    if (!Number.isFinite(usdNum) || usdNum < 0) {
      toast({
        title: '입력 오류',
        description: 'USD 환율을 올바르게 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    if (!Number.isFinite(eurNum) || eurNum < 0) {
      toast({
        title: '입력 오류',
        description: 'EUR 환율을 올바르게 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    await updateMutation.mutateAsync({
      defaultExchangeRateUsd: usdNum,
      defaultExchangeRateEur: eurNum,
    });
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">입고 기본 설정</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            입고 예정 등록 시 사용되는 기본값을 설정합니다.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">예정 환율 기본값</CardTitle>
            </div>
            <CardDescription>
              입고 예정 등록 시 예정 환율 필드에 자동으로 채워지는 값입니다.
              통화별로 다른 기본값을 설정할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex flex-wrap items-end gap-6">
                  <div className="flex flex-col gap-2 min-w-[160px]">
                    <Label htmlFor="defaultExchangeRateUsd" className="text-sm font-medium">
                      USD (달러)
                    </Label>
                    <Input
                      id="defaultExchangeRateUsd"
                      type="text"
                      inputMode="decimal"
                      value={usdInput}
                      onChange={(e) =>
                        setUsdInput(e.target.value.replace(/[^0-9.]/g, ''))
                      }
                      placeholder="1400"
                      className="h-9 w-full max-w-[120px]"
                    />
                    <span className="text-xs text-muted-foreground">원/USD</span>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[160px]">
                    <Label htmlFor="defaultExchangeRateEur" className="text-sm font-medium">
                      EUR (유로)
                    </Label>
                    <Input
                      id="defaultExchangeRateEur"
                      type="text"
                      inputMode="decimal"
                      value={eurInput}
                      onChange={(e) =>
                        setEurInput(e.target.value.replace(/[^0-9.]/g, ''))
                      }
                      placeholder="1550"
                      className="h-9 w-full max-w-[120px]"
                    />
                    <span className="text-xs text-muted-foreground">원/EUR</span>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateMutation.isPending}
                    className="h-9"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        저장 중
                      </>
                    ) : (
                      '저장'
                    )}
                  </Button>
                  {defaults && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">
                        USD: {formatExchangeRate(defaults.defaultExchangeRateUsd)}원
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        EUR: {formatExchangeRate(defaults.defaultExchangeRateEur)}원
                      </Badge>
                    </div>
                  )}
                </div>
              </form>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">변경 이력</h3>
              </div>
              {isHistoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  변경 이력이 없습니다.
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                    <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[140px]">변경일시</TableHead>
                        <TableHead className="w-[90px] text-right">USD</TableHead>
                        <TableHead className="w-[90px] text-right">EUR</TableHead>
                        <TableHead className="w-[80px] text-right">변경자</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(
                              new Date(item.changedAt),
                              'yyyy.MM.dd HH:mm',
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-sm">
                            {formatExchangeRate(item.valueUsd)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-sm">
                            {formatExchangeRate(item.valueEur)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {item.changedByName ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
