package com.mercotrace.service.impl;

import com.mercotrace.domain.ArApDocument;
import com.mercotrace.repository.ArApDocumentRepository;
import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.repository.SalesBillRepository.SalesBillAggregate;
import com.mercotrace.service.HighLevelReportsService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.AdminDailySummaryDTO;
import com.mercotrace.service.dto.PartyExposureRowDTO;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * High-level reports implementation using SalesBill and AR/AP aggregates.
 */
@Service
@Transactional(readOnly = true)
public class HighLevelReportsServiceImpl implements HighLevelReportsService {

    /** Party exposure cache per trader + date range. */
    public static final String CACHE_PARTY_EXPOSURE_BY_TRADER_AND_DATE_RANGE = "highLevelReportsPartyExposureByTraderAndDateRange";

    /** Admin daily summary cache per trader + date range. */
    public static final String CACHE_ADMIN_DAILY_SUMMARY_BY_TRADER_AND_DATE_RANGE = "highLevelReportsAdminDailySummaryByTraderAndDateRange";

    private final SalesBillRepository salesBillRepository;
    private final ArApDocumentRepository arApDocumentRepository;
    private final TraderContextService traderContextService;

    public HighLevelReportsServiceImpl(
        SalesBillRepository salesBillRepository,
        ArApDocumentRepository arApDocumentRepository,
        TraderContextService traderContextService
    ) {
        this.salesBillRepository = salesBillRepository;
        this.arApDocumentRepository = arApDocumentRepository;
        this.traderContextService = traderContextService;
    }

    @Override
    @Cacheable(
        cacheNames = CACHE_PARTY_EXPOSURE_BY_TRADER_AND_DATE_RANGE,
        keyGenerator = "reportsKeyGenerator",
        unless = "#result == null || #result.isEmpty()"
    )
    public List<PartyExposureRowDTO> getPartyExposure(LocalDate dateFrom, LocalDate dateTo) {
        // For now build exposure from AR documents only (outstanding balances).
        LocalDate from = requireDate(dateFrom, "dateFrom");
        LocalDate to = requireDate(dateTo, "dateTo");
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("dateTo must be on or after dateFrom");
        }
        Long traderId = traderContextService.getCurrentTraderId();

        // Load all AR documents for the trader; filter by document date if provided.
        // Using unpaged read through existing repository.
        List<ArApDocument> docs = arApDocumentRepository
            .findAllByTraderIdAndTypeAndStatus(traderId, com.mercotrace.domain.enumeration.ArApType.AR, null, org.springframework.data.domain.Pageable.unpaged())
            .getContent();

        Map<String, PartyExposureRowDTO> byParty = new LinkedHashMap<>();
        for (ArApDocument d : docs) {
            if (d.getDocumentDate() != null && (d.getDocumentDate().isBefore(from) || d.getDocumentDate().isAfter(to))) {
                continue;
            }
            BigDecimal original = safe(d.getOriginalAmount());
            BigDecimal outstanding = safe(d.getOutstandingBalance());
            if (original.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            String partyName = d.getContact() != null && d.getContact().getName() != null ? d.getContact().getName() : "";
            PartyExposureRowDTO row = byParty.computeIfAbsent(partyName, k -> {
                PartyExposureRowDTO dto = new PartyExposureRowDTO();
                dto.setParty(k);
                dto.setTotalSale(BigDecimal.ZERO);
                dto.setTotalCollected(BigDecimal.ZERO);
                dto.setOutstanding(BigDecimal.ZERO);
                dto.setOldestDue("-");
                dto.setRiskLevel("Low");
                return dto;
            });
            row.setTotalSale(row.getTotalSale().add(original));
            BigDecimal collected = original.subtract(outstanding);
            row.setTotalCollected(row.getTotalCollected().add(collected));
            row.setOutstanding(row.getOutstanding().add(outstanding));

            if (outstanding.compareTo(BigDecimal.ZERO) > 0 && d.getDocumentDate() != null) {
                if ("-".equals(row.getOldestDue()) || LocalDate.parse(row.getOldestDue()).isAfter(d.getDocumentDate())) {
                    row.setOldestDue(d.getDocumentDate().toString());
                }
            }
        }

        // Assign simple risk levels based on outstanding amount and age.
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (PartyExposureRowDTO row : byParty.values()) {
            if (row.getOutstanding().compareTo(BigDecimal.ZERO) <= 0) {
                row.setRiskLevel("Low");
                continue;
            }
            long maxDays = 0;
            if (!"-".equals(row.getOldestDue())) {
                LocalDate od = LocalDate.parse(row.getOldestDue());
                maxDays = java.time.temporal.ChronoUnit.DAYS.between(od, today);
            }
            if (maxDays > 90 || row.getOutstanding().compareTo(BigDecimal.valueOf(100000)) > 0) {
                row.setRiskLevel("Critical");
            } else if (maxDays > 60 || row.getOutstanding().compareTo(BigDecimal.valueOf(50000)) > 0) {
                row.setRiskLevel("High");
            } else if (maxDays > 30 || row.getOutstanding().compareTo(BigDecimal.valueOf(20000)) > 0) {
                row.setRiskLevel("Medium");
            } else {
                row.setRiskLevel("Low");
            }
        }
        return new ArrayList<>(byParty.values());
    }

    @Override
    @Cacheable(
        cacheNames = CACHE_ADMIN_DAILY_SUMMARY_BY_TRADER_AND_DATE_RANGE,
        keyGenerator = "reportsKeyGenerator",
        unless = "#result == null"
    )
    public AdminDailySummaryDTO getAdminDailySummary(LocalDate dateFrom, LocalDate dateTo) {
        LocalDate from = requireDate(dateFrom, "dateFrom");
        LocalDate to = requireDate(dateTo, "dateTo");
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("dateTo must be on or after dateFrom");
        }
        AdminDailySummaryDTO dto = new AdminDailySummaryDTO();
        dto.setTotalArrivals(0L);
        dto.setTotalLots(0L);
        dto.setTotalAuctions(0L);

        // When called by an admin without a trader context, return a safe placeholder summary instead of failing.
        java.util.Optional<Long> traderIdOpt = traderContextService.getCurrentTraderIdOptional();
        if (traderIdOpt.isEmpty()) {
            dto.setTotalBills(0L);
            dto.setTotalRevenue(BigDecimal.ZERO);
            dto.setTotalCollected(BigDecimal.ZERO);
            dto.setTotalPending(BigDecimal.ZERO);
            return dto;
        }

        Long traderId = traderIdOpt.get();
        Instant fromInstant = from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant = to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC).minusMillis(1);

        SalesBillAggregate agg = salesBillRepository.aggregateByTraderAndBillDateRange(traderId, fromInstant, toInstant);
        long totalBills = agg != null && agg.getTotalBills() != null ? agg.getTotalBills() : 0L;
        BigDecimal gross = agg != null && agg.getGrossSale() != null ? agg.getGrossSale() : BigDecimal.ZERO;
        BigDecimal pending = agg != null && agg.getPendingBalance() != null ? agg.getPendingBalance() : BigDecimal.ZERO;
        BigDecimal collected = gross.subtract(pending != null ? pending : BigDecimal.ZERO);

        dto.setTotalBills(totalBills);
        dto.setTotalRevenue(gross);
        dto.setTotalCollected(collected);
        dto.setTotalPending(pending);
        return dto;
    }

    private static LocalDate requireDate(LocalDate value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private static BigDecimal safe(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}

