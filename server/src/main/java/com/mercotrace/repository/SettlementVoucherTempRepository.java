package com.mercotrace.repository;

import com.mercotrace.domain.SettlementVoucherTemp;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SettlementVoucherTempRepository extends JpaRepository<SettlementVoucherTemp, Long> {
    List<SettlementVoucherTemp> findAllByTraderIdAndSellerIdOrderByCreatedDateAsc(Long traderId, String sellerId);

    void deleteAllByTraderIdAndSellerId(Long traderId, String sellerId);
}
