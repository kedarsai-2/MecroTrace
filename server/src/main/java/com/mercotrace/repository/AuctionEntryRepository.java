package com.mercotrace.repository;

import com.mercotrace.domain.AuctionEntry;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link com.mercotrace.domain.AuctionEntry} entity.
 */
@Repository
public interface AuctionEntryRepository extends JpaRepository<AuctionEntry, Long> {

    List<AuctionEntry> findAllByAuctionId(Long auctionId);

    List<AuctionEntry> findAllByAuctionIdIn(Iterable<Long> auctionIds);

    void deleteByAuctionIdIn(Collection<Long> auctionIds);

    Optional<AuctionEntry> findFirstByBidNumber(Integer bidNumber);

    Page<AuctionEntry> findAllByCreatedAtBetween(Instant from, Instant to, Pageable pageable);

    /**
     * Lightweight Billing Create/Search rows. Includes all completed auctions owned by the trader,
     * including completed re-auctions for self-sale units, but excludes the placeholder self-sale rows.
     */
    @Query(
        value =
            "SELECT " +
                "ae.buyer_id, ae.buyer_mark, ae.buyer_name, " +
                "ae.id AS auction_entry_id, ae.bid_number, " +
                "a.lot_id, l.lot_name, a.self_sale_unit_id, l.bag_count AS lot_total_qty, " +
                "COALESCE(NULLIF(BTRIM(sc.name), ''), NULLIF(BTRIM(siv.seller_name), ''), '') AS seller_name, " +
                "co.commodity_name, ae.bid_rate, ae.quantity, " +
                "NULLIF(BTRIM(v.vehicle_mark_alias), '') AS vehicle_mark, " +
                "COALESCE(NULLIF(BTRIM(sc.mark), ''), NULLIF(BTRIM(siv.seller_mark), ''), '') AS seller_mark, " +
                "COALESCE(vt.vehicle_total_qty, l.bag_count, 0) AS vehicle_total_qty, " +
                "COALESCE(st.seller_total_qty, l.bag_count, 0) AS seller_total_qty, " +
                "ae.preset_margin, ae.token_advance, ae.is_self_sale, " +
                "a.completed_at, a.id AS auction_id " +
            "FROM auction_entry ae " +
                "INNER JOIN auction a ON ae.auction_id = a.id " +
                "INNER JOIN lot l ON a.lot_id = l.id " +
                "INNER JOIN seller_in_vehicle siv ON l.seller_vehicle_id = siv.id " +
                "INNER JOIN vehicle v ON siv.vehicle_id = v.id " +
                "LEFT JOIN contact sc ON siv.contact_id = sc.id " +
                "LEFT JOIN commodity co ON l.commodity_id = co.id " +
                "LEFT JOIN ( " +
                    "SELECT siv2.vehicle_id, COALESCE(SUM(l2.bag_count), 0) AS vehicle_total_qty " +
                    "FROM lot l2 INNER JOIN seller_in_vehicle siv2 ON l2.seller_vehicle_id = siv2.id " +
                    "GROUP BY siv2.vehicle_id " +
                ") vt ON vt.vehicle_id = siv.vehicle_id " +
                "LEFT JOIN ( " +
                    "SELECT l3.seller_vehicle_id, COALESCE(SUM(l3.bag_count), 0) AS seller_total_qty " +
                    "FROM lot l3 GROUP BY l3.seller_vehicle_id " +
                ") st ON st.seller_vehicle_id = l.seller_vehicle_id " +
            "WHERE v.trader_id = :traderId " +
                "AND a.completed_at IS NOT NULL " +
                "AND COALESCE(ae.is_self_sale, false) = false " +
            "ORDER BY a.completed_at DESC, a.id DESC, ae.bid_number ASC",
        nativeQuery = true
    )
    List<Object[]> findBillingBuyerEntryRowsForTrader(@Param("traderId") Long traderId);

    /**
     * Distinct scribble (temporary) buyer marks for the trader, from entries created in [start, end).
     * Scoped via lot → seller_in_vehicle → vehicle (same as lot ownership), so auctions without trader_id set still match.
     */
    @Query(
        value =
            "SELECT DISTINCT ae.buyer_mark FROM auction_entry ae " +
            "INNER JOIN auction a ON ae.auction_id = a.id " +
            "INNER JOIN lot l ON a.lot_id = l.id " +
            "INNER JOIN seller_in_vehicle siv ON l.seller_vehicle_id = siv.id " +
            "INNER JOIN vehicle v ON siv.vehicle_id = v.id " +
            "WHERE v.trader_id = :traderId " +
            "AND ae.is_scribble = true " +
            "AND ae.created_at >= :start " +
            "AND ae.created_at < :end " +
            "ORDER BY ae.buyer_mark",
        nativeQuery = true
    )
    List<String> findDistinctScribbleBuyerMarksForTraderCreatedBetween(
        @Param("traderId") Long traderId,
        @Param("start") Instant start,
        @Param("end") Instant end
    );

    /**
     * Distinct scribble (temporary) buyer marks across all auction history for bounded picker searches.
     */
    @Query(
        value =
            "SELECT mark FROM (" +
            "SELECT DISTINCT ae.buyer_mark AS mark FROM auction_entry ae " +
            "INNER JOIN auction a ON ae.auction_id = a.id " +
            "INNER JOIN lot l ON a.lot_id = l.id " +
            "INNER JOIN seller_in_vehicle siv ON l.seller_vehicle_id = siv.id " +
            "INNER JOIN vehicle v ON siv.vehicle_id = v.id " +
            "WHERE v.trader_id = :traderId " +
            "AND ae.is_scribble = true " +
            "AND ae.buyer_mark IS NOT NULL " +
            "AND btrim(ae.buyer_mark) <> '' " +
            "AND (:needle = '' OR lower(ae.buyer_mark) LIKE concat('%', :needle, '%'))" +
            ") marks " +
            "ORDER BY " +
            "CASE WHEN lower(mark) = :needle THEN 0 " +
            "WHEN lower(mark) LIKE concat(:needle, '%') THEN 1 " +
            "ELSE 2 END, lower(mark), mark",
        nativeQuery = true
    )
    List<String> searchDistinctScribbleBuyerMarksForTrader(
        @Param("traderId") Long traderId,
        @Param("needle") String needle,
        Pageable pageable
    );
}
