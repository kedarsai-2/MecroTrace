package com.mercotrace.service.impl;

import com.mercotrace.repository.LotRepository;
import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.service.DailySalesSummaryReportService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.DailySalesSummaryDayRowDTO;
import com.mercotrace.service.dto.DailySalesSummaryReportDTO;
import com.mercotrace.service.dto.DailySalesSummaryTotalsDTO;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Per-day (UTC calendar) aggregates, newest day first. Same bill instant semantics as legacy range queries.
 *
 * <p>Net sales per day = gross − commission − user fee − coolie (HALF_UP scale 2).
 */
@Service
@Transactional(readOnly = true)
public class DailySalesSummaryReportServiceImpl implements DailySalesSummaryReportService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public static final int MAX_RANGE_DAYS = 366;

    private final SalesBillRepository salesBillRepository;
    private final LotRepository lotRepository;
    private final TraderContextService traderContextService;

    public DailySalesSummaryReportServiceImpl(
        SalesBillRepository salesBillRepository,
        LotRepository lotRepository,
        TraderContextService traderContextService
    ) {
        this.salesBillRepository = salesBillRepository;
        this.lotRepository = lotRepository;
        this.traderContextService = traderContextService;
    }

    @Override
    public DailySalesSummaryReportDTO getSummary(LocalDate dateFrom, LocalDate dateTo) {
        LocalDate from = requireDate(dateFrom, "dateFrom");
        LocalDate to = requireDate(dateTo, "dateTo");
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("dateTo must be on or after dateFrom");
        }
        LocalDate todayIst = LocalDate.now(IST);
        if (to.isAfter(todayIst)) {
            to = todayIst;
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("date range has no past or present days (end capped to today IST)");
        }
        long spanDays = ChronoUnit.DAYS.between(from, to);
        if (spanDays > MAX_RANGE_DAYS) {
            throw new IllegalArgumentException("Date range must not exceed " + MAX_RANGE_DAYS + " days");
        }

        Long traderId = traderContextService.getCurrentTraderId();
        Instant fromInstant = from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant = to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC).minusMillis(1);

        Map<LocalDate, MutableDay> byDay = new HashMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            byDay.put(d, new MutableDay());
        }

        for (Object[] row : salesBillRepository.aggregateBillsByUtcDay(traderId, fromInstant, toInstant)) {
            LocalDate day = toLocalDate(row[0]);
            if (day == null || !byDay.containsKey(day)) {
                continue;
            }
            MutableDay m = byDay.get(day);
            m.bills = toLong(row[1]);
            m.gross = nzBd(row[2]);
            m.pending = nzBd(row[3]);
        }

        for (Object[] row : salesBillRepository.sumFeesByUtcDay(traderId, fromInstant, toInstant)) {
            LocalDate day = toLocalDate(row[0]);
            if (day == null || !byDay.containsKey(day)) {
                continue;
            }
            MutableDay m = byDay.get(day);
            m.commission = nzBd(row[1]);
            m.userFee = nzBd(row[2]);
            m.coolie = nzBd(row[3]);
        }

        for (Object[] row : lotRepository.sumBagsByUtcArrivalDay(traderId, fromInstant, toInstant)) {
            LocalDate day = toLocalDate(row[0]);
            if (day == null || !byDay.containsKey(day)) {
                continue;
            }
            byDay.get(day).bags = toLong(row[1]);
        }

        DailySalesSummaryReportDTO report = new DailySalesSummaryReportDTO();
        report.setPeriodStart(from);
        report.setPeriodEnd(to);

        DailySalesSummaryTotalsDTO totals = new DailySalesSummaryTotalsDTO();
        long tBills = 0;
        long tBags = 0;
        BigDecimal tGross = BigDecimal.ZERO;
        BigDecimal tComm = BigDecimal.ZERO;
        BigDecimal tUser = BigDecimal.ZERO;
        BigDecimal tCoolie = BigDecimal.ZERO;
        BigDecimal tColl = BigDecimal.ZERO;
        BigDecimal tOut = BigDecimal.ZERO;

        for (LocalDate d = to; !d.isBefore(from); d = d.minusDays(1)) {
            MutableDay m = byDay.get(d);
            DailySalesSummaryDayRowDTO rowDto = m.toRow(d);
            report.getDays().add(rowDto);
            tBills += rowDto.getTotalBills();
            tBags += rowDto.getTotalBags();
            tGross = tGross.add(rowDto.getGrossSale());
            tComm = tComm.add(rowDto.getCommission());
            tUser = tUser.add(rowDto.getUserFee());
            tCoolie = tCoolie.add(rowDto.getCoolie());
            tColl = tColl.add(rowDto.getTotalCollected());
            tOut = tOut.add(rowDto.getOutstanding());
        }

        totals.setTotalBills(tBills);
        totals.setTotalBags(tBags);
        totals.setGrossSale(tGross);
        totals.setCommission(tComm);
        totals.setUserFee(tUser);
        totals.setCoolie(tCoolie);
        totals.setNetSales(tGross.subtract(tComm).subtract(tUser).subtract(tCoolie).setScale(2, RoundingMode.HALF_UP));
        totals.setTotalCollected(tColl);
        totals.setOutstanding(tOut);
        report.setTotals(totals);
        return report;
    }

    private static LocalDate requireDate(LocalDate value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private static LocalDate toLocalDate(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof LocalDate) {
            return (LocalDate) o;
        }
        if (o instanceof Date) {
            return ((Date) o).toLocalDate();
        }
        if (o instanceof java.util.Date) {
            return Instant.ofEpochMilli(((java.util.Date) o).getTime()).atZone(ZoneOffset.UTC).toLocalDate();
        }
        return LocalDate.parse(o.toString());
    }

    private static long toLong(Object o) {
        if (o == null) {
            return 0L;
        }
        if (o instanceof Number) {
            return ((Number) o).longValue();
        }
        return Long.parseLong(o.toString());
    }

    private static BigDecimal nzBd(Object o) {
        if (o == null) {
            return BigDecimal.ZERO;
        }
        if (o instanceof BigDecimal) {
            return (BigDecimal) o;
        }
        if (o instanceof BigInteger) {
            return new BigDecimal((BigInteger) o);
        }
        if (o instanceof Number) {
            return BigDecimal.valueOf(((Number) o).doubleValue());
        }
        return new BigDecimal(o.toString());
    }

    private static final class MutableDay {

        long bills;
        long bags;
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal pending = BigDecimal.ZERO;
        BigDecimal commission = BigDecimal.ZERO;
        BigDecimal userFee = BigDecimal.ZERO;
        BigDecimal coolie = BigDecimal.ZERO;

        DailySalesSummaryDayRowDTO toRow(LocalDate d) {
            BigDecimal collected = gross.subtract(pending);
            BigDecimal net = gross.subtract(commission).subtract(userFee).subtract(coolie).setScale(2, RoundingMode.HALF_UP);
            DailySalesSummaryDayRowDTO dto = new DailySalesSummaryDayRowDTO();
            dto.setDate(d);
            dto.setTotalBills(bills);
            dto.setTotalBags(bags);
            dto.setGrossSale(gross);
            dto.setCommission(commission);
            dto.setUserFee(userFee);
            dto.setCoolie(coolie);
            dto.setNetSales(net);
            dto.setTotalCollected(collected);
            dto.setOutstanding(pending);
            return dto;
        }
    }
}
