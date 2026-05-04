package com.mercotrace.repository;

import com.mercotrace.domain.StockPurchaseItem;
import java.util.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface StockPurchaseItemRepository extends JpaRepository<StockPurchaseItem, Long> {

    @Query(
        "SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END FROM StockPurchaseItem i JOIN i.purchase p " +
        "WHERE p.traderId = :traderId AND i.isDeleted = false AND i.lotId IS NOT NULL AND i.lotId IN :lotIds"
    )
    boolean existsActiveByTraderIdAndLotIdIn(@Param("traderId") Long traderId, @Param("lotIds") Collection<Long> lotIds);
}
