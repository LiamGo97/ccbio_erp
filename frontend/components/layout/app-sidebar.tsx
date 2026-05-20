'use client';

import * as React from 'react';
import {
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  UserCog,
  Calendar,
  CalendarDays,
  Database,
  ClipboardList,
  Building2,
  PhoneCall,
  BarChart,
  Package,
  Leaf,
  Truck,
  Warehouse,
  LayoutDashboard,
  FileText,
  CheckCircle2,
  XCircle,
  CalendarClock,
  CheckSquare,
  ShoppingCart,
  Clock,
  DollarSign,
  Receipt,
  Loader2,
  Ship,
  Settings,
  MessageSquare,
  Send,
  Store,
  AlertTriangle,
  RefreshCw,
  Scale,
  CalendarPlus,
  Table2,
  MapPin,
  Layers,
  Contact,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarRail, useSidebar, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { auth, User } from '@/lib/auth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: User | null;
}

/** `true`이면 사이드바에 「판매예약」 메뉴를 표시합니다. */
const SHOW_SALES_RESERVATION_SIDEBAR_MENU = false;

/** `true`이면 사이드바에 그리드형 「판매예약」 메뉴를 표시합니다. */
const SHOW_SALES_RESERVATION_SHEET_SIDEBAR_MENU = true;

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();

  const normalizedPathname = React.useMemo(() => {
    if (!pathname) {
      return '/';
    }
    if (pathname === '/') {
      return '/';
    }
    return pathname.replace(/\/+$/, '') || '/';
  }, [pathname]);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[AppSidebar] active pathname:', normalizedPathname);
    }
  }, [normalizedPathname]);

  const handleLogout = async () => {
    await auth.logout();
  };

  const isCollapsed = state === 'collapsed';
  const isConsultationsPath =
    normalizedPathname === '/consultations' ||
    normalizedPathname === '/customers';
  const isConsultationsDashboard = normalizedPathname === '/consultations/dashboard';
  /** 상담 관리 그룹(상담·고객·대시보드)에서 현재 위치 */
  const isConsultationsGroupPath =
    isConsultationsPath || isConsultationsDashboard;
  const isCustomersDashboard = normalizedPathname === '/customers/dashboard';
  const isSalesPath = normalizedPathname === '/sales';
  const isVehicleDispatchUserPath = normalizedPathname === '/vehicle-dispatch-user';
  const isVehicleDispatchWarehousePath = normalizedPathname === '/vehicle-dispatch-warehouse';
  const isTransportPath = normalizedPathname?.startsWith('/transport') && normalizedPathname !== '/dispatch-company/dispatch-management';
  const isTransportDashboardPath = normalizedPathname === '/transport/dashboard';
  const isDispatchManagementPath = normalizedPathname === '/transport/dispatch-management';
  const isDispatchRequestPath = normalizedPathname === '/transport/dispatch-request';
  const isDispatchDispatchingPath = normalizedPathname === '/transport/dispatch-dispatching';
  const isDispatchCompletedPath = normalizedPathname === '/transport/dispatch-completed';
  const isDispatchFailedPath = normalizedPathname === '/transport/dispatch-failed';
  const isDispatchRescheduledPath = normalizedPathname === '/transport/dispatch-rescheduled';
  const isLoadingPath = normalizedPathname === '/transport/loading';
  const isLoadingCompletedPath = normalizedPathname === '/transport/loading-completed';
  const isUnloadingCompletedPath = normalizedPathname === '/transport/unloading-completed';
  const isWarehousePath = normalizedPathname === '/warehouses';
  const isDispatchCompanyPath = normalizedPathname === '/dispatch-companies';
  const isUnloadingCompanyPath = normalizedPathname === '/unloading-companies';
  const isCompanyManagementPath = 
    normalizedPathname === '/warehouses' ||
    normalizedPathname === '/dispatch-companies' || 
    normalizedPathname === '/unloading-companies';
  const isSmsManagementPath = normalizedPathname === '/sms-management';
  const isSmsTemplatesPath = normalizedPathname === '/sms-templates';
  const isSmsHistoryPath = normalizedPathname === '/sms-history';
  const isSmsSendersPath = normalizedPathname === '/sms-senders';
  const isSmsPath = isSmsManagementPath || isSmsTemplatesPath || isSmsHistoryPath || isSmsSendersPath;
  const isTradeOrderPath = normalizedPathname === '/trade/order';
  const isTradeContractConfirmedPath = normalizedPathname === '/trade/contract-confirmed';
  const isTradeManagementPath = normalizedPathname === '/trade/management';
  const isTradeBookingPath = normalizedPathname === '/logistics/booking';
  const isDocumentsProcessingPath = normalizedPathname === '/logistics/documents-processing';
  const isDoProcessingPath = normalizedPathname === '/logistics/do-processing';
  const isCustomsProcessingPath = normalizedPathname === '/logistics/customs-processing';
  const isLogisticsManagementPath = normalizedPathname === '/logistics/management';
  const isEtaUpdateHistoryPath = normalizedPathname === '/logistics/eta-update-history';
  const isTradePath = isTradeOrderPath || isTradeContractConfirmedPath || isTradeManagementPath;
  const isLogisticsPath = isTradeBookingPath || isDocumentsProcessingPath || isDoProcessingPath || isCustomsProcessingPath || isLogisticsManagementPath || isEtaUpdateHistoryPath;
  
  // 입고관리 관련 경로
  const isInboundPendingPath = normalizedPathname === '/inbound/pending';
  const isInboundScheduledPath = normalizedPathname === '/inbound/scheduled';
  const isInboundConfirmedPath = normalizedPathname === '/inbound/confirmed';
  const isInboundPath = normalizedPathname === '/inbound';
  const isInboundManagementPath = isInboundPendingPath || isInboundScheduledPath || isInboundConfirmedPath || isInboundPath;

  /** 신규 사이드바: 영업(신규) > 입고·재고 — 영업 전용 라우트 */
  const isSalesInboundV2PendingPath = normalizedPathname === '/sales/inbound/pending';
  const isSalesInboundV2ScheduledPath = normalizedPathname === '/sales/inbound/scheduled';
  const isSalesInboundV2ConfirmedPath = normalizedPathname === '/sales/inbound/confirmed';
  const isSalesInboundV2ManagementPath =
    isSalesInboundV2PendingPath ||
    isSalesInboundV2ScheduledPath ||
    isSalesInboundV2ConfirmedPath;
  const isSalesInventoryV2PendingPath = normalizedPathname === '/sales/inventory/pending';
  const isSalesInventoryV2ConfirmedPath = normalizedPathname === '/sales/inventory/confirmed';
  const isSalesInventoryV2ManagementPath =
    isSalesInventoryV2PendingPath || isSalesInventoryV2ConfirmedPath;
  const isSalesManagementV2Path =
    normalizedPathname === '/sales/management-v2' ||
    normalizedPathname?.startsWith('/sales/management-v2/');
  const isSalesV2ManagementPath =
    isSalesInboundV2ManagementPath ||
    isSalesInventoryV2ManagementPath ||
    isSalesManagementV2Path;
  
  // 재고관리 관련 경로
  const isInventoryPath = normalizedPathname === '/inventory';
  const isInventoryPendingPath = normalizedPathname === '/inventory/pending';
  const isInventoryConfirmedPath = normalizedPathname === '/inventory/confirmed';
  const isInventoryMenuPath = isInventoryPath || isInventoryPendingPath || isInventoryConfirmedPath;
  
  // 영업 관련 경로
  const isSalesDashboardPath = normalizedPathname === '/sales/dashboard';
  const isSalesTransportManagementPath = normalizedPathname?.startsWith('/sales/transport-management');
  const isSalesTransportPath = normalizedPathname === '/sales/transport-management/transport';
  const isSalesTransportByDriverPath =
    normalizedPathname === '/sales/transport-management/by-driver';
  const isSalesInvoicePath = normalizedPathname?.startsWith('/sales/invoice');
  const isSalesProductReservationPath = normalizedPathname === '/sales/product-reservations';
  const isSalesProductReservationSheetPath =
    normalizedPathname === '/sales/product-reservations-sheet';
  const isSalesQuotationSheetPath = normalizedPathname === '/sales/quotation-sheet';
  const isSalesProductReservationAnyPath =
    isSalesProductReservationPath || isSalesProductReservationSheetPath;
  /** 판매관리 접기: 예약 화면 또는 /sales */
  const isSalesManagementPath =
    isSalesPath || isSalesProductReservationAnyPath || isSalesQuotationSheetPath;
  const isSalesMenuPath =
    isSalesDashboardPath ||
    isInboundManagementPath ||
    isInventoryMenuPath ||
    isSalesManagementPath ||
    isSalesTransportManagementPath ||
    isSalesInvoicePath;
  const isSalesDispatchManagementPath = normalizedPathname === '/dispatch-company/dispatch-management';
  const isLoadingManagementPath = normalizedPathname === '/loading-company/loading-management';
  
  // 재무관리 관련 경로
  const isPaymentManagementPath = normalizedPathname?.startsWith('/finance/payment-management') || normalizedPathname === '/finance/payment-pending' || normalizedPathname === '/finance/payment-completed';
  const isReceivablesPath = normalizedPathname === '/finance/receivables';
  const isCollectReceivablePath = normalizedPathname === '/finance/receivables/collect';
  const isReceivableLedgerPath = normalizedPathname === '/finance/receivables/ledger';
  const isReceivableWarningConfigPath = normalizedPathname === '/finance/receivables/warning-config';
  const isReceivableSmsBatchHistoryPath = normalizedPathname === '/finance/receivables/sms-batch-history';
  const isExpectedPaymentPath = normalizedPathname === '/finance/receivables/expected';
  const isCompareExcelPath = normalizedPathname === '/finance/receivables/compare-excel';
  const isFinanceInventoryPendingPath = normalizedPathname === '/finance/inventory-pending';
  const isFinanceInventoryConfirmedPath = normalizedPathname === '/finance/inventory-confirmed';
  const isFinanceInventoryPath = isFinanceInventoryPendingPath || isFinanceInventoryConfirmedPath;
  const isFinancePath = isPaymentManagementPath || isReceivablesPath || isCollectReceivablePath || isReceivableLedgerPath || isReceivableWarningConfigPath || isReceivableSmsBatchHistoryPath || isExpectedPaymentPath || isCompareExcelPath || isFinanceInventoryPath;
  
  // 설정 관련 경로
  const isCompanyInfoPath = normalizedPathname === '/settings/company-info';
  const isInboundDefaultsPath =
    normalizedPathname === '/settings/inbound-defaults';
  const isLegalAdminMasterPath =
    normalizedPathname === '/settings/legal-admin-master';
  const isSuppliersPath = normalizedPathname === '/suppliers';
  const isSettingsPath =
    isCompanyInfoPath || isInboundDefaultsPath || isSuppliersPath;
  const isMallStatsDashboardPath = normalizedPathname === '/mall-stats';
  const isMallStatsDailyPath = normalizedPathname === '/mall-stats/daily';
  const isMallStatsPath = isMallStatsDashboardPath || isMallStatsDailyPath;

  // 배차 업체 사용자 여부 확인 (역할 코드로 확인)
  const isDispatchCompanyUser = React.useMemo(() => {
    if (!user?.roles) return false;
    return user.roles.some((role) => role.code === 'ROLE_DISPATCH_COMPANY_USER');
  }, [user]);

  // 창고 업체 사용자 여부 확인 (역할 코드로 확인)
  const isWarehouseCompanyUser = React.useMemo(() => {
    if (!user?.roles) return false;
    return user.roles.some((role) => role.code === 'ROLE_WAREHOUSE_COMPANY_USER');
  }, [user]);

  // 시스템 관리자 여부 확인 (일반 메뉴 표시용)
  const isSystemUser = React.useMemo(() => {
    if (!user?.roles) return false;
    return user.roles.some((role) => role.code === 'ROLE_SYSTEM' || role.code === 'ROLE_ADMIN');
  }, [user]);

  // 세일즈 권한 여부 확인
  const isSalesUser = React.useMemo(() => {
    if (!user?.roles) return false;
    return user.roles.some((role) => role.code === 'ROLE_SALES');
  }, [user]);

  // 권한이 있는지 확인 (권한이 없으면 메뉴 숨김)
  const hasAnyRole = React.useMemo(() => {
    return user?.roles && user.roles.length > 0;
  }, [user]);

  // 사용자 관리 및 배차 업체 관리 메뉴 표시 여부 (ROLE_SALES만 있으면 숨김)
  const showAdminMenus = React.useMemo(() => {
    // 권한이 없으면 숨김
    if (!hasAnyRole) return false;
    // ROLE_SYSTEM이 있으면 항상 표시
    if (isSystemUser) return true;
    // ROLE_SALES만 있고 ROLE_SYSTEM이 없으면 숨김
    if (isSalesUser && !isSystemUser) return false;
    // 그 외에는 표시
    return true;
  }, [hasAnyRole, isSystemUser, isSalesUser]);

  // 로고 클릭 시 이동할 경로 결정
  const getLogoRedirectPath = React.useMemo(() => {
    // 배차 업체 사용자이고 시스템 권한이 없으면 배차관리(신버전) 페이지로
    if (isDispatchCompanyUser && !isSystemUser) {
      return '/dispatch-company/dispatch-management';
    }
    // 창고 업체 사용자이고 시스템 권한이 없으면 상차관리(신버전) 페이지로
    if (isWarehouseCompanyUser && !isSystemUser) {
      return '/loading-company/loading-management';
    }
    // 그 외에는 대시보드로
    return '/dashboard';
  }, [isDispatchCompanyUser, isWarehouseCompanyUser, isSystemUser]);

  return (
    <Sidebar collapsible="icon" className="relative" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="h-auto py-3">
              <a href={getLogoRedirectPath} className="flex items-center gap-3">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-lg font-bold">C</span>
                </div>
                {!isCollapsed && (
                  <div className="flex flex-1 flex-col items-start justify-center text-left">
                    <span className="truncate text-sm font-semibold leading-tight">CCBio ERP</span>
                    <span className="truncate text-xs leading-tight text-muted-foreground">
                      내부 업무 시스템
                    </span>
                  </div>
                )}
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {hasAnyRole && (
      <SidebarContent>
        {/* 메뉴 그룹 (시스템/영업 사용자만 - 배차/창고 업체 전용은 배차업체·상차업체만 표시) */}
        {(isSystemUser || isSalesUser) && (
        <SidebarGroup>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* 일반 관리자 메뉴들 (ROLE_SYSTEM 또는 ROLE_SALES 권한이 있을 때 표시) */}
              {(isSystemUser || isSalesUser) && (
                <>
              {/* 무역 메뉴 (구매관리 + 물류관리 - 3단계 구조) */}
              <Collapsible
                asChild
                defaultOpen={isTradePath || isLogisticsPath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isTradePath || isLogisticsPath}
                          >
                            <ShoppingCart />
                            <span>무역</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>무역</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {/* 구매관리 (2단계 - 직접 링크) */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isTradePath}
                          onClick={() => router.push('/trade/management')}
                        >
                          <a href="/trade/management">
                            <ShoppingCart className="h-4 w-4" />
                            <span>구매관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      {/* 물류관리 (2단계 - 직접 링크) */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isLogisticsManagementPath}
                          onClick={() => router.push('/logistics/management')}
                        >
                          <a href="/logistics/management">
                            <Ship className="h-4 w-4" />
                            <span>물류관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {/* ETA 갱신 이력 */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isEtaUpdateHistoryPath}
                          onClick={() => router.push('/logistics/eta-update-history')}
                        >
                          <a href="/logistics/eta-update-history">
                            <RefreshCw className="h-4 w-4" />
                            <span>ETA 갱신 이력</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 영업 메뉴 */}
              <Collapsible
                asChild
                defaultOpen={isSalesMenuPath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isSalesMenuPath}
                          >
                            <BarChart />
                            <span>영업</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>영업</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {/* 대시보드 */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isSalesDashboardPath}
                          onClick={() => router.push('/sales/dashboard')}
                        >
                          <a href="/sales/dashboard">
                            <LayoutDashboard className="h-4 w-4" />
                            <span>대시보드</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {/* 입고관리 (2단계) */}
                      <Collapsible
                        asChild
                        defaultOpen={isInboundManagementPath}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isInboundManagementPath}
                            >
                              <Warehouse className="h-4 w-4" />
                              <span>입고관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isInboundPendingPath}
                                  onClick={() => router.push('/inbound/pending')}
                                >
                                  <a href="/inbound/pending">
                                    <Clock className="h-4 w-4" />
                                    <span>입고 대기</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isInboundScheduledPath}
                                  onClick={() => router.push('/inbound/scheduled')}
                                >
                                  <a href="/inbound/scheduled">
                                    <Calendar className="h-4 w-4" />
                                    <span>입고 예정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isInboundConfirmedPath}
                                  onClick={() => router.push('/inbound/confirmed')}
                                >
                                  <a href="/inbound/confirmed">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>입고 확정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      {/* 재고관리 (2단계 - Collapsible) */}
                      <Collapsible
                        asChild
                        defaultOpen={isInventoryMenuPath}
                        className="group/collapsible"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isInventoryMenuPath}
                            >
                              <Package className="h-4 w-4" />
                              <span>재고관리</span>
                              <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isInventoryPendingPath}
                                  onClick={() => router.push('/inventory/pending')}
                                >
                                  <a href="/inventory/pending">
                                    <Clock className="h-4 w-4" />
                                    <span>입고예정재고</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isInventoryConfirmedPath}
                                  onClick={() => router.push('/inventory/confirmed')}
                                >
                                  <a href="/inventory/confirmed">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>입고확정재고</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      {/* 판매관리 (2단계 - Collapsible): 예약 → 판매(목록) 순 */}
                      <Collapsible
                        asChild
                        defaultOpen={isSalesManagementPath}
                        className="group/collapsible"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isSalesManagementPath}
                            >
                              <ShoppingCart className="h-4 w-4" />
                              <span>판매관리</span>
                              <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesQuotationSheetPath}
                                  onClick={() => router.push('/sales/quotation-sheet')}
                                >
                                  <a href="/sales/quotation-sheet">
                                    <FileText className="h-4 w-4" />
                                    <span>견적서</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              {SHOW_SALES_RESERVATION_SIDEBAR_MENU ? (
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isSalesProductReservationPath}
                                    onClick={() => router.push('/sales/product-reservations')}
                                  >
                                    <a href="/sales/product-reservations">
                                      <CalendarPlus className="h-4 w-4" />
                                      <span>판매예약</span>
                                    </a>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ) : null}
                              {SHOW_SALES_RESERVATION_SHEET_SIDEBAR_MENU ? (
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isSalesProductReservationSheetPath}
                                    onClick={() => router.push('/sales/product-reservations-sheet')}
                                  >
                                    <a href="/sales/product-reservations-sheet">
                                      <Table2 className="h-4 w-4" />
                                      <span>판매예약</span>
                                    </a>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ) : null}
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesPath}
                                  onClick={() => router.push('/sales')}
                                >
                                  <a href="/sales">
                                    <ShoppingCart className="h-4 w-4" />
                                    <span>판매관리</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      {/* 운송관리 (2단계 - Collapsible) */}
                      <Collapsible
                        asChild
                        defaultOpen={isSalesTransportManagementPath}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isSalesTransportManagementPath}
                            >
                              <Truck className="h-4 w-4" />
                              <span>운송관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesTransportPath}
                                  onClick={() => router.push('/sales/transport-management/transport')}
                                >
                                  <a href="/sales/transport-management/transport">
                                    <Truck className="h-4 w-4" />
                                    <span>운송관리</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesTransportByDriverPath}
                                  onClick={() => router.push('/sales/transport-management/by-driver')}
                                >
                                  <a href="/sales/transport-management/by-driver">
                                    <Contact className="h-4 w-4" />
                                    <span>기사별 운송</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={normalizedPathname === '/sales/transport-management/mismatch'}
                                  onClick={() => router.push('/sales/transport-management/mismatch')}
                                >
                                  <a href="/sales/transport-management/mismatch">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>판매·운송 불일치</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      {/* 거래명세서 관리 (2단계 - Collapsible) */}
                      <Collapsible
                        asChild
                        defaultOpen={normalizedPathname?.startsWith('/sales/invoice')}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={normalizedPathname?.startsWith('/sales/invoice')}
                            >
                              <Receipt className="h-4 w-4" />
                              <span>거래명세서 관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={normalizedPathname === '/sales/invoice-management'}
                                  onClick={() => router.push('/sales/invoice-management')}
                                >
                                  <a href="/sales/invoice-management">
                                    <FileText className="h-4 w-4" />
                                    <span>거래명세서 관리</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 재무 메뉴 */}
              <Collapsible
                asChild
                defaultOpen={isFinancePath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isFinancePath}
                          >
                            <DollarSign />
                            <span>재무</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>재무</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                      <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isPaymentManagementPath}
                          onClick={() => router.push('/finance/payment-management')}
                        >
                          <a href="/finance/payment-management">
                            <Receipt className="h-4 w-4" />
                            <span>결제관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {/* 재고관리 (2단계 - Collapsible) */}
                      <Collapsible
                        asChild
                        defaultOpen={isFinanceInventoryPath}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isFinanceInventoryPath}
                            >
                              <Package className="h-4 w-4" />
                              <span>재고관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isFinanceInventoryPendingPath}
                                  onClick={() => router.push('/finance/inventory-pending')}
                                >
                                  <a href="/finance/inventory-pending">
                                    <Clock className="h-4 w-4" />
                                    <span>입고예정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isFinanceInventoryConfirmedPath}
                                  onClick={() => router.push('/finance/inventory-confirmed')}
                                >
                                  <a href="/finance/inventory-confirmed">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>입고확정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      {/* 채권관리 (2단계 - Collapsible) */}
                      <Collapsible
                        asChild
                        defaultOpen={isReceivablesPath || isCollectReceivablePath || isReceivableLedgerPath || isReceivableWarningConfigPath || isReceivableSmsBatchHistoryPath || isExpectedPaymentPath || isCompareExcelPath}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isReceivablesPath || isCollectReceivablePath || isReceivableLedgerPath || isReceivableWarningConfigPath || isReceivableSmsBatchHistoryPath || isExpectedPaymentPath || isCompareExcelPath}
                            >
                              <FileText className="h-4 w-4" />
                              <span>채권관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isReceivablesPath}
                                  onClick={() => router.push('/finance/receivables')}
                                >
                                  <a href="/finance/receivables">
                                    <FileText className="h-4 w-4" />
                                    <span>채권관리</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isCollectReceivablePath}
                                  onClick={() => router.push('/finance/receivables/collect')}
                                >
                                  <a href="/finance/receivables/collect">
                                    <DollarSign className="h-4 w-4" />
                                    <span>수금 관리</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isReceivableLedgerPath}
                                  onClick={() => router.push('/finance/receivables/ledger')}
                                >
                                  <a href="/finance/receivables/ledger">
                                    <FileText className="h-4 w-4" />
                                    <span>거래처관리대장</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isReceivableWarningConfigPath}
                                  onClick={() => router.push('/finance/receivables/warning-config')}
                                >
                                  <a href="/finance/receivables/warning-config">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>채권 경고 설정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isReceivableSmsBatchHistoryPath}
                                  onClick={() => router.push('/finance/receivables/sms-batch-history')}
                                >
                                  <a href="/finance/receivables/sms-batch-history">
                                    <Send className="h-4 w-4" />
                                    <span>채권 경고 문자 발송 이력</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isExpectedPaymentPath}
                                  onClick={() => router.push('/finance/receivables/expected')}
                                >
                                  <a href="/finance/receivables/expected">
                                    <CalendarDays className="h-4 w-4" />
                                    <span>입금예상액</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isCompareExcelPath}
                                  onClick={() => router.push('/finance/receivables/compare-excel')}
                                >
                                  <a href="/finance/receivables/compare-excel">
                                    <Scale className="h-4 w-4" />
                                    <span>이카운트 잔액 비교</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* SMS 관리 메뉴 (시스템 관리자 또는 영업 권한) */}
              {(isSystemUser || isSalesUser) && (
                <Collapsible
                  asChild
                  defaultOpen={isSmsPath}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <TooltipProvider>
                      <Tooltip>
                        <CollapsibleTrigger asChild>
                          <TooltipTrigger asChild>
                            <SidebarMenuButton
                              isActive={isSmsPath}
                            >
                              <MessageSquare />
                              <span>SMS 관리</span>
                              <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuButton>
                          </TooltipTrigger>
                        </CollapsibleTrigger>
                        {isCollapsed && (
                          <TooltipContent side="right">
                            <p>SMS 관리</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {/* 기존 알리고 API 기반 SMS 발송/이력 메뉴 숨김 (주석 처리) */}
                        {/* <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isSmsManagementPath}
                            onClick={() => router.push('/sms-management')}
                          >
                            <a href="/sms-management">
                              <Send className="h-4 w-4" />
                              <span>SMS 발송/이력</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem> */}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isSmsHistoryPath}
                            onClick={() => router.push('/sms-history')}
                          >
                            <a href="/sms-history">
                              <FileText className="h-4 w-4" />
                              <span>SMS 발송 이력</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isSmsTemplatesPath}
                            onClick={() => router.push('/sms-templates')}
                          >
                            <a href="/sms-templates">
                              <FileText className="h-4 w-4" />
                              <span>SMS 템플릿 관리</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isSmsSendersPath}
                            onClick={() => router.push('/sms-senders')}
                          >
                            <a href="/sms-senders">
                              <PhoneCall className="h-4 w-4" />
                              <span>SMS 발신자 관리</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {/* 운송관리 메뉴 */}
              <Collapsible
                asChild
                defaultOpen={isTransportPath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isTransportPath}
                          >
                            <Truck />
                            <span>운송관리</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>운송관리</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isTransportDashboardPath}
                          onClick={() => router.push('/transport/dashboard')}
                        >
                          <a href="/transport/dashboard">
                            <LayoutDashboard className="h-4 w-4" />
                            <span>대시보드</span>
                          </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={isDispatchManagementPath}
                        onClick={() => router.push('/transport/dispatch-management')}
                      >
                        <a href="/transport/dispatch-management">
                          <FileText className="h-4 w-4" />
                          <span>배차관리</span>
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isDispatchRequestPath}
                          onClick={() => router.push('/transport/dispatch-request')}
                        >
                          <a href="/transport/dispatch-request">
                            <FileText className="h-4 w-4" />
                            <span>배차요청</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isDispatchDispatchingPath}
                          onClick={() => router.push('/transport/dispatch-dispatching')}
                        >
                          <a href="/transport/dispatch-dispatching">
                            <Loader2 className="h-4 w-4" />
                            <span>배차중</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isDispatchCompletedPath}
                          onClick={() => router.push('/transport/dispatch-completed')}
                        >
                          <a href="/transport/dispatch-completed">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>배차완료</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isDispatchFailedPath}
                          onClick={() => router.push('/transport/dispatch-failed')}
                        >
                          <a href="/transport/dispatch-failed">
                            <XCircle className="h-4 w-4" />
                            <span>배차실패</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isDispatchRescheduledPath}
                          onClick={() => router.push('/transport/dispatch-rescheduled')}
                        >
                          <a href="/transport/dispatch-rescheduled">
                            <CalendarClock className="h-4 w-4" />
                            <span>일정조정</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isLoadingPath}
                          onClick={() => router.push('/transport/loading')}
                        >
                          <a href="/transport/loading">
                            <Package className="h-4 w-4" />
                            <span>상차중</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isLoadingCompletedPath}
                          onClick={() => router.push('/transport/loading-completed')}
                        >
                          <a href="/transport/loading-completed">
                            <CheckSquare className="h-4 w-4" />
                            <span>상차완료</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isUnloadingCompletedPath}
                          onClick={() => router.push('/transport/unloading-completed')}
                        >
                          <a href="/transport/unloading-completed">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>하차완료</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 상담 관리 메뉴 */}
              <Collapsible
                asChild
                defaultOpen={isConsultationsGroupPath && !isCustomersDashboard}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isConsultationsGroupPath && !isCustomersDashboard}
                          >
                            <PhoneCall />
                            <span>상담 관리</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>상담 관리</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isConsultationsDashboard}
                          onClick={() => router.push('/consultations/dashboard')}
                        >
                          <a href="/consultations/dashboard">
                            <BarChart className="h-4 w-4" />
                            <span>재고 대시보드</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/consultations'}
                          onClick={() => router.push('/consultations')}
                        >
                          <a href="/consultations">
                            <PhoneCall className="h-4 w-4" />
                            <span>상담 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/customers'}
                          onClick={() => router.push('/customers')}
                        >
                          <a href="/customers">
                            <Building2 className="h-4 w-4" />
                            <span>고객 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 운영 관리 메뉴 */}
              <Collapsible
                asChild
                defaultOpen={
                  normalizedPathname === '/customers/dashboard' ||
                  normalizedPathname === '/organic-certifications' ||
                  normalizedPathname === '/consultations/stats'
                }
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={
                              normalizedPathname === '/customers/dashboard' ||
                              normalizedPathname === '/organic-certifications' ||
                              normalizedPathname === '/consultations/stats'
                            }
                          >
                            <BarChart />
                            <span>운영 관리</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>운영 관리</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/consultations/stats'}
                          onClick={() => router.push('/consultations/stats')}
                        >
                          <a href="/consultations/stats">
                            <PhoneCall className="h-4 w-4" />
                            <span>상담 통계</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/customers/dashboard'}
                          onClick={() => router.push('/customers/dashboard')}
                        >
                          <a href="/customers/dashboard">
                            <BarChart className="h-4 w-4" />
                            <span>고객 현황</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/organic-certifications'}
                          onClick={() => router.push('/organic-certifications')}
                        >
                          <a href="/organic-certifications">
                            <Leaf className="h-4 w-4" />
                            <span>유기축산 인증</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 쇼핑몰·앱 통계 메뉴 */}
              <Collapsible
                asChild
                defaultOpen={isMallStatsPath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isMallStatsPath}
                          >
                            <Store className="h-4 w-4" />
                            <span>쇼핑몰·앱 통계</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>쇼핑몰·앱 통계</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isMallStatsDashboardPath}
                          onClick={() => router.push('/mall-stats')}
                        >
                          <a href="/mall-stats">
                            <LayoutDashboard className="h-4 w-4" />
                            <span>대시보드</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isMallStatsDailyPath}
                          onClick={() => router.push('/mall-stats/daily')}
                        >
                          <a href="/mall-stats/daily">
                            <Calendar className="h-4 w-4" />
                            <span>일별 데이터 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 사용자 관리 메뉴 (서브메뉴 포함, ROLE_SALES만 있으면 숨김) */}
              {showAdminMenus && (
              <Collapsible
                asChild
                defaultOpen={normalizedPathname?.startsWith('/users')}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={normalizedPathname?.startsWith('/users')}
                          >
                            <Users />
                            <span>사용자 관리</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>사용자 관리</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/users'}
                          onClick={() => router.push('/users')}
                        >
                          <a href="/users">
                            <UserCog className="h-4 w-4" />
                            <span>사용자 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/users/permissions'}
                          onClick={() => router.push('/users/permissions')}
                        >
                          <a href="/users/permissions">
                            <Shield className="h-4 w-4" />
                            <span>권한 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
              )}

              {/* 설정 메뉴 (공급자 관리, 업체 관리, 카테고리 관리) */}
              <Collapsible
                asChild
                defaultOpen={isSettingsPath || isCompanyManagementPath || normalizedPathname === '/codes' || normalizedPathname === '/free-time' || normalizedPathname === '/safe-freight-rates' || normalizedPathname === '/settings/inbound-defaults' || isLegalAdminMasterPath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isSettingsPath || isCompanyManagementPath || normalizedPathname === '/codes' || normalizedPathname === '/free-time' || normalizedPathname === '/safe-freight-rates' || normalizedPathname === '/settings/inbound-defaults' || isLegalAdminMasterPath}
                          >
                            <Settings />
                            <span>설정</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>설정</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isSuppliersPath}
                          onClick={() => router.push('/suppliers')}
                        >
                          <a href="/suppliers">
                            <Store className="h-4 w-4" />
                            <span>공급자 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isWarehousePath}
                          onClick={() => router.push('/warehouses')}
                        >
                          <a href="/warehouses">
                            <Warehouse className="h-4 w-4" />
                            <span>창고(업체) 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/dispatch-companies'}
                          onClick={() => router.push('/dispatch-companies')}
                        >
                          <a href="/dispatch-companies">
                            <Truck className="h-4 w-4" />
                            <span>배차(업체) 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isUnloadingCompanyPath}
                          onClick={() => router.push('/unloading-companies')}
                        >
                          <a href="/unloading-companies">
                            <Truck className="h-4 w-4" />
                            <span>하차(업체) 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/codes'}
                          onClick={() => router.push('/codes')}
                        >
                          <a href="/codes">
                            <Database className="h-4 w-4" />
                            <span>코드 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/free-time'}
                          onClick={() => router.push('/free-time')}
                        >
                          <a href="/free-time">
                            <ClipboardList className="h-4 w-4" />
                            <span>FT 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isInboundDefaultsPath}
                          onClick={() =>
                            router.push('/settings/inbound-defaults')
                          }
                        >
                          <a href="/settings/inbound-defaults">
                            <Package className="h-4 w-4" />
                            <span>입고 기본 설정</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/safe-freight-rates'}
                          onClick={() => router.push('/safe-freight-rates')}
                        >
                          <a href="/safe-freight-rates">
                            <Database className="h-4 w-4" />
                            <span>안전운임 요금표</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isLegalAdminMasterPath}
                          onClick={() => router.push('/settings/legal-admin-master')}
                        >
                          <a href="/settings/legal-admin-master">
                            <MapPin className="h-4 w-4" />
                            <span>법정동 마스터</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 구메뉴 (스케줄 관리, 판매관리, 영업관리, 배차관리(구버전), 상차관리(구버전)) */}
              <Collapsible
                asChild
                defaultOpen={normalizedPathname === '/schedules' || normalizedPathname === '/vehicle-dispatch' || normalizedPathname === '/inbound' || normalizedPathname === '/vehicle-dispatch-user' || normalizedPathname === '/vehicle-dispatch-warehouse'}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={normalizedPathname === '/schedules' || normalizedPathname === '/vehicle-dispatch' || normalizedPathname === '/inbound' || normalizedPathname === '/vehicle-dispatch-user' || normalizedPathname === '/vehicle-dispatch-warehouse'}
                          >
                            <Package />
                            <span>구메뉴</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>구메뉴</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/schedules'}
                          onClick={() => router.push('/schedules')}
                        >
                          <a href="/schedules">
                            <Calendar className="h-4 w-4" />
                            <span>스케줄 관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/vehicle-dispatch'}
                          onClick={() => router.push('/vehicle-dispatch')}
                        >
                          <a href="/vehicle-dispatch">
                            <ShoppingCart className="h-4 w-4" />
                            <span>판매관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={normalizedPathname === '/inbound'}
                          onClick={() => router.push('/inbound')}
                        >
                          <a href="/inbound">
                            <Package className="h-4 w-4" />
                            <span>영업관리</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isVehicleDispatchUserPath}
                          onClick={() => router.push('/vehicle-dispatch-user')}
                        >
                          <a href="/vehicle-dispatch-user">
                            <Truck className="h-4 w-4" />
                            <span>배차관리(구버전)</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isVehicleDispatchWarehousePath}
                          onClick={() => router.push('/vehicle-dispatch-warehouse')}
                        >
                          <a href="/vehicle-dispatch-warehouse">
                            <Warehouse className="h-4 w-4" />
                            <span>상차관리(구버전)</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 영업 — 구메뉴 아래 신규: 입고·재고 (상단 영업 메뉴와 별도) */}
              <Collapsible
                asChild
                defaultOpen={isSalesV2ManagementPath}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <CollapsibleTrigger asChild>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            isActive={isSalesV2ManagementPath}
                          >
                            <Layers />
                            <span>영업</span>
                            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </TooltipTrigger>
                      </CollapsibleTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>영업 — 신규 입고·재고</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <Collapsible
                        asChild
                        defaultOpen={isSalesInboundV2ManagementPath}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isSalesInboundV2ManagementPath}
                            >
                              <Warehouse className="h-4 w-4" />
                              <span>입고 관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesInboundV2PendingPath}
                                  onClick={() => router.push('/sales/inbound/pending')}
                                >
                                  <a href="/sales/inbound/pending">
                                    <Clock className="h-4 w-4" />
                                    <span>입고 대기</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesInboundV2ScheduledPath}
                                  onClick={() => router.push('/sales/inbound/scheduled')}
                                >
                                  <a href="/sales/inbound/scheduled">
                                    <Calendar className="h-4 w-4" />
                                    <span>입고 예정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesInboundV2ConfirmedPath}
                                  onClick={() => router.push('/sales/inbound/confirmed')}
                                >
                                  <a href="/sales/inbound/confirmed">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>입고 확정</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      <Collapsible
                        asChild
                        defaultOpen={isSalesInventoryV2ManagementPath}
                        className="group/collapsible-sub"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton
                              isActive={isSalesInventoryV2ManagementPath}
                            >
                              <Package className="h-4 w-4" />
                              <span>재고 관리</span>
                              <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible-sub:rotate-180" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesInventoryV2PendingPath}
                                  onClick={() => router.push('/sales/inventory/pending')}
                                >
                                  <a href="/sales/inventory/pending">
                                    <Clock className="h-4 w-4" />
                                    <span>입고예정재고</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isSalesInventoryV2ConfirmedPath}
                                  onClick={() => router.push('/sales/inventory/confirmed')}
                                >
                                  <a href="/sales/inventory/confirmed">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>입고확정재고</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isSalesManagementV2Path}
                          onClick={() => router.push('/sales/management-v2/sales')}
                        >
                          <a href="/sales/management-v2/sales">
                            <ShoppingCart className="h-4 w-4" />
                            <span>판매관리 (신규)</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        {/* 배차관리 그룹 (신버전만) */}
        {(isSystemUser || isSalesUser || isDispatchCompanyUser) && (
          <SidebarGroup>
            <SidebarGroupLabel>배차관리</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          asChild
                          isActive={isSalesDispatchManagementPath}
                          onClick={() => router.push('/dispatch-company/dispatch-management')}
                        >
                          <a href="/dispatch-company/dispatch-management">
                            <Truck />
                            <span>배차관리</span>
                          </a>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>배차관리</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* 상차관리 그룹 (신버전만) */}
        {(isSystemUser || isSalesUser || isWarehouseCompanyUser) && (
          <SidebarGroup>
            <SidebarGroupLabel>상차관리</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          asChild
                          isActive={isLoadingManagementPath}
                          onClick={() => router.push('/loading-company/loading-management')}
                        >
                          <a href="/loading-company/loading-management">
                            <Warehouse />
                            <span>상차관리</span>
                          </a>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <p>상차관리</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      )}

      <SidebarFooter className="border-t border-sidebar-border p-2 mt-auto">
        {user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <DropdownMenuTrigger asChild>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          size="lg"
                          className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
                            {user.picture ? (
                              <img
                                src={user.picture}
                                alt={user.name || 'User'}
                                className="size-8 rounded-lg object-cover"
                              />
                            ) : (
                              <span className="text-sm font-semibold">
                                {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          {!isCollapsed && (
                            <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                              <span className="truncate font-semibold">
                                {user.name || '사용자'}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {user.email}
                              </span>
                            </div>
                          )}
                          {!isCollapsed && (
                            <ChevronDown className="ml-auto h-4 w-4" />
                          )}
                        </SidebarMenuButton>
                      </TooltipTrigger>
                    </DropdownMenuTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right">
                        <div className="text-sm">
                          <p className="font-semibold">{user.name || '사용자'}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side={isCollapsed ? 'right' : 'top'}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        {user.picture ? (
                          <img
                            src={user.picture}
                            alt={user.name || 'User'}
                            className="size-8 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold">
                            {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">
                          {user.name || '사용자'}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>로그아웃</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
      
      {/* 사이드바 토글 버튼 - 사이드바와 컨텐츠 영역 경계 중앙에 배치 */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 h-7 w-7 -translate-y-1/2 translate-x-1/2 rounded-full border border-border bg-muted/60 shadow-sm hover:bg-muted hover:text-foreground z-30"
              onClick={toggleSidebar}
              style={{
                // 헤더 패딩(8px) + 버튼 상단 패딩(12px) + 로고 아이콘 높이의 절반(16px) = 36px
                top: 'calc(0.5rem + 0.75rem + 1rem)',
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronLeft className="h-3 w-3" />
              )}
              <span className="sr-only">사이드바 토글</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Sidebar>
  );
}

