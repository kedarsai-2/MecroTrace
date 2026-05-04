package com.mercotrace.repository;

import com.mercotrace.domain.AuctionSelfSaleUnit;
import com.mercotrace.domain.enumeration.AuctionSelfSaleUnitStatus;
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
 * Repository for quantity-based auction self-sale units.
 */
@Repository
public interface AuctionSelfSaleUnitRepository extends JpaRepository<AuctionSelfSaleUnit, Long> {

    Page<AuctionSelfSaleUnit> findByTraderIdAndStatusIn(Long traderId, Collection<AuctionSelfSaleUnitStatus> statuses, Pageable pageable);

    List<AuctionSelfSaleUnit> findBySourceAuctionId(Long sourceAuctionId);

    Optional<AuctionSelfSaleUnit> findByIdAndTraderId(Long id, Long traderId);

    boolean existsBySourceAuctionEntryId(Long sourceAuctionEntryId);

    List<AuctionSelfSaleUnit> findByLotIdIn(Collection<Long> lotIds);

    List<AuctionSelfSaleUnit> findByLotId(Long lotId);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM AuctionSelfSaleUnit u WHERE u.lotId IN :lotIds")
    boolean existsByLotIdIn(@Param("lotIds") Collection<Long> lotIds);
}
