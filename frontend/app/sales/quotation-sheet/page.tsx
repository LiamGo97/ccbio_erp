'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, type User } from '@/lib/auth';
import {
  QuotationSheetGridWithColumnSettings,
  type QuotationSheetGridHandle,
} from '@/components/sales/quotation-sheet-grid-with-column-settings';
import { useQuotationSheetRows } from '@/lib/hooks/use-quotation-sheet-rows';
import { Button } from '@/components/ui/button';
import { Download, FileUp } from 'lucide-react';

export default function SalesQuotationSheetPage() {
  const sheetGridRef = React.useRef<QuotationSheetGridHandle>(null);
  const [user, setUser] = React.useState<User | null>(null);

  const { remoteCells, remoteVersion, persistRow } = useQuotationSheetRows(
    !!user,
  );

  const handlePersistRow = React.useCallback(
    async (row: number, values: string[]) => {
      await persistRow({ rowIndex: row, values });
    },
    [persistRow],
  );

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  return (
    <AppLayout user={user}>
      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">견적서</h1>
            <p className="text-sm text-muted-foreground">
              변경 사항은 잠시 후 자동 저장됩니다. 탭을 벗어나면 대기 중인 저장이
              바로 전송됩니다.
            </p>
          </div>
          {user ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sheetGridRef.current?.exportExcel()}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden />
                엑셀 다운로드
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sheetGridRef.current?.openExcelImportPicker()}
              >
                <FileUp className="mr-2 h-4 w-4" aria-hidden />
                엑셀로 복구
              </Button>
            </div>
          ) : null}
        </div>

        <QuotationSheetGridWithColumnSettings
          ref={sheetGridRef}
          className="min-h-[65vh]"
          onPersistRow={handlePersistRow}
          remoteCells={remoteCells}
          remoteVersion={remoteVersion}
        />
      </div>
    </AppLayout>
  );
}

