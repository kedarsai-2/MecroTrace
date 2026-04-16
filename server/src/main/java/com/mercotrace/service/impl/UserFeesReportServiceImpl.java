package com.mercotrace.service.impl;

import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.UserFeesReportService;
import com.mercotrace.service.dto.UserFeesBillRowDTO;
import com.mercotrace.service.dto.UserFeesDayDetailDTO;
import com.mercotrace.service.dto.UserFeesDayRowDTO;
import com.mercotrace.service.dto.UserFeesReportDTO;
import com.mercotrace.service.dto.UserFeesTotalsDTO;
import java.math.BigDecimal;
import java.math.BigInteger;
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

@Service
@Transactional(readOnly = true)
public class UserFeesReportServiceImpl implements UserFeesReportService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public static final int MAX_RANGE_DAYS = 366;

    private final SalesBillRepository salesBillRepository;
    private final TraderContextService traderContextService;

    public UserFeesReportServiceImpl(SalesBillRepository salesBillRepository, TraderContextService traderContextService) {
        this.salesBillRepository = salesBillRepository;
        this.traderContextService = traderContextService;
    }

    @Override
    public UserFeesReportDTO getReport(LocalDate dateFrom, LocalDate dateTo, String billPrefix) {
        LocalDate[] range = validateAndCapRange(dateFrom, dateTo);
        LocalDate from = range[0];
        LocalDate to = range[1];
        String prefixKey = normalizePrefix(billPrefix);

        Long traderId = traderContextService.getCurrentTraderId();
        Instant fromInstant = from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant = to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC).minusMillis(1);

        Map<LocalDate, MutableDay> byDay = new HashMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            byDay.put(d, new MutableDay());
        }

        for (Object[] row : salesBillRepository.sumGrandTotalByUtcDayWithOptionalPrefix(traderId, fromInstant, toInstant, prefixKey)) {
            LocalDate day = toLocalDate(row[0]);
            if (day == null || !byDay.containsKey(day)) {
                continue;
            }
            byDay.get(day).totalSales = nzBd(row[1]);
        }

        for (Object[] row : salesBillRepository.sumUserFeeWeighmanByUtcDayWithOptionalPrefix(traderId, fromInstant, toInstant, prefixKey)) {
            LocalDate day = toLocalDate(row[0]);
            if (day == null || !byDay.containsKey(day)) {
                continue;
            }
            MutableDay m = byDay.get(day);
            m.userCharges = nzBd(row[1]);
            m.weighmanCharge = nzBd(row[2]);
        }

        for (Object[] row : salesBillRepository.sumLineItemQuantityByUtcDayWithOptionalPrefix(traderId, fromInstant, toInstant, prefixKey)) {
            LocalDate day = toLocalDate(row[0]);
            if (day == null || !byDay.containsKey(day)) {
                continue;
            }
            byDay.get(day).totalBags = toLong(row[1]);
        }

        UserFeesReportDTO report = new UserFeesReportDTO();
        report.setPeriodStart(from);
        report.setPeriodEnd(to);
        report.setBillPrefixApplied(prefixKey);

        UserFeesTotalsDTO totals = new UserFeesTotalsDTO();
        long tb = 0;
        BigDecimal ts = BigDecimal.ZERO;
        BigDecimal tu = BigDecimal.ZERO;
        BigDecimal tw = BigDecimal.ZERO;

        for (LocalDate d = to; !d.isBefore(from); d = d.minusDays(1)) {
            MutableDay m = byDay.get(d);
            UserFeesDayRowDTO rowDto = m.toRow(d);
            report.getDays().add(rowDto);
            tb += rowDto.getTotalBags();
            ts = ts.add(rowDto.getTotalSales());
            tu = tu.add(rowDto.getUserCharges());
            tw = tw.add(rowDto.getWeighmanCharge());
        }

        totals.setTotalBags(tb);
        totals.setTotalSales(ts);
        totals.setUserCharges(tu);
        totals.setWeighmanCharge(tw);
        report.setTotals(totals);
        return report;
    }

    @Override
    public UserFeesDayDetailDTO getDayDetail(LocalDate date, String billPrefix) {
        LocalDate day = requireDate(date, "date");
        LocalDate todayIst = LocalDate.now(IST);
        if (day.isAfter(todayIst)) {
            throw new IllegalArgumentException("date must not be after today (IST)");
        }
        String prefixKey = normalizePrefix(billPrefix);
        Long traderId = traderContextService.getCurrentTraderId();

        UserFeesDayDetailDTO dto = new UserFeesDayDetailDTO();
        dto.setDate(day);
        dto.setBillPrefixApplied(prefixKey);

        List<Object[]> rows = salesBillRepository.findUserFeesBillRowsForUtcDayWithOptionalPrefix(traderId, day, prefixKey);
        UserFeesTotalsDTO totals = new UserFeesTotalsDTO();
        long tb = 0;
        BigDecimal ts = BigDecimal.ZERO;
        BigDecimal tu = BigDecimal.ZERO;
        BigDecimal tw = BigDecimal.ZERO;

        for (Object[] row : rows) {
            UserFeesBillRowDTO b = new UserFeesBillRowDTO();
            b.setBuyerName(row[0] != null ? row[0].toString() : "");
            b.setBillNumber(row[1] != null ? row[1].toString() : "");
            b.setTotalSales(nzBd(row[2]));
            b.setTotalBags(toLong(row[3]));
            b.setUserCharges(nzBd(row[4]));
            b.setWeighmanCharge(nzBd(row[5]));
            dto.getBills().add(b);
            tb += b.getTotalBags();
            ts = ts.add(b.getTotalSales());
            tu = tu.add(b.getUserCharges());
            tw = tw.add(b.getWeighmanCharge());
        }

        totals.setTotalBags(tb);
        totals.setTotalSales(ts);
        totals.setUserCharges(tu);
        totals.setWeighmanCharge(tw);
        dto.setTotals(totals);
        return dto;
    }

    private static LocalDate[] validateAndCapRange(LocalDate dateFrom, LocalDate dateTo) {
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
        return new LocalDate[] { from, to };
    }

    private static String normalizePrefix(String billPrefix) {
        if (billPrefix == null) {
            return "";
        }
        return billPrefix.trim().toUpperCase();
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

        long totalBags;
        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal userCharges = BigDecimal.ZERO;
        BigDecimal weighmanCharge = BigDecimal.ZERO;

        UserFeesDayRowDTO toRow(LocalDate d) {
            UserFeesDayRowDTO dto = new UserFeesDayRowDTO();
            dto.setDate(d);
            dto.setTotalBags(totalBags);
            dto.setTotalSales(totalSales);
            dto.setUserCharges(userCharges);
            dto.setWeighmanCharge(weighmanCharge);
            return dto;
        }
    }
}
