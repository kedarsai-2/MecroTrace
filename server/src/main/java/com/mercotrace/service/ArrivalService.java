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
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
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

    private final VehicleRepository vehicleRepository;
    private final VehicleWeightRepository vehicleWeightRepository;
    private final SellerInVehicleRepository sellerInVehicleRepository;
    private final LotRepository lotRepository;
    private final FreightCalculationRepository freightCalculationRepository;
    private final FreightDistributionRepository freightDistributionRepository;
    private final VoucherRepository voucherRepository;
    private final DailySerialRepository dailySerialRepository;
    private final CommodityRepository commodityRepository;
    private final ContactRepository contactRepository;
    private final ContactService contactService;
    private final TraderContextService traderContextService;
    private final AuctionRepository auctionRepository;
    private final AuctionEntryRepository auctionEntryRepository;
    private final WeighingSessionRepository weighingSessionRepository;

    public ArrivalService(
        VehicleRepository vehicleRepository,
        VehicleWeightRepository vehicleWeightRepository,
        SellerInVehicleRepository sellerInVehicleRepository,
        LotRepository lotRepository,
        FreightCalculationRepository freightCalculationRepository,
        FreightDistributionRepository freightDistributionRepository,
        VoucherRepository voucherRepository,
        DailySerialRepository dailySerialRepository,
        CommodityRepository commodityRepository,
        ContactRepository contactRepository,
        ContactService contactService,
        TraderContextService traderContextService,
        AuctionRepository auctionRepository,
        AuctionEntryRepository auctionEntryRepository,
        WeighingSessionRepository weighingSessionRepository
    ) {
        this.vehicleRepository = vehicleRepository;
        this.vehicleWeightRepository = vehicleWeightRepository;
        this.sellerInVehicleRepository = sellerInVehicleRepository;
        this.lotRepository = lotRepository;
        this.freightCalculationRepository = freightCalculationRepository;
        this.freightDistributionRepository = freightDistributionRepository;
        this.voucherRepository = voucherRepository;
        this.dailySerialRepository = dailySerialRepository;
        this.commodityRepository = commodityRepository;
        this.contactRepository = contactRepository;
        this.contactService = contactService;
        this.traderContextService = traderContextService;
        this.auctionRepository = auctionRepository;
        this.auctionEntryRepository = auctionEntryRepository;
        this.weighingSessionRepository = weighingSessionRepository;
    }

    /**
     * Create a new arrival with vehicle, weight, sellers, lots, and freight side effects.
     */
    public ArrivalSummaryDTO createArrival(@Valid ArrivalRequestDTO request) {
        validateRequest(request);

        Long traderId = resolveTraderId();
        validateSellerMarks(request.getSellers(), traderId, null);

        Instant now = Instant.now();
        double netWeight = Math.max(0d, request.getLoadedWeight() - request.getEmptyWeight());
        double finalBillableWeight = Math.max(0d, netWeight - request.getDeductedWeight());

        Vehicle vehicle = new Vehicle();
        String vehicleNumber = normalizeVehicleNumber(request);
        vehicle.setTraderId(traderId);
        vehicle.setVehicleNumber(vehicleNumber);
        vehicle.setArrivalDatetime(now);
        vehicle.setCreatedAt(now);
        if (request.getGodown() != null) vehicle.setGodown(request.getGodown());
        if (request.getGatepassNumber() != null) vehicle.setGatepassNumber(request.getGatepassNumber());
        if (request.getOrigin() != null) vehicle.setOrigin(request.getOrigin());
        if (request.getBrokerName() != null) vehicle.setBrokerName(request.getBrokerName().trim());
        if (request.getNarration() != null) vehicle.setNarration(request.getNarration().trim());
        vehicle = vehicleRepository.save(vehicle);

        VehicleWeight weight = new VehicleWeight();
        weight.setVehicleId(vehicle.getId());
        weight.setLoadedWeight(request.getLoadedWeight());
        weight.setEmptyWeight(request.getEmptyWeight());
        weight.setDeductedWeight(request.getDeductedWeight());
        weight.setNetWeight(netWeight);
        weight.setRecordedAt(now);
        vehicleWeightRepository.save(weight);

        DailySerial dailySerial = getOrCreateGlobalSellerSerialForUpdate(traderId);
        int sellerSerial = dailySerial.getSellerSerial() != null ? dailySerial.getSellerSerial() : 0;
        int arrivalLotSerial = 0;

        List<SellerInVehicle> sellerLinks = new ArrayList<>();
        List<Lot> lots = new ArrayList<>();

        Long brokerContactId = request.getBrokerContactId();
        for (ArrivalSellerDTO sellerDTO : request.getSellers()) {
            SellerInVehicle sellerInVehicle = new SellerInVehicle();
            sellerInVehicle.setVehicleId(vehicle.getId());
            Long contactId = sellerDTO.getContactId();
            if (contactId != null) {
                contactRepository.findById(contactId).orElseThrow(() ->
                    new IllegalArgumentException("Seller contact not found: " + contactId)
                );
                contactService.ensureTraderUsesPortalContact(traderId, contactId);
                sellerInVehicle.setContactId(contactId);
            } else {
                if (sellerDTO.getSellerName() == null || sellerDTO.getSellerName().isBlank()) {
                    throw new IllegalArgumentException("Free-text seller must have a name");
                }
                sellerInVehicle.setContactId(null);
                sellerInVehicle.setSellerName(sellerDTO.getSellerName().trim());
                sellerInVehicle.setSellerPhone(sellerDTO.getSellerPhone() != null ? sellerDTO.getSellerPhone().trim() : null);
                sellerInVehicle.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
            }
            if (brokerContactId != null) {
                sellerInVehicle.setBrokerId(brokerContactId);
            }
            sellerInVehicle = sellerInVehicleRepository.save(sellerInVehicle);
            sellerLinks.add(sellerInVehicle);

            sellerSerial = nextSellerSerial(sellerSerial);
            for (ArrivalLotDTO lotDTO : sellerDTO.getLots()) {
                Lot lot = new Lot();
                lot.setSellerVehicleId(sellerInVehicle.getId());
                lot.setCommodityId(resolveCommodityId(traderId, lotDTO.getCommodityName()));
                lot.setLotName(lotDTO.getLotName().trim());
                lot.setBagCount(lotDTO.getBagCount());
                if (lotDTO.getVariant() != null && !lotDTO.getVariant().isBlank()) lot.setVariant(lotDTO.getVariant().trim());
                if (lotDTO.getBrokerTag() != null && !lotDTO.getBrokerTag().isBlank()) lot.setBrokerTag(lotDTO.getBrokerTag().trim());
                lot.setSellerSerialNo(sellerSerial);
                arrivalLotSerial = nextLotSerial(arrivalLotSerial);
                lot.setLotSerialNo(arrivalLotSerial);
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

        dailySerial.setSellerSerial(sellerSerial);
        if (dailySerial.getLotSerial() == null) {
            dailySerial.setLotSerial(0);
        }
        dailySerialRepository.save(dailySerial);

        double freightTotal = computeFreightTotal(request.getFreightMethod(), request.getFreightRate(), finalBillableWeight, lots, request.isNoRental());

        FreightCalculation freight = new FreightCalculation();
        freight.setVehicleId(vehicle.getId());
        freight.setMethod(request.getFreightMethod());
        freight.setRate(request.getFreightRate());
        freight.setTotalAmount(freightTotal);
        freight.setNoRental(request.isNoRental());
        freight.setAdvancePaid(request.getAdvancePaid());
        freight.setCreatedAt(now);
        freight = freightCalculationRepository.save(freight);

        if (!request.isNoRental() && freightTotal > 0d) {
            createVoucher(traderId, "FREIGHT", vehicle.getId(), freightTotal, now);
        }

        if (request.getAdvancePaid() != null && request.getAdvancePaid() > 0d) {
            createVoucher(traderId, "ADVANCE", vehicle.getId(), request.getAdvancePaid(), now);
        }

        if (request.getFreightMethod() == FreightMethod.DIVIDE_BY_WEIGHT && !lots.isEmpty() && freightTotal > 0d) {
            distributeFreight(freight, lots, freightTotal);
        }

        ArrivalSummaryDTO summary = new ArrivalSummaryDTO();
        summary.setVehicleId(vehicle.getId());
        summary.setVehicleNumber(vehicle.getVehicleNumber());
        summary.setSellerCount(sellerLinks.size());
        summary.setLotCount(lots.size());
        summary.setNetWeight(netWeight);
        summary.setFinalBillableWeight(finalBillableWeight);
        summary.setFreightTotal(freightTotal);
        summary.setFreightMethod(request.getFreightMethod());
        summary.setArrivalDatetime(vehicle.getArrivalDatetime());
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
        return listArrivals(pageable, null);
    }

    @Transactional(readOnly = true)
    public Page<ArrivalSummaryDTO> listArrivals(Pageable pageable, String statusFilter) {
        Long traderId = resolveTraderId();

        Page<Vehicle> vehiclePage = vehicleRepository.findAllByTraderIdOrderByArrivalDatetimeDesc(traderId, pageable);
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
                sellerFull.setSellerMark(contactMarkById.getOrDefault(siv.getContactId(), ""));
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
        dto.setSellers(sellerFullList);
        return dto;
    }

    /**
     * Update arrival: vehicle metadata, weights, and/or freight. All fields optional. Trader-scoped.
     */
    @Transactional
    public ArrivalSummaryDTO updateArrival(Long vehicleId, ArrivalUpdateDTO update) {
        Long traderId = resolveTraderId();
        Vehicle vehicle = vehicleRepository.findById(vehicleId)
            .orElseThrow(() -> new IllegalArgumentException("Arrival not found: " + vehicleId));
        if (!vehicle.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Arrival not found: " + vehicleId);
        }

        if (update.getVehicleNumber() != null && !update.getVehicleNumber().isBlank()) {
            vehicle.setVehicleNumber(update.getVehicleNumber().trim().toUpperCase());
        }
        if (update.getGodown() != null) vehicle.setGodown(update.getGodown());
        if (update.getGatepassNumber() != null) vehicle.setGatepassNumber(update.getGatepassNumber());
        if (update.getOrigin() != null) vehicle.setOrigin(update.getOrigin());
        if (update.getBrokerName() != null) vehicle.setBrokerName(update.getBrokerName().trim());
        if (update.getNarration() != null) vehicle.setNarration(update.getNarration().trim());
        vehicle = vehicleRepository.save(vehicle);
        final Vehicle vehicleRef = vehicle;

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

        boolean sellersReplaced = false;
        List<Lot> currentLots = new ArrayList<>();
        if (update.getSellers() != null && !update.getSellers().isEmpty()) {
            validateUpdateSellers(update.getSellers(), update.getMultiSeller(), traderId);
            List<SellerInVehicle> existingSellers = sellerInVehicleRepository.findAllByVehicleId(vehicleId);
            List<Long> existingSellerVehicleIds = existingSellers.stream().map(SellerInVehicle::getId).toList();
            if (!existingSellerVehicleIds.isEmpty()) {
                freightCalculationRepository.findOneByVehicleId(vehicleId)
                    .ifPresent(fc -> freightDistributionRepository.deleteByFreightId(fc.getId()));
                List<Lot> lotsToRemove = lotRepository.findAllBySellerVehicleIdIn(existingSellerVehicleIds);
                List<Long> lotIdsToRemove = lotsToRemove.stream().map(Lot::getId).toList();
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
            DailySerial dailySerial = null;
            int sellerSerial = 0;
            Set<Integer> usedSellerSerials = new HashSet<>();
            Set<Integer> usedLotSerialsAcrossArrival = new HashSet<>();
            int arrivalLotSerial = 0;
            Long updateBrokerContactId = update.getBrokerContactId();
            for (ArrivalSellerDTO sellerDTO : update.getSellers()) {
                SellerInVehicle siv = new SellerInVehicle();
                siv.setVehicleId(vehicleId);
                Long contactId = sellerDTO.getContactId();
                if (contactId != null) {
                    contactRepository.findById(contactId).orElseThrow(() ->
                        new IllegalArgumentException("Seller contact not found: " + contactId));
                    contactService.ensureTraderUsesPortalContact(traderId, contactId);
                    siv.setContactId(contactId);
                } else {
                    if (sellerDTO.getSellerName() == null || sellerDTO.getSellerName().isBlank()) {
                        throw new IllegalArgumentException("Free-text seller must have a name");
                    }
                    String phone = sellerDTO.getSellerPhone() != null ? sellerDTO.getSellerPhone().trim() : null;
                    if (phone != null && !phone.isEmpty()) {
                        if (!phone.matches("[0-9]+") || phone.length() < 6 || phone.length() > 20) {
                            throw new IllegalArgumentException("Free-text seller phone must be digits only (6–20 digits)");
                        }
                    }
                    siv.setContactId(null);
                    siv.setSellerName(sellerDTO.getSellerName().trim());
                    siv.setSellerPhone(phone);
                    siv.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
                }
                if (updateBrokerContactId != null) {
                    siv.setBrokerId(updateBrokerContactId);
                }
                siv = sellerInVehicleRepository.save(siv);
                Integer requestedSerial = normalizeSellerSerialNumber(sellerDTO.getSellerSerialNumber());
                if (requestedSerial != null) {
                    if (!usedSellerSerials.add(requestedSerial)) {
                        throw new IllegalArgumentException("Duplicate seller serial number in arrival update: " + requestedSerial);
                    }
                } else {
                    if (dailySerial == null) {
                        dailySerial = getOrCreateGlobalSellerSerialForUpdate(traderId);
                        sellerSerial = dailySerial.getSellerSerial() != null ? dailySerial.getSellerSerial() : 0;
                    }
                    requestedSerial = nextAvailableSellerSerial(sellerSerial, usedSellerSerials);
                    sellerSerial = requestedSerial;
                    usedSellerSerials.add(requestedSerial);
                }
                for (ArrivalLotDTO lotDTO : sellerDTO.getLots()) {
                    Lot lot = new Lot();
                    lot.setSellerVehicleId(siv.getId());
                    lot.setCommodityId(resolveCommodityId(traderId, lotDTO.getCommodityName()));
                    lot.setLotName(lotDTO.getLotName().trim());
                    lot.setBagCount(lotDTO.getBagCount());
                    if (lotDTO.getVariant() != null && !lotDTO.getVariant().isBlank()) lot.setVariant(lotDTO.getVariant().trim());
                    if (lotDTO.getBrokerTag() != null && !lotDTO.getBrokerTag().isBlank()) lot.setBrokerTag(lotDTO.getBrokerTag().trim());
                    lot.setSellerSerialNo(requestedSerial);
                    Integer requestedLotSerial = normalizeLotSerialNumber(lotDTO.getLotSerialNumber());
                    if (requestedLotSerial != null) {
                        if (!usedLotSerialsAcrossArrival.add(requestedLotSerial)) {
                            throw new IllegalArgumentException("Duplicate lot serial number in arrival update: " + requestedLotSerial);
                        }
                        arrivalLotSerial = Math.max(arrivalLotSerial, requestedLotSerial);
                    } else {
                        requestedLotSerial = nextAvailableLotSerial(arrivalLotSerial, usedLotSerialsAcrossArrival);
                        arrivalLotSerial = requestedLotSerial;
                        usedLotSerialsAcrossArrival.add(requestedLotSerial);
                    }
                    lot.setLotSerialNo(requestedLotSerial);
                    lot.setCreatedAt(now);
                    currentLots.add(lot);
                }
            }
            if (dailySerial != null) {
                dailySerial.setSellerSerial(sellerSerial);
                if (dailySerial.getLotSerial() == null) {
                    dailySerial.setLotSerial(0);
                }
                dailySerialRepository.save(dailySerial);
            }
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
            || update.getNoRental() != null || update.getAdvancePaid() != null || sellersReplaced;
        if (updateFreight && freightOpt.isPresent()) {
            FreightCalculation freight = freightOpt.get();
            if (update.getFreightMethod() != null) freight.setMethod(update.getFreightMethod());
            if (update.getFreightRate() != null) freight.setRate(update.getFreightRate());
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
                freight.getMethod(),
                freight.getRate(),
                finalBillable,
                lotsForFreight,
                Boolean.TRUE.equals(freight.getNoRental())
            );
            freight.setTotalAmount(freightTotal);
            freight = freightCalculationRepository.save(freight);

            voucherRepository.deleteByReferenceTypeAndReferenceId("FREIGHT", vehicleId);
            voucherRepository.deleteByReferenceTypeAndReferenceId("ADVANCE", vehicleId);
            Instant now = Instant.now();
            if (!Boolean.TRUE.equals(freight.getNoRental()) && freightTotal > 0d) {
                createVoucher(traderId, "FREIGHT", vehicleId, freightTotal, now);
            }
            if (freight.getAdvancePaid() != null && freight.getAdvancePaid() > 0d) {
                createVoucher(traderId, "ADVANCE", vehicleId, freight.getAdvancePaid(), now);
            }

            if (freight.getMethod() == FreightMethod.DIVIDE_BY_WEIGHT && !lotsForFreight.isEmpty() && freightTotal > 0d) {
                freightDistributionRepository.deleteByFreightId(freight.getId());
                distributeFreight(freight, lotsForFreight, freightTotal);
            }
        }

        return toSummary(vehicle);
    }

    /**
     * Delete arrival (vehicle and all related records). Trader-scoped.
     */
    @Transactional
    public void deleteArrival(Long vehicleId) {
        Long traderId = resolveTraderId();
        Vehicle vehicle = vehicleRepository.findById(vehicleId)
            .orElseThrow(() -> new IllegalArgumentException("Arrival not found: " + vehicleId));
        if (!vehicle.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Arrival not found: " + vehicleId);
        }
        Optional<FreightCalculation> freightOpt = freightCalculationRepository.findOneByVehicleId(vehicleId);
        freightOpt.ifPresent(fc -> freightDistributionRepository.deleteByFreightId(fc.getId()));
        freightCalculationRepository.deleteByVehicleId(vehicleId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("FREIGHT", vehicleId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("ADVANCE", vehicleId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("COOLIE", vehicleId);
        List<SellerInVehicle> sellers = sellerInVehicleRepository.findAllByVehicleId(vehicleId);
        List<Long> sellerVehicleIds = sellers.stream().map(SellerInVehicle::getId).toList();
        if (!sellerVehicleIds.isEmpty()) {
            List<Lot> lotsToRemove = lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds);
            List<Long> lotIdsToRemove = lotsToRemove.stream().map(Lot::getId).toList();
            if (!lotIdsToRemove.isEmpty()) {
                List<Auction> auctionsForLots = auctionRepository.findAllByLotIdIn(lotIdsToRemove);
                List<Long> auctionIds = auctionsForLots.stream().map(Auction::getId).toList();
                if (!auctionIds.isEmpty()) {
                    auctionEntryRepository.deleteByAuctionIdIn(auctionIds);
                }
                auctionRepository.deleteByLotIdIn(lotIdsToRemove);
            }
            lotRepository.deleteBySellerVehicleIdIn(sellerVehicleIds);
        }
        sellerInVehicleRepository.deleteByVehicleId(vehicleId);
        vehicleWeightRepository.deleteByVehicleId(vehicleId);
        vehicleRepository.delete(vehicle);
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

        List<ArrivalDetailDTO> content = vehicles.stream().map(v -> {
            ArrivalDetailDTO dto = new ArrivalDetailDTO();
            dto.setVehicleId(v.getId());
            dto.setVehicleNumber(v.getVehicleNumber());
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

    private void validateRequest(ArrivalRequestDTO request) {
        if (request.getSellers() == null || request.getSellers().isEmpty()) {
            throw new IllegalArgumentException("At least one seller is required");
        }
        if (!request.isMultiSeller() && request.getSellers().size() > 1) {
            throw new IllegalArgumentException("Single-seller arrival allows only one seller");
        }
        for (ArrivalSellerDTO seller : request.getSellers()) {
            if (seller.getContactId() == null) {
                if (seller.getSellerPhone() != null && !seller.getSellerPhone().isBlank()) {
                    String phone = seller.getSellerPhone().trim();
                    if (!phone.matches("[0-9]+") || phone.length() < 6 || phone.length() > 20) {
                        throw new IllegalArgumentException("Free-text seller phone must be digits only (6–20 digits)");
                    }
                }
            }
            if (seller.getLots() == null || seller.getLots().isEmpty()) {
                throw new IllegalArgumentException("Each seller must have at least one lot");
            }
            for (ArrivalLotDTO lot : seller.getLots()) {
                if (lot.getLotName() == null || lot.getLotName().isBlank()) {
                    throw new IllegalArgumentException("Lot name is required");
                }
                if (!lot.getLotName().trim().matches("^[a-zA-Z0-9][a-zA-Z0-9\\s_\\-]*$")) {
                    throw new IllegalArgumentException("Lot name must be alphanumeric (spaces), and may include '-' and '_' : " + lot.getLotName());
                }
                if (lot.getBagCount() <= 0) {
                    throw new IllegalArgumentException("Lot bag count must be greater than 0");
                }
            }
        }
        validateUniqueLotNamesWithinSeller(request.getSellers());
        if (request.isMultiSeller()) {
            if (request.getVehicleNumber() == null || request.getVehicleNumber().isBlank()) {
                throw new IllegalArgumentException("Vehicle number is required for multi-seller arrivals");
            }
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

    private Long resolveTraderId() {
        return traderContextService.getCurrentTraderId();
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

    private int nextAvailableLotSerial(int currentSerial, Set<Integer> reservedSerials) {
        int candidate = currentSerial;
        for (int attempt = 0; attempt < 9999; attempt++) {
            candidate = nextLotSerial(candidate);
            if (!reservedSerials.contains(candidate)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("No lot serial numbers available for this seller context");
    }

    private Integer normalizeSellerSerialNumber(Integer sellerSerialNumber) {
        if (sellerSerialNumber == null) {
            return null;
        }
        if (sellerSerialNumber < 1 || sellerSerialNumber > 9999) {
            throw new IllegalArgumentException("Seller serial number must be between 1 and 9999");
        }
        return sellerSerialNumber;
    }

    private Integer normalizeLotSerialNumber(Integer lotSerialNumber) {
        if (lotSerialNumber == null) {
            return null;
        }
        if (lotSerialNumber < 1 || lotSerialNumber > 9999) {
            throw new IllegalArgumentException("Lot serial number must be between 1 and 9999");
        }
        return lotSerialNumber;
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
        double finalBillableWeight,
        List<Lot> lots,
        boolean noRental
    ) {
        if (noRental) {
            return 0d;
        }
        double safeRate = rate != null ? rate : 0d;
        switch (method) {
            case BY_WEIGHT:
                return finalBillableWeight * safeRate;
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
        if (!request.isMultiSeller()) {
            String provided = request.getVehicleNumber();
            if (provided == null || provided.isBlank()) {
                return "SINGLE-SELLER";
            }
            return provided.trim().toUpperCase();
        }
        return request.getVehicleNumber() != null ? request.getVehicleNumber().trim().toUpperCase() : "";
    }
}

