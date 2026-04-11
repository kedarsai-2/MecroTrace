package com.mercotrace.repository;

import com.mercotrace.domain.SalesBill;
import java.math.BigDecimal;
import java.util.Collection;
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
        "SELECT COALESCE(SUM(b.outboundFreight), 0) FROM SalesBill b " +
        "WHERE b.traderId = :traderId AND b.id IN :billIds"
    )
    BigDecimal sumOutboundFreightByTraderAndBillIds(@Param("traderId") Long traderId, @Param("billIds") Collection<Long> billIds);
}
