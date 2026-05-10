'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { useCompanyInfo, useUpdateCompanyInfo } from '@/lib/hooks/use-company-info';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function CompanyInfoPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const { data: companyInfo, isLoading } = useCompanyInfo();
  const updateMutation = useUpdateCompanyInfo();

  const [formData, setFormData] = React.useState({
    businessRegistrationNumber: '',
    representativeName: '',
    companyName: '',
    address: '',
    tel: '',
  });

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  React.useEffect(() => {
    if (companyInfo) {
      setFormData({
        businessRegistrationNumber: companyInfo.businessRegistrationNumber || '',
        representativeName: companyInfo.representativeName || '',
        companyName: companyInfo.companyName || '',
        address: companyInfo.address || '',
        tel: companyInfo.tel || '',
      });
    }
  }, [companyInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateMutation.mutateAsync(formData);
  };

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">회사 정보 관리</h1>
          <p className="text-sm text-muted-foreground">
            거래명세서에 표시될 회사 정보를 관리합니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>공급자 정보</CardTitle>
            <CardDescription>
              거래명세서 발행 시 사용되는 회사 정보입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="businessRegistrationNumber">사업자등록번호</Label>
                    <Input
                      id="businessRegistrationNumber"
                      value={formData.businessRegistrationNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, businessRegistrationNumber: e.target.value })
                      }
                      placeholder="521-81-03288"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="tel">전화번호 (TEL)</Label>
                    <Input
                      id="tel"
                      value={formData.tel}
                      onChange={(e) => setFormData({ ...formData, tel: e.target.value })}
                      placeholder="031-373-3288"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="representativeName">성명 (대표)</Label>
                    <Input
                      id="representativeName"
                      value={formData.representativeName}
                      onChange={(e) =>
                        setFormData({ ...formData, representativeName: e.target.value })
                      }
                      placeholder="김성오"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="companyName">상호 (회사명)</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) =>
                        setFormData({ ...formData, companyName: e.target.value })
                      }
                      placeholder="참참바이오 주식회사"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="address">주소</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="경기도 화성시 동탄광역환승로62, 438호"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      '저장'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

