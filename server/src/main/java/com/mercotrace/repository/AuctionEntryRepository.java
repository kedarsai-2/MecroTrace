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

