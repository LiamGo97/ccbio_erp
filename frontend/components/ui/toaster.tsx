"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, duration, variant, onOpenChange, ...props }) {
        // duration이 0이면 자동으로 닫히지 않으므로, 최소 1000ms 보장
        const toastDuration = duration && duration > 0 ? duration : 3000;
        
        return (
          <Toast 
            key={id} 
            duration={toastDuration} 
            variant={variant} 
            onOpenChange={onOpenChange}
            {...props}
          >
            <div className="flex items-start gap-3 flex-1">
              {variant === 'destructive' && (
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              )}
              {variant === 'success' && (
                <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 grid gap-1">
                {title ? <ToastTitle>{title}</ToastTitle> : null}
                {description ? (
                  <ToastDescription>{description}</ToastDescription>
                ) : null}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
