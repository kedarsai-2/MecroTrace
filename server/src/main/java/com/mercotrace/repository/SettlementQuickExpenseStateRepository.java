package com.mercotrace.repository;

import com.mercotrace.domain.SettlementQuickExpenseState;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SettlementQuickExpenseStateRepository extends JpaRepository<SettlementQuickExpenseState, Long> {
    Optional<SettlementQuickExpenseState> findOneByTraderIdAndSellerId(Long traderId, String sellerId);

    List<SettlementQuickExpenseState> findAllByTraderIdAndSellerIdIn(Long traderId, List<String> sellerIds);
}
