package com.mercotrace.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.Auction;
import com.mercotrace.domain.AuctionEntry;
import com.mercotrace.domain.Contact;
import com.mercotrace.domain.Lot;
import com.mercotrace.domain.SellerInVehicle;
import com.mercotrace.domain.Vehicle;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import com.mercotrace.repository.AuctionEntryRepository;
import com.mercotrace.repository.AuctionRepository;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.LotRepository;
import com.mercotrace.repository.SellerInVehicleRepository;
import com.mercotrace.repository.VehicleRepository;
import com.mercotrace.service.AuctionService.AuctionConflictException;
import com.mercotrace.service.dto.AuctionBidCreateRequest;
import com.mercotrace.service.dto.AuctionBidUpdateRequest;
import com.mercotrace.service.dto.AuctionResultDTO;
import com.mercotrace.service.dto.AuctionSessionDTO;
import com.mercotrace.service.dto.LotSummaryDTO;
import com.mercotrace.service.mapper.AuctionEntryMapper;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class AuctionServiceTest {

    @Mock
    private AuctionRepository auctionRepository;

    @Mock
    private AuctionEntryRepository auctionEntryRepository;

    @Mock
    private LotRepository lotRepository;

    @Mock
    private AuctionEntryMapper auctionEntryMapper;

    @Mock
    private SellerInVehicleRepository sellerInVehicleRepository;

    @Mock
    private VehicleRepository vehicleRepository;

    @Mock
    private ContactRepository contactRepository;

    @Mock
    private ContactService contactService;

    @Mock
    private CommodityRepository commodityRepository;

    @Mock
    private TraderContextService traderContextService;

    @InjectMocks
    private AuctionService auctionService;

    @BeforeEach
    void setUp() {
        when(traderContextService.getCurrentTraderId()).thenReturn(1L);
    }

    @Test
    void listLotsWithStatus_returnsEmptyPage_whenNoLotsForTrader() {
        Pageable pageable = PageRequest.of(0, 20);
        when(lotRepository.findAllByTraderId(anyLong(), any(Pageable.class))).thenReturn(Page.empty(pageable));

        Page<LotSummaryDTO> result = auctionService.listLotsWithStatus(pageable, null, null);

        assertThat(result.getTotalElements()).isZero();
        assertThat(result.getContent()).isEmpty();
        verify(lotRepository).findAllByTraderId(1L, pageable);
        verifyNoMoreInteractions(auctionRepository, auctionEntryRepository);
    }

    @Test
    void listLotsWithStatus_computesSoldBagsAndStatusSold() {
        Pageable pageable = PageRequest.of(0, 20);

        when(sellerInVehicleRepository.findAllById(anyCollection())).thenReturn(Collections.emptyList());
        when(vehicleRepository.findAllById(anyCollection())).thenReturn(Collections.emptyList());
        when(contactRepository.findAllById(anyCollection())).thenReturn(Collections.emptyList());
        when(commodityRepository.findAllById(anyCollection())).thenReturn(Collections.emptyList());

        Lot lot = new Lot();
        lot.setId(100L);
        lot.setLotName("Lot A");
        lot.setBagCount(10);
        Page<Lot> lotPage = new PageImpl<>(List.of(lot), pageable, 1);
        when(lotRepository.findAllByTraderId(anyLong(), any(Pageable.class))).thenReturn(lotPage);

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(100L);
        auction.setAuctionDatetime(Instant.parse("2024-01-01T10:00:00Z"));
        auction.setCompletedAt(Instant.parse("2024-01-01T11:00:00Z"));
        when(auctionRepository.findAllByLotIdIn(List.of(100L))).thenReturn(List.of(auction));

        AuctionEntry entry = new AuctionEntry();
        entry.setAuctionId(200L);
        entry.setQuantity(10);
        when(auctionEntryRepository.findAllByAuctionIdIn(anyCollection())).thenReturn(List.of(entry));

        Page<LotSummaryDTO> result = auctionService.listLotsWithStatus(pageable, null, null);

        assertThat(result.getTotalElements()).isEqualTo(1);
        LotSummaryDTO summary = result.getContent().get(0);
        assertThat(summary.getLotId()).isEqualTo(100L);
        assertThat(summary.getSoldBags()).isEqualTo(10);
        assertThat(summary.getStatus()).isEqualTo("SOLD");
    }

    @Test
    void getOrStartSession_createsNewAuctionWhenNoneExists() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setBagCount(10);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        when(auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)).thenReturn(Optional.empty());
        when(auctionEntryRepository.findAllByAuctionId(anyLong())).thenReturn(Collections.emptyList());

        ArgumentCaptor<Auction> auctionCaptor = ArgumentCaptor.forClass(Auction.class);
        when(auctionRepository.save(auctionCaptor.capture())).thenAnswer(invocation -> {
            Auction saved = auctionCaptor.getValue();
            saved.setId(200L);
            return saved;
        });

        AuctionSessionDTO session = auctionService.getOrStartSession(lotId);

        assertThat(session.getAuctionId()).isEqualTo(200L);
        assertThat(session.getLot().getLotId()).isEqualTo(lotId);
        assertThat(session.getTotalSoldBags()).isZero();
        assertThat(session.getStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    void getOrStartSession_throwsNotFoundForLotNotOwnedByTrader() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(2L); // different trader than current
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        assertThatThrownBy(() -> auctionService.getOrStartSession(lotId)).isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void addBid_throwsConflictWhenQuantityExceedsLotWithoutIncrease() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setBagCount(10);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(lotId);
        when(auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)).thenReturn(Optional.of(auction));

        AuctionEntry existing = new AuctionEntry();
        existing.setAuctionId(200L);
        existing.setQuantity(8);
        when(auctionEntryRepository.findAllByAuctionId(200L)).thenReturn(List.of(existing));

        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerName("Buyer");
        request.setBuyerMark("M1");
        request.setRate(new BigDecimal("100"));
        request.setQuantity(5);
        request.setAllowLotIncrease(false);

        assertThatThrownBy(() -> auctionService.addBid(lotId, request))
            .isInstanceOf(AuctionConflictException.class)
            .satisfies(ex -> {
                AuctionConflictException conflict = (AuctionConflictException) ex;
                assertThat(conflict.getLotTotal()).isEqualTo(10);
                assertThat(conflict.getCurrentTotal()).isEqualTo(8);
                assertThat(conflict.getAttemptedQty()).isEqualTo(5);
                assertThat(conflict.getNewTotal()).isEqualTo(13);
            });
    }

    @Test
    void addBid_withAllowLotIncrease_expandsLotAndPersistsEntry() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setBagCount(10);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(lotId);
        when(auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)).thenReturn(Optional.of(auction));

        AuctionEntry existing = new AuctionEntry();
        existing.setAuctionId(200L);
        existing.setQuantity(8);
        existing.setBidNumber(1);
        existing.setBidRate(new BigDecimal("100"));
        existing.setPresetMargin(BigDecimal.ZERO);
        existing.setPresetType(AuctionPresetType.PROFIT);
        existing.setSellerRate(new BigDecimal("100"));
        existing.setBuyerRate(new BigDecimal("100"));
        existing.setAmount(new BigDecimal("800"));
        existing.setIsSelfSale(false);
        existing.setIsScribble(false);
        existing.setTokenAdvance(BigDecimal.ZERO);
        existing.setExtraRate(BigDecimal.ZERO);
        existing.setBuyerName("B1");
        existing.setBuyerMark("M1");
        existing.setCreatedAt(Instant.now());

        List<AuctionEntry> allEntries = new java.util.ArrayList<>();
        allEntries.add(existing);
        when(auctionEntryRepository.findAllByAuctionId(200L)).thenAnswer(invocation -> allEntries);
        when(auctionEntryRepository.save(any(AuctionEntry.class))).thenAnswer(invocation -> {
            AuctionEntry saved = invocation.getArgument(0, AuctionEntry.class);
            allEntries.add(saved);
            return saved;
        });

        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerName("Buyer2");
        request.setBuyerMark("M2");
        request.setRate(new BigDecimal("120"));
        request.setQuantity(5);
        request.setAllowLotIncrease(true);
        request.setPresetApplied(new BigDecimal("10"));
        request.setPresetType(AuctionPresetType.PROFIT);
        request.setExtraRate(new BigDecimal("2"));
        request.setTokenAdvance(new BigDecimal("50"));

        AuctionSessionDTO session = auctionService.addBid(lotId, request);

        assertThat(lot.getBagCount()).isEqualTo(13);

        ArgumentCaptor<AuctionEntry> newEntryCaptor = ArgumentCaptor.forClass(AuctionEntry.class);
        verify(auctionEntryRepository).save(newEntryCaptor.capture());
        AuctionEntry saved = newEntryCaptor.getValue();
        assertThat(saved.getAuctionId()).isEqualTo(200L);
        assertThat(saved.getBuyerName()).isEqualTo("Buyer2");
        assertThat(saved.getBuyerMark()).isEqualTo("M2");
        assertThat(saved.getBidRate()).isEqualByComparingTo("120");
        assertThat(saved.getPresetMargin()).isEqualByComparingTo("10");
        assertThat(saved.getPresetType()).isEqualTo(AuctionPresetType.PROFIT);

        // seller_rate column stores base bid only; preset is in preset_margin
        assertThat(saved.getSellerRate()).isEqualByComparingTo("120");
        // buyerRate = bidRate + extra
        assertThat(saved.getBuyerRate()).isEqualByComparingTo("122");
        // amount = buyerRate * quantity
        assertThat(saved.getAmount()).isEqualByComparingTo("610");
        assertThat(saved.getQuantity()).isEqualTo(5);
        assertThat(saved.getTokenAdvance()).isEqualByComparingTo("50");
        assertThat(saved.getExtraRate()).isEqualByComparingTo("2");

        assertThat(session.getTotalSoldBags()).isEqualTo(13);
        assertThat(session.getRemainingBags()).isZero();
        assertThat(session.getStatus()).isEqualTo("SOLD");
    }

    @Test
    void addBid_mergesDuplicateNonSelfSaleBidWithSameMarkAndRate() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setBagCount(20);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(lotId);
        when(auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)).thenReturn(Optional.of(auction));

        AuctionEntry existing = new AuctionEntry();
        existing.setId(1L);
        existing.setAuctionId(200L);
        existing.setBuyerId(10L);
        existing.setBuyerName("Buyer");
        existing.setBuyerMark("M1");
        existing.setBidNumber(1);
        existing.setBidRate(new BigDecimal("100"));
        existing.setPresetMargin(BigDecimal.ZERO);
        existing.setPresetType(AuctionPresetType.PROFIT);
        existing.setSellerRate(new BigDecimal("100"));
        existing.setBuyerRate(new BigDecimal("100"));
        existing.setQuantity(5);
        existing.setAmount(new BigDecimal("500"));
        existing.setIsSelfSale(false);
        existing.setIsScribble(false);
        existing.setTokenAdvance(BigDecimal.ZERO);
        existing.setExtraRate(BigDecimal.ZERO);
        existing.setBuyerMark("M1");
        existing.setCreatedAt(Instant.now());

        when(auctionEntryRepository.findAllByAuctionId(200L)).thenReturn(List.of(existing));

        when(auctionEntryRepository.save(existing)).thenReturn(existing);
        when(auctionEntryRepository.findAllByAuctionId(200L)).thenReturn(List.of(existing));

        AuctionBidCreateRequest request = new AuctionBidCreateRequest();
        request.setBuyerId(10L);
        request.setBuyerName("Buyer");
        request.setBuyerMark("M1");
        request.setRate(new BigDecimal("100"));
        request.setQuantity(3);
        request.setAllowLotIncrease(false);
        request.setSelfSale(false);

        AuctionSessionDTO session = auctionService.addBid(lotId, request);

        assertThat(existing.getQuantity()).isEqualTo(8);
        assertThat(existing.getAmount()).isEqualByComparingTo("800");
        assertThat(session.getTotalSoldBags()).isEqualTo(8);
        assertThat(session.getRemainingBags()).isEqualTo(12);
        assertThat(session.getStatus()).isEqualTo("PARTIAL");
    }

    @Test
    void updateBid_recalculatesSellerAndBuyerRatesAndAmount() {
        Long lotId = 100L;
        Long bidId = 500L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setBagCount(10);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        AuctionEntry entry = new AuctionEntry();
        entry.setId(bidId);
        entry.setAuctionId(200L);
        entry.setBidRate(new BigDecimal("100"));
        entry.setPresetMargin(new BigDecimal("10"));
        entry.setPresetType(AuctionPresetType.PROFIT);
        entry.setQuantity(5);
        entry.setExtraRate(BigDecimal.ZERO);
        entry.setTokenAdvance(BigDecimal.ZERO);
        entry.setBuyerRate(new BigDecimal("100"));
        entry.setSellerRate(new BigDecimal("90"));
        entry.setAmount(new BigDecimal("500"));
        when(auctionEntryRepository.findById(bidId)).thenReturn(Optional.of(entry));

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(lotId);
        when(auctionRepository.findById(200L)).thenReturn(Optional.of(auction));
        when(auctionEntryRepository.findAllByAuctionId(200L)).thenReturn(List.of(entry));

        AuctionBidUpdateRequest request = new AuctionBidUpdateRequest();
        request.setTokenAdvance(new BigDecimal("50"));
        request.setExtraRate(new BigDecimal("2"));
        request.setPresetApplied(new BigDecimal("5"));
        request.setPresetType(AuctionPresetType.LOSS);

        AuctionSessionDTO session = auctionService.updateBid(lotId, bidId, request);

        assertThat(entry.getTokenAdvance()).isEqualByComparingTo("50");
        assertThat(entry.getExtraRate()).isEqualByComparingTo("2");
        assertThat(entry.getPresetMargin()).isEqualByComparingTo("5");
        assertThat(entry.getPresetType()).isEqualTo(AuctionPresetType.LOSS);

        // seller_rate stores base bid; preset kept in preset_margin
        assertThat(entry.getSellerRate()).isEqualByComparingTo("100");
        // buyerRate = bidRate + extra
        assertThat(entry.getBuyerRate()).isEqualByComparingTo("102");
        assertThat(entry.getAmount()).isEqualByComparingTo("510");

        assertThat(session.getTotalSoldBags()).isEqualTo(5);
        assertThat(session.getHighestBidRate()).isEqualTo(100);
    }

    @Test
    void completeAuction_throwsConflictWhenNoEntries() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setBagCount(10);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(lotId);
        when(auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)).thenReturn(Optional.of(auction));

        when(auctionEntryRepository.findAllByAuctionId(200L)).thenReturn(Collections.emptyList());

        assertThatThrownBy(() -> auctionService.completeAuction(lotId)).isInstanceOf(AuctionConflictException.class);
    }

    @Test
    void completeAuction_marksAuctionCompletedAndBuildsResultDto() {
        Long lotId = 100L;

        Lot lot = new Lot();
        lot.setId(lotId);
        lot.setLotName("Lot A");
        lot.setBagCount(10);
        lot.setSellerVehicleId(10L);
        when(lotRepository.findById(lotId)).thenReturn(Optional.of(lot));

        SellerInVehicle siv = new SellerInVehicle();
        siv.setId(10L);
        siv.setVehicleId(20L);
        when(sellerInVehicleRepository.findById(10L)).thenReturn(Optional.of(siv));

        Vehicle vehicle = new Vehicle();
        vehicle.setId(20L);
        vehicle.setTraderId(1L);
        when(vehicleRepository.findById(20L)).thenReturn(Optional.of(vehicle));

        Auction auction = new Auction();
        auction.setId(200L);
        auction.setLotId(lotId);
        auction.setAuctionDatetime(Instant.parse("2024-01-01T10:00:00Z"));
        when(auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)).thenReturn(Optional.of(auction));

        AuctionEntry e1 = new AuctionEntry();
        e1.setAuctionId(200L);
        e1.setBidNumber(2);
        e1.setBuyerId(10L);
        e1.setBuyerMark("M1");
        e1.setBuyerName("Buyer 1");
        e1.setBidRate(new BigDecimal("100"));
        e1.setQuantity(4);
        e1.setAmount(new BigDecimal("400"));
        e1.setIsSelfSale(false);
        e1.setIsScribble(false);
        e1.setPresetMargin(BigDecimal.ZERO);
        e1.setPresetType(AuctionPresetType.PROFIT);

        AuctionEntry e2 = new AuctionEntry();
        e2.setAuctionId(200L);
        e2.setBidNumber(1);
        e2.setBuyerId(11L);
        e2.setBuyerMark("M2");
        e2.setBuyerName("Buyer 2");
        e2.setBidRate(new BigDecimal("110"));
        e2.setQuantity(6);
        e2.setAmount(new BigDecimal("660"));
        e2.setIsSelfSale(false);
        e2.setIsScribble(false);
        e2.setPresetMargin(BigDecimal.ZERO);
        e2.setPresetType(AuctionPresetType.PROFIT);

        when(auctionEntryRepository.findAllByAuctionId(200L)).thenReturn(List.of(e1, e2));

        ArgumentCaptor<Auction> auctionCaptor = ArgumentCaptor.forClass(Auction.class);
        when(auctionRepository.save(auctionCaptor.capture())).thenAnswer(invocation -> auctionCaptor.getValue());

        AuctionResultDTO result = auctionService.completeAuction(lotId);

        Auction savedAuction = auctionCaptor.getValue();
        assertThat(savedAuction.getCompletedAt()).isNotNull();

        assertThat(result.getAuctionId()).isEqualTo(200L);
        assertThat(result.getLotId()).isEqualTo(lotId);
        assertThat(result.getLotName()).isEqualTo("Lot A");
        assertThat(result.getEntries()).hasSize(2);
        assertThat(result.getEntries().get(0).getBidNumber()).isEqualTo(1);
        assertThat(result.getEntries().get(1).getBidNumber()).isEqualTo(2);
    }

    @Test
    void listTemporaryBuyerMarksForCurrentCalendarDay_excludesRegisteredMarksAndSorts() {
        when(auctionEntryRepository.findDistinctScribbleBuyerMarksForTraderCreatedBetween(eq(1L), any(Instant.class), any(Instant.class)))
            .thenReturn(List.of("zebra", "alpha", "dup"));
        Contact c = new Contact();
        c.setMark("Dup");
        when(contactRepository.findAllByTraderIdAndActiveTrue(1L)).thenReturn(List.of(c));

        List<String> result = auctionService.listTemporaryBuyerMarksForCurrentCalendarDay();

        assertThat(result).containsExactly("alpha", "zebra");
    }
}

