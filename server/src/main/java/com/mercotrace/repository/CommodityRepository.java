package com.mercotrace.repository;

import com.mercotrace.domain.Commodity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Commodity entity.
 */
@SuppressWarnings("unused")
@Repository
public interface CommodityRepository extends JpaRepository<Commodity, Long>, JpaSpecificationExecutor<Commodity> {

    List<Commodity> findAllByTraderIdAndActiveTrue(Long traderId);

    Optional<Commodity> findOneByTraderIdAndCommodityNameIgnoreCase(Long traderId, String commodityName);
}
