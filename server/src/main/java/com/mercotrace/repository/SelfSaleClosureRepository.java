package com.mercotrace.repository;

import com.mercotrace.domain.SelfSaleClosure;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface SelfSaleClosureRepository extends JpaRepository<SelfSaleClosure, Long> {

    /**
     * Paginated list of closures for a trader (excluding soft-deleted), sorted by closedAt desc by default.
     */
    Page<SelfSaleClosure> findByTraderIdAndIsDeletedFalse(Long traderId, Pageable pageable);

    List<SelfSaleClosure> findAllByTraderIdAndIsDeletedFalse(Long traderId);

    /**
     * Sum of (appliedRate * lot.bagCount) for all non-deleted closures of the trader. For "Total Sold" in client (align with client_origin).
     */
    @Query("SELECT COALESCE(SUM(s.appliedRate * l.bagCount), 0) FROM SelfSaleClosure s, Lot l WHERE l.id = s.lotId AND s.traderId = :traderId AND s.isDeleted = false")
    BigDecimal sumAmountByTraderId(@Param("traderId") Long traderId);

    long countByTraderIdAndIsDeletedFalse(Long traderId);

    /**
     * Lot IDs that are already closed as self-sale for this trader (to exclude from open lots).
     */
    @Query("SELECT s.lotId FROM SelfSaleClosure s WHERE s.traderId = :traderId AND s.isDeleted = false")
    Set<Long> findClosedLotIdsByTraderId(@Param("traderId") Long traderId);

    /**
     * Whether the lot has an active (non-deleted) self-sale closure for this trader.
     */
    boolean existsByLotIdAndTraderIdAndIsDeletedFalse(Long lotId, Long traderId);

    /**
     * Latest active self-sale closure for the given lot and trader.
     */
    java.util.Optional<SelfSaleClosure> findFirstByLotIdAndTraderIdAndIsDeletedFalseOrderByClosedAtDesc(Long lotId, Long traderId);
}
