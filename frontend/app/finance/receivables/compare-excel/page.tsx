'use client';

import * as React from 'react';
import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { useSuppliers } from '@/lib/hooks/use-suppliers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface CompareResult {
  onlyInSystem: { name: string; balance: number }[];
  onlyInExcel: { name: string; balance: number }[];
  balanceMismatch: {
    name: string;
    systemBalance: number;
    excelBalance: number;
    difference: number;
  }[];
  matchCount: number;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR').format(value);

function CompareExcelPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: suppliers } = useSuppliers();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!['.xlsx', '.xls'].includes(ext)) {
      toast({
        title: '파일 형식 오류',
        description: 'Excel 파일(.xlsx, .xls)만 업로드 가능합니다.',
        variant: 'destructive',
      });
      return;
    }
    setExcelFile(file);
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!excelFile) {
      toast({
        title: '파일 선택 필요',
        description: '이카운트에서 내려받은 엑셀 파일을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setAnalyzing(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', excelFile);

      const params: Record<string, string> = {};
      if (selectedSupplierId && selectedSupplierId !== 'all') {
        params.supplierIds = selectedSupplierId;
      }
      const { data } = await api.post<CompareResult>(
        '/receivables/compare-with-excel',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          params,
        },
      );

      setResult(data);
      toast({
        title: '분석 완료',
        description: `시스템 ${data.onlyInSystem.length}건, 엑셀 ${data.onlyInExcel.length}건, 불일치 ${data.balanceMismatch.length}건, 일치 ${data.matchCount}건`,
      });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiErr?.response?.data?.message ?? apiErr?.message ?? '분석 중 오류가 발생했습니다.';
      toast({
        title: '분석 실패',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setExcelFile(null);
    setSelectedSupplierId('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">이카운트 잔액 비교</h1>
          <p className="text-muted-foreground text-sm">
            이카운트에서 내려받은 거래처별 채권 엑셀과 시스템 채권 데이터를 비교합니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>엑셀 파일 및 공급자 선택</CardTitle>
            <CardDescription>
              이카운트에서 내려받은 엑셀 파일(.xlsx)을 선택하고, 비교할 공급자를 선택한 뒤 분석 버튼을 누르세요. 공급자를 선택하면 해당 공급자의 시스템 채권 데이터만 엑셀과 비교합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium">공급자</Label>
                <Select
                  value={selectedSupplierId || 'all'}
                  onValueChange={(v) => {
                    setSelectedSupplierId(v === 'all' ? '' : v);
                    setResult(null);
                  }}
                >
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>
                        {supplier.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Label className="whitespace-nowrap text-sm font-medium">파일 선택</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  파일 선택
                </Button>
                <Label className="text-sm text-muted-foreground truncate flex-1">
                  {excelFile ? excelFile.name : '선택된 파일 없음'}
                </Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAnalyze} disabled={!excelFile || analyzing}>
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    분석
                  </>
                )}
              </Button>
              {(excelFile || result || selectedSupplierId) && (
                <Button variant="outline" onClick={handleReset} disabled={analyzing}>
                  초기화
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>잔액 일치 {result.matchCount}건</span>
            </div>

            {/* 첫 줄: 시스템 | 엑셀 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 시스템에만 있음 */}
              <Card className="flex flex-col min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  시스템에만 있는 데이터
                  <Badge variant="secondary">{result.onlyInSystem.length}건</Badge>
                </CardTitle>
                <CardDescription>
                  시스템에는 있으나 이카운트 엑셀에는 없는 거래처 (0원 잔액 제외)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.onlyInSystem.length === 0 ? (
                  <p className="text-sm text-muted-foreground">없음</p>
                ) : (
                  <div className="rounded-md border overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead>회사명</TableHead>
                          <TableHead className="text-right">잔액</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.onlyInSystem.map((row, i) => (
                          <TableRow key={`sys-${i}`} className="h-10">
                            <TableCell>{row.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(row.balance)}원
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

              {/* 엑셀에만 있음 */}
              <Card className="flex flex-col min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  엑셀에만 있는 데이터
                  <Badge variant="secondary">{result.onlyInExcel.length}건</Badge>
                </CardTitle>
                <CardDescription>
                  이카운트 엑셀에는 있으나 시스템에는 없는 거래처 (잔액 빈 행 제외)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.onlyInExcel.length === 0 ? (
                  <p className="text-sm text-muted-foreground">없음</p>
                ) : (
                  <div className="rounded-md border overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead>거래처명</TableHead>
                          <TableHead className="text-right">잔액</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.onlyInExcel.map((row, i) => (
                          <TableRow key={`excel-${i}`} className="h-10">
                            <TableCell>{row.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(row.balance)}원
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>

            {/* 둘째 줄: 잔액 불일치 */}
            <Card className="flex flex-col min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  잔액 불일치
                  <Badge variant="destructive">{result.balanceMismatch.length}건</Badge>
                </CardTitle>
                <CardDescription>
                  양쪽 모두 있는데 잔액이 다른 거래처
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.balanceMismatch.length === 0 ? (
                  <p className="text-sm text-muted-foreground">없음</p>
                ) : (
                  <div className="rounded-md border overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead>거래처명</TableHead>
                          <TableHead className="text-right">시스템 잔액</TableHead>
                          <TableHead className="text-right">엑셀 잔액</TableHead>
                          <TableHead className="text-right">차이</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.balanceMismatch.map((row, i) => (
                          <TableRow key={`mismatch-${i}`} className="h-10">
                            <TableCell>{row.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(row.systemBalance)}원
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(row.excelBalance)}원
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono ${
                                row.difference > 0 ? 'text-red-600' : 'text-blue-600'
                              }`}
                            >
                              {row.difference > 0 ? '+' : ''}
                              {formatNumber(row.difference)}원
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function CompareExcelPage() {
  return (
    <CompareExcelPageContent />
  );
}
