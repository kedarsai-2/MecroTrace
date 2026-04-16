package com.mercotrace.service;

import com.mercotrace.service.dto.DailySalesSummaryReportDTO;
import java.time.LocalDate;

/** Aggregated daily / period sales summary for trader reports (billing + arrivals). */
public interface DailySalesSummaryReportService {

    /**
     * @param dateFrom inclusive start (local date)
     * @param dateTo inclusive end (local date)
     * @throws IllegalArgumentException if dates null, to before from, or span exceeds allowed maximum (366 days)
     */
    DailySalesSummaryReportDTO getSummary(LocalDate dateFrom, LocalDate dateTo);
}
