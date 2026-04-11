package com.mercotrace.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.domain.SalesBill;
import com.mercotrace.domain.SalesBillCommodityGroup;
import com.mercotrace.repository.BillNumberSequenceRepository;
import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.repository.VoucherRepository;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.CommodityConfigRepository;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.SalesBillDTOs.BillLineItemDTO;
import com.mercotrace.service.dto.SalesBillDTOs.CommodityGroupDTO;
import com.mercotrace.service.dto.SalesBillDTOs.SalesBillCreateOrUpdateRequest;
import com.mercotrace.service.dto.SalesBillDTOs.SalesBillDTO;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
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
class SalesBillServiceImplTest {

    private static final long TRADER_ID = 101L;

    @Mock
    private TraderContextService traderContextService;

    @Mock
    private SalesBillRepository salesBillRepository;

    @Mock
    private TraderRepository traderRepository;

    @Mock
    private BillNumberSequenceRepository billNumberSequenceRepository;

    @Mock
    private VoucherRepository voucherRepository;

    @Mock
    private CommodityRepository commodityRepository;

    @Mock
    private CommodityConfigRepository commodityConfigRepository;

    private SalesBillServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new SalesBillServiceImpl(
            traderContextService,
            salesBillRepository,
            traderRepository,
            billNumberSequenceRepository,
            voucherRepository,
            commodityRepository,
            commodityConfigRepository,
            new ObjectMapper()
        );
    }

    private SalesBillCreateOrUpdateRequest sampleCreateRequest() {
        SalesBillCreateOrUpdateRequest req = new SalesBillCreateOrUpdateRequest();
        req.setBuyerName("Buyer One");
        req.setBuyerMark("B1");
        req.setBillingName("Buyer One");
        req.setBillDate(Instant.parse("2026-03-16T05:41:11.352Z").toString());
        req.setGrandTotal(BigDecimal.valueOf(1000));
        req.setOutboundFreight(BigDecimal.valueOf(75));

        BillLineItemDTO item = new BillLineItemDTO();
        item.setBidNumber(1);
        item.setLotName("LOT-1");
        item.setSellerName("Seller A");
        item.setQuantity(10);
        item.setWeight(BigDecimal.valueOf(500));
        item.setBaseRate(BigDecimal.valueOf(100));
        item.setAmount(BigDecimal.valueOf(1000));

        CommodityGroupDTO group = new CommodityGroupDTO();
        group.setCommodityName("Wheat");
        group.setSubtotal(BigDecimal.valueOf(1000));
        group.setGstRate(BigDecimal.valueOf(18));
        group.setSgstRate(BigDecimal.valueOf(9));
        group.setCgstRate(BigDecimal.valueOf(9));
        group.setIgstRate(BigDecimal.ZERO);
        group.setItems(List.of(item));
        req.setCommodityGroups(List.of(group));

        return req;
    }

    @Test
    void create_persistsCommodityGstRates_andCreatesVouchers() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);

        when(salesBillRepository.save(any(SalesBill.class))).thenAnswer(inv -> {
            SalesBill b = inv.getArgument(0);
            if (b.getId() == null) {
                b.setId(1L);
            }
            return b;
        });

        SalesBillCreateOrUpdateRequest req = sampleCreateRequest();

        SalesBillDTO dto = service.create(req);

        ArgumentCaptor<SalesBill> billCaptor = ArgumentCaptor.forClass(SalesBill.class);
        verify(salesBillRepository).save(billCaptor.capture());
        SalesBill saved = billCaptor.getValue();

        assertThat(saved.getTraderId()).isEqualTo(TRADER_ID);
        assertThat(saved.getBillNumber()).isNull(); // assigned via assignNumber(), not on create
        assertThat(saved.getBuyerName()).isEqualTo("Buyer One");
        assertThat(saved.getCommodityGroups()).hasSize(1);
        assertThat(saved.getCommodityGroups().get(0).getItems()).hasSize(1);
        assertThat(saved.getCommodityGroups().get(0).getGstRate()).isEqualByComparingTo("18");
        assertThat(saved.getCommodityGroups().get(0).getSgstRate()).isEqualByComparingTo("9");
        assertThat(saved.getCommodityGroups().get(0).getCgstRate()).isEqualByComparingTo("9");
        assertThat(saved.getCommodityGroups().get(0).getIgstRate()).isEqualByComparingTo("0");

        assertThat(dto.getBillNumber()).isNull();
        assertThat(dto.getBuyerName()).isEqualTo("Buyer One");
    }

    @Test
    void getBills_withoutFiltersUsesSimpleFindAll() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        PageRequest pageable = PageRequest.of(0, 10);
        SalesBill bill = new SalesBill();
        bill.setId(10L);
        bill.setTraderId(TRADER_ID);
        bill.setBillNumber("MT-00001");
        bill.setBuyerName("Buyer X");
        when(salesBillRepository.findAllByTraderId(TRADER_ID, pageable))
            .thenReturn(new PageImpl<>(List.of(bill), pageable, 1));

        Page<SalesBillDTO> page = service.getBills(pageable, null, null, null, null);

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).getBillNumber()).isEqualTo("MT-00001");
        assertThat(page.getContent().get(0).getBuyerName()).isEqualTo("Buyer X");
    }

    @Test
    void getById_throwsWhenBillMissingOrOwnedByOtherTrader() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        when(salesBillRepository.findByIdWithGroupsAndVersions(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(999L))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("not found");

        SalesBill otherTraderBill = new SalesBill();
        otherTraderBill.setId(5L);
        otherTraderBill.setTraderId(999L);
        when(salesBillRepository.findByIdWithGroupsAndVersions(5L)).thenReturn(Optional.of(otherTraderBill));

        assertThatThrownBy(() -> service.getById(5L))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("not found");
    }

    @Test
    void update_appendsVersionSnapshotAndRemapsChildren() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);

        SalesBill existing = new SalesBill();
        existing.setId(20L);
        existing.setTraderId(TRADER_ID);
        existing.setBillNumber("MT-00010");
        SalesBillCommodityGroup existingGroup = new SalesBillCommodityGroup();
        existingGroup.setSalesBill(existing);
        existing.getCommodityGroups().add(existingGroup);

        when(salesBillRepository.findByIdWithGroupsAndVersions(20L)).thenReturn(Optional.of(existing));
        when(salesBillRepository.save(any(SalesBill.class))).thenAnswer(inv -> inv.getArgument(0));

        SalesBillCreateOrUpdateRequest req = sampleCreateRequest();
        SalesBillDTO dto = service.update(20L, req);

        assertThat(existing.getVersions()).hasSize(1);
        assertThat(existing.getCommodityGroups()).hasSize(1);
        assertThat(existing.getCommodityGroups().get(0).getItems()).hasSize(1);
        assertThat(dto.getBillNumber()).isEqualTo("MT-00010");
        assertThat(dto.getCommodityGroups()).hasSize(1);
    }

    @Test
    void getBills_withFiltersUsesCustomRepositoryMethod() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        PageRequest pageable = PageRequest.of(0, 10);
        Instant from = Instant.parse("2026-03-01T00:00:00Z");
        Instant to = Instant.parse("2026-03-31T23:59:59Z");

        SalesBill bill = new SalesBill();
        bill.setId(30L);
        bill.setTraderId(TRADER_ID);
        bill.setBillNumber("MT-00002");
        bill.setBuyerName("Filtered Buyer");
        when(salesBillRepository.findByTraderIdAndFilters(
            TRADER_ID,
            "MT-00002",
            "Filtered Buyer",
            from,
            to,
            pageable
        )).thenReturn(new PageImpl<>(List.of(bill), pageable, 1));

        Page<SalesBillDTO> page = service.getBills(pageable, "  MT-00002 ", " Filtered Buyer ", from, to);

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).getBillNumber()).isEqualTo("MT-00002");
        assertThat(page.getContent().get(0).getBuyerName()).isEqualTo("Filtered Buyer");
    }
}

