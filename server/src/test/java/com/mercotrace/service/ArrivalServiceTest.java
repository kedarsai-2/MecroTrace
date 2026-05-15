package com.mercotrace.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.Auction;
import com.mercotrace.domain.Commodity;
import com.mercotrace.domain.DailySerial;
import com.mercotrace.domain.FreightCalculation;
import com.mercotrace.domain.Lot;
import com.mercotrace.domain.Patti;
import com.mercotrace.domain.SellerInVehicle;
import com.mercotrace.domain.Vehicle;
import com.mercotrace.domain.VehicleWeight;
import com.mercotrace.domain.enumeration.FreightMethod;
import com.mercotrace.repository.AuctionEntryRepository;
import com.mercotrace.repository.AuctionRepository;
import com.mercotrace.repository.AuctionSelfSaleUnitRepository;
import com.mercotrace.repository.CdnItemRepository;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.DailySerialAllocationRepository;
import com.mercotrace.repository.DailySerialRepository;
import com.mercotrace.repository.FreightCalculationRepository;
import com.mercotrace.repository.FreightDistributionRepository;
import com.mercotrace.repository.LotRepository;
import com.mercotrace.repository.PattiRepository;
import com.mercotrace.repository.SalesBillLineItemRepository;
import com.mercotrace.repository.SellerInVehicleRepository;
import com.mercotrace.repository.SelfSaleClosureRepository;
import com.mercotrace.repository.StockPurchaseItemRepository;
import com.mercotrace.repository.VehicleRepository;
import com.mercotrace.repository.VehicleWeightRepository;
import com.mercotrace.repository.VoucherRepository;
import com.mercotrace.repository.WeighingSessionRepository;
import com.mercotrace.repository.WriterPadSessionRepository;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalLotDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSellerDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalUpdateDTO;
import com.mercotrace.web.rest.errors.ArrivalDeletionBlockedException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class ArrivalServiceTest {

    @Mock
    private VehicleRepository vehicleRepository;

    @Mock
    private VehicleWeightRepository vehicleWeightRepository;

    @Mock
    private SellerInVehicleRepository sellerInVehicleRepository;

    @Mock
    private LotRepository lotRepository;

    @Mock
    private FreightCalculationRepository freightCalculationRepository;

    @Mock
    private FreightDistributionRepository freightDistributionRepository;

    @Mock
    private VoucherRepository voucherRepository;

    @Mock
    private DailySerialRepository dailySerialRepository;

    @Mock
    private DailySerialAllocationRepository dailySerialAllocationRepository;

    @Mock
    private CommodityRepository commodityRepository;

    @Mock
    private ContactRepository contactRepository;

    @Mock
    private AuctionRepository auctionRepository;

    @Mock
    private AuctionEntryRepository auctionEntryRepository;

    @Mock
    private WeighingSessionRepository weighingSessionRepository;

    @Mock
    private SalesBillLineItemRepository salesBillLineItemRepository;

    @Mock
    private AuctionSelfSaleUnitRepository auctionSelfSaleUnitRepository;

    @Mock
    private SelfSaleClosureRepository selfSaleClosureRepository;

    @Mock
    private CdnItemRepository cdnItemRepository;

    @Mock
    private StockPurchaseItemRepository stockPurchaseItemRepository;

    @Mock
    private WriterPadSessionRepository writerPadSessionRepository;

    @Mock
    private PattiRepository pattiRepository;

    @Mock
    private ContactService contactService;

    @Mock
    private TraderContextService traderContextService;

    @InjectMocks
    private ArrivalService arrivalService;

    @BeforeEach
    void setUp() {
        when(traderContextService.getCurrentTraderId()).thenReturn(1L);
        lenient().when(salesBillLineItemRepository.existsForTraderLotsDeletionScope(anyLong(), anyList(), anyList())).thenReturn(false);
        lenient().when(auctionSelfSaleUnitRepository.existsByLotIdIn(anyList())).thenReturn(false);
        lenient().when(selfSaleClosureRepository.existsActiveByTraderIdAndLotIdIn(anyLong(), anyList())).thenReturn(false);
        lenient().when(cdnItemRepository.existsActiveByLotIdIn(anyList())).thenReturn(false);
        lenient().when(stockPurchaseItemRepository.existsActiveByTraderIdAndLotIdIn(anyLong(), anyList())).thenReturn(false);
        lenient().when(weighingSessionRepository.existsByLotIdIn(anyList())).thenReturn(false);
        lenient().when(writerPadSessionRepository.existsByLotIdIn(anyList())).thenReturn(false);
        lenient()
            .when(pattiRepository.findAllByTraderIdAndSellerIdInAndLockedAtIsNotNullAndReopenedAtIsNullAndInProgressFalse(anyLong(), anyList()))
            .thenReturn(List.of());
    }

    @Test
    void listArrivalsReturnsEmptyPageWhenNoVehicles() {
        Pageable pageable = PageRequest.of(0, 20);
        when(vehicleRepository.findAllByTraderIdAndPartiallyCompletedOrderByArrivalDatetimeDesc(anyLong(), any(Boolean.class), any(Pageable.class)))
            .thenReturn(Page.empty(pageable));

        Page<?> page = arrivalService.listArrivals(pageable);

        assertThat(page.getTotalElements()).isZero();
        assertThat(page.getContent()).isEmpty();
    }

    @Test
    void listArrivalsAggregatesSummaryFields() {
        Pageable pageable = PageRequest.of(0, 20);

        Vehicle vehicle = new Vehicle();
        vehicle.setId(10L);
        vehicle.setTraderId(1L);
        vehicle.setVehicleNumber("KA01AB1234");
        vehicle.setArrivalDatetime(Instant.now());

        Page<Vehicle> vehiclePage = new PageImpl<>(List.of(vehicle), pageable, 1);
        when(vehicleRepository.findAllByTraderIdAndPartiallyCompletedOrderByArrivalDatetimeDesc(anyLong(), any(Boolean.class), any(Pageable.class)))
            .thenReturn(vehiclePage);

        VehicleWeight weight = new VehicleWeight();
        weight.setVehicleId(10L);
        weight.setNetWeight(1000.0);
        weight.setDeductedWeight(100.0);
        when(vehicleWeightRepository.findAllByVehicleIdIn(List.of(10L))).thenReturn(List.of(weight));

        FreightCalculation freight = new FreightCalculation();
        freight.setVehicleId(10L);
        freight.setMethod(FreightMethod.BY_WEIGHT);
        freight.setTotalAmount(500.0);
        when(freightCalculationRepository.findAllByVehicleIdIn(List.of(10L))).thenReturn(List.of(freight));

        SellerInVehicle s1 = new SellerInVehicle();
        s1.setId(1L);
        s1.setVehicleId(10L);
        SellerInVehicle s2 = new SellerInVehicle();
        s2.setId(2L);
        s2.setVehicleId(10L);
        when(sellerInVehicleRepository.findAllByVehicleIdIn(List.of(10L))).thenReturn(List.of(s1, s2));

        Lot l1 = new Lot();
        l1.setId(100L);
        l1.setSellerVehicleId(1L);
        l1.setBagCount(5);
        Lot l2 = new Lot();
        l2.setId(101L);
        l2.setSellerVehicleId(2L);
        l2.setBagCount(7);
        when(lotRepository.findAllBySellerVehicleIdIn(List.of(1L, 2L))).thenReturn(List.of(l1, l2));
        when(auctionRepository.findAllByLotIdIn(anyList())).thenReturn(List.of());
        when(weighingSessionRepository.findByLotIdIn(anyList())).thenReturn(List.of());

        Page<?> result = arrivalService.listArrivals(pageable);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent()).hasSize(1);

        var summary = (com.mercotrace.service.dto.ArrivalDTOs.ArrivalSummaryDTO) result.getContent().get(0);
        assertThat(summary.getVehicleId()).isEqualTo(10L);
        assertThat(summary.getVehicleNumber()).isEqualTo("KA01AB1234");
        assertThat(summary.getSellerCount()).isEqualTo(2);
        assertThat(summary.getLotCount()).isEqualTo(2);
        assertThat(summary.getNetWeight()).isEqualTo(1000.0);
        assertThat(summary.getFinalBillableWeight()).isEqualTo(900.0);
        assertThat(summary.getFreightTotal()).isEqualTo(500.0);
        assertThat(summary.getFreightMethod()).isEqualTo(FreightMethod.BY_WEIGHT);
        assertThat(summary.getArrivalDatetime()).isNotNull();
    }

    @Test
    void listArrivalsUsesRepositorySearchWhenQueryProvided() {
        Pageable pageable = PageRequest.of(0, 20);
        when(vehicleRepository.searchByTraderAndPartiallyCompleted(eq(1L), eq(false), eq("%ka01%"), any(Pageable.class)))
            .thenReturn(Page.empty(pageable));

        Page<?> page = arrivalService.listArrivals(pageable, null, false, "  KA01  ");

        assertThat(page.getTotalElements()).isZero();
        verify(vehicleRepository).searchByTraderAndPartiallyCompleted(eq(1L), eq(false), eq("%ka01%"), any(Pageable.class));
    }

    @Test
    void updateArrivalAllowsIncreasingLinkedExistingLotQuantity() {
        Vehicle vehicle = linkedArrivalVehicle();
        SellerInVehicle seller = linkedArrivalSeller();
        Lot lot = linkedArrivalLot(10);
        stubLinkedArrivalForUpdate(vehicle, seller, lot);

        ArrivalUpdateDTO update = linkedArrivalUpdate(15);

        var summary = arrivalService.updateArrival(10L, update);

        assertThat(lot.getBagCount()).isEqualTo(15);
        assertThat(summary.getTotalBags()).isEqualTo(15);
        verify(lotRepository).save(lot);
    }

    @Test
    void updateArrivalBlocksDecreasingLinkedExistingLotQuantity() {
        Vehicle vehicle = linkedArrivalVehicle();
        SellerInVehicle seller = linkedArrivalSeller();
        Lot lot = linkedArrivalLot(10);
        stubLinkedArrivalForUpdate(vehicle, seller, lot);

        ArrivalUpdateDTO update = linkedArrivalUpdate(8);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> arrivalService.updateArrival(10L, update))
            .isInstanceOf(ArrivalDeletionBlockedException.class)
            .satisfies(ex ->
                assertThat(((ArrivalDeletionBlockedException) ex).getProblemDetailWithCause().getDetail()).contains("cannot be decreased")
            );

        assertThat(lot.getBagCount()).isEqualTo(10);
        verify(lotRepository, never()).save(lot);
    }

    @Test
    void updateArrivalBlocksIncreasingLotQuantityWhenSalesBillExists() {
        Vehicle vehicle = linkedArrivalVehicle();
        SellerInVehicle seller = linkedArrivalSeller();
        Lot lot = linkedArrivalLot(10);
        stubLinkedArrivalForUpdate(vehicle, seller, lot);
        when(salesBillLineItemRepository.existsForTraderLotsDeletionScope(1L, List.of("30"), List.of(30L))).thenReturn(true);

        ArrivalUpdateDTO update = linkedArrivalUpdate(15);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> arrivalService.updateArrival(10L, update))
            .isInstanceOf(ArrivalDeletionBlockedException.class)
            .satisfies(ex -> assertThat(((ArrivalDeletionBlockedException) ex).getProblemDetailWithCause().getDetail()).contains("Billing"));

        assertThat(lot.getBagCount()).isEqualTo(10);
        verify(lotRepository, never()).save(lot);
    }

    @Test
    void updateArrivalBlocksIncreasingLotQuantityWhenPrintedPattiExists() {
        Vehicle vehicle = linkedArrivalVehicle();
        SellerInVehicle seller = linkedArrivalSeller();
        Lot lot = linkedArrivalLot(10);
        stubLinkedArrivalForUpdate(vehicle, seller, lot);
        when(pattiRepository.findAllByTraderIdAndSellerIdInAndLockedAtIsNotNullAndReopenedAtIsNullAndInProgressFalse(1L, List.of("20")))
            .thenReturn(List.of(new Patti()));

        ArrivalUpdateDTO update = linkedArrivalUpdate(15);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> arrivalService.updateArrival(10L, update))
            .isInstanceOf(ArrivalDeletionBlockedException.class)
            .satisfies(ex ->
                assertThat(((ArrivalDeletionBlockedException) ex).getProblemDetailWithCause().getDetail()).contains("Settlement patti")
            );

        assertThat(lot.getBagCount()).isEqualTo(10);
        verify(lotRepository, never()).save(lot);
    }

    @Test
    void updateArrivalAllowsDeletingUnlinkedLotWhenAnotherLotHasAuction() {
        Vehicle vehicle = linkedArrivalVehicle();
        SellerInVehicle seller = linkedArrivalSeller();
        Lot auctionedLot = linkedArrivalLot(10);
        Lot availableLot = availableArrivalLot(5);
        stubArrivalForUpdate(vehicle, seller, List.of(auctionedLot, availableLot));
        when(lotRepository.findAllBySellerVehicleIdIn(List.of(20L))).thenReturn(List.of(auctionedLot, availableLot), List.of(auctionedLot));

        ArrivalUpdateDTO update = linkedArrivalUpdate(10);

        var summary = arrivalService.updateArrival(10L, update);

        verify(lotRepository).delete(availableLot);
        assertThat(summary.getTotalBags()).isEqualTo(10);
    }

    private Vehicle linkedArrivalVehicle() {
        Vehicle vehicle = new Vehicle();
        vehicle.setId(10L);
        vehicle.setTraderId(1L);
        vehicle.setVehicleNumber("KA01AB1234");
        vehicle.setArrivalDatetime(Instant.now());
        vehicle.setPartiallyCompleted(false);
        return vehicle;
    }

    private SellerInVehicle linkedArrivalSeller() {
        SellerInVehicle seller = new SellerInVehicle();
        seller.setId(20L);
        seller.setVehicleId(10L);
        seller.setSellerName("Seller");
        seller.setSellerPhone("999999");
        return seller;
    }

    private Lot linkedArrivalLot(int bagCount) {
        Lot lot = new Lot();
        lot.setId(30L);
        lot.setSellerVehicleId(20L);
        lot.setCommodityId(40L);
        lot.setLotName("Lot A");
        lot.setBagCount(bagCount);
        lot.setSellerSerialNo(1);
        lot.setLotSerialNo(1);
        return lot;
    }

    private Lot availableArrivalLot(int bagCount) {
        Lot lot = new Lot();
        lot.setId(31L);
        lot.setSellerVehicleId(20L);
        lot.setCommodityId(40L);
        lot.setLotName("Lot B");
        lot.setBagCount(bagCount);
        lot.setSellerSerialNo(1);
        lot.setLotSerialNo(2);
        return lot;
    }

    private void stubLinkedArrivalForUpdate(Vehicle vehicle, SellerInVehicle seller, Lot lot) {
        stubArrivalForUpdate(vehicle, seller, List.of(lot));
    }

    private void stubArrivalForUpdate(Vehicle vehicle, SellerInVehicle seller, List<Lot> lots) {
        Commodity commodity = new Commodity();
        commodity.setId(40L);
        commodity.setCommodityName("Chilli");

        DailySerial dailySerial = new DailySerial();
        dailySerial.setSellerSerial(1);
        dailySerial.setLotSerial(1);

        when(vehicleRepository.findById(10L)).thenReturn(Optional.of(vehicle));
        when(vehicleRepository.save(any(Vehicle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sellerInVehicleRepository.findAllByVehicleId(10L)).thenReturn(List.of(seller));
        when(lotRepository.findAllBySellerVehicleIdIn(List.of(20L))).thenReturn(lots);
        when(lotRepository.findAllById(anyList())).thenAnswer(invocation -> {
            List<Long> ids = invocation.getArgument(0);
            return lots.stream().filter(lot -> ids.contains(lot.getId())).toList();
        });
        when(auctionEntryRepository.existsByAuctionLotIdIn(anyList())).thenAnswer(invocation -> {
            List<Long> ids = invocation.getArgument(0);
            return ids.contains(30L);
        });
        when(commodityRepository.findOneByTraderIdAndCommodityNameIgnoreCase(1L, "Chilli")).thenReturn(Optional.of(commodity));
        when(dailySerialRepository.findOneByTraderIdAndSerialDateForUpdate(eq(1L), any())).thenReturn(Optional.of(dailySerial));
        when(lotRepository.findMaxLotSerialNoByTraderId(1L)).thenReturn(Optional.of(1));
        lenient().when(vehicleWeightRepository.findOneByVehicleId(10L)).thenReturn(Optional.empty());
        lenient().when(freightCalculationRepository.findOneByVehicleId(10L)).thenReturn(Optional.empty());
    }

    private ArrivalUpdateDTO linkedArrivalUpdate(int bagCount) {
        ArrivalLotDTO lotDTO = new ArrivalLotDTO();
        lotDTO.setId(30L);
        lotDTO.setLotName("Lot A");
        lotDTO.setBagCount(bagCount);
        lotDTO.setCommodityName("Chilli");

        ArrivalSellerDTO sellerDTO = new ArrivalSellerDTO();
        sellerDTO.setSellerVehicleId(20L);
        sellerDTO.setSellerName("Seller");
        sellerDTO.setSellerPhone("999999");
        sellerDTO.setLots(List.of(lotDTO));

        ArrivalUpdateDTO update = new ArrivalUpdateDTO();
        update.setMultiSeller(true);
        update.setSellers(List.of(sellerDTO));
        return update;
    }
}
