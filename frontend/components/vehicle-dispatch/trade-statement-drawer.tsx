'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { VehicleDispatch } from '@/lib/hooks/use-vehicle-dispatch';
import { Label } from '@/components/ui/label';
import { X, Loader2, Camera, Send, FileText } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import api from '@/lib/api';

export interface TradeStatementDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleDispatch?: VehicleDispatch | null;
  onSubmit?: (data: TradeStatementFormData) => Promise<void>;
}

export interface TradeStatementFormData {
  issueDate: string;
  statementNumber?: string;
  unitPrice?: number;
  sent: boolean;
  sentDate?: string;
}

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'yyyy-MM-dd', { locale: ko });
};

export function TradeStatementDrawer({
  open,
  onOpenChange,
  vehicleDispatch,
  onSubmit,
}: TradeStatementDrawerProps) {
  const isMobile = useIsMobile();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const statementRef = React.useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { isDirty } } = useForm<TradeStatementFormData>({
    defaultValues: {
      issueDate: format(new Date(), 'yyyy-MM-dd'),
      statementNumber: '',
      unitPrice: undefined,
      sent: false,
      sentDate: '',
    },
  });

  const sent = watch('sent');

  React.useEffect(() => {
    if (open) {
      reset({
        issueDate: format(new Date(), 'yyyy-MM-dd'),
        statementNumber: '',
        unitPrice: undefined,
        sent: false,
        sentDate: '',
      });
    }
  }, [open, reset]);

  const handleCapture = async () => {
    if (!statementRef.current) {
      toast({
        title: '오류',
        description: '명세서 영역을 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsCapturing(true);
    try {
      // html2canvas를 사용하여 화면 캡처
      // MMS 전송을 위해 scale을 낮춰서 이미지 크기 감소 (알리고 API 제한 고려)
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(statementRef.current, {
        backgroundColor: '#ffffff',
        scale: 1, // scale: 2에서 1로 변경하여 이미지 크기 절반으로 감소
        logging: false,
      });

      // canvas를 blob으로 변환
      canvas.toBlob((blob) => {
        if (blob) {
          // TODO: 이미지를 서버에 업로드하고 URL을 받아오는 로직 필요
          // 현재는 다운로드만 수행
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `거래명세서_${vehicleDispatch?.id || 'unknown'}_${format(new Date(), 'yyyyMMdd')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          toast({
            title: '캡처 완료',
            description: '거래 명세서가 다운로드되었습니다.',
          });
        }
      }, 'image/png');
    } catch (error) {
      console.error('캡처 오류:', error);
      toast({
        title: '캡처 실패',
        description: '거래 명세서 캡처 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFormSubmit = async (data: TradeStatementFormData) => {
    if (!onSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(data);
      toast({
        title: '발행 완료',
        description: '거래 명세서가 발행되었습니다.',
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('거래 명세서 발행 오류:', error);
      toast({
        title: '발행 실패',
        description: error?.response?.data?.message || '거래 명세서 발행 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendSms = async () => {
    if (!statementRef.current) {
      toast({
        title: '오류',
        description: '명세서 영역을 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!vehicleDispatch?.phone) {
      toast({
        title: '오류',
        description: '수신자 전화번호가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsCapturing(true);
    try {
      // 1. html2canvas로 화면 캡처
      // MMS 전송을 위해 scale을 낮춰서 이미지 크기 감소 (알리고 API 제한 고려)
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(statementRef.current, {
        backgroundColor: '#ffffff',
        scale: 1, // scale: 2에서 1로 변경하여 이미지 크기 절반으로 감소
        logging: false,
      });

      // 2. canvas를 blob으로 변환 (JPEG로 변환하여 용량 절감)
      // 알리고 API 제한을 고려하여 JPEG 형식 사용, 품질 0.8
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('이미지 변환 실패'));
          }
        }, 'image/jpeg', 0.8); // PNG 대신 JPEG, 품질 80%
      });

      // 3. FormData로 서버에 업로드
      const formData = new FormData();
      formData.append('file', blob, `거래명세서_${vehicleDispatch.id}_${format(new Date(), 'yyyyMMdd')}.jpg`);

      const uploadResponse = await api.post<{ success: boolean; url: string; path: string }>(
        '/storage/upload/image',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (!uploadResponse.data.success || !uploadResponse.data.url) {
        throw new Error('이미지 업로드 실패');
      }

      // 4. 알리고 API로 MMS 발송
      const smsResponse = await api.post('/aligo/sms/send', {
        message: `거래명세서를 발송합니다.\n발행일: ${watch('issueDate') ? format(new Date(watch('issueDate')), 'yyyy-MM-dd', { locale: ko }) : format(new Date(), 'yyyy-MM-dd', { locale: ko })}`,
        recipients: [
          {
            phone: vehicleDispatch.phone,
            name: vehicleDispatch.companyName || undefined,
          },
        ],
        imageUrl: uploadResponse.data.url,
      });

      toast({
        title: '발송 완료',
        description: '거래명세서가 문자로 발송되었습니다.',
      });

      // 발송 완료 체크박스 자동 체크
      setValue('sent', true, { shouldDirty: true });
      setValue('sentDate', format(new Date(), 'yyyy-MM-dd'), { shouldDirty: true });
    } catch (error: any) {
      console.error('문자 발송 오류:', error);
      toast({
        title: '발송 실패',
        description: error?.response?.data?.message || '거래명세서 발송 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsCapturing(false);
    }
  };

  // 거래 명세서에 표시할 데이터 계산 (Hooks는 항상 같은 순서로 호출되어야 함)
  const totalWeight = React.useMemo(() => {
    if (!vehicleDispatch?.loadingItems || vehicleDispatch.loadingItems.length === 0) return 0;
    return vehicleDispatch.loadingItems.reduce((sum, item) => {
      const weight = parseFloat(item.workWeight || '0');
      return sum + (isNaN(weight) ? 0 : weight);
    }, 0);
  }, [vehicleDispatch?.loadingItems]);

  const totalTransportFee = vehicleDispatch?.transportFee || 0;
  const totalWeighingFee = vehicleDispatch?.weighingFee || 0;
  const totalAmount = totalTransportFee + totalWeighingFee;

  if (!vehicleDispatch) {
    return null;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full flex flex-col"
        style={{ width: isMobile ? '100vw' : '1200px', maxWidth: isMobile ? '100vw' : '95vw' }}
      >
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <DrawerTitle>거래 명세서 발행</DrawerTitle>
              <DrawerDescription>
                이카운트 ERP 형식의 거래 명세서를 발행하고 문자로 발송할 수 있습니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            {/* 입력 필드 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="issueDate">발행일</Label>
                <Input
                  id="issueDate"
                  type="date"
                  {...register('issueDate', { required: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="statementNumber">명세서 번호 (선택)</Label>
                <Input
                  id="statementNumber"
                  {...register('statementNumber')}
                  placeholder="자동 생성"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitPrice">단가</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  {...register('unitPrice', { valueAsNumber: true })}
                  placeholder="단가 입력"
                />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sent"
                    checked={sent}
                    onCheckedChange={(checked) => setValue('sent', checked === true, { shouldDirty: true })}
                  />
                  <Label htmlFor="sent" className="cursor-pointer">
                    발송 완료
                  </Label>
                </div>
              </div>
              {sent && (
                <div className="space-y-2">
                  <Label htmlFor="sentDate">발송일</Label>
                  <Input
                    id="sentDate"
                    type="date"
                    {...register('sentDate')}
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
              )}
            </div>

            {/* 거래 명세서 화면 - 이카운트 ERP 형식 */}
            <div
              ref={statementRef}
              className="bg-white p-12 shadow-lg"
              style={{ minHeight: '800px', fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: '1.6', overflow: 'visible' }}
            >
              {/* 상단 레이아웃: 왼쪽 제목 + 네모칸, 오른쪽 공급자 테이블 */}
              <div className="flex justify-between items-end mb-10 gap-8">
                {/* 왼쪽: 거래명세서 제목 + 하단 네모칸 */}
                <div className="flex-[1.2]">
                  {/* 거래명세서 제목 */}
                  <div className="mb-2">
                    <h1 className="text-4xl font-bold" style={{ letterSpacing: '3px' }}>거래명세서</h1>
                  </div>
                  
                  {/* 하단 네모칸 (농가 정보) */}
                  <div className="mt-2">
                    <div className="w-full border-2 border-black p-3" style={{ minHeight: '80px' }}>
                      <div className="text-base">
                        <p className="font-semibold mb-1 text-lg">{vehicleDispatch.companyName || '-'}</p>
                        <p className="text-gray-800 mb-1">
                          {vehicleDispatch.unloadingPostalCode && `[${vehicleDispatch.unloadingPostalCode}] `}
                          {vehicleDispatch.unloadingAddress || ''}
                          {vehicleDispatch.unloadingAddressDetail && ` ${vehicleDispatch.unloadingAddressDetail}`}
                        </p>
                        <p className="text-gray-800">
                          {vehicleDispatch.phone ? `☎ ${formatPhone(vehicleDispatch.phone)}` : '☎ -'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 오른쪽: 공급자 정보 (테이블 형식) */}
                <div className="flex-[1.2] relative" style={{ overflow: 'visible' }}>
                  <table className="text-sm border-collapse" style={{ border: '1px solid #000', width: '100%' }}>
                    <tbody>
                      <tr>
                        <td 
                          className="border border-black px-3 py-2 text-center font-semibold align-middle" 
                          rowSpan={4}
                          style={{ writingMode: 'vertical-rl', textOrientation: 'upright', width: '40px' }}
                        >
                          공급자
                        </td>
                        <td className="border border-black px-3 py-2 font-semibold" style={{ width: '120px' }}>일련번호</td>
                        <td className="border border-black px-3 py-2">{watch('issueDate') ? format(new Date(watch('issueDate')), 'yyyy/MM/dd', { locale: ko }) : format(new Date(), 'yyyy/MM/dd', { locale: ko })} {watch('statementNumber') ? `-${watch('statementNumber')}` : '-28'}</td>
                        <td className="border border-black px-3 py-2 font-semibold" style={{ width: '60px' }}>TEL</td>
                        <td className="border border-black px-3 py-2">031-373-3288</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-3 py-2 font-semibold">사업자등록번호</td>
                        <td className="border border-black px-3 py-2">521-81-03288</td>
                        <td className="border border-black px-3 py-2 font-semibold">성명</td>
                        <td className="border border-black px-3 py-2">김성오</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-3 py-2 font-semibold">상호</td>
                        <td className="border border-black px-3 py-2" colSpan={3}>참참바이오 주식회사</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-3 py-2 font-semibold">주소</td>
                        <td className="border border-black px-3 py-2" colSpan={3}>경기도 화성시 동탄광역환승로62, 438호</td>
                      </tr>
                    </tbody>
                  </table>
                  {/* 도장 레이어 (테이블 위에 absolute positioned) */}
                  <div className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible', zIndex: 10 }}>
                    <div className="relative w-full h-full" style={{ overflow: 'visible' }}>
                      <img 
                        src="/stamps/stamp.png" 
                        alt="도장" 
                        className="absolute object-contain"
                        style={{ 
                          width: '240px', 
                          height: '240px',
                          top: 'calc(50% - 10px)',
                          right: '-70px',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 총액 표시 */}
              <div className="mb-6 flex justify-between items-center pb-2" style={{ borderBottom: '2px solid #000' }}>
                <div>
                  <span className="font-semibold text-base">금 액</span>
                  <span className="ml-4 text-xl font-bold">
                    {totalAmount.toLocaleString()}원 정
                  </span>
                </div>
                <div className="text-xl font-bold">
                  (₩{totalAmount.toLocaleString()})
                </div>
              </div>

              {/* 품목 목록 테이블 */}
              <div className="mb-6">
                <table className="w-full border-collapse" style={{ border: '1px solid #000' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #000' }}>
                      <th className="border border-black px-3 py-2.5 text-center font-semibold" style={{ width: '8%' }}>일자</th>
                      <th className="border border-black px-3 py-2.5 text-center font-semibold" style={{ width: '32%' }}>품목명[규격]</th>
                      <th className="border border-black px-3 py-2.5 text-center font-semibold" style={{ width: '15%' }}>수량(단위포함)</th>
                      <th className="border border-black px-3 py-2.5 text-center font-semibold" style={{ width: '12%' }}>단가</th>
                      <th className="border border-black px-3 py-2.5 text-center font-semibold" style={{ width: '18%' }}>공급가액</th>
                      <th className="border border-black px-3 py-2.5 text-center font-semibold" style={{ width: '15%' }}>부가세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleDispatch.loadingItems && vehicleDispatch.loadingItems.length > 0 ? (
                      <>
                        {vehicleDispatch.loadingItems.map((item, index) => {
                          const issueDate = watch('issueDate') ? format(new Date(watch('issueDate')), 'MM/dd', { locale: ko }) : format(new Date(), 'MM/dd', { locale: ko });
                          const weight = parseFloat(item.workWeight || '0');
                          const inputUnitPrice = watch('unitPrice') || 0;
                          const unitPrice = inputUnitPrice > 0 ? inputUnitPrice : (weight > 0 ? Math.round(totalAmount / weight) : 0);
                          const supplyAmount = Math.round(unitPrice * weight);
                          
                          // 수량 포맷팅: 소수점 이하 0 제거 후 콤마 추가
                          const formatWeight = (w: number): string => {
                            if (w === 0) return '-';
                            const formatted = parseFloat(w.toFixed(3)).toString();
                            return `${parseFloat(formatted).toLocaleString('ko-KR')} MT`;
                          };
                          
                          return (
                            <tr key={item.id || index} style={{ borderBottom: '1px solid #000' }}>
                              <td className="border border-black px-3 py-2.5 text-center">{issueDate}</td>
                              <td className="border border-black px-3 py-2.5">
                                운송서비스 [{item.workBL || item.requestBL || '-'}]
                                {item.workContainer || item.requestContainer ? ` (${item.workContainer || item.requestContainer})` : ''}
                              </td>
                              <td className="border border-black px-3 py-2.5 text-right">{formatWeight(weight)}</td>
                              <td className="border border-black px-3 py-2.5 text-right">{unitPrice > 0 ? unitPrice.toLocaleString() : '-'}</td>
                              <td className="border border-black px-3 py-2.5 text-right">{supplyAmount > 0 ? supplyAmount.toLocaleString() : '-'}</td>
                              <td className="border border-black px-3 py-2.5 text-right"></td>
                            </tr>
                          );
                        })}
                        {/* 빈 행 추가 (최대 8개 행) */}
                        {Array.from({ length: Math.max(0, 8 - (vehicleDispatch.loadingItems?.length || 0)) }).map((_, index) => (
                          <tr key={`empty-${index}`} style={{ height: '38px' }}>
                            <td className="border border-black px-3 py-2.5"></td>
                            <td className="border border-black px-3 py-2.5"></td>
                            <td className="border border-black px-3 py-2.5"></td>
                            <td className="border border-black px-3 py-2.5"></td>
                            <td className="border border-black px-3 py-2.5"></td>
                            <td className="border border-black px-3 py-2.5"></td>
                          </tr>
                        ))}
                      </>
                    ) : (
                      Array.from({ length: 8 }).map((_, index) => (
                        <tr key={`empty-${index}`} style={{ height: '38px' }}>
                          <td className="border border-black px-3 py-2.5"></td>
                          <td className="border border-black px-3 py-2.5"></td>
                          <td className="border border-black px-3 py-2.5"></td>
                          <td className="border border-black px-3 py-2.5"></td>
                          <td className="border border-black px-3 py-2.5"></td>
                          <td className="border border-black px-3 py-2.5"></td>
                        </tr>
                      ))
                    )}
                    {/* 합계 행 */}
                    <tr style={{ borderTop: '2px solid #000', borderBottom: '1px solid #000', backgroundColor: '#f9f9f9' }}>
                      <td className="border border-black px-3 py-2.5 text-center font-semibold" colSpan={2}>합계</td>
                      <td className="border border-black px-3 py-2.5 text-right font-semibold">
                        {totalWeight > 0 ? parseFloat(totalWeight.toFixed(3)).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="border border-black px-3 py-2.5"></td>
                      <td className="border border-black px-3 py-2.5 text-right font-semibold">{totalAmount.toLocaleString()}</td>
                      <td className="border border-black px-3 py-2.5 text-right font-semibold">0</td>
                    </tr>
                    {/* 인수/인 행 */}
                    <tr style={{ borderTop: '1px solid #000' }}>
                      <td className="border border-black px-3 py-2.5 text-center font-semibold" colSpan={4}>인수</td>
                      <td className="border border-black px-3 py-2.5"></td>
                      <td className="border border-black px-3 py-2.5 text-center font-semibold">인</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <div className="flex justify-between gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isCapturing || !statementRef.current}
                onClick={handleCapture}
              >
                {isCapturing ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    캡처 중...
                  </>
                ) : (
                  <>
                    <Camera className="mr-1.5 h-4 w-4" />
                    화면 캡처
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={handleSendSms}
              >
                <Send className="mr-1.5 h-4 w-4" />
                문자 발송
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
              <Button
                type="submit"
                onClick={handleSubmit(handleFormSubmit)}
                disabled={isSubmitting || !isDirty}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    발행 중...
                  </>
                ) : (
                  <>
                    <FileText className="mr-1.5 h-4 w-4" />
                    발행하기
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

