import { Brackets, SelectQueryBuilder } from 'typeorm';
import { Sales } from './entities/sales.entity';
import { GetSalesDto } from './dto/get-sales.dto';

/**
 * 판매 목록(findAll)과 동일한 필터를 QueryBuilder에 적용합니다.
 * join은 호출 전에 sales/customer/items/container/order/contract/inbounds 등이 맞춰져 있어야 합니다.
 */
export function applySalesListFiltersToQueryBuilder(
  queryBuilder: SelectQueryBuilder<Sales>,
  dto: GetSalesDto,
): void {
  const searchTerm = (dto.search?.trim() || dto.bkBl?.trim()) || '';
  if (searchTerm) {
    const pattern = `%${searchTerm.toLowerCase()}%`;
    queryBuilder.leftJoin(
      'tb_code',
      'productCode',
      "productCode.cd_group = 'PRODUCT' AND productCode.cd_value = container.co_product",
    );
    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where('LOWER(COALESCE(customer.cu_company_name, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(customer.cu_ceo, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(customer.cu_phone, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(order.bk, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(order.bl, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(container.co_container_no, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(container.co_product, \'\')) LIKE :pattern', { pattern })
          .orWhere('LOWER(COALESCE(productCode.cd_name, \'\')) LIKE :pattern', { pattern });
      }),
    );
    if (!dto.includeCancelled) {
      queryBuilder.andWhere(
        `EXISTS (
            SELECT 1 FROM tb_sales_item si
            WHERE si.sa_id = sales.sa_id
            AND si.co_id = container.co_id
            AND (si.si_status IS NULL OR si.si_status != 'SALES_ITEM_CANCELLED')
          )`,
      );
    }
  }

  if (!dto.includeCancelled) {
    queryBuilder.andWhere('sales.sa_cancelled_at IS NULL');
  }

  queryBuilder.andWhere('sales.cu_id IS NOT NULL');

  if (dto.statusFilter === 'none') {
    queryBuilder.andWhere('1 = 0');
  } else if (dto.statuses?.length) {
    const itemToSalesStatus: Record<string, string> = {
      SALES_ITEM_RESERVED: 'RESERVED',
      SALES_ITEM_SOLD: 'SOLD',
      SALES_ITEM_COMPLETED: 'COMPLETED',
    };
    const statusList = dto.statuses
      .filter((s): s is string => typeof s === 'string')
      .map((s) => itemToSalesStatus[s] ?? s)
      .filter((s) => ['RESERVED', 'SOLD', 'COMPLETED'].includes(s));
    if (statusList.length > 0) {
      queryBuilder.andWhere('sales.sa_status IN (:...salesStatuses)', { salesStatuses: statusList });
    }
  }

  const dateType = dto.dateType ?? 'createdAt';
  if (dto.startDate && dto.endDate) {
    if (dateType === 'invoiceIssuedAt') {
      const invoiceStartDate = new Date(dto.startDate);
      invoiceStartDate.setHours(0, 0, 0, 0);
      const invoiceEndDate = new Date(dto.endDate);
      invoiceEndDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere(
        `EXISTS (
            SELECT 1 FROM tb_sales_item si
            INNER JOIN tb_invoice_item ii ON ii.si_id = si.si_id
            INNER JOIN tb_invoice iv ON iv.iv_id = ii.iv_id AND iv.iv_status = 'ISSUED' AND iv.iv_deleted_at IS NULL
            WHERE si.sa_id = sales.sa_id
            AND iv.iv_issued_at >= :invoiceStartDate
            AND iv.iv_issued_at <= :invoiceEndDate
          )`,
        { invoiceStartDate, invoiceEndDate },
      );
    } else {
      queryBuilder.andWhere('sales.sa_created_at >= :startDate', { startDate: dto.startDate });
      queryBuilder.andWhere('sales.sa_created_at <= :endDate', { endDate: dto.endDate });
    }
  } else {
    if (dto.startDate) {
      queryBuilder.andWhere('sales.sa_created_at >= :startDate', { startDate: dto.startDate });
    }
    if (dto.endDate) {
      queryBuilder.andWhere('sales.sa_created_at <= :endDate', { endDate: dto.endDate });
    }
  }

  if (dto.warehouseFilter === 'none' || (dto.warehouseIds !== undefined && dto.warehouseIds.length === 0)) {
    queryBuilder.andWhere('1 = 0');
  } else if (dto.warehouseIds !== undefined && dto.warehouseIds.length > 0) {
    queryBuilder.andWhere(
      `EXISTS (
          SELECT 1 FROM tb_sales_item si
          INNER JOIN tb_container tc ON tc.co_id = si.co_id
          INNER JOIN tb_trade_order o ON o.to_id = tc.co_order_id AND o.to_deleted_at IS NULL
          INNER JOIN tb_trade_order_inbound ti ON ti.ti_order_id = o.to_id
          JOIN tb_warehouse w ON w.wh_id IN (:...warehouseIds) AND TRIM(w.wh_name) = TRIM(ti.ti_warehouse)
          WHERE si.sa_id = sales.sa_id
        )`,
      { warehouseIds: dto.warehouseIds },
    );
  }

  const priceStage = dto.salesUnitPriceStage?.trim();
  if (priceStage) {
    queryBuilder.andWhere(
      `EXISTS (
          SELECT 1 FROM tb_sales_item si
          WHERE si.sa_id = sales.sa_id
          AND si.si_sales_unit_price_stage = :salesUnitPriceStage
          AND (si.si_status IS NULL OR si.si_status != 'SALES_ITEM_CANCELLED')
        )`,
      { salesUnitPriceStage: priceStage },
    );
  }
}
