package com.mercotrace.repository;

import com.mercotrace.domain.Auction;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link com.mercotrace.domain.Auction} entity.
 */
@Repository
public interface AuctionRepository extends JpaRepository<Auction, Long> {

    Optional<Auction> findFirstByLotIdOrderByAuctionDatetimeDesc(Long lotId);

    Optional<Auction> findFirstByLotIdAndSelfSaleUnitIdIsNullOrderByAuctionDatetimeDesc(Long lotId);

    Optional<Auction> findFirstByLotIdAndCompletedAtIsNotNullOrderByAuctionDatetimeDesc(Long lotId);

    Page<Auction> findAllByTraderIdAndAuctionDatetimeBetween(Long traderId, Instant from, Instant to, Pageable pageable);

    Page<Auction> findAllByAuctionDatetimeBetween(Instant from, Instant to, Pageable pageable);

    List<Auction> findAllByLotIdIn(Iterable<Long> lotIds);

    List<Auction> findAllByLotIdInAndSelfSaleUnitIdIsNull(Iterable<Long> lotIds);

    List<Auction> findAllBySelfSaleUnitIdOrderByAuctionDatetimeAsc(Long selfSaleUnitId);

    void deleteByLotIdIn(Collection<Long> lotIds);

    /**
     * Completed auctions only (used for "results" list).
     */
    Page<Auction> findByCompletedAtIsNotNull(Pageable pageable);

    Page<Auction> findByCompletedAtIsNotNullAndSelfSaleUnitIdIsNull(Pageable pageable);

    /**
     * Completed auctions for the given lot IDs (used by Settlement sellers list).
     */
    Page<Auction> findByCompletedAtIsNotNullAndLotIdIn(java.util.Collection<Long> lotIds, Pageable pageable);

    Page<Auction> findByCompletedAtIsNotNullAndLotIdInAndSelfSaleUnitIdIsNull(java.util.Collection<Long> lotIds, Pageable pageable);
}

