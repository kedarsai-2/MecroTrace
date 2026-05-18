package com.mercotrace.web.rest;

import com.mercotrace.service.LogisticsDailySerialService;
import com.mercotrace.service.LogisticsDailySerialService.DailySerialsResponse;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for Logistics (PrintHub) support: daily serial allocation (REQ-LOG-001, REQ-LOG-002).
 */
@RestController
@RequestMapping("/api/logistics")
public class LogisticsResource {

    private static final Logger LOG = LoggerFactory.getLogger(LogisticsResource.class);

    private final LogisticsDailySerialService logisticsDailySerialService;

    public LogisticsResource(LogisticsDailySerialService logisticsDailySerialService) {
        this.logisticsDailySerialService = logisticsDailySerialService;
    }

    /**
     * {@code POST  /api/logistics/daily-serials} : Get or allocate daily serials for seller names and lot ids.
     * Returns stable sellerSerials and lotNumbers for the current trader and today. No localStorage; server-persisted.
     */
    @PostMapping("/daily-serials")
    public ResponseEntity<DailySerialsResponse> allocateDailySerials(
        @RequestBody(required = false) DailySerialsRequest request
    ) {
        DailySerialsRequest body = request != null ? request : new DailySerialsRequest();
        LOG.debug("REST request to allocate daily serials: {} sellers, {} lots",
            body.getSellerNames() != null ? body.getSellerNames().size() : 0,
            body.getLotIds() != null ? body.getLotIds().size() : 0);
        DailySerialsResponse result = logisticsDailySerialService.allocate(
            body.getSellerNames(),
            body.getLotIds()
        );
        return ResponseEntity.ok(result);
    }

    /**
     * Payload type for Daily Serials Request.
     */
    public static class DailySerialsRequest {
        private List<String> sellerNames = List.of();
        private List<String> lotIds = List.of();

        public List<String> getSellerNames() {
            return sellerNames;
        }

        public void setSellerNames(List<String> sellerNames) {
            this.sellerNames = sellerNames != null ? sellerNames : List.of();
        }

        public List<String> getLotIds() {
            return lotIds;
        }

        public void setLotIds(List<String> lotIds) {
            this.lotIds = lotIds != null ? lotIds : List.of();
        }
    }
}
