package com.mercotrace.service.impl;

import com.mercotrace.domain.Trader;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.service.TraderAuctionTouchLayoutService;
import jakarta.persistence.EntityNotFoundException;
import java.time.Instant;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class TraderAuctionTouchLayoutServiceImpl implements TraderAuctionTouchLayoutService {

    private final TraderRepository traderRepository;

    public TraderAuctionTouchLayoutServiceImpl(TraderRepository traderRepository) {
        this.traderRepository = traderRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> getLayoutJson(Long traderId) {
        return traderRepository.findById(traderId).map(Trader::getAuctionTouchLayoutJson);
    }

    @Override
    public String saveLayoutJson(Long traderId, String layoutJson) {
        Trader trader = traderRepository.findById(traderId).orElseThrow(() -> new EntityNotFoundException("Trader not found: " + traderId));
        String normalized = layoutJson == null || layoutJson.isBlank() ? null : layoutJson.trim();
        trader.setAuctionTouchLayoutJson(normalized);
        trader.setUpdatedAt(Instant.now());
        traderRepository.save(trader);
        return trader.getAuctionTouchLayoutJson();
    }
}
