package com.mercotrace.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.PrintLog;
import com.mercotrace.repository.PrintLogRepository;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.PrintLogCreateRequest;
import com.mercotrace.service.dto.PrintLogDTO;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
class PrintLogServiceImplTest {

    private static final long TRADER_ID = 101L;

    @Mock
    private PrintLogRepository printLogRepository;

    @Mock
    private TraderContextService traderContextService;

    private PrintLogServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PrintLogServiceImpl(printLogRepository, traderContextService);
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
    }

    @Test
    void create_setsTraderIdAndDefaultsPrintedAtWhenNull() {
        PrintLogCreateRequest request = new PrintLogCreateRequest();
        request.setReferenceType("SALES_BILL");
        request.setReferenceId("123");
        request.setPrintType("SALES_BILL");
        request.setPrintedAt(null);

        when(printLogRepository.save(any(PrintLog.class))).thenAnswer(inv -> {
            PrintLog e = inv.getArgument(0);
            e.setId(1L);
            if (e.getPrintedAt() == null) {
                e.setPrintedAt(Instant.now());
            }
            return e;
        });

        PrintLogDTO dto = service.create(request);

        ArgumentCaptor<PrintLog> captor = ArgumentCaptor.forClass(PrintLog.class);
        verify(printLogRepository).save(captor.capture());
        PrintLog saved = captor.getValue();
        assertThat(saved.getTraderId()).isEqualTo(TRADER_ID);
        assertThat(saved.getReferenceType()).isEqualTo("SALES_BILL");
        assertThat(saved.getReferenceId()).isEqualTo("123");
        assertThat(saved.getPrintType()).isEqualTo("SALES_BILL");
        assertThat(saved.getPrintedAt()).isNotNull();

        assertThat(dto.getId()).isEqualTo(1L);
        assertThat(dto.getReferenceType()).isEqualTo("SALES_BILL");
        assertThat(dto.getReferenceId()).isEqualTo("123");
        assertThat(dto.getPrintType()).isEqualTo("SALES_BILL");
        assertThat(dto.getPrintedAt()).isNotNull();
    }

    @Test
    void list_returnsPageOfPrintLogDTOsForCurrentTrader() {
        PrintLog log = new PrintLog();
        log.setId(5L);
        log.setTraderId(TRADER_ID);
        log.setReferenceType("STICKER");
        log.setReferenceId("1");
        log.setPrintType("STICKER");
        log.setPrintedAt(Instant.now());

        Page<PrintLog> page = new PageImpl<>(List.of(log));
        when(printLogRepository.findAllByTraderIdOrderByPrintedAtDesc(TRADER_ID, PageRequest.of(0, 20))).thenReturn(page);

        Page<PrintLogDTO> result = service.list(PageRequest.of(0, 20));

        assertThat(result.getTotalElements()).isEqualTo(1);
        PrintLogDTO dto = result.getContent().get(0);
        assertThat(dto.getId()).isEqualTo(5L);
        assertThat(dto.getReferenceType()).isEqualTo("STICKER");
        assertThat(dto.getReferenceId()).isEqualTo("1");
        assertThat(dto.getPrintType()).isEqualTo("STICKER");
    }
}

