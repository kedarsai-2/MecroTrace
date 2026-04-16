package com.mercotrace.repository;

import com.mercotrace.domain.SalesBill;
import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface SalesBillRepository extends JpaRepository<SalesBill, Long> {

    /**
     * Aggregate row for sales bill metrics used by high-level reports.
     */
    interface SalesBillAggregate {
        Long getTotalBills();

        BigDecimal getGrossSale();

        BigDecimal getPendingBalance();
    }

    /** Fee totals from commodity groups for bills in date range (no bill row duplication). */
    interface SalesBillFeeTotals {
        BigDecimal getCommissionTotal();

        BigDecimal getUserFeeTotal();

        BigDecimal getCoolieTotal();
    }

    // NOTE:
    // Hibernate does not allow fetching multiple bag collections in a single query
    // (see MultipleBagFetchException). We eagerly fetch only the top-level
    // commodityGroups; nested items and versions will be loaded lazily via
    // separate queries as needed to avoid MultipleBagFetchException.
    @EntityGraph(attributePaths = { "commodityGroups" })
    @Query("SELECT s FROM SalesBill s WHERE s.id = :id")
    Optional<SalesBill> findByIdWithGroupsAndVersions(@Param("id") Long id);

    Page<SalesBill> findAllByTraderId(Long traderId, Pageable pageable);

    @Query("SELECT s FROM SalesBill s WHERE s.traderId = :traderId " +
           "AND (:billNumber IS NULL OR :billNumber = '' OR LOWER(s.billNumber) LIKE LOWER(CONCAT('%', :billNumber, '%'))) " +
           "AND (:buyerName IS NULL OR :buyerName = '' OR LOWER(s.buyerName) LIKE LOWER(CONCAT('%', :buyerName, '%')) OR LOWER(s.buyerMark) LIKE LOWER(CONCAT('%', :buyerName, '%')) OR LOWER(s.billingName) LIKE LOWER(CONCAT('%', :buyerName, '%'))) " +
           "AND (:dateFrom IS NULL OR s.billDate >= :dateFrom) " +
           "AND (:dateTo IS NULL OR s.billDate <= :dateTo)")
    Page<SalesBill> findByTraderIdAndFilters(
        @Param("traderId") Long traderId,
        @Param("billNumber") String billNumber,
        @Param("buyerName") String buyerName,
        @Param("dateFrom") java.time.Instant dateFrom,
        @Param("dateTo") java.time.Instant dateTo,
        Pageable pageable
    );

    @Query(
        "SELECT COUNT(s) AS totalBills, " +
        "COALESCE(SUM(s.grandTotal), 0) AS grossSale, " +
        "COALESCE(SUM(s.pendingBalance), 0) AS pendingBalance " +
        "FROM SalesBill s " +
        "WHERE s.traderId = :traderId " +
        "AND s.billDate >= :dateFrom " +
        "AND s.billDate <= :dateTo"
    )
    SalesBillAggregate aggregateByTraderAndBillDateRange(
        @Param("traderId") Long traderId,
        @Param("dateFrom") java.time.Instant dateFrom,
        @Param("dateTo") java.time.Instant dateTo
    );

    @Query(
        "SELECT COALESCE(SUM(g.commissionAmount), 0) AS commissionTotal, " +
        "COALESCE(SUM(g.userFeeAmount), 0) AS userFeeTotal, " +
        "COALESCE(SUM(g.coolieAmount), 0) AS coolieTotal " +
        "FROM SalesBillCommodityGroup g JOIN g.salesBill s " +
        "WHERE s.traderId = :traderId AND s.billDate >= :dateFrom AND s.billDate <= :dateTo"
    )
    SalesBillFeeTotals sumFeeTotalsByTraderAndBillDateRange(
        @Param("traderId") Long traderId,
        @Param("dateFrom") java.time.Instant dateFrom,
        @Param("dateTo") java.time.Instant dateTo
    );

    @Query(
        "SELECT COALESCE(SUM(b.outboundFreight), 0) FROM SalesBill b " +
        "WHERE b.traderId = :traderId AND b.id IN :billIds"
    )
    BigDecimal sumOutboundFreightByTraderAndBillIds(@Param("traderId") Long traderId, @Param("billIds") Collection<Long> billIds);

    /** Per UTC calendar day: bill count, gross, pending. */
    @Query(
        value =
            "SELECT CAST((s.bill_date AT TIME ZONE 'UTC') AS date) AS d, " +
            "COUNT(*)::bigint, " +
            "COALESCE(SUM(s.grand_total), 0), " +
            "COALESCE(SUM(s.pending_balance), 0) " +
            "FROM sales_bill s " +
            "WHERE s.trader_id = :traderId AND s.bill_date >= :fromInstant AND s.bill_date <= :toInstant " +
            "GROUP BY CAST((s.bill_date AT TIME ZONE 'UTC') AS date) " +
            "ORDER BY d DESC",
        nativeQuery = true
    )
    List<Object[]> aggregateBillsByUtcDay(
        @Param("traderId") Long traderId,
        @Param("fromInstant") java.time.Instant fromInstant,
        @Param("toInstant") java.time.Instant toInstant
    );

    @Query(
        value =
            "SELECT CAST((s.bill_date AT TIME ZONE 'UTC') AS date) AS d, " +
            "COALESCE(SUM(g.commission_amount), 0), " +
            "COALESCE(SUM(g.user_fee_amount), 0), " +
            "COALESCE(SUM(g.coolie_amount), 0) " +
            "FROM sales_bill_commodity_group g " +
            "JOIN sales_bill s ON g.sales_bill_id = s.id " +
            "WHERE s.trader_id = :traderId AND s.bill_date >= :fromInstant AND s.bill_date <= :toInstant " +
            "GROUP BY CAST((s.bill_date AT TIME ZONE 'UTC') AS date) " +
            "ORDER BY d DESC",
        nativeQuery = true
    )
    List<Object[]> sumFeesByUtcDay(
        @Param("traderId") Long traderId,
        @Param("fromInstant") java.time.Instant fromInstant,
        @Param("toInstant") java.time.Instant toInstant
    );

    /** Per UTC calendar day: sum of grand_total (filtered by optional bill number prefix). */
    @Query(
        value =
            "SELECT CAST((s.bill_date AT TIME ZONE 'UTC') AS date) AS d, " +
            "COALESCE(SUM(s.grand_total), 0) " +
            "FROM sales_bill s " +
            "WHERE s.trader_id = :traderId AND s.bill_date >= :fromInstant AND s.bill_date <= :toInstant " +
            "AND (COALESCE(:billPrefix, '') = '' OR UPPER(s.bill_number) LIKE UPPER(:billPrefix) || '%') " +
            "GROUP BY CAST((s.bill_date AT TIME ZONE 'UTC') AS date) " +
            "ORDER BY d DESC",
        nativeQuery = true
    )
    List<Object[]> sumGrandTotalByUtcDayWithOptionalPrefix(
        @Param("traderId") Long traderId,
        @Param("fromInstant") java.time.Instant fromInstant,
        @Param("toInstant") java.time.Instant toInstant,
        @Param("billPrefix") String billPrefix
    );

    /** Per UTC calendar day: user fee and weighman sums (prefix on bill). */
    @Query(
        value =
            "SELECT CAST((s.bill_date AT TIME ZONE 'UTC') AS date) AS d, " +
            "COALESCE(SUM(g.user_fee_amount), 0), " +
            "COALESCE(SUM(g.weighman_charge_amount), 0) " +
            "FROM sales_bill_commodity_group g " +
            "JOIN sales_bill s ON g.sales_bill_id = s.id " +
            "WHERE s.trader_id = :traderId AND s.bill_date >= :fromInstant AND s.bill_date <= :toInstant " +
            "AND (COALESCE(:billPrefix, '') = '' OR UPPER(s.bill_number) LIKE UPPER(:billPrefix) || '%') " +
            "GROUP BY CAST((s.bill_date AT TIME ZONE 'UTC') AS date) " +
            "ORDER BY d DESC",
        nativeQuery = true
    )
    List<Object[]> sumUserFeeWeighmanByUtcDayWithOptionalPrefix(
        @Param("traderId") Long traderId,
        @Param("fromInstant") java.time.Instant fromInstant,
        @Param("toInstant") java.time.Instant toInstant,
        @Param("billPrefix") String billPrefix
    );

    /** Per UTC calendar day: billed bag quantities (line item quantity sum). */
    @Query(
        value =
            "SELECT CAST((s.bill_date AT TIME ZONE 'UTC') AS date) AS d, " +
            "COALESCE(SUM(li.quantity), 0) " +
            "FROM sales_bill_line_item li " +
            "JOIN sales_bill_commodity_group g ON li.commodity_group_id = g.id " +
            "JOIN sales_bill s ON g.sales_bill_id = s.id " +
            "WHERE s.trader_id = :traderId AND s.bill_date >= :fromInstant AND s.bill_date <= :toInstant " +
            "AND (COALESCE(:billPrefix, '') = '' OR UPPER(s.bill_number) LIKE UPPER(:billPrefix) || '%') " +
            "GROUP BY CAST((s.bill_date AT TIME ZONE 'UTC') AS date) " +
            "ORDER BY d DESC",
        nativeQuery = true
    )
    List<Object[]> sumLineItemQuantityByUtcDayWithOptionalPrefix(
        @Param("traderId") Long traderId,
        @Param("fromInstant") java.time.Instant fromInstant,
        @Param("toInstant") java.time.Instant toInstant,
        @Param("billPrefix") String billPrefix
    );

    /**
     * Bills for one UTC calendar day of {@code bill_date}, optional prefix. One row per bill; fees/bags via correlated subselects (no join inflation).
     */
    @Query(
        value =
            "SELECT s.buyer_name, s.bill_number, s.grand_total, " +
            "(SELECT COALESCE(SUM(li.quantity), 0) FROM sales_bill_line_item li " +
            "  INNER JOIN sales_bill_commodity_group cg ON li.commodity_group_id = cg.id " +
            "  WHERE cg.sales_bill_id = s.id), " +
            "(SELECT COALESCE(SUM(cg.user_fee_amount), 0) FROM sales_bill_commodity_group cg WHERE cg.sales_bill_id = s.id), " +
            "(SELECT COALESCE(SUM(cg.weighman_charge_amount), 0) FROM sales_bill_commodity_group cg WHERE cg.sales_bill_id = s.id) " +
            "FROM sales_bill s " +
            "WHERE s.trader_id = :traderId " +
            "AND CAST((s.bill_date AT TIME ZONE 'UTC') AS date) = CAST(:billDay AS date) " +
            "AND (COALESCE(:billPrefix, '') = '' OR UPPER(s.bill_number) LIKE UPPER(:billPrefix) || '%') " +
            "ORDER BY UPPER(s.bill_number)",
        nativeQuery = true
    )
    List<Object[]> findUserFeesBillRowsForUtcDayWithOptionalPrefix(
        @Param("traderId") Long traderId,
        @Param("billDay") java.time.LocalDate billDay,
        @Param("billPrefix") String billPrefix
    );
}
