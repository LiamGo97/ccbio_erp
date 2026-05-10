'use client';

import { toast } from '@/components/ui/use-toast';

export function toastSuccess(title: string, description?: string) {
  toast({
    variant: 'success',
    title,
    description,
    duration: 3000,
  });
}

export function toastError(title: string, description?: string) {
  toast({
    variant: 'destructive',
    title,
    description,
    duration: 5000,
  });
}

export function toastApiError(error: unknown, title?: string) {
  let message = '알 수 없는 오류가 발생했습니다.';
  
  if (error && typeof error === 'object') {
    if ('response' in error && error.response && typeof error.response === 'object') {
      const response = error.response as { data?: { message?: string; error?: string } };
      message = response.data?.message || response.data?.error || message;
    } else if ('message' in error && typeof error.message === 'string') {
      message = error.message;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  toast({
    variant: 'destructive',
    title: title || '오류 발생',
    description: message,
    duration: 5000,
  });
}
