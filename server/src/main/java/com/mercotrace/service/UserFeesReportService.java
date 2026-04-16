package com.mercotrace.service;

import com.mercotrace.service.dto.UserFeesDayDetailDTO;
import com.mercotrace.service.dto.UserFeesReportDTO;
import java.time.LocalDate;

/** User fee and weighman aggregates from billing, grouped by UTC calendar day of bill date. */
public interface UserFeesReportService {

    /**
     * @param billPrefix optional; empty = all bills. When set, matches bill number prefix (case-insensitive).
     */
    UserFeesReportDTO getReport(LocalDate dateFrom, LocalDate dateTo, String billPrefix);

    UserFeesDayDetailDTO getDayDetail(LocalDate date, String billPrefix);
}
