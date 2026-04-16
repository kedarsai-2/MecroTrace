package com.mercotrace.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.ArApDocument;
import com.mercotrace.domain.Contact;
import com.mercotrace.repository.ArApDocumentRepository;
import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.PartyExposureRowDTO;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

/**
 * Unit tests for {@link HighLevelReportsServiceImpl}.
 */
@ExtendWith(MockitoExtension.class)
class HighLevelReportsServiceImplTest {

    private static final long TRADER_ID = 101L;

    @Mock
    private SalesBillRepository salesBillRepository;

    @Mock
    private ArApDocumentRepository arApDocumentRepository;

    @Mock
    private TraderContextService traderContextService;

    private HighLevelReportsServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new HighLevelReportsServiceImpl(salesBillRepository, arApDocumentRepository, traderContextService);
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
    }

    @Test
    void getPartyExposureBuildsRowsFromArDocuments() {
        LocalDate from = LocalDate.of(2025, 1, 1);
        LocalDate to = LocalDate.of(2025, 12, 31);
        Contact c = new Contact();
        c.setId(1L);
        c.setName("Vijay Traders");
        ArApDocument d = new ArApDocument();
        d.setId(10L);
        d.setTraderId(TRADER_ID);
        d.setContact(c);
        d.setOriginalAmount(BigDecimal.valueOf(100000));
        d.setOutstandingBalance(BigDecimal.valueOf(40000));
        d.setDocumentDate(LocalDate.of(2025, 2, 1));

        Page<ArApDocument> page = new PageImpl<>(List.of(d), PageRequest.of(0, 200), 1);
        when(arApDocumentRepository.findAllByTraderIdAndTypeAndStatus(eq(TRADER_ID), any(), eq(null), any()))
            .thenReturn(page);

        List<PartyExposureRowDTO> rows = service.getPartyExposure(from, to);

        assertThat(rows).hasSize(1);
        PartyExposureRowDTO row = rows.get(0);
        assertThat(row.getParty()).isEqualTo("Vijay Traders");
        assertThat(row.getTotalSale()).isEqualByComparingTo(BigDecimal.valueOf(100000));
        assertThat(row.getOutstanding()).isEqualByComparingTo(BigDecimal.valueOf(40000));
    }
}

