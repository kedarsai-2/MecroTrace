package com.mercotrace.repository;

import com.mercotrace.domain.CdnItem;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface CdnItemRepository extends JpaRepository<CdnItem, Long> {

    List<CdnItem> findAllByCdnIdAndIsDeletedFalse(Long cdnId);

    @Query("SELECT i FROM CdnItem i WHERE i.cdn.id = :cdnId AND i.cdn.traderId = :traderId AND i.isDeleted = false")
    List<CdnItem> findAllByCdnIdAndTraderId(@Param("cdnId") Long cdnId, @Param("traderId") Long traderId);

    @Query(
        "SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END FROM CdnItem i " +
        "WHERE i.isDeleted = false AND i.lotId IS NOT NULL AND i.lotId IN :lotIds"
    )
    boolean existsActiveByLotIdIn(@Param("lotIds") Collection<Long> lotIds);
}
