package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.TraderAuctionTouchLayoutService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.AuctionTouchLayoutJsonDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/trader/auction-touch-layout")
public class TraderAuctionTouchLayoutResource {

    private static final Logger LOG = LoggerFactory.getLogger(TraderAuctionTouchLayoutResource.class);

    private final TraderAuctionTouchLayoutService traderAuctionTouchLayoutService;
    private final TraderContextService traderContextService;

    public TraderAuctionTouchLayoutResource(
        TraderAuctionTouchLayoutService traderAuctionTouchLayoutService,
        TraderContextService traderContextService
    ) {
        this.traderAuctionTouchLayoutService = traderAuctionTouchLayoutService;
        this.traderContextService = traderContextService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<AuctionTouchLayoutJsonDTO> get() {
        Long traderId = traderContextService.getCurrentTraderId();
        AuctionTouchLayoutJsonDTO dto = new AuctionTouchLayoutJsonDTO();
        dto.setLayoutJson(traderAuctionTouchLayoutService.getLayoutJson(traderId).orElse(null));
        return ResponseEntity.ok(dto);
    }

    @PutMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<AuctionTouchLayoutJsonDTO> put(@Valid @RequestBody AuctionTouchLayoutJsonDTO body) {
        Long traderId = traderContextService.getCurrentTraderId();
        String saved = traderAuctionTouchLayoutService.saveLayoutJson(traderId, body.getLayoutJson());
        LOG.debug("Updated auction touch layout for trader {}", traderId);
        AuctionTouchLayoutJsonDTO out = new AuctionTouchLayoutJsonDTO();
        out.setLayoutJson(saved);
        return ResponseEntity.ok(out);
    }
}
