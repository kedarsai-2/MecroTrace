package com.mercotrace.repository;

import com.mercotrace.domain.SalesBillLineItem;
import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface SalesBillLineItemRepository extends JpaRepository<SalesBillLineItem, Long> {

    /**
     * Sum persisted billing line weights per lot (commodity group line items), trader-scoped.
     * Used by Settlement Sales Pad net weight vs Arrivals.
     */
    @Query(
        "SELECT i.lotId, COALESCE(SUM(i.weight), 0) FROM SalesBillLineItem i " +
        "JOIN i.commodityGroup g JOIN g.salesBill b " +
        "WHERE b.traderId = :traderId AND i.lotId IS NOT NULL AND i.lotId IN :lotIds " +
        "GROUP BY i.lotId"
    )
    List<Object[]> sumWeightGroupedByLotId(@Param("traderId") Long traderId, @Param("lotIds") Collection<String> lotIds);

    /**
     * Distinct sales bill ids that bill any of the given lots (optional billing name filter).
     */
    @Query(
        "SELECT DISTINCT g.salesBill.id FROM SalesBillLineItem i " +
        "JOIN i.commodityGroup g " +
        "WHERE g.salesBill.traderId = :traderId AND i.lotId IS NOT NULL AND i.lotId IN :lotIds " +
        "AND (:nameFilter IS NULL OR LOWER(g.salesBill.billingName) LIKE LOWER(CONCAT('%', :nameFilter, '%')))"
    )
    List<Long> findDistinctBillIdsByTraderAndLots(
        @Param("traderId") Long traderId,
        @Param("lotIds") Collection<String> lotIds,
        @Param("nameFilter") String nameFilter
    );

    /**
     * Sum line amounts for the given lots on sales bills (optional billing name filter).
     */
    @Query(
        "SELECT COALESCE(SUM(i.amount), 0) FROM SalesBillLineItem i " +
        "JOIN i.commodityGroup g " +
        "WHERE g.salesBill.traderId = :traderId AND i.lotId IS NOT NULL AND i.lotId IN :lotIds " +
        "AND (:nameFilter IS NULL OR LOWER(g.salesBill.billingName) LIKE LOWER(CONCAT('%', :nameFilter, '%')))"
    )
    BigDecimal sumLineAmountByTraderLots(
        @Param("traderId") Long traderId,
        @Param("lotIds") Collection<String> lotIds,
        @Param("nameFilter") String nameFilter
    );

    /**
     * Settlement: sum line amounts for seller lots, including rows where {@code lot_id} was not persisted
     * but {@code auction_entry_id} resolves to an {@link com.mercotrace.domain.Auction} for one of the lots.
     */
    @Query(
        "SELECT COALESCE(SUM(i.amount), 0) FROM SalesBillLineItem i " +
        "JOIN i.commodityGroup g " +
        "WHERE g.salesBill.traderId = :traderId AND " +
        "(" +
        "  (i.lotId IS NOT NULL AND i.lotId IN :lotIdStrs) OR " +
        "  (i.lotId IS NULL AND i.auctionEntryId IS NOT NULL AND i.auctionEntryId IN (" +
        "    SELECT ae.id FROM AuctionEntry ae JOIN Auction au ON ae.auctionId = au.id WHERE au.lotId IN :lotIdsLong" +
        "  ))" +
        ") AND " +
        "(:nameFilter IS NULL OR LOWER(g.salesBill.billingName) LIKE LOWER(CONCAT('%', :nameFilter, '%')))"
    )
    BigDecimal sumLineAmountByTraderLotsForSettlement(
        @Param("traderId") Long traderId,
        @Param("lotIdStrs") Collection<String> lotIdStrs,
        @Param("lotIdsLong") Collection<Long> lotIdsLong,
        @Param("nameFilter") String nameFilter
    );

    /**
     * Distinct bill ids for settlement (same lot matching rules as {@link #sumLineAmountByTraderLotsForSettlement}).
     */
    @Query(
        "SELECT DISTINCT g.salesBill.id FROM SalesBillLineItem i " +
        "JOIN i.commodityGroup g " +
        "WHERE g.salesBill.traderId = :traderId AND " +
        "(" +
        "  (i.lotId IS NOT NULL AND i.lotId IN :lotIdStrs) OR " +
        "  (i.lotId IS NULL AND i.auctionEntryId IS NOT NULL AND i.auctionEntryId IN (" +
        "    SELECT ae.id FROM AuctionEntry ae JOIN Auction au ON ae.auctionId = au.id WHERE au.lotId IN :lotIdsLong" +
        "  ))" +
        ") AND " +
        "(:nameFilter IS NULL OR LOWER(g.salesBill.billingName) LIKE LOWER(CONCAT('%', :nameFilter, '%')))"
    )
    List<Long> findDistinctBillIdsByTraderAndLotsForSettlement(
        @Param("traderId") Long traderId,
        @Param("lotIdStrs") Collection<String> lotIdStrs,
        @Param("lotIdsLong") Collection<Long> lotIdsLong,
        @Param("nameFilter") String nameFilter
    );
}
