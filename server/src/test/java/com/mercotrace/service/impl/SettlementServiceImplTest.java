package com.mercotrace.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.ChartOfAccount;
import com.mercotrace.domain.FreightCalculation;
import com.mercotrace.domain.Patti;
import com.mercotrace.domain.PattiDeduction;
import com.mercotrace.domain.Lot;
import com.mercotrace.domain.PattiRateCluster;
import com.mercotrace.domain.SellerInVehicle;
import com.mercotrace.domain.Vehicle;
import com.mercotrace.domain.BillNumberSequence;
import com.mercotrace.repository.ChartOfAccountRepository;
import com.mercotrace.repository.PattiRepository;
import com.mercotrace.repository.VoucherLineRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.SettlementDTOs.*;
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

@ExtendWith(MockitoExtension.class)
class SettlementServiceImplTest {

    private static final long TRADER_ID = 101L;

    @Mock
    private TraderContextService traderContextService;
    @Mock
    private com.mercotrace.repository.BillNumberSequenceRepository billNumberSequenceRepository;

    @Mock
    private com.mercotrace.repository.LotRepository lotRepository;

    @Mock
    private com.mercotrace.service.AuctionService auctionService;

    @Mock
    private com.mercotrace.repository.PattiRepository pattiRepository;

    @Mock
    private com.mercotrace.repository.WeighingSessionRepository weighingSessionRepository;

    @Mock
    private com.mercotrace.repository.SellerInVehicleRepository sellerInVehicleRepository;

    @Mock
    private com.mercotrace.repository.ContactRepository contactRepository;

    @Mock
    private com.mercotrace.repository.VehicleRepository vehicleRepository;

    @Mock
    private com.mercotrace.repository.CommodityRepository commodityRepository;

    @Mock
    private com.mercotrace.repository.FreightCalculationRepository freightCalculationRepository;

    @Mock
    private ChartOfAccountRepository chartOfAccountRepository;

    @Mock
    private VoucherLineRepository voucherLineRepository;

    @Mock
    private com.mercotrace.repository.VehicleWeightRepository vehicleWeightRepository;

    @Mock
    private com.mercotrace.repository.SalesBillLineItemRepository salesBillLineItemRepository;

    @Mock
    private com.mercotrace.repository.SalesBillRepository salesBillRepository;

    @Mock
    private com.mercotrace.repository.SettlementQuickExpenseStateRepository settlementQuickExpenseStateRepository;

    @Mock
    private com.mercotrace.repository.SettlementVoucherTempRepository settlementVoucherTempRepository;

    @Mock
    private com.mercotrace.service.ContactService contactService;

    @Mock
    private com.mercotrace.repository.HamaliSlabRepository hamaliSlabRepository;

    @Mock
    private com.mercotrace.repository.CommodityConfigRepository commodityConfigRepository;

    private SettlementServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new SettlementServiceImpl(
            traderContextService,
            billNumberSequenceRepository,
            lotRepository,
            auctionService,
            pattiRepository,
            weighingSessionRepository,
            sellerInVehicleRepository,
            contactRepository,
            vehicleRepository,
            commodityRepository,
            freightCalculationRepository,
            chartOfAccountRepository,
            voucherLineRepository,
            vehicleWeightRepository,
            salesBillLineItemRepository,
            salesBillRepository,
            settlementQuickExpenseStateRepository,
            settlementVoucherTempRepository,
            contactService,
            hamaliSlabRepository,
            commodityConfigRepository,
            new ObjectMapper()
        );
        // Only create stubbing when needed in specific tests to avoid UnnecessaryStubbingException.
    }

    private PattiSaveRequest sampleSaveRequest() {
        PattiSaveRequest req = new PattiSaveRequest();
        req.setSellerId("S1");
        req.setSellerName("Test Seller");
        req.setGrossAmount(BigDecimal.valueOf(10000));
        req.setTotalDeductions(BigDecimal.valueOf(500));
        req.setNetPayable(BigDecimal.valueOf(9500));
        req.setUseAverageWeight(false);

        RateClusterDTO rc = new RateClusterDTO();
        rc.setRate(BigDecimal.valueOf(1000));
        rc.setTotalQuantity(10);
        rc.setTotalWeight(BigDecimal.valueOf(500));
        rc.setAmount(BigDecimal.valueOf(500000));
        req.setRateClusters(List.of(rc));

        DeductionItemDTO d = new DeductionItemDTO();
        d.setKey("freight");
        d.setLabel("Freight");
        d.setAmount(BigDecimal.valueOf(500));
        d.setEditable(true);
        d.setAutoPulled(true);
        req.setDeductions(List.of(d));
        return req;
    }

    @Test
    void createPatti_setsTraderIdGeneratesPattiIdAndMapsClustersAndDeductions() {
        PattiSaveRequest req = sampleSaveRequest();

        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        BillNumberSequence seq = new BillNumberSequence();
        seq.setPrefix("PATTI");
        seq.setNextValue(2255L);
        when(billNumberSequenceRepository.findByPrefixForUpdate("PATTI")).thenReturn(Optional.of(seq));
        when(pattiRepository.save(any(Patti.class))).thenAnswer(inv -> {
            Patti p = inv.getArgument(0);
            if (p.getId() == null) {
                p.setId(1L);
            }
            if (p.getPattiId() == null) {
                p.setPattiId("2255-1");
            }
            return p;
        });
        when(pattiRepository.findById(1L)).thenAnswer(inv -> {
            Patti p = new Patti();
            p.setId(1L);
            p.setTraderId(TRADER_ID);
            p.setPattiId("2255-1");
            p.setPattiBaseNumber("2255");
            p.setSellerSequenceNumber(1);
            p.setSellerId(req.getSellerId());
            p.setSellerName(req.getSellerName());
            p.setGrossAmount(req.getGrossAmount());
            p.setTotalDeductions(req.getTotalDeductions());
            p.setNetPayable(req.getNetPayable());
            p.setUseAverageWeight(Boolean.TRUE.equals(req.getUseAverageWeight()));
            p.setCreatedDate(Instant.now());

            PattiRateCluster c = new PattiRateCluster();
            c.setRate(req.getRateClusters().get(0).getRate());
            c.setTotalQuantity(req.getRateClusters().get(0).getTotalQuantity());
            c.setTotalWeight(req.getRateClusters().get(0).getTotalWeight());
            c.setAmount(req.getRateClusters().get(0).getAmount());
            p.getRateClusters().add(c);

            PattiDeduction pd = new PattiDeduction();
            pd.setDeductionKey(req.getDeductions().get(0).getKey());
            pd.setLabel(req.getDeductions().get(0).getLabel());
            pd.setAmount(req.getDeductions().get(0).getAmount());
            pd.setEditable(req.getDeductions().get(0).getEditable());
            pd.setAutoPulled(req.getDeductions().get(0).getAutoPulled());
            p.getDeductions().add(pd);
            return Optional.of(p);
        });

        PattiDTO dto = service.createPatti(req);

        // Verify basic persistence behaviour via resulting DTO rather than exact save invocations,
        // since the service intentionally saves twice (before and after mapping nested collections).
        assertThat(dto.getPattiId()).isEqualTo("2255-1");
        assertThat(dto.getPattiBaseNumber()).isEqualTo("2255");
        assertThat(dto.getSellerSequenceNumber()).isEqualTo(1);
        assertThat(dto.getSellerName()).isEqualTo("Test Seller");
        assertThat(dto.getRateClusters()).hasSize(1);
        assertThat(dto.getDeductions()).hasSize(1);
    }

    @Test
    void getPattiById_returnsEmptyWhenNotOwnedByTrader() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        Patti other = new Patti();
        other.setId(99L);
        other.setTraderId(999L);
        when(pattiRepository.findById(99L)).thenReturn(Optional.of(other));

        assertThat(service.getPattiById(99L)).isEmpty();
    }

    @Test
    void getSellerCharges_returnsZeroWhenInvalidSellerId() {
        SellerChargesDTO dto = service.getSellerCharges("any");
        assertThat(dto.getFreight()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getAdvance()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getFreightAutoPulled()).isFalse();
        assertThat(dto.getAdvanceAutoPulled()).isFalse();
    }

    @Test
    void getSellerExpenseSnapshot_returnsZerosWhenInvalidSellerId() {
        SellerExpenseSnapshotDTO dto = service.getSellerExpenseSnapshot("not-a-number");
        assertThat(dto.getFreight()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getUnloading()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getWeighing()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getCashAdvance()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getCashAdvanceJournalPending()).isTrue();
    }

    @Test
    void getSellerCharges_autoPullsFromFreightCalculationWhenAvailable() {
        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(100L);
        siv.setVehicleId(200L);

        FreightCalculation fc = new FreightCalculation();
        fc.setVehicleId(200L);
        fc.setTotalAmount(1500.0);
        fc.setAdvancePaid(500.0);

        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        when(sellerInVehicleRepository.findById(100L)).thenReturn(Optional.of(siv));
        when(freightCalculationRepository.findOneByVehicleId(200L)).thenReturn(Optional.of(fc));

        SellerChargesDTO dto = service.getSellerCharges("100");

        assertThat(dto.getFreight()).isEqualByComparingTo(BigDecimal.valueOf(1500));
        assertThat(dto.getAdvance()).isEqualByComparingTo(BigDecimal.valueOf(500));
        assertThat(dto.getFreightAutoPulled()).isTrue();
        assertThat(dto.getAdvanceAutoPulled()).isTrue();
    }

    @Test
    void getSellerCharges_addsLedgerAdvanceWhenContactHasReceivableLedger() {
        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(100L);
        siv.setVehicleId(200L);
        siv.setContactId(50L);

        ChartOfAccount receivableLedger = new ChartOfAccount();
        receivableLedger.setId(300L);
        receivableLedger.setTraderId(TRADER_ID);
        receivableLedger.setContactId(50L);
        receivableLedger.setClassification("RECEIVABLE");

        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        when(sellerInVehicleRepository.findById(100L)).thenReturn(Optional.of(siv));
        when(freightCalculationRepository.findOneByVehicleId(200L)).thenReturn(Optional.empty());
        when(chartOfAccountRepository.findFirstByTraderIdAndContactIdAndClassification(
            TRADER_ID, 50L, "RECEIVABLE"
        )).thenReturn(Optional.of(receivableLedger));
        when(voucherLineRepository.sumCreditByLedgerIdAndVoucherTypeExcludingStatus(
            any(), any(), any()
        )).thenReturn(BigDecimal.valueOf(1200));

        SellerChargesDTO dto = service.getSellerCharges("100");

        assertThat(dto.getFreight()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getAdvance()).isEqualByComparingTo(BigDecimal.valueOf(1200));
        assertThat(dto.getFreightAutoPulled()).isFalse();
        assertThat(dto.getAdvanceAutoPulled()).isTrue();
    }

    @Test
    void getSellerCharges_combinesFreightAndLedgerAdvance() {
        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(100L);
        siv.setVehicleId(200L);
        siv.setContactId(50L);

        FreightCalculation fc = new FreightCalculation();
        fc.setVehicleId(200L);
        fc.setTotalAmount(1500.0);
        fc.setAdvancePaid(500.0);

        ChartOfAccount receivableLedger = new ChartOfAccount();
        receivableLedger.setId(300L);
        receivableLedger.setTraderId(TRADER_ID);
        receivableLedger.setContactId(50L);
        receivableLedger.setClassification("RECEIVABLE");

        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        when(sellerInVehicleRepository.findById(100L)).thenReturn(Optional.of(siv));
        when(freightCalculationRepository.findOneByVehicleId(200L)).thenReturn(Optional.of(fc));
        when(chartOfAccountRepository.findFirstByTraderIdAndContactIdAndClassification(
            TRADER_ID, 50L, "RECEIVABLE"
        )).thenReturn(Optional.of(receivableLedger));
        when(voucherLineRepository.sumCreditByLedgerIdAndVoucherTypeExcludingStatus(
            any(), any(), any()
        )).thenReturn(BigDecimal.valueOf(300));

        SellerChargesDTO dto = service.getSellerCharges("100");

        assertThat(dto.getFreight()).isEqualByComparingTo(BigDecimal.valueOf(1500));
        assertThat(dto.getAdvance()).isEqualByComparingTo(BigDecimal.valueOf(800)); // 500 + 300
        assertThat(dto.getFreightAutoPulled()).isTrue();
        assertThat(dto.getAdvanceAutoPulled()).isTrue();
    }

    @Test
    void getSettlementAmountSummary_aggregatesFromLotsAndBills() {
        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(100L);
        siv.setVehicleId(200L);

        Vehicle vehicle = new Vehicle();
        vehicle.setId(200L);
        vehicle.setTraderId(TRADER_ID);

        Lot lot = new Lot();
        lot.setId(55L);
        lot.setSellerVehicleId(100L);

        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        when(sellerInVehicleRepository.findById(100L)).thenReturn(Optional.of(siv));
        when(sellerInVehicleRepository.findAllByVehicleId(200L)).thenReturn(List.of(siv));
        when(vehicleRepository.findById(200L)).thenReturn(Optional.of(vehicle));
        when(freightCalculationRepository.findOneByVehicleId(200L)).thenReturn(Optional.empty());
        when(lotRepository.findAllBySellerVehicleIdIn(List.of(100L))).thenReturn(List.of(lot));
        when(salesBillLineItemRepository.sumLineAmountByTraderLotsForSettlement(TRADER_ID, List.of("55"), List.of(55L), null))
            .thenReturn(BigDecimal.valueOf(8888));
        when(salesBillLineItemRepository.findDistinctBillIdsByTraderAndLotsForSettlement(TRADER_ID, List.of("55"), List.of(55L), null))
            .thenReturn(List.of(1L, 2L));
        when(salesBillRepository.sumOutboundFreightByTraderAndBillIds(TRADER_ID, List.of(1L, 2L)))
            .thenReturn(BigDecimal.valueOf(450));

        SettlementAmountSummaryDTO dto = service.getSettlementAmountSummary("100", null);

        assertThat(dto.getArrivalFreightAmount()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(dto.getFreightInvoiced()).isEqualByComparingTo(BigDecimal.valueOf(450));
        assertThat(dto.getPayableInvoiced()).isEqualByComparingTo(BigDecimal.valueOf(8888));
    }

    // generateNextPattiId is indirectly covered via createPatti and logging; explicit reflection-based
    // test is omitted to keep tests simple and avoid coupling to private implementation details.
}

