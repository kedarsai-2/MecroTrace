package com.mercotrace.service;

import com.mercotrace.domain.*;
import com.mercotrace.domain.enumeration.FreightMethod;
import com.mercotrace.domain.enumeration.VoucherStatus;
import com.mercotrace.repository.*;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalRequestDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSellerDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalLotDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSummaryDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalDetailDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSellerDetailDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalLotDetailDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalFullDetailDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalSellerFullDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalLotFullDTO;
import com.mercotrace.service.dto.ArrivalDTOs.ArrivalUpdateDTO;
import com.mercotrace.web.rest.errors.ArrivalDeletionBlockedException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service for the Arrivals aggregate.
 */
@Service
@Transactional
public class ArrivalService {

    private static final Logger LOG = LoggerFactory.getLogger(ArrivalService.class);
    private static final LocalDate GLOBAL_SELLER_SERIAL_DATE = LocalDate.of(1970, 1, 1);

    /** Message when another vehicle already owns this mark/alias (case-insensitive, trimmed). */
    public static final String VEHICLE_MARK_ALIAS_DUPLICATE_MESSAGE =
        "Vehicle mark/alias is already used by another arrival. Each non-empty alias must be unique across the system.";

    /** Persisted in {@code daily_serial_allocation}; stable seller-to-serial mapping per trader (not per arrival). */
    private static final String KEY_TYPE_ARRIVAL_SELLER = "ARRIVAL_SELLER";

    /** JSON omitted {@code multiSeller} → multi mode (matches UI default); explicit false → single. */
    private static boolean effectiveRequestMultiSeller(ArrivalRequestDTO request) {
        Boolean m = request.getMultiSeller();
        return m == null || Boolean.TRUE.equals(m);
    }

    private final VehicleRepository vehicleRepository;
    private final VehicleWeightRepository vehicleWeightRepository;
    private final SellerInVehicleRepository sellerInVehicleRepository;
    private final LotRepository lotRepository;
    private final FreightCalculationRepository freightCalculationRepository;
    private final FreightDistributionRepository freightDistributionRepository;
    private final VoucherRepository voucherRepository;
    private final DailySerialRepository dailySerialRepository;
    private final DailySerialAllocationRepository dailySerialAllocationRepository;
    private final CommodityRepository commodityRepository;
    private final ContactRepository contactRepository;
    private final ContactService contactService;
    private final TraderContextService traderContextService;
    private final AuctionRepository auctionRepository;
    private final AuctionEntryRepository auctionEntryRepository;
    private final WeighingSessionRepository weighingSessionRepository;
    private final SalesBillLineItemRepository salesBillLineItemRepository;
    private final AuctionSelfSaleUnitRepository auctionSelfSaleUnitRepository;
    private final SelfSaleClosureRepository selfSaleClosureRepository;
    private final CdnItemRepository cdnItemRepository;
    private final StockPurchaseItemRepository stockPurchaseItemRepository;
    private final WriterPadSessionRepository writerPadSessionRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public ArrivalService(
        VehicleRepository vehicleRepository,
        VehicleWeightRepository vehicleWeightRepository,
        SellerInVehicleRepository sellerInVehicleRepository,
        LotRepository lotRepository,
        FreightCalculationRepository freightCalculationRepository,
        FreightDistributionRepository freightDistributionRepository,
        VoucherRepository voucherRepository,
        DailySerialRepository dailySerialRepository,
        DailySerialAllocationRepository dailySerialAllocationRepository,
        CommodityRepository commodityRepository,
        ContactRepository contactRepository,
        ContactService contactService,
        TraderContextService traderContextService,
        AuctionRepository auctionRepository,
        AuctionEntryRepository auctionEntryRepository,
        WeighingSessionRepository weighingSessionRepository,
        SalesBillLineItemRepository salesBillLineItemRepository,
        AuctionSelfSaleUnitRepository auctionSelfSaleUnitRepository,
        SelfSaleClosureRepository selfSaleClosureRepository,
        CdnItemRepository cdnItemRepository,
        StockPurchaseItemRepository stockPurchaseItemRepository,
        WriterPadSessionRepository writerPadSessionRepository
    ) {
        this.vehicleRepository = vehicleRepository;
        this.vehicleWeightRepository = vehicleWeightRepository;
        this.sellerInVehicleRepository = sellerInVehicleRepository;
        this.lotRepository = lotRepository;
        this.freightCalculationRepository = freightCalculationRepository;
        this.freightDistributionRepository = freightDistributionRepository;
        this.voucherRepository = voucherRepository;
        this.dailySerialRepository = dailySerialRepository;
        this.dailySerialAllocationRepository = dailySerialAllocationRepository;
        this.commodityRepository = commodityRepository;
        this.contactRepository = contactRepository;
        this.contactService = contactService;
        this.traderContextService = traderContextService;
        this.auctionRepository = auctionRepository;
        this.auctionEntryRepository = auctionEntryRepository;
        this.weighingSessionRepository = weighingSessionRepository;
        this.salesBillLineItemRepository = salesBillLineItemRepository;
        this.auctionSelfSaleUnitRepository = auctionSelfSaleUnitRepository;
        this.selfSaleClosureRepository = selfSaleClosureRepository;
        this.cdnItemRepository = cdnItemRepository;
        this.stockPurchaseItemRepository = stockPurchaseItemRepository;
        this.writerPadSessionRepository = writerPadSessionRepository;
    }

    /**
     * Create a new arrival with vehicle, weight, sellers, lots, and freight side effects.
     * When request.isPartiallyCompleted() is true, mandatory validations and financial
     * side-effects (vouchers, freight distribution) are skipped so the user can save
     * an incomplete form without friction.
     */
    public ArrivalSummaryDTO createArrival(ArrivalRequestDTO request) {
        boolean isPartial = request.isPartiallyCompleted();

        if (!isPartial) {
            validateCompletedArrival(request);
            validateRequest(request);
        }

        Long traderId = resolveTraderId();

        List<ArrivalSellerDTO> requestSellers = request.getSellers() != null ? request.getSellers() : List.of();
        if (!requestSellers.isEmpty()) {
            validateSellerMarks(requestSellers, traderId, null);
        }

        Instant now = Instant.now();
        double loadedWt = request.getLoadedWeight() != null ? request.getLoadedWeight() : 0d;
        double emptyWt = request.getEmptyWeight() != null ? request.getEmptyWeight() : 0d;
        double deductedWt = request.getDeductedWeight() != null ? request.getDeductedWeight() : 0d;
        double netWeight = Math.max(0d, loadedWt - emptyWt);
        double finalBillableWeight = Math.max(0d, netWeight - deductedWt);

        Vehicle vehicle = new Vehicle();
        String vehicleNumber = normalizeVehicleNumber(request);
        String vehicleMarkAlias = normalizeVehicleMarkAlias(request.getVehicleMarkAlias());
        assertVehicleMarkAliasUnique(vehicleMarkAlias, null);
        vehicle.setTraderId(traderId);
        vehicle.setVehicleNumber(vehicleNumber);
        vehicle.setVehicleMarkAlias(vehicleMarkAlias);
        vehicle.setArrivalDatetime(now);
        vehicle.setCreatedAt(now);
        vehicle.setPartiallyCompleted(isPartial);
        vehicle.setMultiSeller(effectiveRequestMultiSeller(request));
        if (request.getGodown() != null) vehicle.setGodown(request.getGodown());
        if (request.getGatepassNumber() != null) vehicle.setGatepassNumber(request.getGatepassNumber());
        if (request.getOrigin() != null) vehicle.setOrigin(request.getOrigin());
        if (request.getBrokerName() != null) vehicle.setBrokerName(request.getBrokerName().trim());
        if (request.getNarration() != null) vehicle.setNarration(request.getNarration().trim());
        vehicle = vehicleRepository.save(vehicle);

        VehicleWeight weight = new VehicleWeight();
        weight.setVehicleId(vehicle.getId());
        weight.setLoadedWeight(loadedWt);
        weight.setEmptyWeight(emptyWt);
        weight.setDeductedWeight(deductedWt);
        weight.setNetWeight(netWeight);
        weight.setRecordedAt(now);
        vehicleWeightRepository.save(weight);

        DailySerial dailySerial = getOrCreateGlobalSellerSerialForUpdate(traderId);
        int sellerSerialPeak = dailySerial.getSellerSerial() != null ? dailySerial.getSellerSerial() : 0;
        Set<Integer> usedSellerSerials = new HashSet<>();
        Set<String> seenSellerKeys = new HashSet<>();
        int lotSerialPeak = currentLotSerialBaseForTrader(traderId, dailySerial);

        List<SellerInVehicle> sellerLinks = new ArrayList<>();
        List<Lot> lots = new ArrayList<>();

        Long brokerContactId = request.getBrokerContactId();
        for (ArrivalSellerDTO sellerDTO : requestSellers) {
            SellerInVehicle sellerInVehicle = new SellerInVehicle();
            sellerInVehicle.setVehicleId(vehicle.getId());
            Long contactId = sellerDTO.getContactId();
            if (contactId != null) {
                Contact contact = contactRepository.findById(contactId).orElseThrow(() ->
                    new IllegalArgumentException("Seller contact not found: " + contactId)
                );
                contactService.ensureTraderUsesPortalContact(traderId, contactId);
                sellerInVehicle.setContactId(contactId);
                String incomingMark = sellerDTO.getSellerMark() != null && !sellerDTO.getSellerMark().isBlank() ? sellerDTO.getSellerMark().trim() : null;
                sellerInVehicle.setSellerMark(incomingMark);
                propagateMarkToContact(contact, incomingMark, traderId);
            } else {
                sellerInVehicle.setContactId(null);
                sellerInVehicle.setSellerName(sellerDTO.getSellerName() != null ? sellerDTO.getSellerName().trim() : null);
                sellerInVehicle.setSellerPhone(sellerDTO.getSellerPhone() != null ? sellerDTO.getSellerPhone().trim() : null);
                sellerInVehicle.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
            }
            if (brokerContactId != null) {
                sellerInVehicle.setBrokerId(brokerContactId);
            }
            sellerInVehicle = sellerInVehicleRepository.save(sellerInVehicle);
            sellerLinks.add(sellerInVehicle);

            int sellerSerial = assignStableSellerSerial(traderId, sellerDTO, dailySerial, usedSellerSerials, seenSellerKeys);
            sellerSerialPeak = Math.max(sellerSerialPeak, sellerSerial);
            List<ArrivalLotDTO> sellerLots = sellerDTO.getLots() != null ? sellerDTO.getLots() : List.of();
            for (ArrivalLotDTO lotDTO : sellerLots) {
                // DB constraints require commodity_id + lot_name; skip incomplete lot rows.
                String lotName = lotDTO.getLotName();
                String commodityName = lotDTO.getCommodityName();
                boolean hasLotName = lotName != null && !lotName.isBlank();
                boolean hasCommodityName = commodityName != null && !commodityName.isBlank();
                if (!hasLotName || !hasCommodityName) continue;

                Lot lot = new Lot();
                lot.setSellerVehicleId(sellerInVehicle.getId());
                lot.setCommodityId(resolveCommodityId(traderId, commodityName.trim()));
                lot.setLotName(lotName.trim());
                Integer bagCount = lotDTO.getBagCount();
                lot.setBagCount(bagCount != null ? bagCount : 0);
                if (lotDTO.getVariant() != null && !lotDTO.getVariant().isBlank()) lot.setVariant(lotDTO.getVariant().trim());
                if (lotDTO.getBrokerTag() != null && !lotDTO.getBrokerTag().isBlank()) lot.setBrokerTag(lotDTO.getBrokerTag().trim());
                lot.setSellerSerialNo(sellerSerial);
                lotSerialPeak = nextLotSerial(lotSerialPeak);
                lot.setLotSerialNo(lotSerialPeak);
                lot.setCreatedAt(now);
                lots.add(lot);
            }
        }

        if (brokerContactId != null) {
            contactService.ensureTraderUsesPortalContact(traderId, brokerContactId);
        }

        if (!lots.isEmpty()) {
            lotRepository.saveAll(lots);
        }

        dailySerial.setSellerSerial(sellerSerialPeak);
        dailySerial.setLotSerial(lotSerialPeak);
        dailySerialRepository.save(dailySerial);

        FreightMethod fm = request.getFreightMethod() != null ? request.getFreightMethod() : FreightMethod.BY_WEIGHT;
        double freightRate = request.getFreightRate() != null ? request.getFreightRate() : 0d;
        double freightKgs = request.getFreightKgs() != null ? request.getFreightKgs() : 1.0d;
        double advancePaid = request.getAdvancePaid() != null ? request.getAdvancePaid() : 0d;
        double freightTotal = computeFreightTotal(fm, freightRate, freightKgs, finalBillableWeight, lots, request.isNoRental());

        FreightCalculation freight = new FreightCalculation();
        freight.setVehicleId(vehicle.getId());
        freight.setMethod(fm);
        freight.setRate(freightRate);
        freight.setFreightKgs(freightKgs);
        freight.setTotalAmount(freightTotal);
        freight.setNoRental(request.isNoRental());
        freight.setAdvancePaid(advancePaid);
        freight.setCreatedAt(now);
        freight = freightCalculationRepository.save(freight);

        if (!isPartial) {
            if (!request.isNoRental() && freightTotal > 0d) {
                createVoucher(traderId, "FREIGHT", vehicle.getId(), freightTotal, now);
            }
            if (advancePaid > 0d) {
                createVoucher(traderId, "ADVANCE", vehicle.getId(), advancePaid, now);
            }
            if (fm == FreightMethod.DIVIDE_BY_WEIGHT && !lots.isEmpty() && freightTotal > 0d) {
                distributeFreight(freight, lots, freightTotal);
            }
        }

        ArrivalSummaryDTO summary = new ArrivalSummaryDTO();
        summary.setVehicleId(vehicle.getId());
        summary.setVehicleNumber(vehicle.getVehicleNumber());
        summary.setVehicleMarkAlias(vehicle.getVehicleMarkAlias());
        summary.setSellerCount(sellerLinks.size());
        summary.setLotCount(lots.size());
        summary.setNetWeight(netWeight);
        summary.setFinalBillableWeight(finalBillableWeight);
        summary.setFreightTotal(freightTotal);
        summary.setFreightMethod(fm);
        summary.setArrivalDatetime(vehicle.getArrivalDatetime());
        summary.setLastModifiedDate(vehicle.getLastModifiedDate());
        summary.setPartiallyCompleted(isPartial);
        return summary;
    }

    private static String arrivalStatusFromDto(ArrivalSummaryDTO dto) {
        int lotCount = dto.getLotCount();
        int weighedCount = dto.getWeighedCount();
        int bidsCount = dto.getBidsCount();
        if (lotCount > 0 && weighedCount >= lotCount) return "WEIGHED";
        if (bidsCount > 0) return "AUCTIONED";
        return "PENDING";
    }

    @Transactional(readOnly = true)
    public Page<ArrivalSummaryDTO> listArrivals(Pageable pageable) {
        return listArrivals(pageable, null, null);
    }

    @Transactional(readOnly = true)
    public Page<ArrivalSummaryDTO> listArrivals(Pageable pageable, String statusFilter) {
        return listArrivals(pageable, statusFilter, null);
    }

    @Transactional(readOnly = true)
    public Page<ArrivalSummaryDTO> listArrivals(Pageable pageable, String statusFilter, Boolean partiallyCompleted) {
        Long traderId = resolveTraderId();

        boolean wantPartial = Boolean.TRUE.equals(partiallyCompleted);
        Page<Vehicle> vehiclePage = vehicleRepository
            .findAllByTraderIdAndPartiallyCompletedOrderByArrivalDatetimeDesc(traderId, wantPartial, pageable);
        List<Vehicle> vehicles = vehiclePage.getContent();

        if (vehicles.isEmpty()) {
            return Page.empty(pageable);
        }

        List<Long> vehicleIds = vehicles.stream().map(Vehicle::getId).toList();

        List<VehicleWeight> weights = vehicleWeightRepository.findAllByVehicleIdIn(vehicleIds);
        List<FreightCalculation> freights = freightCalculationRepository.findAllByVehicleIdIn(vehicleIds);
        List<SellerInVehicle> sellers = sellerInVehicleRepository.findAllByVehicleIdIn(vehicleIds);
        List<Long> sellerVehicleIds = sellers.stream().map(SellerInVehicle::getId).toList();
        List<Lot> lots = sellerVehicleIds.isEmpty() ? List.of() : lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds);

        List<Long> contactIds = sellers.stream().map(SellerInVehicle::getContactId).filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, String> contactNameById = contactIds.isEmpty() ? Map.of() : contactRepository.findAllById(contactIds).stream()
            .collect(Collectors.toMap(Contact::getId, c -> c.getName() != null ? c.getName() : ""));

        List<Long> allLotIds = lots.stream().map(Lot::getId).toList();
        List<Auction> auctionsForLots = allLotIds.isEmpty() ? List.of() : auctionRepository.findAllByLotIdIn(allLotIds);
        List<Long> auctionIds = auctionsForLots.stream().map(Auction::getId).toList();
        List<AuctionEntry> entries = auctionIds.isEmpty() ? List.of() : auctionEntryRepository.findAllByAuctionIdIn(auctionIds);
        Set<Long> lotIdsWithBids = entries.stream().map(AuctionEntry::getAuctionId).distinct()
            .map(aid -> auctionsForLots.stream().filter(a -> a.getId().equals(aid)).findFirst().map(Auction::getLotId).orElse(null))
            .filter(java.util.Objects::nonNull).collect(Collectors.toSet());

        List<WeighingSession> weighingSessions = allLotIds.isEmpty() ? List.of() : weighingSessionRepository.findByLotIdIn(allLotIds);
        Set<Long> weighedLotIds = weighingSessions.stream().map(WeighingSession::getLotId).collect(Collectors.toSet());

        List<ArrivalSummaryDTO> content = vehicles.stream().map(v -> {
            Optional<VehicleWeight> weightOpt = weights.stream().filter(w -> w.getVehicleId().equals(v.getId())).findFirst();
            Optional<FreightCalculation> freightOpt = freights.stream().filter(f -> f.getVehicleId().equals(v.getId())).findFirst();

            double netWeight = weightOpt.map(VehicleWeight::getNetWeight).orElse(0d);
            double deducted = weightOpt.map(VehicleWeight::getDeductedWeight).orElse(0d);
            double finalBillable = Math.max(0d, netWeight - deducted);
            double freightTotal = freightOpt.map(FreightCalculation::getTotalAmount).orElse(0d);
            FreightMethod method = freightOpt.map(FreightCalculation::getMethod).orElse(null);

            List<SellerInVehicle> vehicleSellers = sellers.stream().filter(sv -> sv.getVehicleId().equals(v.getId())).toList();
            int sellerCount = vehicleSellers.size();
            List<Lot> vehicleLots = lots.stream().filter(l -> vehicleSellers.stream().anyMatch(sv -> sv.getId().equals(l.getSellerVehicleId()))).toList();
            int lotCount = vehicleLots.size();

            String primarySellerName = null;
            if (!vehicleSellers.isEmpty()) {
                SellerInVehicle first = vehicleSellers.get(0);
                if (first.getContactId() != null) {
                    primarySellerName = contactNameById.getOrDefault(first.getContactId(), "");
                }
                if (primarySellerName == null || primarySellerName.isEmpty()) {
                    primarySellerName = first.getSellerName() != null ? first.getSellerName() : "-";
                }
            }
            if (primarySellerName == null) primarySellerName = "-";

            int totalBags = vehicleLots.stream().mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0).sum();
            int bidsCount = (int) vehicleLots.stream().map(Lot::getId).filter(lotIdsWithBids::contains).count();
            int weighedCount = (int) vehicleLots.stream().map(Lot::getId).filter(weighedLotIds::contains).count();

            ArrivalSummaryDTO dto = new ArrivalSummaryDTO();
            dto.setVehicleId(v.getId());
            dto.setVehicleNumber(v.getVehicleNumber());
            dto.setVehicleMarkAlias(v.getVehicleMarkAlias());
            dto.setSellerCount(sellerCount);
            dto.setLotCount(lotCount);
            dto.setNetWeight(netWeight);
            dto.setFinalBillableWeight(finalBillable);
            dto.setFreightTotal(freightTotal);
            dto.setFreightMethod(method);
            dto.setArrivalDatetime(v.getArrivalDatetime());
            dto.setGodown(v.getGodown());
            dto.setGatepassNumber(v.getGatepassNumber());
            dto.setOrigin(v.getOrigin());
            dto.setPrimarySellerName(primarySellerName);
            dto.setTotalBags(totalBags);
            dto.setBidsCount(bidsCount);
            dto.setWeighedCount(weighedCount);
            dto.setPartiallyCompleted(Boolean.TRUE.equals(v.getPartiallyCompleted()));
            dto.setLastModifiedDate(v.getLastModifiedDate());
            return dto;
        }).toList();

        if (statusFilter != null && !statusFilter.isBlank()) {
            String want = statusFilter.trim().toUpperCase();
            List<ArrivalSummaryDTO> filtered = content.stream()
                .filter(dto -> want.equals(arrivalStatusFromDto(dto)))
                .toList();
            return new PageImpl<>(filtered, pageable, filtered.size());
        }
        return new PageImpl<>(content, pageable, vehiclePage.getTotalElements());
    }

    /**
     * Get full arrival detail by vehicle id (for expand panel). Trader-scoped.
     */
    @Transactional(readOnly = true)
    public ArrivalFullDetailDTO getArrivalById(Long vehicleId) {
        Long traderId = resolveTraderId();
        Vehicle vehicle = vehicleRepository.findById(vehicleId)
            .orElseThrow(() -> new IllegalArgumentException("Arrival not found: " + vehicleId));
        if (!vehicle.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Arrival not found: " + vehicleId);
        }

        Optional<VehicleWeight> weightOpt = vehicleWeightRepository.findOneByVehicleId(vehicleId);
        Optional<FreightCalculation> freightOpt = freightCalculationRepository.findOneByVehicleId(vehicleId);
        List<SellerInVehicle> sellers = sellerInVehicleRepository.findAllByVehicleId(vehicleId);
        List<Long> sellerVehicleIds = sellers.stream().map(SellerInVehicle::getId).toList();
        List<Lot> lots = sellerVehicleIds.isEmpty() ? List.of() : lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds);
        List<Long> contactIds = sellers.stream().map(SellerInVehicle::getContactId).filter(java.util.Objects::nonNull).distinct().toList();
        List<Contact> contacts = contactIds.isEmpty() ? List.of() : contactRepository.findAllById(contactIds);
        List<Long> commodityIds = lots.stream().map(Lot::getCommodityId).filter(java.util.Objects::nonNull).distinct().toList();
        List<Commodity> commodities = commodityIds.isEmpty() ? List.of() : commodityRepository.findAllById(commodityIds);

        java.util.Map<Long, String> contactNameById = contacts.stream()
            .collect(Collectors.toMap(Contact::getId, c -> c.getName() != null ? c.getName() : ""));
        java.util.Map<Long, String> contactPhoneById = contacts.stream()
            .collect(Collectors.toMap(Contact::getId, c -> c.getPhone() != null ? c.getPhone() : ""));
        java.util.Map<Long, String> contactMarkById = contacts.stream()
            .collect(Collectors.toMap(Contact::getId, c -> c.getMark() != null ? c.getMark() : ""));
        java.util.Map<Long, String> commodityNameById = commodities.stream()
            .collect(Collectors.toMap(Commodity::getId, c -> c.getCommodityName() != null ? c.getCommodityName() : ""));

        ArrivalFullDetailDTO dto = new ArrivalFullDetailDTO();
        dto.setVehicleId(vehicle.getId());
        dto.setVehicleNumber(vehicle.getVehicleNumber());
        dto.setVehicleMarkAlias(vehicle.getVehicleMarkAlias());
        dto.setArrivalDatetime(vehicle.getArrivalDatetime());
        dto.setGodown(vehicle.getGodown());
        dto.setGatepassNumber(vehicle.getGatepassNumber());
        dto.setOrigin(vehicle.getOrigin());
        dto.setBrokerName(vehicle.getBrokerName());
        dto.setBrokerContactId(sellers.isEmpty() ? null : sellers.get(0).getBrokerId());
        dto.setNarration(vehicle.getNarration());

        double netWeight = weightOpt.map(VehicleWeight::getNetWeight).orElse(0d);
        dto.setLoadedWeight(weightOpt.map(VehicleWeight::getLoadedWeight).orElse(null));
        dto.setEmptyWeight(weightOpt.map(VehicleWeight::getEmptyWeight).orElse(null));
        dto.setDeductedWeight(weightOpt.map(VehicleWeight::getDeductedWeight).orElse(null));
        dto.setNetWeight(netWeight);

        if (freightOpt.isPresent()) {
            FreightCalculation fc = freightOpt.get();
            dto.setFreightMethod(fc.getMethod());
            dto.setFreightRate(fc.getRate());
            dto.setFreightKgs(fc.getFreightKgs());
            dto.setFreightTotal(fc.getTotalAmount());
            dto.setNoRental(Boolean.TRUE.equals(fc.getNoRental()));
            dto.setAdvancePaid(fc.getAdvancePaid());
        }

        List<ArrivalSellerFullDTO> sellerFullList = new ArrayList<>();
        for (SellerInVehicle siv : sellers) {
            ArrivalSellerFullDTO sellerFull = new ArrivalSellerFullDTO();
            sellerFull.setContactId(siv.getContactId());
            if (siv.getContactId() != null) {
                sellerFull.setSellerName(contactNameById.getOrDefault(siv.getContactId(), ""));
                sellerFull.setSellerPhone(contactPhoneById.getOrDefault(siv.getContactId(), ""));
                // prefer per-arrival mark override stored on seller row; fall back to the contact's global mark
                String sivMark = siv.getSellerMark();
                sellerFull.setSellerMark(sivMark != null && !sivMark.isBlank() ? sivMark : contactMarkById.getOrDefault(siv.getContactId(), ""));
            } else {
                sellerFull.setSellerName(siv.getSellerName() != null ? siv.getSellerName() : "");
                sellerFull.setSellerPhone(siv.getSellerPhone() != null ? siv.getSellerPhone() : "");
                sellerFull.setSellerMark(siv.getSellerMark() != null ? siv.getSellerMark() : null);
            }
            List<Lot> sellerLots = lots.stream().filter(l -> l.getSellerVehicleId().equals(siv.getId())).toList();
            sellerFull.setSellerSerialNumber(
                sellerLots.stream()
                    .map(Lot::getSellerSerialNo)
                    .filter(java.util.Objects::nonNull)
                    .findFirst()
                    .orElse(null)
            );
            List<ArrivalLotFullDTO> lotFullList = sellerLots.stream().map(lot -> {
                ArrivalLotFullDTO lf = new ArrivalLotFullDTO();
                lf.setId(lot.getId());
                lf.setLotName(lot.getLotName());
                lf.setLotSerialNumber(lot.getLotSerialNo());
                lf.setCommodityName(commodityNameById.getOrDefault(lot.getCommodityId(), ""));
                lf.setBagCount(lot.getBagCount() != null ? lot.getBagCount() : 0);
                lf.setBrokerTag(lot.getBrokerTag());
                lf.setVariant(lot.getVariant());
                return lf;
            }).toList();
            sellerFull.setLots(lotFullList);
            sellerFullList.add(sellerFull);
        }
        dto.setPartiallyCompleted(Boolean.TRUE.equals(vehicle.getPartiallyCompleted()));
        dto.setMultiSeller(!Boolean.FALSE.equals(vehicle.getMultiSeller()));
        dto.setSellers(sellerFullList);
        List<Long> allLotIds = lots.stream().map(Lot::getId).toList();
        dto.setDeleteBlockers(
            collectLotDeletionBlockers(traderId, allLotIds).stream().map(Enum::name).sorted().toList()
        );
        return dto;
    }

    /**
     * Update arrival: vehicle metadata, weights, and/or freight. All fields optional. Trader-scoped.
     * When partiallyCompleted transitions from true → false, full validation and financial
     * side-effects are applied (promotion to completed record).
     */
    @Transactional
    public ArrivalSummaryDTO updateArrival(Long vehicleId, ArrivalUpdateDTO update) {
        Long traderId = resolveTraderId();
        Vehicle vehicle = vehicleRepository.findById(vehicleId)
            .orElseThrow(() -> new IllegalArgumentException("Arrival not found: " + vehicleId));
        if (!vehicle.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Arrival not found: " + vehicleId);
        }

        boolean wasPartial = Boolean.TRUE.equals(vehicle.getPartiallyCompleted());
        boolean promotingToComplete = wasPartial && Boolean.FALSE.equals(update.getPartiallyCompleted());

        if (update.getPartiallyCompleted() != null) {
            vehicle.setPartiallyCompleted(update.getPartiallyCompleted());
        }
        if (update.getMultiSeller() != null) {
            vehicle.setMultiSeller(update.getMultiSeller());
        }

        if (update.getVehicleNumber() != null && !update.getVehicleNumber().isBlank()) {
            vehicle.setVehicleNumber(update.getVehicleNumber().trim().toUpperCase());
        }
        if (update.getVehicleMarkAlias() != null) {
            String normalizedAlias = normalizeVehicleMarkAlias(update.getVehicleMarkAlias());
            assertVehicleMarkAliasUnique(normalizedAlias, vehicleId);
            vehicle.setVehicleMarkAlias(normalizedAlias);
        }
        if (update.getGodown() != null) vehicle.setGodown(update.getGodown());
        if (update.getGatepassNumber() != null) vehicle.setGatepassNumber(update.getGatepassNumber());
        if (update.getOrigin() != null) vehicle.setOrigin(update.getOrigin());
        if (update.getBrokerName() != null) vehicle.setBrokerName(update.getBrokerName().trim());
        if (update.getNarration() != null) vehicle.setNarration(update.getNarration().trim());
        vehicle = vehicleRepository.save(vehicle);
        final Vehicle vehicleRef = vehicle;

        if (promotingToComplete) {
            List<ArrivalSellerDTO> promoteSellers = update.getSellers();
            if (promoteSellers == null || promoteSellers.isEmpty()) {
                throw new IllegalArgumentException("At least one seller is required");
            }
            boolean multiForValidate = update.getMultiSeller() != null
                ? Boolean.TRUE.equals(update.getMultiSeller())
                : promoteSellers.size() > 1;
            validateCompletedArrivalPayload(promoteSellers, multiForValidate, vehicle.getVehicleNumber());
        }

        if (update.getLoadedWeight() != null || update.getEmptyWeight() != null || update.getDeductedWeight() != null) {
            VehicleWeight weight = vehicleWeightRepository.findOneByVehicleId(vehicleId).orElseGet(() -> {
                VehicleWeight w = new VehicleWeight();
                w.setVehicleId(vehicleId);
                w.setLoadedWeight(0d);
                w.setEmptyWeight(0d);
                w.setDeductedWeight(0d);
                w.setNetWeight(0d);
                w.setRecordedAt(vehicleRef.getArrivalDatetime() != null ? vehicleRef.getArrivalDatetime() : Instant.now());
                return w;
            });
            if (update.getLoadedWeight() != null) weight.setLoadedWeight(update.getLoadedWeight());
            if (update.getEmptyWeight() != null) weight.setEmptyWeight(update.getEmptyWeight());
            if (update.getDeductedWeight() != null) weight.setDeductedWeight(update.getDeductedWeight());
            double lw = weight.getLoadedWeight() != null ? weight.getLoadedWeight() : 0d;
            double ew = weight.getEmptyWeight() != null ? weight.getEmptyWeight() : 0d;
            weight.setNetWeight(Math.max(0d, lw - ew));
            vehicleWeightRepository.save(weight);
        }

        boolean isStillPartial = Boolean.TRUE.equals(vehicle.getPartiallyCompleted());

        boolean sellersReplaced = false;
        List<Lot> currentLots = new ArrayList<>();
        if (update.getSellers() != null && !update.getSellers().isEmpty()) {
            if (!isStillPartial) {
                validateUpdateSellers(update.getSellers(), update.getMultiSeller(), traderId);
            }
            List<SellerInVehicle> existingSellers = sellerInVehicleRepository.findAllByVehicleId(vehicleId);
            List<Long> existingSellerVehicleIds = existingSellers.stream().map(SellerInVehicle::getId).toList();
            if (!existingSellerVehicleIds.isEmpty()) {
                freightCalculationRepository.findOneByVehicleId(vehicleId)
                    .ifPresent(fc -> freightDistributionRepository.deleteByFreightId(fc.getId()));
                List<Lot> lotsToRemove = lotRepository.findAllBySellerVehicleIdIn(existingSellerVehicleIds);
                List<Long> lotIdsToRemove = lotsToRemove.stream().map(Lot::getId).toList();
                assertLotsNotBlockedForDeletion(traderId, lotIdsToRemove);
                if (!lotIdsToRemove.isEmpty()) {
                    List<Auction> auctionsForLots = auctionRepository.findAllByLotIdIn(lotIdsToRemove);
                    List<Long> auctionIds = auctionsForLots.stream().map(Auction::getId).toList();
                    if (!auctionIds.isEmpty()) {
                        auctionEntryRepository.deleteByAuctionIdIn(auctionIds);
                    }
                    auctionRepository.deleteByLotIdIn(lotIdsToRemove);
                }
                lotRepository.deleteBySellerVehicleIdIn(existingSellerVehicleIds);
            }
            sellerInVehicleRepository.deleteByVehicleId(vehicleId);

            Instant now = Instant.now();
            DailySerial dailySerial = getOrCreateGlobalSellerSerialForUpdate(traderId);
            int sellerSerialPeak = dailySerial.getSellerSerial() != null ? dailySerial.getSellerSerial() : 0;
            Set<Integer> usedSellerSerials = new HashSet<>();
            Set<String> seenSellerKeys = new HashSet<>();
            int lotSerialPeak = currentLotSerialBaseForTrader(traderId, dailySerial);
            Long updateBrokerContactId = update.getBrokerContactId();
            for (ArrivalSellerDTO sellerDTO : update.getSellers()) {
                SellerInVehicle siv = new SellerInVehicle();
                siv.setVehicleId(vehicleId);
                Long contactId = sellerDTO.getContactId();
                if (contactId != null) {
                    Contact contact = contactRepository.findById(contactId).orElseThrow(() ->
                        new IllegalArgumentException("Seller contact not found: " + contactId));
                    contactService.ensureTraderUsesPortalContact(traderId, contactId);
                    siv.setContactId(contactId);
                    String incomingMark = sellerDTO.getSellerMark() != null && !sellerDTO.getSellerMark().isBlank() ? sellerDTO.getSellerMark().trim() : null;
                    siv.setSellerMark(incomingMark);
                    propagateMarkToContact(contact, incomingMark, traderId);
                } else {
                    String phone = sellerDTO.getSellerPhone() != null ? sellerDTO.getSellerPhone().trim() : null;
                    if (!isStillPartial && phone != null && !phone.isEmpty()) {
                        if (!phone.matches("[0-9]+") || phone.length() < 6 || phone.length() > 20) {
                            throw new IllegalArgumentException("Free-text seller phone must be digits only (6–20 digits)");
                        }
                    }
                    siv.setContactId(null);
                    siv.setSellerName(sellerDTO.getSellerName() != null ? sellerDTO.getSellerName().trim() : null);
                    siv.setSellerPhone(phone);
                    siv.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
                }
                if (updateBrokerContactId != null) {
                    siv.setBrokerId(updateBrokerContactId);
                }
                siv = sellerInVehicleRepository.save(siv);
                int requestedSerial = assignStableSellerSerial(traderId, sellerDTO, dailySerial, usedSellerSerials, seenSellerKeys);
                sellerSerialPeak = Math.max(sellerSerialPeak, requestedSerial);
                List<ArrivalLotDTO> sellerLots = sellerDTO.getLots() != null ? sellerDTO.getLots() : List.of();
                for (ArrivalLotDTO lotDTO : sellerLots) {
                    // DB constraints require commodity_id + lot_name; skip incomplete lot rows.
                    String lotName = lotDTO.getLotName();
                    String commodityName = lotDTO.getCommodityName();
                    boolean hasLotName = lotName != null && !lotName.isBlank();
                    boolean hasCommodityName = commodityName != null && !commodityName.isBlank();
                    if (!hasLotName || !hasCommodityName) continue;

                    Lot lot = new Lot();
                    lot.setSellerVehicleId(siv.getId());
                    lot.setCommodityId(resolveCommodityId(traderId, commodityName.trim()));
                    lot.setLotName(lotName.trim());
                    Integer bagCount = lotDTO.getBagCount();
                    lot.setBagCount(bagCount != null ? bagCount : 0);
                    if (lotDTO.getVariant() != null && !lotDTO.getVariant().isBlank()) lot.setVariant(lotDTO.getVariant().trim());
                    if (lotDTO.getBrokerTag() != null && !lotDTO.getBrokerTag().isBlank()) lot.setBrokerTag(lotDTO.getBrokerTag().trim());
                    lot.setSellerSerialNo(requestedSerial);
                    // Lot serials are trader-scoped and continue incrementally across arrivals.
                    lotSerialPeak = nextLotSerial(lotSerialPeak);
                    lot.setLotSerialNo(lotSerialPeak);
                    lot.setCreatedAt(now);
                    currentLots.add(lot);
                }
            }
            dailySerial.setSellerSerial(sellerSerialPeak);
            dailySerial.setLotSerial(lotSerialPeak);
            dailySerialRepository.save(dailySerial);
            if (updateBrokerContactId != null) {
                contactService.ensureTraderUsesPortalContact(traderId, updateBrokerContactId);
            }
            if (!currentLots.isEmpty()) {
                lotRepository.saveAll(currentLots);
            }
            sellersReplaced = true;
        }

        Optional<FreightCalculation> freightOpt = freightCalculationRepository.findOneByVehicleId(vehicleId);
        boolean updateFreight = update.getFreightMethod() != null || update.getFreightRate() != null
            || update.getFreightKgs() != null || update.getNoRental() != null || update.getAdvancePaid() != null || sellersReplaced;
        if (updateFreight && freightOpt.isPresent()) {
            FreightCalculation freight = freightOpt.get();
            if (update.getFreightMethod() != null) freight.setMethod(update.getFreightMethod());
            if (update.getFreightRate() != null) freight.setRate(update.getFreightRate());
            if (update.getFreightKgs() != null) freight.setFreightKgs(update.getFreightKgs());
            if (update.getNoRental() != null) freight.setNoRental(update.getNoRental());
            if (update.getAdvancePaid() != null) freight.setAdvancePaid(update.getAdvancePaid());

            Optional<VehicleWeight> currentWeight = vehicleWeightRepository.findOneByVehicleId(vehicleId);
            double netWeight = currentWeight.map(VehicleWeight::getNetWeight).orElse(0d);
            double deducted = currentWeight.map(VehicleWeight::getDeductedWeight).orElse(0d);
            double finalBillable = Math.max(0d, netWeight - deducted);
            List<Lot> lotsForFreight = sellersReplaced && !currentLots.isEmpty() ? currentLots
                : lotRepository.findAllBySellerVehicleIdIn(
                    sellerInVehicleRepository.findAllByVehicleId(vehicleId).stream().map(SellerInVehicle::getId).toList());
            double freightTotal = computeFreightTotal(
                freight.getMethod() != null ? freight.getMethod() : FreightMethod.BY_WEIGHT,
                freight.getRate() != null ? freight.getRate() : 0d,
                freight.getFreightKgs() != null ? freight.getFreightKgs() : 1.0d,
                finalBillable,
                lotsForFreight,
                Boolean.TRUE.equals(freight.getNoRental())
            );
            freight.setTotalAmount(freightTotal);
            freight = freightCalculationRepository.save(freight);

            if (!isStillPartial) {
                voucherRepository.deleteByReferenceTypeAndReferenceId("FREIGHT", vehicleId);
                voucherRepository.deleteByReferenceTypeAndReferenceId("ADVANCE", vehicleId);
                Instant now2 = Instant.now();
                if (!Boolean.TRUE.equals(freight.getNoRental()) && freightTotal > 0d) {
                    createVoucher(traderId, "FREIGHT", vehicleId, freightTotal, now2);
                }
                if (freight.getAdvancePaid() != null && freight.getAdvancePaid() > 0d) {
                    createVoucher(traderId, "ADVANCE", vehicleId, freight.getAdvancePaid(), now2);
                }

                if (freight.getMethod() == FreightMethod.DIVIDE_BY_WEIGHT && !lotsForFreight.isEmpty() && freightTotal > 0d) {
                    freightDistributionRepository.deleteByFreightId(freight.getId());
                    distributeFreight(freight, lotsForFreight, freightTotal);
                }
            }
        }

        return toSummary(vehicle);
    }

    /**
     * Delete arrival (vehicle and all related records). Trader-scoped.
     * Blocked with {@link ArrivalDeletionBlockedException} when billing, self-sale, CDN, stock, weighing, or writer-pad still reference any lot.
     */
    @Transactional
    public void deleteArrival(Long vehicleId) {
        Long traderId = resolveTraderId();
        Vehicle vehicle = vehicleRepository.findById(vehicleId)
            .orElseThrow(() -> new IllegalArgumentException("Arrival not found: " + vehicleId));
        if (!vehicle.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Arrival not found: " + vehicleId);
        }
        List<SellerInVehicle> sellers = sellerInVehicleRepository.findAllByVehicleId(vehicleId);
        List<Long> sellerVehicleIds = sellers.stream().map(SellerInVehicle::getId).toList();
        List<Long> lotIdsToRemove = sellerVehicleIds.isEmpty()
            ? List.of()
            : lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds).stream().map(Lot::getId).toList();
        assertLotsNotBlockedForDeletion(traderId, lotIdsToRemove);

        evictSecondLevelCacheForArrivalDeletion(vehicleId);
        Optional<FreightCalculation> freightOpt = freightCalculationRepository.findOneByVehicleId(vehicleId);
        freightOpt.ifPresent(fc -> freightDistributionRepository.deleteByFreightId(fc.getId()));
        freightCalculationRepository.deleteByVehicleId(vehicleId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("FREIGHT", vehicleId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("ADVANCE", vehicleId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("COOLIE", vehicleId);
        if (!sellerVehicleIds.isEmpty()) {
            List<Lot> lotsToRemove = lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds);
            List<Long> lotIdsForDelete = lotsToRemove.stream().map(Lot::getId).toList();
            if (!lotIdsForDelete.isEmpty()) {
                List<Auction> auctionsForLots = auctionRepository.findAllByLotIdIn(lotIdsForDelete);
                List<Long> auctionIds = auctionsForLots.stream().map(Auction::getId).toList();
                if (!auctionIds.isEmpty()) {
                    auctionEntryRepository.deleteByAuctionIdIn(auctionIds);
                }
                auctionRepository.deleteByLotIdIn(lotIdsForDelete);
            }
            lotRepository.deleteBySellerVehicleIdIn(sellerVehicleIds);
        }
        sellerInVehicleRepository.deleteByVehicleId(vehicleId);
        vehicleWeightRepository.deleteByVehicleId(vehicleId);
        vehicleRepository.delete(vehicle);
    }

    private List<ArrivalDeletionBlocker> collectLotDeletionBlockers(Long traderId, List<Long> lotIds) {
        if (lotIds == null || lotIds.isEmpty()) {
            return List.of();
        }
        List<String> lotIdStrs = lotIds.stream().map(String::valueOf).toList();
        List<ArrivalDeletionBlocker> out = new ArrayList<>();
        if (salesBillLineItemRepository.existsForTraderLotsDeletionScope(traderId, lotIdStrs, lotIds)) {
            out.add(ArrivalDeletionBlocker.BILLING);
        }
        if (auctionSelfSaleUnitRepository.existsByLotIdIn(lotIds)) {
            out.add(ArrivalDeletionBlocker.AUCTION_SELF_SALE);
        }
        if (selfSaleClosureRepository.existsActiveByTraderIdAndLotIdIn(traderId, lotIds)) {
            out.add(ArrivalDeletionBlocker.SELF_SALE_CLOSURE);
        }
        if (cdnItemRepository.existsActiveByLotIdIn(lotIds)) {
            out.add(ArrivalDeletionBlocker.CDN);
        }
        if (stockPurchaseItemRepository.existsActiveByTraderIdAndLotIdIn(traderId, lotIds)) {
            out.add(ArrivalDeletionBlocker.STOCK_PURCHASE);
        }
        if (weighingSessionRepository.existsByLotIdIn(lotIds)) {
            out.add(ArrivalDeletionBlocker.WEIGHING);
        }
        if (writerPadSessionRepository.existsByLotIdIn(lotIds)) {
            out.add(ArrivalDeletionBlocker.WRITER_PAD);
        }
        out.sort(Comparator.comparing(ArrivalDeletionBlocker::name));
        return out;
    }

    private void assertLotsNotBlockedForDeletion(Long traderId, List<Long> lotIds) {
        List<ArrivalDeletionBlocker> blockers = collectLotDeletionBlockers(traderId, lotIds);
        if (blockers.isEmpty()) {
            return;
        }
        List<String> codes = blockers.stream().map(Enum::name).toList();
        String labels = blockers.stream().map(ArrivalDeletionBlocker::displayLabel).collect(Collectors.joining(", "));
        throw new ArrivalDeletionBlockedException(
            "This arrival cannot be deleted while linked data exists in: " + labels + ". Remove or adjust those records first.",
            codes
        );
    }

    /**
     * Drop Hibernate second-level (Redis/JCache) entries for this arrival graph before DELETE.
     * Stale serialized entries after entity/schema changes — or Redisson decode edge cases — can surface as
     * {@code Index N out of bounds for length N} while loading or updating the cache during delete.
     */
    private void evictSecondLevelCacheForArrivalDeletion(Long vehicleId) {
        try {
            jakarta.persistence.Cache slc = entityManager.getEntityManagerFactory().getCache();
            if (slc == null) {
                return;
            }
            tryEvictSecondLevel(slc, Vehicle.class, vehicleId);

            for (Long id : nativeLongIds("SELECT id FROM vehicle_weight WHERE vehicle_id = ?1", vehicleId)) {
                tryEvictSecondLevel(slc, VehicleWeight.class, id);
            }
            for (Long id : nativeLongIds("SELECT id FROM freight_calculation WHERE vehicle_id = ?1", vehicleId)) {
                tryEvictSecondLevel(slc, FreightCalculation.class, id);
            }
            for (Long id :
                nativeLongIds(
                    "SELECT fd.id FROM freight_distribution fd INNER JOIN freight_calculation fc ON fd.freight_id = fc.id WHERE fc.vehicle_id = ?1",
                    vehicleId
                )) {
                tryEvictSecondLevel(slc, FreightDistribution.class, id);
            }
            for (Long id :
                nativeLongIds(
                    "SELECT id FROM voucher WHERE reference_id = ?1 AND reference_type IN ('FREIGHT','ADVANCE','COOLIE')",
                    vehicleId
                )) {
                tryEvictSecondLevel(slc, Voucher.class, id);
            }

            List<Long> sivIds = nativeLongIds("SELECT id FROM seller_in_vehicle WHERE vehicle_id = ?1", vehicleId);
            for (Long id : sivIds) {
                tryEvictSecondLevel(slc, SellerInVehicle.class, id);
            }
            if (sivIds.isEmpty()) {
                return;
            }
            List<Long> lotIds = new ArrayList<>();
            for (Long sivId : sivIds) {
                lotIds.addAll(nativeLongIds("SELECT id FROM lot WHERE seller_vehicle_id = ?1", sivId));
            }
            for (Long id : lotIds) {
                tryEvictSecondLevel(slc, Lot.class, id);
            }
            if (lotIds.isEmpty()) {
                return;
            }
            List<Long> auctionIds = new ArrayList<>();
            for (Long lotId : lotIds) {
                auctionIds.addAll(nativeLongIds("SELECT id FROM auction WHERE lot_id = ?1", lotId));
            }
            for (Long id : auctionIds) {
                tryEvictSecondLevel(slc, Auction.class, id);
            }
            if (auctionIds.isEmpty()) {
                return;
            }
            for (Long auctionId : auctionIds) {
                for (Long id : nativeLongIds("SELECT id FROM auction_entry WHERE auction_id = ?1", auctionId)) {
                    tryEvictSecondLevel(slc, AuctionEntry.class, id);
                }
            }
        } catch (RuntimeException ex) {
            LOG.warn("Second-level cache eviction before arrival delete failed for vehicle {}: {}", vehicleId, ex.toString());
        }
    }

    @SuppressWarnings("unchecked")
    private List<Long> nativeLongIds(String sql, Object param) {
        List<?> rows = entityManager.createNativeQuery(sql).setParameter(1, param).getResultList();
        return rows.stream().map(r -> ((Number) r).longValue()).toList();
    }

    private static void tryEvictSecondLevel(jakarta.persistence.Cache slc, Class<?> type, Long id) {
        try {
            slc.evict(type, id);
        } catch (RuntimeException ex) {
            LOG.debug("Second-level cache evict {}#{} skipped: {}", type.getSimpleName(), id, ex.getMessage());
        }
    }

    private ArrivalSummaryDTO toSummary(Vehicle v) {
        Optional<VehicleWeight> weightOpt = vehicleWeightRepository.findOneByVehicleId(v.getId());
        Optional<FreightCalculation> freightOpt = freightCalculationRepository.findOneByVehicleId(v.getId());
        List<SellerInVehicle> sellers = sellerInVehicleRepository.findAllByVehicleId(v.getId());
        int lotCount = (int) lotRepository.findAllBySellerVehicleIdIn(
            sellers.stream().map(SellerInVehicle::getId).toList()
        ).stream().count();
        double netWeight = weightOpt.map(VehicleWeight::getNetWeight).orElse(0d);
        double freightTotal = freightOpt.map(FreightCalculation::getTotalAmount).orElse(0d);
        FreightMethod method = freightOpt.map(FreightCalculation::getMethod).orElse(null);
        ArrivalSummaryDTO dto = new ArrivalSummaryDTO();
        dto.setVehicleId(v.getId());
        dto.setVehicleNumber(v.getVehicleNumber());
        dto.setVehicleMarkAlias(v.getVehicleMarkAlias());
        dto.setSellerCount(sellers.size());
        dto.setLotCount(lotCount);
        dto.setNetWeight(netWeight);
        dto.setFinalBillableWeight(Math.max(0d, netWeight - weightOpt.map(VehicleWeight::getDeductedWeight).orElse(0d)));
        dto.setFreightTotal(freightTotal);
        dto.setFreightMethod(method);
        dto.setArrivalDatetime(v.getArrivalDatetime());
        dto.setGodown(v.getGodown());
        dto.setGatepassNumber(v.getGatepassNumber());
        dto.setOrigin(v.getOrigin());
        dto.setPartiallyCompleted(Boolean.TRUE.equals(v.getPartiallyCompleted()));
        dto.setLastModifiedDate(v.getLastModifiedDate());
        return dto;
    }

    /**
     * List arrivals with nested sellers and lots (id, lotName, sellerName) for UIs that need lot-level lookup (e.g. WeighingPage).
     */
    @Transactional(readOnly = true)
    public Page<ArrivalDetailDTO> listArrivalsDetail(Pageable pageable) {
        Long traderId = resolveTraderId();

        Page<Vehicle> vehiclePage = vehicleRepository.findAllByTraderIdOrderByArrivalDatetimeDesc(traderId, pageable);
        List<Vehicle> vehicles = vehiclePage.getContent();

        if (vehicles.isEmpty()) {
            return Page.empty(pageable);
        }

        List<Long> vehicleIds = vehicles.stream().map(Vehicle::getId).toList();
        List<SellerInVehicle> sellers = sellerInVehicleRepository.findAllByVehicleIdIn(vehicleIds);
        List<Long> sellerVehicleIds = sellers.stream().map(SellerInVehicle::getId).toList();
        List<Lot> lots = sellerVehicleIds.isEmpty() ? List.of() : lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds);
        List<Long> contactIds = sellers.stream().map(SellerInVehicle::getContactId).filter(java.util.Objects::nonNull).distinct().toList();
        List<Contact> contacts = contactIds.isEmpty() ? List.of() : contactRepository.findAllById(contactIds);

        java.util.Map<Long, String> contactNameById = contacts.stream()
            .collect(Collectors.toMap(Contact::getId, c -> c.getName() != null ? c.getName() : ""));
        java.util.Map<Long, Contact> contactById = contacts.stream().collect(Collectors.toMap(Contact::getId, c -> c, (a, b) -> a));

        List<ArrivalDetailDTO> content = vehicles.stream().map(v -> {
            ArrivalDetailDTO dto = new ArrivalDetailDTO();
            dto.setVehicleId(v.getId());
            dto.setVehicleNumber(v.getVehicleNumber());
            dto.setVehicleMarkAlias(v.getVehicleMarkAlias());
            dto.setArrivalDatetime(v.getArrivalDatetime());
            dto.setGodown(v.getGodown());
            dto.setOrigin(v.getOrigin());

            List<SellerInVehicle> vehicleSellers = sellers.stream().filter(sv -> sv.getVehicleId().equals(v.getId())).toList();
            List<ArrivalSellerDetailDTO> sellerDetailList = new ArrayList<>();
            for (SellerInVehicle siv : vehicleSellers) {
                ArrivalSellerDetailDTO sellerDetail = new ArrivalSellerDetailDTO();
                sellerDetail.setSellerName(siv.getContactId() != null
                    ? contactNameById.getOrDefault(siv.getContactId(), "")
                    : (siv.getSellerName() != null ? siv.getSellerName() : ""));
                Contact sellerContact = siv.getContactId() != null ? contactById.get(siv.getContactId()) : null;
                String resolvedMark = null;
                if (sellerContact != null && sellerContact.getMark() != null && !sellerContact.getMark().isBlank()) {
                    resolvedMark = sellerContact.getMark().trim();
                } else if (siv.getSellerMark() != null && !siv.getSellerMark().isBlank()) {
                    resolvedMark = siv.getSellerMark().trim();
                }
                sellerDetail.setSellerMark(resolvedMark);
                List<Lot> sellerLots = lots.stream().filter(l -> l.getSellerVehicleId().equals(siv.getId())).toList();
                List<ArrivalLotDetailDTO> lotDetails = sellerLots.stream().map(lot -> {
                    ArrivalLotDetailDTO ld = new ArrivalLotDetailDTO();
                    ld.setId(lot.getId());
                    ld.setLotName(lot.getLotName());
                    return ld;
                }).toList();
                sellerDetail.setLots(lotDetails);
                sellerDetailList.add(sellerDetail);
            }
            dto.setSellers(sellerDetailList);
            return dto;
        }).toList();

        return new PageImpl<>(content, pageable, vehiclePage.getTotalElements());
    }

    /**
     * Validate seller mark uniqueness:
     * 1. No duplicate marks among sellers in the same vehicle.
     * 2. For dynamic sellers (contactId null), mark must not already exist for any contact of this trader.
     */
    private void validateSellerMarks(List<ArrivalSellerDTO> sellers, Long traderId, Long excludeContactId) {
        java.util.Set<String> seenMarks = new java.util.HashSet<>();
        for (ArrivalSellerDTO seller : sellers) {
            String mark = seller.getSellerMark();
            if (mark == null || mark.isBlank()) {
                continue;
            }
            String trimmedMark = mark.trim();
            String markLower = trimmedMark.toLowerCase();

            // 1. No duplicate marks within the same vehicle
            if (seenMarks.contains(markLower)) {
                throw new IllegalArgumentException("This mark is already in use by another seller in this vehicle. Marks must be unique.");
            }
            seenMarks.add(markLower);

            // 2. For dynamic sellers: mark must not exist in trader's contacts or in global (self-registered) contacts
            if (seller.getContactId() == null) {
                Optional<Contact> existingTraderContact = contactRepository.findOneByTraderIdAndMarkIgnoreCase(traderId, trimmedMark);
                if (existingTraderContact.isPresent() && (excludeContactId == null || !existingTraderContact.get().getId().equals(excludeContactId))) {
                    throw new IllegalArgumentException(
                        "This mark is already in use by a contact. Please choose a unique mark or select the seller from Contacts.");
                }
                Optional<Contact> existingGlobalContact = contactRepository.findOneByMarkAndTraderIdIsNull(trimmedMark);
                if (existingGlobalContact.isPresent()) {
                    throw new IllegalArgumentException(
                        "This mark is already in use by a registered contact. Please choose a unique mark or select the seller from Contacts.");
                }
            }
        }
    }

    private void validateUpdateSellers(List<ArrivalSellerDTO> sellers, Boolean multiSeller, Long traderId) {
        if (Boolean.FALSE.equals(multiSeller) && sellers.size() > 1) {
            throw new IllegalArgumentException("Single-seller arrival allows only one seller");
        }
        validateSellerMarks(sellers, traderId, null);
        for (ArrivalSellerDTO seller : sellers) {
            if (seller.getContactId() == null && seller.getSellerPhone() != null && !seller.getSellerPhone().isBlank()) {
                String phone = seller.getSellerPhone().trim();
                if (!phone.matches("[0-9]+") || phone.length() < 6 || phone.length() > 20) {
                    throw new IllegalArgumentException("Free-text seller phone must be digits only (6–20 digits)");
                }
            }
            if (seller.getLots() != null) {
                for (ArrivalLotDTO lot : seller.getLots()) {
                    if (lot.getLotName() != null
                        && !lot.getLotName().trim().isEmpty()
                        && !lot.getLotName().trim().matches("^[a-zA-Z0-9][a-zA-Z0-9\\s_\\-]*$")) {
                        throw new IllegalArgumentException("Lot name must be alphanumeric (spaces), and may include '-' and '_' : " + lot.getLotName());
                    }
                }
            }
        }
        validateUniqueLotNamesWithinSeller(sellers);
    }

    /**
     * Rules for a fully completed arrival (not a draft). Drafts skip this via {@code partiallyCompleted == true}
     * or {@code POST /api/arrivals/partial}.
     */
    private void validateCompletedArrival(ArrivalRequestDTO request) {
        List<ArrivalSellerDTO> sellers = request.getSellers() != null ? request.getSellers() : List.of();
        validateCompletedArrivalPayload(sellers, effectiveRequestMultiSeller(request), request.getVehicleNumber());
    }

    private void validateCompletedArrivalPayload(List<ArrivalSellerDTO> sellers, boolean multiSeller, String vehicleNumber) {
        if (sellers.isEmpty()) {
            throw new IllegalArgumentException("At least one seller is required");
        }
        if (multiSeller) {
            if (vehicleNumber == null || vehicleNumber.isBlank()) {
                throw new IllegalArgumentException("Vehicle number is required for multi-seller arrivals");
            }
            String vn = vehicleNumber.trim();
            if (vn.length() < 2 || vn.length() > 12) {
                throw new IllegalArgumentException("Vehicle number must be between 2 and 12 characters");
            }
        }
        for (ArrivalSellerDTO seller : sellers) {
            if (seller.getContactId() == null) {
                if (seller.getSellerName() == null || seller.getSellerName().isBlank()) {
                    throw new IllegalArgumentException("Free-text seller must have a name");
                }
            }
            List<ArrivalLotDTO> lots = seller.getLots() != null ? seller.getLots() : List.of();
            boolean hasCompleteLot = false;
            for (ArrivalLotDTO lot : lots) {
                if (lot.getLotName() != null
                    && !lot.getLotName().isBlank()
                    && lot.getCommodityName() != null
                    && !lot.getCommodityName().isBlank()
                    && lot.getBagCount() > 0) {
                    hasCompleteLot = true;
                    break;
                }
            }
            if (!hasCompleteLot) {
                throw new IllegalArgumentException("Each seller must have at least one lot with name, commodity, and quantity");
            }
        }
    }

    /**
     * Validate a completed arrival request. Only format/range checks when values are
     * present; no fields are required so users can save with minimal data.
     */
    private void validateRequest(ArrivalRequestDTO request) {
        List<ArrivalSellerDTO> sellers = request.getSellers() != null ? request.getSellers() : List.of();
        if (!effectiveRequestMultiSeller(request) && sellers.size() > 1) {
            throw new IllegalArgumentException("Single-seller arrival allows only one seller");
        }
        
        // Validate freight_kgs for BY_WEIGHT method
        if (request.getFreightMethod() == FreightMethod.BY_WEIGHT && request.getFreightKgs() != null) {
            if (request.getFreightKgs() <= 0) {
                throw new IllegalArgumentException("Freight kgs must be greater than 0 for BY_WEIGHT method");
            }
        }
        
        for (ArrivalSellerDTO seller : sellers) {
            if (seller.getContactId() == null && seller.getSellerPhone() != null && !seller.getSellerPhone().isBlank()) {
                String phone = seller.getSellerPhone().trim();
                if (!phone.matches("[0-9]+") || phone.length() < 6 || phone.length() > 20) {
                    throw new IllegalArgumentException("Free-text seller phone must be digits only (6–20 digits)");
                }
            }
            List<ArrivalLotDTO> lots = seller.getLots() != null ? seller.getLots() : List.of();
            for (ArrivalLotDTO lot : lots) {
                if (lot.getLotName() != null && !lot.getLotName().isBlank()
                    && !lot.getLotName().trim().matches("^[a-zA-Z0-9][a-zA-Z0-9\\s_\\-]*$")) {
                    throw new IllegalArgumentException("Lot name must be alphanumeric (spaces), and may include '-' and '_' : " + lot.getLotName());
                }
            }
        }
        if (!sellers.isEmpty()) {
            validateUniqueLotNamesWithinSeller(sellers);
        }
    }

    private void validateUniqueLotNamesWithinSeller(List<ArrivalSellerDTO> sellers) {
        for (ArrivalSellerDTO seller : sellers) {
            if (seller.getLots() == null || seller.getLots().isEmpty()) {
                continue;
            }
            Set<String> normalizedLotNames = new HashSet<>();
            for (ArrivalLotDTO lot : seller.getLots()) {
                String lotName = lot.getLotName();
                if (lotName == null || lotName.isBlank()) {
                    continue;
                }
                String normalized = lotName.trim().toLowerCase();
                if (!normalizedLotNames.add(normalized)) {
                    throw new IllegalArgumentException("Lot Name already exists for this seller");
                }
            }
        }
    }

    /**
     * Propagate per-arrival mark override to Contact.mark for global use.
     * Throws IllegalArgumentException if mark cannot be saved (conflict, length).
     */
    private void propagateMarkToContact(Contact contact, String mark, Long traderId) {
        if (mark == null || mark.isBlank()) return;
        String trimmed = mark.trim();
        
        // Validate length against Contact.mark column (varchar 20)
        if (trimmed.length() > 20) {
            throw new IllegalArgumentException(
                "Mark/alias must be 20 characters or less to save globally. Current: " + trimmed.length() + " chars"
            );
        }
        
        // Skip if already set to same value (case-insensitive)
        String current = contact.getMark() != null ? contact.getMark().trim() : "";
        if (trimmed.equalsIgnoreCase(current)) return;
        
        // Check conflicts with other trader contacts
        boolean conflictsTrader = contactRepository
            .findOneByTraderIdAndMarkIgnoreCaseAndIdNot(traderId, trimmed, contact.getId())
            .isPresent();
        if (conflictsTrader) {
            throw new IllegalArgumentException(
                "This mark is already in use by another contact. Please choose a unique mark."
            );
        }
        
        // Check conflicts with global self-registered contacts
        boolean conflictsGlobal = contactRepository
            .findOneByMarkAndTraderIdIsNull(trimmed)
            .isPresent();
        if (conflictsGlobal) {
            throw new IllegalArgumentException(
                "This mark is already in use by a registered contact. Please choose a unique mark."
            );
        }
        
        contact.setMark(trimmed);
        contactRepository.save(contact);
    }

    private Long resolveTraderId() {
        return traderContextService.getCurrentTraderId();
    }

    /**
     * Identity key for stable seller serial: registered contact; for free-text prefer {@code sellerMark} (unique per trader rules),
     * then phone digits, then normalized name. When this returns null, a one-off serial is allocated without persisting a mapping
     * (incomplete/partial rows).
     */
    private String resolveArrivalSellerSerialKey(ArrivalSellerDTO sellerDTO) {
        Long contactId = sellerDTO.getContactId();
        if (contactId != null) {
            return "c:" + contactId;
        }
        String sellerMark = sellerDTO.getSellerMark();
        if (sellerMark != null && !sellerMark.isBlank()) {
            String normMark = sellerMark.trim().toLowerCase();
            return "m:" + normMark;
        }
        String phone = sellerDTO.getSellerPhone();
        if (phone != null && !phone.isBlank()) {
            String digits = phone.trim().replaceAll("\\D+", "");
            if (digits.length() >= 6 && digits.length() <= 20) {
                return "p:" + digits;
            }
        }
        String name = sellerDTO.getSellerName();
        if (name != null && !name.isBlank()) {
            String norm = name.trim().toLowerCase().replaceAll("\\s+", " ");
            return "n:" + norm;
        }
        return null;
    }

    private int nextFreshSellerSerialForTrader(Long traderId, DailySerial lockedDailySerial, Set<Integer> usedInArrival) {
        int maxAlloc = dailySerialAllocationRepository
            .findMaxSerialNumberByTraderIdAndSerialDateAndKeyType(traderId, GLOBAL_SELLER_SERIAL_DATE, KEY_TYPE_ARRIVAL_SELLER)
            .orElse(0);
        int maxDaily = lockedDailySerial.getSellerSerial() != null ? lockedDailySerial.getSellerSerial() : 0;
        int base = Math.max(maxAlloc, maxDaily);
        return nextAvailableSellerSerial(base, usedInArrival);
    }

    private int currentLotSerialBaseForTrader(Long traderId, DailySerial lockedDailySerial) {
        int maxDaily = lockedDailySerial.getLotSerial() != null ? lockedDailySerial.getLotSerial() : 0;
        int maxHistorical = lotRepository.findMaxLotSerialNoByTraderId(traderId).orElse(0);
        return Math.max(maxDaily, maxHistorical);
    }

    /**
     * Assigns seller serial unique in this arrival; for known seller identity reuse persisted serial across all arrivals for the trader.
     */
    private int assignStableSellerSerial(
        Long traderId,
        ArrivalSellerDTO sellerDTO,
        DailySerial lockedDailySerial,
        Set<Integer> usedSellerSerialsInArrival,
        Set<String> seenKeysInArrival
    ) {
        String key = resolveArrivalSellerSerialKey(sellerDTO);
        if (key != null) {
            if (!seenKeysInArrival.add(key)) {
                throw new IllegalArgumentException(
                    "Duplicate seller identity in this arrival (same contact, mark, phone, or name). Remove the duplicate seller row."
                );
            }
            Optional<DailySerialAllocation> existing = dailySerialAllocationRepository.findOneByTraderIdAndSerialDateAndKeyTypeAndKeyValue(
                traderId,
                GLOBAL_SELLER_SERIAL_DATE,
                KEY_TYPE_ARRIVAL_SELLER,
                key
            );
            if (existing.isPresent()) {
                int serial = existing.get().getSerialNumber();
                if (!usedSellerSerialsInArrival.add(serial)) {
                    throw new IllegalStateException("Duplicate seller serial in the same arrival for different identities");
                }
                return serial;
            }
            int serial;
            Optional<Integer> legacy = Optional.empty();
            if (key.startsWith("c:")) {
                long cid = Long.parseLong(key.substring(2));
                legacy = lotRepository.findMinSellerSerialNoForContactAndTrader(cid, traderId);
            } else if (key.startsWith("m:")) {
                legacy = lotRepository.findMinSellerSerialNoForFreeTextMarkAndTrader(key.substring(2), traderId);
            }
            if (legacy.isPresent()) {
                int l = legacy.get();
                if (l < 1 || l > 9999) {
                    serial = nextFreshSellerSerialForTrader(traderId, lockedDailySerial, usedSellerSerialsInArrival);
                    if (!usedSellerSerialsInArrival.add(serial)) {
                        throw new IllegalStateException("Could not assign unique seller serial");
                    }
                } else if (usedSellerSerialsInArrival.contains(l)) {
                    throw new IllegalArgumentException("Duplicate seller serial in this arrival");
                } else {
                    serial = l;
                    usedSellerSerialsInArrival.add(serial);
                }
            } else {
                serial = nextFreshSellerSerialForTrader(traderId, lockedDailySerial, usedSellerSerialsInArrival);
                if (!usedSellerSerialsInArrival.add(serial)) {
                    throw new IllegalStateException("Could not assign unique seller serial");
                }
            }
            DailySerialAllocation alloc = new DailySerialAllocation();
            alloc.setTraderId(traderId);
            alloc.setSerialDate(GLOBAL_SELLER_SERIAL_DATE);
            alloc.setKeyType(KEY_TYPE_ARRIVAL_SELLER);
            alloc.setKeyValue(key);
            alloc.setSerialNumber(serial);
            dailySerialAllocationRepository.save(alloc);
            dailySerialAllocationRepository.flush();
            return serial;
        }
        int serial = nextFreshSellerSerialForTrader(traderId, lockedDailySerial, usedSellerSerialsInArrival);
        if (!usedSellerSerialsInArrival.add(serial)) {
            throw new IllegalStateException("Could not assign unique seller serial");
        }
        return serial;
    }

    private DailySerial getOrCreateGlobalSellerSerialForUpdate(Long traderId) {
        return dailySerialRepository
            .findOneByTraderIdAndSerialDateForUpdate(traderId, GLOBAL_SELLER_SERIAL_DATE)
            .orElseGet(() -> {
                DailySerial serial = new DailySerial();
                serial.setTraderId(traderId);
                serial.setSerialDate(GLOBAL_SELLER_SERIAL_DATE);
                serial.setSellerSerial(0);
                serial.setLotSerial(0);
                DailySerial saved = dailySerialRepository.saveAndFlush(serial);
                return dailySerialRepository.findOneByTraderIdAndSerialDateForUpdate(traderId, GLOBAL_SELLER_SERIAL_DATE).orElse(saved);
            });
    }

    private int nextSellerSerial(int currentSerial) {
        return currentSerial >= 9999 ? 1 : currentSerial + 1;
    }

    private int nextLotSerial(int currentSerial) {
        return currentSerial >= 9999 ? 1 : currentSerial + 1;
    }

    private int nextAvailableSellerSerial(int currentSerial, Set<Integer> reservedSerials) {
        int candidate = currentSerial;
        for (int attempt = 0; attempt < 10000; attempt++) {
            candidate = nextSellerSerial(candidate);
            if (!reservedSerials.contains(candidate)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("No seller serial numbers available for this arrival context");
    }

    private Long resolveCommodityId(Long traderId, String commodityName) {
        return commodityRepository
            .findOneByTraderIdAndCommodityNameIgnoreCase(traderId, commodityName)
            .map(Commodity::getId)
            .orElseThrow(() -> new IllegalArgumentException("Commodity not found: " + commodityName));
    }

    private double computeFreightTotal(
        FreightMethod method,
        Double rate,
        Double freightKgs,
        double finalBillableWeight,
        List<Lot> lots,
        boolean noRental
    ) {
        if (noRental) {
            return 0d;
        }
        double safeRate = rate != null ? rate : 0d;
        double safeKgs = freightKgs != null ? freightKgs : 1.0d;
        switch (method) {
            case BY_WEIGHT:
                if (safeKgs <= 0d) return 0d;
                return (finalBillableWeight * safeRate) / safeKgs;
            case BY_COUNT:
                int totalBags = lots.stream().mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0).sum();
                return totalBags * safeRate;
            case LUMPSUM:
            case DIVIDE_BY_WEIGHT:
                return safeRate;
            default:
                return 0d;
        }
    }

    private void createVoucher(Long traderId, String referenceType, Long referenceId, double amount, Instant now) {
        Voucher voucher = new Voucher();
        voucher.setTraderId(traderId);
        voucher.setReferenceType(referenceType);
        voucher.setReferenceId(referenceId);
        voucher.setAmount(BigDecimal.valueOf(amount));
        voucher.setStatus(VoucherStatus.OPEN);
        voucher.setCreatedAt(now);
        voucherRepository.save(voucher);
    }

    private void distributeFreight(FreightCalculation freight, List<Lot> lots, double freightTotal) {
        int totalBags = lots.stream().mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0).sum();
        if (totalBags <= 0) {
            return;
        }
        List<FreightDistribution> rows = new ArrayList<>();
        for (Lot lot : lots) {
            double share = (double) lot.getBagCount() / (double) totalBags;
            double amount = freightTotal * share;
            FreightDistribution fd = new FreightDistribution();
            fd.setFreightId(freight.getId());
            fd.setLotId(lot.getId());
            fd.setAllocatedAmount(amount);
            rows.add(fd);
        }
        freightDistributionRepository.saveAll(rows);
    }

    private String normalizeVehicleNumber(ArrivalRequestDTO request) {
        if (!effectiveRequestMultiSeller(request)) {
            String provided = request.getVehicleNumber();
            if (provided == null || provided.isBlank()) {
                return "SINGLE-SELLER";
            }
            return provided.trim().toUpperCase();
        }
        String vn = request.getVehicleNumber();
        if (vn == null || vn.isBlank()) return null;
        return vn.trim().toUpperCase();
    }

    /** Max length for {@code vehicle.vehicle_mark_alias}; alphanumeric ASCII only when non-blank. */
    public static final int VEHICLE_MARK_ALIAS_MAX_LEN = 8;

    /**
     * Trims vehicle mark/alias; blank becomes null. Non-blank must be at most {@link #VEHICLE_MARK_ALIAS_MAX_LEN} characters
     * and match {@code [A-Za-z0-9]+}.
     */
    static String normalizeVehicleMarkAlias(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.trim();
        if (t.isEmpty()) {
            return null;
        }
        if (t.length() > VEHICLE_MARK_ALIAS_MAX_LEN) {
            throw new IllegalArgumentException(
                "Vehicle mark/alias must be at most " + VEHICLE_MARK_ALIAS_MAX_LEN + " characters."
            );
        }
        if (!t.matches("[A-Za-z0-9]+")) {
            throw new IllegalArgumentException(
                "Vehicle mark/alias must contain only letters and numbers (A–Z, a–z, 0–9)."
            );
        }
        return t;
    }

    private void assertVehicleMarkAliasUnique(String normalizedAlias, Long excludeVehicleId) {
        if (normalizedAlias == null) {
            return;
        }
        String key = normalizedAlias.toLowerCase();
        boolean taken =
            excludeVehicleId == null
                ? vehicleRepository.existsByNormalizedVehicleMarkAlias(key)
                : vehicleRepository.existsByNormalizedVehicleMarkAliasExcludingId(key, excludeVehicleId);
        if (taken) {
            throw new IllegalArgumentException(VEHICLE_MARK_ALIAS_DUPLICATE_MESSAGE);
        }
    }
}

