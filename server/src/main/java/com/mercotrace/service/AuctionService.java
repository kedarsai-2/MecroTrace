package com.mercotrace.service;

import com.mercotrace.domain.Auction;
import com.mercotrace.domain.AuctionEntry;
import com.mercotrace.domain.AuctionSelfSaleUnit;
import com.mercotrace.domain.Commodity;
import com.mercotrace.domain.Contact;
import com.mercotrace.domain.Lot;
import com.mercotrace.domain.SellerInVehicle;
import com.mercotrace.domain.Vehicle;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import com.mercotrace.domain.enumeration.AuctionSelfSaleUnitStatus;
import com.mercotrace.repository.AuctionEntryRepository;
import com.mercotrace.repository.AuctionRepository;
import com.mercotrace.repository.AuctionSelfSaleUnitRepository;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.LotRepository;
import com.mercotrace.repository.PrintLogRepository;
import com.mercotrace.repository.SellerInVehicleRepository;
import com.mercotrace.repository.VehicleRepository;
import com.mercotrace.service.dto.*;
import com.mercotrace.service.mapper.AuctionEntryMapper;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.Collection;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service layer for Auction (Sales Pad) operations.
 */
@Service
@Transactional
public class AuctionService {

    private static final Logger LOG = LoggerFactory.getLogger(AuctionService.class);

    /** Newest completed auctions first so paginated "all results" clients see recent billing candidates first. */
    private static final Sort DEFAULT_COMPLETED_AUCTION_SORT = Sort.by(Sort.Order.desc("completedAt"), Sort.Order.desc("id"));

    /** Calendar day for temporary-buyer expiry (scribble marks); aligns with primary market timezone. */
    private static final ZoneId BUSINESS_CALENDAR_ZONE = ZoneId.of("Asia/Kolkata");

    /** Sums of lot bag counts: per vehicle (all sellers) and per seller-in-vehicle row. */
    private static final class VehicleSellerQtyIndex {

        final Map<Long, Integer> vehicleIdToTotal;
        final Map<Long, Integer> sellerVehicleIdToTotal;

        VehicleSellerQtyIndex(Map<Long, Integer> vehicleIdToTotal, Map<Long, Integer> sellerVehicleIdToTotal) {
            this.vehicleIdToTotal = vehicleIdToTotal;
            this.sellerVehicleIdToTotal = sellerVehicleIdToTotal;
        }
    }

    private VehicleSellerQtyIndex buildVehicleSellerQtyIndex(Set<Long> vehicleIds) {
        if (vehicleIds == null || vehicleIds.isEmpty()) {
            return new VehicleSellerQtyIndex(Map.of(), Map.of());
        }
        List<SellerInVehicle> allSivsForVehicles = sellerInVehicleRepository.findAllByVehicleIdIn(vehicleIds);
        Set<Long> allSivIds = allSivsForVehicles.stream().map(SellerInVehicle::getId).collect(Collectors.toSet());
        List<Lot> allLotsOnVehicles = allSivIds.isEmpty() ? List.of() : lotRepository.findAllBySellerVehicleIdIn(allSivIds);
        Map<Long, Integer> sellerVehicleIdToTotal = new HashMap<>();
        for (Lot l : allLotsOnVehicles) {
            if (l.getSellerVehicleId() != null) {
                sellerVehicleIdToTotal.merge(l.getSellerVehicleId(), l.getBagCount() != null ? l.getBagCount() : 0, Integer::sum);
            }
        }
        Map<Long, Integer> vehicleIdToTotal = new HashMap<>();
        for (Long vid : vehicleIds) {
            List<Long> sivIdsOfVehicle = allSivsForVehicles
                .stream()
                .filter(s -> vid.equals(s.getVehicleId()))
                .map(SellerInVehicle::getId)
                .toList();
            int total = allLotsOnVehicles
                .stream()
                .filter(l -> sivIdsOfVehicle.contains(l.getSellerVehicleId()))
                .mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0)
                .sum();
            vehicleIdToTotal.put(vid, total);
        }
        return new VehicleSellerQtyIndex(vehicleIdToTotal, sellerVehicleIdToTotal);
    }

    private final AuctionRepository auctionRepository;
    private final AuctionEntryRepository auctionEntryRepository;
    private final LotRepository lotRepository;
    private final AuctionEntryMapper auctionEntryMapper;
    private final SellerInVehicleRepository sellerInVehicleRepository;
    private final VehicleRepository vehicleRepository;
    private final ContactRepository contactRepository;
    private final ContactService contactService;
    private final CommodityRepository commodityRepository;
    private final TraderContextService traderContextService;
    private final AuctionSelfSaleUnitRepository auctionSelfSaleUnitRepository;
    private final PrintLogRepository printLogRepository;

    /** Matches client Print Hub `BUYER_CHITI_BID` — per-bid print completion key {@code lotId:bidNumber}. */
    private static final String PRINT_LOG_BUYER_CHITI_BID = "BUYER_CHITI_BID";

    public AuctionService(
        AuctionRepository auctionRepository,
        AuctionEntryRepository auctionEntryRepository,
        LotRepository lotRepository,
        AuctionEntryMapper auctionEntryMapper,
        SellerInVehicleRepository sellerInVehicleRepository,
        VehicleRepository vehicleRepository,
        ContactRepository contactRepository,
        ContactService contactService,
        CommodityRepository commodityRepository,
        TraderContextService traderContextService,
        AuctionSelfSaleUnitRepository auctionSelfSaleUnitRepository,
        PrintLogRepository printLogRepository
    ) {
        this.auctionRepository = auctionRepository;
        this.auctionEntryRepository = auctionEntryRepository;
        this.lotRepository = lotRepository;
        this.auctionEntryMapper = auctionEntryMapper;
        this.sellerInVehicleRepository = sellerInVehicleRepository;
        this.vehicleRepository = vehicleRepository;
        this.contactRepository = contactRepository;
        this.contactService = contactService;
        this.commodityRepository = commodityRepository;
        this.traderContextService = traderContextService;
        this.auctionSelfSaleUnitRepository = auctionSelfSaleUnitRepository;
        this.printLogRepository = printLogRepository;
    }

    /** Contact-linked sellers: use contact name/mark. Free-text sellers (no contact): use SellerInVehicle fields. */
    private static String resolveAuctionSellerName(Contact c, SellerInVehicle siv) {
        if (c != null && c.getName() != null && !c.getName().isBlank()) {
            return c.getName();
        }
        return siv != null && siv.getSellerName() != null && !siv.getSellerName().isBlank() ? siv.getSellerName() : null;
    }

    private static String resolveAuctionSellerMark(Contact c, SellerInVehicle siv) {
        if (c != null && c.getMark() != null && !c.getMark().isBlank()) {
            return c.getMark();
        }
        return siv != null && siv.getSellerMark() != null && !siv.getSellerMark().isBlank() ? siv.getSellerMark() : null;
    }

    /**
     * List lots with auction-derived status and optional search, for Sales Pad lot selector.
     * Scoped to the current trader: lots whose seller_vehicle links to a vehicle with that trader_id.
     */
    @Transactional(readOnly = true)
    public Page<LotSummaryDTO> listLotsWithStatus(Pageable pageable, String statusFilter, String q) {
        Long traderId = resolveTraderId();
        Page<Lot> lotPage = (q != null && !q.isBlank())
            ? lotRepository.findAllByTraderIdAndLotNameContainingIgnoreCase(traderId, q.trim(), pageable)
            : lotRepository.findAllByTraderId(traderId, pageable);
        List<Lot> lots = lotPage.getContent();
        if (lots.isEmpty()) {
            return Page.empty(pageable);
        }
        List<Long> lotIds = lots.stream().map(Lot::getId).toList();
        Set<Long> sellerVehicleIds = lots.stream().map(Lot::getSellerVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> commodityIds = lots.stream().map(Lot::getCommodityId).filter(Objects::nonNull).collect(Collectors.toSet());

        Map<Long, SellerInVehicle> sivMap = sellerInVehicleRepository.findAllById(sellerVehicleIds).stream()
            .collect(Collectors.toMap(SellerInVehicle::getId, s -> s));
        Set<Long> vehicleIds = sivMap.values().stream().map(SellerInVehicle::getVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> contactIds = sivMap.values().stream().map(SellerInVehicle::getContactId).filter(Objects::nonNull).collect(Collectors.toSet());

        Map<Long, Vehicle> vehicleMap = vehicleRepository.findAllById(vehicleIds).stream()
            .collect(Collectors.toMap(Vehicle::getId, v -> v));
        Map<Long, Contact> contactMap = contactRepository.findAllById(contactIds).stream()
            .collect(Collectors.toMap(Contact::getId, c -> c));
        Map<Long, Commodity> commodityMap = commodityRepository.findAllById(commodityIds).stream()
            .collect(Collectors.toMap(Commodity::getId, c -> c));

        List<Auction> auctions = auctionRepository.findAllByLotIdInAndSelfSaleUnitIdIsNull(lotIds);
        Set<Long> auctionIds = auctions.stream().map(Auction::getId).collect(Collectors.toSet());
        List<AuctionEntry> entries = auctionIds.isEmpty() ? List.of() : auctionEntryRepository.findAllByAuctionIdIn(auctionIds);

        Map<Long, List<Auction>> lotToAuctions = auctions.stream().collect(Collectors.groupingBy(Auction::getLotId));
        Map<Long, List<AuctionEntry>> auctionToEntries = entries.stream().collect(Collectors.groupingBy(AuctionEntry::getAuctionId));

        VehicleSellerQtyIndex qtyIndex = buildVehicleSellerQtyIndex(vehicleIds);
        Map<Long, Integer> vehicleIdToTotal = qtyIndex.vehicleIdToTotal;
        Map<Long, Integer> sellerVehicleIdToTotal = qtyIndex.sellerVehicleIdToTotal;

        List<LotSummaryDTO> content = new ArrayList<>();
        for (Lot lot : lots) {
            LotSummaryDTO dto = toLotSummaryDTO(
                lot,
                sivMap.get(lot.getSellerVehicleId()),
                vehicleMap,
                contactMap,
                commodityMap.get(lot.getCommodityId()),
                lotToAuctions.getOrDefault(lot.getId(), List.of()),
                auctionToEntries,
                vehicleIdToTotal,
                sellerVehicleIdToTotal
            );
            if (statusFilter == null || statusFilter.isBlank()) {
                content.add(dto);
            } else if (statusFilter.equalsIgnoreCase(dto.getStatus())) {
                content.add(dto);
            }
        }
        return new PageImpl<>(content, pageable, lotPage.getTotalElements());
    }

    private LotSummaryDTO toLotSummaryDTO(
        Lot lot,
        SellerInVehicle siv,
        Map<Long, Vehicle> vehicleMap,
        Map<Long, Contact> contactMap,
        Commodity commodity,
        List<Auction> lotAuctions,
        Map<Long, List<AuctionEntry>> auctionToEntries,
        Map<Long, Integer> vehicleIdToTotal,
        Map<Long, Integer> sellerVehicleIdToTotal
    ) {
        LotSummaryDTO dto = new LotSummaryDTO();
        dto.setLotId(lot.getId());
        dto.setLotName(lot.getLotName());
        dto.setBagCount(lot.getBagCount());
        dto.setOriginalBagCount(lot.getBagCount());
        dto.setSellerVehicleId(lot.getSellerVehicleId());
        dto.setWasModified(false);

        if (siv != null) {
            Vehicle v = siv.getVehicleId() != null ? vehicleMap.get(siv.getVehicleId()) : null;
            // Map is built from page-scoped vehicle ids; if missing (e.g. cache edge), load vehicle for mark + number.
            if (v == null && siv.getVehicleId() != null) {
                v = vehicleRepository.findById(siv.getVehicleId()).orElse(null);
            }
            Contact c = siv.getContactId() != null ? contactMap.get(siv.getContactId()) : null;
            if (c == null && siv.getContactId() != null) {
                c = contactRepository.findById(siv.getContactId()).orElse(null);
            }
            dto.setVehicleNumber(v != null ? v.getVehicleNumber() : null);
            dto.setSellerName(resolveAuctionSellerName(c, siv));
            dto.setSellerMark(resolveAuctionSellerMark(c, siv));
            if (v != null && v.getVehicleMarkAlias() != null && !v.getVehicleMarkAlias().isBlank()) {
                dto.setVehicleMark(v.getVehicleMarkAlias().trim());
            }
            if (siv.getVehicleId() != null) {
                dto.setVehicleTotalQty(vehicleIdToTotal.get(siv.getVehicleId()));
            }
        }
        if (lot.getSellerVehicleId() != null) {
            dto.setSellerTotalQty(sellerVehicleIdToTotal.get(lot.getSellerVehicleId()));
        }
        dto.setCommodityName(commodity != null ? commodity.getCommodityName() : null);

        Optional<Auction> latestAuction = lotAuctions.stream()
            .max(Comparator.comparing(Auction::getAuctionDatetime, Comparator.nullsLast(Comparator.naturalOrder())));
        List<AuctionEntry> latestAuctionEntries = latestAuction
            .map(a -> auctionToEntries.getOrDefault(a.getId(), List.of()))
            .orElse(List.of());

        int soldBags = latestAuctionEntries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        dto.setSoldBags(soldBags);

        int bagCount = lot.getBagCount() != null ? lot.getBagCount() : 0;
        int remaining = Math.max(0, bagCount - soldBags);

        String status;
        if (latestAuction.isEmpty() || latestAuctionEntries.isEmpty()) {
            status = "AVAILABLE";
        } else if (latestAuction.get().getCompletedAt() != null) {
            status = remaining == 0 ? "SOLD" : "PARTIAL";
        } else {
            status = remaining == 0 ? "SOLD" : "PENDING";
        }
        dto.setStatus(status);
        dto.setParticipatingBuyers(buildParticipatingBuyers(latestAuctionEntries));
        return dto;
    }

    /**
     * Distinct buyers (registered or scribble/temp) with bids on the latest auction, excluding self-sale rows.
     */
    private List<LotParticipatingBuyerDTO> buildParticipatingBuyers(List<AuctionEntry> latestAuctionEntries) {
        if (latestAuctionEntries == null || latestAuctionEntries.isEmpty()) {
            return List.of();
        }
        Set<String> seen = new LinkedHashSet<>();
        List<LotParticipatingBuyerDTO> out = new ArrayList<>();
        for (AuctionEntry e : latestAuctionEntries) {
            if (Boolean.TRUE.equals(e.getIsSelfSale())) {
                continue;
            }
            String key;
            if (e.getBuyerId() != null) {
                key = "r:" + e.getBuyerId();
            } else {
                String mark = e.getBuyerMark() != null ? e.getBuyerMark().trim().toLowerCase(Locale.ROOT) : "";
                String name = e.getBuyerName() != null ? e.getBuyerName().trim().toLowerCase(Locale.ROOT) : "";
                key = "t:" + mark + "|" + name;
            }
            if (!seen.add(key)) {
                continue;
            }
            LotParticipatingBuyerDTO b = new LotParticipatingBuyerDTO();
            b.setGroupKey(key);
            b.setBuyerName(e.getBuyerName() != null ? e.getBuyerName() : "");
            b.setBuyerMark(e.getBuyerMark() != null ? e.getBuyerMark() : "");
            b.setRegistered(e.getBuyerId() != null);
            out.add(b);
        }
        out.sort(
            Comparator.comparing((LotParticipatingBuyerDTO x) -> !x.isRegistered())
                .thenComparing(x -> (x.getBuyerName() != null ? x.getBuyerName() : "").toLowerCase(Locale.ROOT))
                .thenComparing(x -> (x.getBuyerMark() != null ? x.getBuyerMark() : "").toLowerCase(Locale.ROOT))
        );
        return out;
    }

    /**
     * Distinct temporary (scribble) buyer marks for the current trader for the current calendar day only.
     * Excludes marks that match an active registered contact's mark so the strip does not duplicate Row 1.
     */
    @Transactional(readOnly = true)
    public List<String> listTemporaryBuyerMarksForCurrentCalendarDay() {
        Long traderId = resolveTraderId();
        LocalDate today = LocalDate.now(BUSINESS_CALENDAR_ZONE);
        Instant start = today.atStartOfDay(BUSINESS_CALENDAR_ZONE).toInstant();
        Instant end = today.plusDays(1).atStartOfDay(BUSINESS_CALENDAR_ZONE).toInstant();

        List<String> raw = auctionEntryRepository.findDistinctScribbleBuyerMarksForTraderCreatedBetween(traderId, start, end);
        if (raw.isEmpty()) {
            return List.of();
        }

        Set<String> registeredMarksLower = contactRepository
            .findAllByTraderIdAndActiveTrue(traderId)
            .stream()
            .map(Contact::getMark)
            .filter(m -> m != null && !m.isBlank())
            .map(m -> m.trim().toLowerCase(Locale.ROOT))
            .collect(Collectors.toSet());

        return raw
            .stream()
            .filter(m -> m != null && !m.isBlank())
            .filter(m -> !registeredMarksLower.contains(m.trim().toLowerCase(Locale.ROOT)))
            .sorted(String.CASE_INSENSITIVE_ORDER)
            .toList();
    }

    /**
     * Get or start an auction session for a lot.
     */
    public AuctionSessionDTO getOrStartSession(Long lotId) {
        Long traderId = resolveTraderId();
        Lot lot = lotRepository.findById(lotId).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + lotId));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + lotId);
        }

        Auction auction = findLatestNormalAuctionForLot(lotId).orElseGet(() -> createAuctionSession(lotId, traderId));

        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());

        if (auction.getCompletedAt() != null && !auctionSelfSaleUnitRepository.findBySourceAuctionId(auction.getId()).isEmpty()) {
            return buildEffectiveLotSessionDTO(auction, lot, entries);
        }

        return buildSessionDTO(auction, lot, entries);
    }

    @Transactional(readOnly = true)
    public Page<AuctionSelfSaleUnitDTO> listSelfSaleUnits(Pageable pageable, String q) {
        Long traderId = resolveTraderId();
        Page<AuctionSelfSaleUnit> page = auctionSelfSaleUnitRepository.findByTraderIdAndStatusIn(
            traderId,
            List.of(AuctionSelfSaleUnitStatus.OPEN, AuctionSelfSaleUnitStatus.PARTIAL),
            pageable
        );
        List<AuctionSelfSaleUnit> units = page.getContent();
        if (units.isEmpty()) {
            return Page.empty(pageable);
        }

        List<Long> lotIds = units.stream().map(AuctionSelfSaleUnit::getLotId).distinct().toList();
        Map<Long, Lot> lotById = lotRepository.findAllById(lotIds).stream().collect(Collectors.toMap(Lot::getId, l -> l));

        Set<Long> sellerVehicleIds = lotById.values().stream().map(Lot::getSellerVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> commodityIds = lotById.values().stream().map(Lot::getCommodityId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, SellerInVehicle> sivById = sellerInVehicleRepository.findAllById(sellerVehicleIds)
            .stream()
            .collect(Collectors.toMap(SellerInVehicle::getId, s -> s));
        Set<Long> vehicleIds = sivById.values().stream().map(SellerInVehicle::getVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> contactIds = sivById.values().stream().map(SellerInVehicle::getContactId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, Vehicle> vehicleById = vehicleRepository.findAllById(vehicleIds).stream().collect(Collectors.toMap(Vehicle::getId, v -> v));
        Map<Long, Contact> contactById = contactRepository.findAllById(contactIds).stream().collect(Collectors.toMap(Contact::getId, c -> c));
        Map<Long, Commodity> commodityById = commodityRepository.findAllById(commodityIds).stream().collect(Collectors.toMap(Commodity::getId, c -> c));

        Set<Long> vehicleIdsForQty = sivById.values().stream().map(SellerInVehicle::getVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        VehicleSellerQtyIndex selfSaleQtyIndex = buildVehicleSellerQtyIndex(vehicleIdsForQty);

        List<AuctionSelfSaleUnitDTO> content = units
            .stream()
            .map(unit -> toAuctionSelfSaleUnitDTO(unit, lotById.get(unit.getLotId()), sivById, vehicleById, contactById, commodityById, selfSaleQtyIndex))
            .filter(Objects::nonNull)
            .filter(dto -> {
                if (q == null || q.isBlank()) {
                    return true;
                }
                String needle = q.trim().toLowerCase(Locale.ROOT);
                return (
                    (dto.getLotName() != null && dto.getLotName().toLowerCase(Locale.ROOT).contains(needle)) ||
                    (dto.getSellerName() != null && dto.getSellerName().toLowerCase(Locale.ROOT).contains(needle)) ||
                    (dto.getSellerMark() != null && dto.getSellerMark().toLowerCase(Locale.ROOT).contains(needle)) ||
                    (dto.getVehicleNumber() != null && dto.getVehicleNumber().toLowerCase(Locale.ROOT).contains(needle)) ||
                    (dto.getCommodityName() != null && dto.getCommodityName().toLowerCase(Locale.ROOT).contains(needle))
                );
            })
            .toList();

        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    /**
     * Get or start a Sales Pad session for a quantity-based self-sale unit.
     */
    public AuctionSessionDTO getOrStartSelfSaleSession(Long selfSaleUnitId) {
        Long traderId = resolveTraderId();
        AuctionSelfSaleUnit unit = getRequiredSelfSaleUnit(selfSaleUnitId, traderId);
        Lot lot = lotRepository.findById(unit.getLotId()).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + unit.getLotId()));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + unit.getLotId());
        }

        Auction auction = getOrCreateSelfSaleAuction(unit, traderId);

        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        AuctionSessionDTO dto = buildSessionDTO(auction, lot, entries, unit.getRemainingQty(), unit.getSelfSaleQty());
        dto.setSelfSaleContext(buildSelfSaleContext(unit, lot));
        return dto;
    }

    public AuctionSessionDTO addBidToSelfSaleUnit(Long selfSaleUnitId, @Valid AuctionBidCreateRequest request) {
        Long traderId = resolveTraderId();
        AuctionSelfSaleUnit unit = getRequiredSelfSaleUnit(selfSaleUnitId, traderId);
        Lot lot = lotRepository.findById(unit.getLotId()).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + unit.getLotId()));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + unit.getLotId());
        }

        Auction auction = getOrCreateSelfSaleAuction(unit, traderId);
        List<AuctionEntry> existingEntries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        int currentSold = existingEntries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int requestedQty = request.getQuantity();
        int unitCap = unit.getRemainingQty() != null ? unit.getRemainingQty() : 0;
        int newTotal = currentSold + requestedQty;

        if (newTotal > unitCap) {
            throw new AuctionConflictException("Adding this bid exceeds self-sale quantity", "quantity", currentSold, unitCap, requestedQty, newTotal);
        }

        createOrMergeAuctionEntry(auction, existingEntries, request, traderId);
        List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
        AuctionSessionDTO dto = buildSessionDTO(auction, lot, refreshed, unit.getRemainingQty(), unit.getSelfSaleQty());
        dto.setSelfSaleContext(buildSelfSaleContext(unit, lot));
        return dto;
    }

    public AuctionSessionDTO updateBidInSelfSaleUnit(Long selfSaleUnitId, Long bidId, AuctionBidUpdateRequest request) {
        Long traderId = resolveTraderId();
        AuctionSelfSaleUnit unit = getRequiredSelfSaleUnit(selfSaleUnitId, traderId);
        Lot lot = lotRepository.findById(unit.getLotId()).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + unit.getLotId()));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + unit.getLotId());
        }

        Auction auction = getRequiredActiveSelfSaleAuction(unit);
        AuctionEntry entry = auctionEntryRepository.findById(bidId).orElseThrow(() -> new EntityNotFoundException("Bid not found: " + bidId));
        if (!Objects.equals(entry.getAuctionId(), auction.getId())) {
            throw new EntityNotFoundException("Bid not found: " + bidId);
        }

        if (request.getExpectedLastModifiedMs() != null && entry.getLastModifiedDate() != null) {
            if (entry.getLastModifiedDate().toEpochMilli() != request.getExpectedLastModifiedMs()) {
                throw new StaleBidEditException("This bid was changed elsewhere. Refresh and try again.");
            }
        }

        if (request.getSummarySellerRate() != null && request.getRate() == null) {
            if (request.getSummarySellerRate().compareTo(BigDecimal.ONE) < 0) {
                throw new IllegalArgumentException("Summary seller rate must be at least 1");
            }
            entry.setSummarySellerRate(request.getSummarySellerRate());
            entry.setLastModifiedDate(Instant.now());
            auctionEntryRepository.saveAndFlush(entry);
            List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
            AuctionSessionDTO dto = buildSessionDTO(auction, lot, refreshed, unit.getRemainingQty(), unit.getSelfSaleQty());
            dto.setSelfSaleContext(buildSelfSaleContext(unit, lot));
            return dto;
        }

        if (request.getRate() != null && request.getRate().compareTo(BigDecimal.ONE) < 0) {
            throw new IllegalArgumentException("Rate must be at least 1");
        }
        if (request.getQuantity() != null && request.getQuantity() < 1) {
            throw new IllegalArgumentException("Quantity must be at least 1");
        }

        List<AuctionEntry> existingEntries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        int currentSold = existingEntries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int entryQty = entry.getQuantity() != null ? entry.getQuantity() : 0;
        int newQty = request.getQuantity() != null ? request.getQuantity() : entryQty;
        int otherSold = currentSold - entryQty;
        int newTotal = otherSold + newQty;
        int unitCap = unit.getRemainingQty() != null ? unit.getRemainingQty() : 0;
        if (newTotal > unitCap) {
            throw new AuctionConflictException("Updating this bid exceeds self-sale quantity", "quantity", otherSold, unitCap, newQty, newTotal);
        }

        if (request.getRate() != null) {
            entry.setBidRate(request.getRate());
        }
        if (request.getQuantity() != null) {
            entry.setQuantity(newQty);
        }
        if (request.getTokenAdvance() != null) {
            entry.setTokenAdvance(request.getTokenAdvance());
        }
        if (request.getExtraRate() != null) {
            entry.setExtraRate(request.getExtraRate());
        }
        if (request.getPresetApplied() != null) {
            entry.setPresetMargin(request.getPresetApplied());
        }
        if (request.getPresetType() != null) {
            entry.setPresetType(request.getPresetType());
        }

        applyBillingBuyerReassignFromPatch(entry, auction, request, traderId);

        BigDecimal bidRate = entry.getBidRate();
        BigDecimal extra = entry.getExtraRate() != null ? entry.getExtraRate() : BigDecimal.ZERO;
        entry.setSellerRate(bidRate);
        entry.setBuyerRate(bidRate.add(extra));
        entry.setAmount(entry.getBuyerRate().multiply(BigDecimal.valueOf(entry.getQuantity() != null ? entry.getQuantity() : 0)));
        entry.setLastModifiedDate(Instant.now());

        auctionEntryRepository.save(entry);
        List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
        AuctionSessionDTO dto = buildSessionDTO(auction, lot, refreshed, unit.getRemainingQty(), unit.getSelfSaleQty());
        dto.setSelfSaleContext(buildSelfSaleContext(unit, lot));
        return dto;
    }

    public AuctionSessionDTO deleteBidFromSelfSaleUnit(Long selfSaleUnitId, Long bidId) {
        Long traderId = resolveTraderId();
        AuctionSelfSaleUnit unit = getRequiredSelfSaleUnit(selfSaleUnitId, traderId);
        Lot lot = lotRepository.findById(unit.getLotId()).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + unit.getLotId()));
        Auction auction = getRequiredActiveSelfSaleAuction(unit);
        AuctionEntry entry = auctionEntryRepository.findById(bidId).orElseThrow(() -> new EntityNotFoundException("Bid not found: " + bidId));
        if (!Objects.equals(entry.getAuctionId(), auction.getId())) {
            throw new EntityNotFoundException("Bid not found: " + bidId);
        }

        auctionEntryRepository.delete(entry);
        List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
        AuctionSessionDTO dto = buildSessionDTO(auction, lot, refreshed, unit.getRemainingQty(), unit.getSelfSaleQty());
        dto.setSelfSaleContext(buildSelfSaleContext(unit, lot));
        return dto;
    }

    public AuctionResultDTO completeSelfSaleAuction(Long selfSaleUnitId) {
        Long traderId = resolveTraderId();
        AuctionSelfSaleUnit unit = getRequiredSelfSaleUnit(selfSaleUnitId, traderId);
        Lot lot = lotRepository.findById(unit.getLotId()).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + unit.getLotId()));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + unit.getLotId());
        }

        Auction auction = getRequiredActiveSelfSaleAuction(unit);
        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        if (entries.isEmpty()) {
            throw new AuctionConflictException("Cannot complete auction without bids", "entries", 0, 0, 0, 0);
        }

        int sold = entries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int available = unit.getRemainingQty() != null ? unit.getRemainingQty() : 0;
        if (sold > available) {
            throw new AuctionConflictException("Completing this auction exceeds self-sale quantity", "quantity", 0, available, sold, sold);
        }

        Instant now = Instant.now();
        auction.setCompletedAt(now);
        auctionRepository.save(auction);

        int remainingQty = available - sold;
        unit.setRemainingQty(remainingQty);
        unit.setStatus(remainingQty == 0 ? AuctionSelfSaleUnitStatus.CLOSED : AuctionSelfSaleUnitStatus.PARTIAL);
        unit.setClosedAt(remainingQty == 0 ? now : null);
        unit.setLastReauctionAuctionId(auction.getId());
        auctionSelfSaleUnitRepository.save(unit);

        return buildResultDTO(auction, lot, entries, unit.getId());
    }

    /**
     * Add a bid to the current auction for the lot.
     */
    public AuctionSessionDTO addBid(Long lotId, @Valid AuctionBidCreateRequest request) {
        Long traderId = resolveTraderId();
        Lot lot = lotRepository.findById(lotId).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + lotId));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + lotId);
        }
        Auction auction = findLatestNormalAuctionForLot(lotId).orElseGet(() -> {
            Auction a = new Auction();
            a.setLotId(lotId);
            a.setTraderId(traderId);
            a.setAuctionDatetime(Instant.now());
            a.setCreatedAt(Instant.now());
            return auctionRepository.save(a);
        });

        List<AuctionEntry> existingEntries = auctionEntryRepository.findAllByAuctionId(auction.getId());

        int currentSold = existingEntries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int requestedQty = request.getQuantity();
        int lotTotal = lot.getBagCount() != null ? lot.getBagCount() : 0;
        int newTotal = currentSold + requestedQty;

        if (newTotal > lotTotal && !request.isAllowLotIncrease()) {
            throw new AuctionConflictException("Adding this bid exceeds lot quantity", "quantity", currentSold, lotTotal, requestedQty, newTotal);
        }

        if (newTotal > lotTotal && request.isAllowLotIncrease()) {
            lot.setBagCount(newTotal);
            lotRepository.save(lot);
        }

        createOrMergeAuctionEntry(auction, existingEntries, request, traderId);

        List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
        return buildSessionDTO(auction, lot, refreshed);
    }

    /**
     * Update editable fields on an existing bid.
     */
    public AuctionSessionDTO updateBid(Long lotId, Long bidId, AuctionBidUpdateRequest request) {
        Long traderId = resolveTraderId();
        Lot lot = lotRepository.findById(lotId).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + lotId));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + lotId);
        }
        AuctionEntry entry = auctionEntryRepository.findById(bidId).orElseThrow(() -> new EntityNotFoundException("Bid not found: " + bidId));
        Auction auction = auctionRepository
            .findById(entry.getAuctionId())
            .orElseThrow(() -> new EntityNotFoundException("Auction not found for bid: " + bidId));

        if (!Objects.equals(auction.getLotId(), lotId)) {
            throw new EntityNotFoundException("Bid not found: " + bidId);
        }

        if (request.getExpectedLastModifiedMs() != null && entry.getLastModifiedDate() != null) {
            if (entry.getLastModifiedDate().toEpochMilli() != request.getExpectedLastModifiedMs()) {
                throw new StaleBidEditException("This bid was changed elsewhere. Refresh and try again.");
            }
        }

        /* Summary vehicle-ops: persist negotiated seller figure only — leaves auction bid_rate / buyer_rate unchanged. */
        if (request.getSummarySellerRate() != null && request.getRate() == null) {
            if (request.getSummarySellerRate().compareTo(BigDecimal.ONE) < 0) {
                throw new IllegalArgumentException("Summary seller rate must be at least 1");
            }
            entry.setSummarySellerRate(request.getSummarySellerRate());
            entry.setLastModifiedDate(Instant.now());
            auctionEntryRepository.saveAndFlush(entry);
            List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
            return buildSessionDTO(auction, lot, refreshed);
        }

        if (request.getRate() != null && request.getRate().compareTo(BigDecimal.ONE) < 0) {
            throw new IllegalArgumentException("Rate must be at least 1");
        }
        if (request.getQuantity() != null && request.getQuantity() < 1) {
            throw new IllegalArgumentException("Quantity must be at least 1");
        }

        List<AuctionEntry> existingEntries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        int currentSold = existingEntries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int entryQty = entry.getQuantity() != null ? entry.getQuantity() : 0;
        int newQty = request.getQuantity() != null ? request.getQuantity() : entryQty;
        int otherSold = currentSold - entryQty;
        int newTotal = otherSold + newQty;
        int lotTotal = lot.getBagCount() != null ? lot.getBagCount() : 0;

        if (newTotal > lotTotal && !request.isAllowLotIncrease()) {
            throw new AuctionConflictException("Updating this bid exceeds lot quantity", "quantity", otherSold, lotTotal, newQty, newTotal);
        }
        if (newTotal > lotTotal && request.isAllowLotIncrease()) {
            lot.setBagCount(newTotal);
            lotRepository.save(lot);
        }

        if (request.getRate() != null) {
            entry.setBidRate(request.getRate());
        }
        if (request.getQuantity() != null) {
            entry.setQuantity(newQty);
        }

        if (request.getTokenAdvance() != null) {
            entry.setTokenAdvance(request.getTokenAdvance());
        }
        if (request.getExtraRate() != null) {
            entry.setExtraRate(request.getExtraRate());
        }
        if (request.getPresetApplied() != null) {
            entry.setPresetMargin(request.getPresetApplied());
        }
        if (request.getPresetType() != null) {
            entry.setPresetType(request.getPresetType());
        }

        applyBillingBuyerReassignFromPatch(entry, auction, request, traderId);

        BigDecimal bidRate = entry.getBidRate();
        BigDecimal extra = entry.getExtraRate() != null ? entry.getExtraRate() : BigDecimal.ZERO;
        entry.setSellerRate(bidRate);
        entry.setBuyerRate(bidRate.add(extra));
        entry.setAmount(entry.getBuyerRate().multiply(BigDecimal.valueOf(entry.getQuantity() != null ? entry.getQuantity() : 0)));
        entry.setLastModifiedDate(Instant.now());

        auctionEntryRepository.save(entry);
        List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
        return buildSessionDTO(auction, lot, refreshed);
    }

    /**
     * Delete a bid from the auction session.
     */
    public AuctionSessionDTO deleteBid(Long lotId, Long bidId) {
        Long traderId = resolveTraderId();
        Lot lot = lotRepository.findById(lotId).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + lotId));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + lotId);
        }
        AuctionEntry entry = auctionEntryRepository.findById(bidId).orElseThrow(() -> new EntityNotFoundException("Bid not found: " + bidId));
        Auction auction = auctionRepository
            .findById(entry.getAuctionId())
            .orElseThrow(() -> new EntityNotFoundException("Auction not found for bid: " + bidId));

        auctionEntryRepository.delete(entry);
        List<AuctionEntry> refreshed = auctionEntryRepository.findAllByAuctionId(auction.getId());
        return buildSessionDTO(auction, lot, refreshed);
    }

    /**
     * Complete an auction for a lot and generate AuctionResultDTO.
     */
    public AuctionResultDTO completeAuction(Long lotId) {
        Long traderId = resolveTraderId();
        Lot lot = lotRepository.findById(lotId).orElseThrow(() -> new EntityNotFoundException("Lot not found: " + lotId));
        if (!isLotOwnedByTrader(lot, traderId)) {
            throw new EntityNotFoundException("Lot not found: " + lotId);
        }

        Auction auction = findLatestNormalAuctionForLot(lotId)
            .orElseThrow(() -> new EntityNotFoundException("No auction exists for lot: " + lotId));

        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        if (entries.isEmpty()) {
            throw new AuctionConflictException("Cannot complete auction without bids", "entries", 0, 0, 0, 0);
        }

        int sold = entries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int bagCount = lot.getBagCount() != null ? lot.getBagCount() : 0;
        if (sold < bagCount) {
            LOG.warn("Completing auction for lot {} with partial sale: sold={} bagCount={}", lotId, sold, bagCount);
        }

        auction.setCompletedAt(Instant.now());
        if (auction.getTraderId() == null) {
            auction.setTraderId(traderId);
        }
        auctionRepository.save(auction);
        createSelfSaleUnitsFromCompletedAuction(auction, entries, traderId);

        return buildResultDTO(auction, lot, entries, null);
    }

    @Transactional(readOnly = true)
    public Page<AuctionResultDTO> listResults(Pageable pageable) {
        Long traderId = resolveTraderId();
        Page<Lot> traderLots = lotRepository.findAllByTraderId(traderId, Pageable.unpaged());
        if (traderLots.isEmpty()) {
            return Page.empty(pageable);
        }
        java.util.List<Long> lotIds = traderLots.getContent().stream().map(Lot::getId).toList();
        Pageable sorted = withDefaultCompletedAuctionSort(pageable);
        Page<Auction> page = auctionRepository.findByCompletedAtIsNotNullAndLotIdInAndSelfSaleUnitIdIsNull(lotIds, sorted);
        return buildResultsPage(page, sorted);
    }

    /**
     * Completed auction results for the given lot IDs (trader-scoped, e.g. for Settlement sellers).
     */
    @Transactional(readOnly = true)
    public Page<AuctionResultDTO> listResultsByLotIds(Collection<Long> lotIds, Pageable pageable) {
        if (lotIds == null || lotIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Long traderId = resolveTraderId();
        java.util.List<Long> traderLotIds = lotRepository.findAllByTraderId(traderId, Pageable.unpaged())
            .getContent()
            .stream()
            .map(Lot::getId)
            .toList();
        java.util.Set<Long> allowedLotIds = new java.util.HashSet<>(traderLotIds);
        java.util.List<Long> filteredLotIds = lotIds.stream().filter(allowedLotIds::contains).toList();
        if (filteredLotIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Pageable sorted = withDefaultCompletedAuctionSort(pageable);
        Page<Auction> page = auctionRepository.findByCompletedAtIsNotNullAndLotIdInAndSelfSaleUnitIdIsNull(filteredLotIds, sorted);
        return buildResultsPage(page, sorted);
    }

    private Pageable withDefaultCompletedAuctionSort(Pageable pageable) {
        if (pageable.getSort().isSorted()) {
            return pageable;
        }
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), DEFAULT_COMPLETED_AUCTION_SORT);
    }

    private Page<AuctionResultDTO> buildResultsPage(Page<Auction> page, Pageable pageable) {
        List<Auction> auctions = page.getContent();
        if (auctions.isEmpty()) {
            return Page.empty(pageable);
        }
        List<Long> auctionIds = auctions.stream().map(Auction::getId).toList();
        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionIdIn(auctionIds);
        List<Lot> lots = lotRepository.findAllById(auctions.stream().map(Auction::getLotId).toList());

        Set<Long> sellerVehicleIds = lots.stream().map(Lot::getSellerVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, SellerInVehicle> sivById =
            sellerVehicleIds.isEmpty()
                ? Map.of()
                : sellerInVehicleRepository.findAllById(sellerVehicleIds).stream().collect(Collectors.toMap(SellerInVehicle::getId, s -> s));
        Set<Long> vehicleIds = sivById.values().stream().map(SellerInVehicle::getVehicleId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<Long> contactIds = sivById.values().stream().map(SellerInVehicle::getContactId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, Vehicle> vehicleById =
            vehicleIds.isEmpty()
                ? Map.of()
                : vehicleRepository.findAllById(vehicleIds).stream().collect(Collectors.toMap(Vehicle::getId, v -> v));
        Map<Long, Contact> contactById =
            contactIds.isEmpty()
                ? Map.of()
                : contactRepository.findAllById(contactIds).stream().collect(Collectors.toMap(Contact::getId, c -> c));

        VehicleSellerQtyIndex resultQtyIndex = buildVehicleSellerQtyIndex(vehicleIds);

        List<AuctionResultDTO> content = auctions
            .stream()
            .map(a -> {
                Lot lot = lots.stream().filter(l -> l.getId().equals(a.getLotId())).findFirst().orElse(null);
                List<AuctionEntry> aEntries = entries.stream().filter(e -> e.getAuctionId().equals(a.getId())).toList();
                AuctionResultDTO dto = buildEffectiveLotResultDTO(a, lot, aEntries);
                applySellerVehicleToAuctionResult(dto, lot, sivById, vehicleById, contactById, resultQtyIndex);
                return dto;
            })
            .collect(Collectors.toList());

        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public Optional<AuctionResultDTO> getResultByLot(Long lotId) {
        Long traderId = resolveTraderId();
        Optional<Auction> auctionOpt = findLatestNormalAuctionForLot(lotId);
        if (auctionOpt.isEmpty()) {
            return Optional.empty();
        }
        Auction auction = auctionOpt.get();
        Lot lot = lotRepository.findById(lotId).orElse(null);
        if (lot == null || !isLotOwnedByTrader(lot, traderId)) {
            return Optional.empty();
        }
        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        AuctionResultDTO dto = buildEffectiveLotResultDTO(auction, lot, entries);
        applySellerVehicleToAuctionResult(dto, lot);
        return Optional.of(dto);
    }

    @Transactional(readOnly = true)
    public Optional<AuctionResultDTO> getResultByBidNumber(Integer bidNumber) {
        Long traderId = resolveTraderId();
        Optional<AuctionEntry> entryOpt = auctionEntryRepository.findFirstByBidNumber(bidNumber);
        if (entryOpt.isEmpty()) {
            return Optional.empty();
        }
        AuctionEntry entry = entryOpt.get();
        Auction auction = auctionRepository
            .findById(entry.getAuctionId())
            .orElseThrow(() -> new EntityNotFoundException("Auction not found for bid: " + bidNumber));
        Lot lot = lotRepository.findById(auction.getLotId()).orElse(null);
        if (lot == null || !isLotOwnedByTrader(lot, traderId)) {
            return Optional.empty();
        }
        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        AuctionResultDTO dto = buildResultDTO(auction, lot, entries);
        applySellerVehicleToAuctionResult(dto, lot);
        return Optional.of(dto);
    }

    /**
     * Fills seller display name, vehicle number, marks, and vehicle/seller totals on auction results (Billing, logistics).
     */
    private void enrichAuctionResultLotIdentifiers(
        AuctionResultDTO dto,
        Lot lot,
        SellerInVehicle siv,
        Vehicle v,
        Contact c,
        VehicleSellerQtyIndex qtyIndex
    ) {
        if (dto == null || qtyIndex == null) {
            return;
        }
        dto.setSellerMark(resolveAuctionSellerMark(c, siv));
        if (v != null && v.getVehicleMarkAlias() != null && !v.getVehicleMarkAlias().isBlank()) {
            dto.setVehicleMark(v.getVehicleMarkAlias().trim());
        } else {
            dto.setVehicleMark(null);
        }
        if (lot != null && lot.getSellerVehicleId() != null) {
            dto.setSellerTotalQty(qtyIndex.sellerVehicleIdToTotal.get(lot.getSellerVehicleId()));
        }
        if (siv != null && siv.getVehicleId() != null) {
            dto.setVehicleTotalQty(qtyIndex.vehicleIdToTotal.get(siv.getVehicleId()));
        }
    }

    private void applySellerVehicleToAuctionResult(AuctionResultDTO dto, Lot lot) {
        if (dto == null || lot == null || lot.getSellerVehicleId() == null) {
            return;
        }
        SellerInVehicle siv = sellerInVehicleRepository.findById(lot.getSellerVehicleId()).orElse(null);
        if (siv == null) {
            return;
        }
        Contact c = siv.getContactId() != null ? contactRepository.findById(siv.getContactId()).orElse(null) : null;
        Vehicle v = siv.getVehicleId() != null ? vehicleRepository.findById(siv.getVehicleId()).orElse(null) : null;
        dto.setSellerName(resolveAuctionSellerName(c, siv));
        dto.setVehicleNumber(v != null ? v.getVehicleNumber() : null);
        VehicleSellerQtyIndex qtyIndex = siv.getVehicleId() != null
            ? buildVehicleSellerQtyIndex(Set.of(siv.getVehicleId()))
            : new VehicleSellerQtyIndex(Map.of(), Map.of());
        enrichAuctionResultLotIdentifiers(dto, lot, siv, v, c, qtyIndex);
    }

    private void applySellerVehicleToAuctionResult(
        AuctionResultDTO dto,
        Lot lot,
        Map<Long, SellerInVehicle> sivById,
        Map<Long, Vehicle> vehicleById,
        Map<Long, Contact> contactById,
        VehicleSellerQtyIndex qtyIndex
    ) {
        if (dto == null || lot == null || lot.getSellerVehicleId() == null) {
            return;
        }
        SellerInVehicle siv = sivById.get(lot.getSellerVehicleId());
        if (siv == null) {
            return;
        }
        Contact c = siv.getContactId() != null ? contactById.get(siv.getContactId()) : null;
        Vehicle v = siv.getVehicleId() != null ? vehicleById.get(siv.getVehicleId()) : null;
        dto.setSellerName(resolveAuctionSellerName(c, siv));
        dto.setVehicleNumber(v != null ? v.getVehicleNumber() : null);
        enrichAuctionResultLotIdentifiers(dto, lot, siv, v, c, qtyIndex != null ? qtyIndex : new VehicleSellerQtyIndex(Map.of(), Map.of()));
    }

    private AuctionSessionDTO buildSessionDTO(Auction auction, Lot lot, List<AuctionEntry> entries) {
        return buildSessionDTOFromDtos(auction, lot, auctionEntryMapper.toDto(entries), lot.getBagCount(), lot.getBagCount());
    }

    private AuctionSessionDTO buildSessionDTO(
        Auction auction,
        Lot lot,
        List<AuctionEntry> entries,
        Integer bagCountOverride,
        Integer originalBagCountOverride
    ) {
        return buildSessionDTOFromDtos(auction, lot, auctionEntryMapper.toDto(entries), bagCountOverride, originalBagCountOverride);
    }

    private AuctionSessionDTO buildSessionDTOFromDtos(
        Auction auction,
        Lot lot,
        List<AuctionEntryDTO> entryDtos,
        Integer bagCountOverride,
        Integer originalBagCountOverride
    ) {
        AuctionSessionDTO dto = new AuctionSessionDTO();
        dto.setAuctionId(auction.getId());

        LotSummaryDTO lotSummary = new LotSummaryDTO();
        lotSummary.setLotId(lot.getId());
        lotSummary.setLotName(lot.getLotName());
        lotSummary.setBagCount(bagCountOverride != null ? bagCountOverride : lot.getBagCount());
        lotSummary.setOriginalBagCount(originalBagCountOverride != null ? originalBagCountOverride : lot.getBagCount());
        lotSummary.setSellerVehicleId(lot.getSellerVehicleId());
        lotSummary.setWasModified(false);

        // Populate seller, vehicle, commodity so client can show them in the Sales Pad toolbar (same as list lots).
        if (lot.getSellerVehicleId() != null) {
            SellerInVehicle siv = sellerInVehicleRepository.findById(lot.getSellerVehicleId()).orElse(null);
            if (siv != null) {
                Vehicle v = siv.getVehicleId() != null ? vehicleRepository.findById(siv.getVehicleId()).orElse(null) : null;
                Contact c = siv.getContactId() != null ? contactRepository.findById(siv.getContactId()).orElse(null) : null;
                lotSummary.setVehicleNumber(v != null ? v.getVehicleNumber() : null);
                lotSummary.setSellerName(resolveAuctionSellerName(c, siv));
                lotSummary.setSellerMark(resolveAuctionSellerMark(c, siv));
                if (v != null && v.getVehicleMarkAlias() != null && !v.getVehicleMarkAlias().isBlank()) {
                    lotSummary.setVehicleMark(v.getVehicleMarkAlias().trim());
                }
                // Vehicle total: sum of all lots on same vehicle. Seller total: sum of all lots for same seller.
                if (siv.getVehicleId() != null) {
                    List<SellerInVehicle> sivsOnVehicle = sellerInVehicleRepository.findAllByVehicleId(siv.getVehicleId());
                    List<Long> sivIds = sivsOnVehicle.stream().map(SellerInVehicle::getId).toList();
                    List<Lot> lotsOnVehicle = lotRepository.findAllBySellerVehicleIdIn(sivIds);
                    int vehicleTotal = lotsOnVehicle.stream().mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0).sum();
                    lotSummary.setVehicleTotalQty(vehicleTotal);
                }
                List<Lot> lotsForSeller = lotRepository.findAllBySellerVehicleIdIn(List.of(lot.getSellerVehicleId()));
                int sellerTotal = lotsForSeller.stream().mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0).sum();
                lotSummary.setSellerTotalQty(sellerTotal);
            }
        }
        if (lot.getCommodityId() != null) {
            Commodity commodity = commodityRepository.findById(lot.getCommodityId()).orElse(null);
            lotSummary.setCommodityName(commodity != null ? commodity.getCommodityName() : null);
        }

        int totalSold = entryDtos.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int bagCount = bagCountOverride != null ? bagCountOverride : (lot.getBagCount() != null ? lot.getBagCount() : 0);
        int remaining = Math.max(0, bagCount - totalSold);
        int highestRate = entryDtos
            .stream()
            .map(AuctionEntryDTO::getBidRate)
            .filter(r -> r != null)
            .map(r -> r.intValue())
            .max(Integer::compareTo)
            .orElse(0);

        String status;
        if (entryDtos.isEmpty()) {
            status = "AVAILABLE";
        } else if (remaining == 0) {
            status = "SOLD";
        } else {
            status = "PARTIAL";
        }

        dto.setLot(lotSummary);
        dto.setEntries(entryDtos);
        dto.setTotalSoldBags(totalSold);
        dto.setRemainingBags(remaining);
        dto.setHighestBidRate(highestRate);
        dto.setStatus(status);

        return dto;
    }

    private AuctionSessionDTO buildEffectiveLotSessionDTO(Auction auction, Lot lot, List<AuctionEntry> baseEntries) {
        List<AuctionSelfSaleUnit> units = auctionSelfSaleUnitRepository.findBySourceAuctionId(auction.getId());
        if (units.isEmpty()) {
            return buildSessionDTO(auction, lot, baseEntries);
        }

        Map<Long, AuctionSelfSaleUnit> unitBySourceEntryId = units
            .stream()
            .filter(u -> u.getSourceAuctionEntryId() != null)
            .collect(Collectors.toMap(AuctionSelfSaleUnit::getSourceAuctionEntryId, u -> u, (a, b) -> a));

        List<AuctionEntryDTO> displayEntries = new ArrayList<>();
        for (AuctionEntry entry : baseEntries.stream().sorted(Comparator.comparingInt(AuctionEntry::getBidNumber)).toList()) {
            if (!Boolean.TRUE.equals(entry.getIsSelfSale())) {
                displayEntries.add(auctionEntryMapper.toDto(entry));
                continue;
            }

            AuctionSelfSaleUnit unit = entry.getId() != null ? unitBySourceEntryId.get(entry.getId()) : null;
            if (unit == null) {
                displayEntries.add(auctionEntryMapper.toDto(entry));
                continue;
            }

            List<Auction> completedReAuctions = auctionRepository
                .findAllBySelfSaleUnitIdOrderByAuctionDatetimeAsc(unit.getId())
                .stream()
                .filter(a -> a.getCompletedAt() != null)
                .toList();

            if (completedReAuctions.isEmpty()) {
                displayEntries.add(auctionEntryMapper.toDto(entry));
                continue;
            }

            List<Long> reAuctionIds = completedReAuctions.stream().map(Auction::getId).toList();
            Map<Long, List<AuctionEntry>> reAuctionEntries = auctionEntryRepository.findAllByAuctionIdIn(reAuctionIds)
                .stream()
                .collect(Collectors.groupingBy(AuctionEntry::getAuctionId));

            for (Auction reAuction : completedReAuctions) {
                displayEntries.addAll(
                    reAuctionEntries
                        .getOrDefault(reAuction.getId(), List.of())
                        .stream()
                        .sorted(Comparator.comparingInt(AuctionEntry::getBidNumber))
                        .map(auctionEntryMapper::toDto)
                        .toList()
                );
            }

            if (unit.getRemainingQty() != null && unit.getRemainingQty() > 0) {
                AuctionEntryDTO remainingSelfSale = new AuctionEntryDTO();
                remainingSelfSale.setId(entry.getId());
                remainingSelfSale.setAuctionId(auction.getId());
                remainingSelfSale.setBuyerId(entry.getBuyerId());
                remainingSelfSale.setBidNumber(entry.getBidNumber());
                remainingSelfSale.setBidRate(unit.getRate());
                remainingSelfSale.setPresetMargin(entry.getPresetMargin());
                remainingSelfSale.setPresetType(entry.getPresetType());
                remainingSelfSale.setSellerRate(unit.getRate());
                remainingSelfSale.setBuyerRate(unit.getRate());
                remainingSelfSale.setQuantity(unit.getRemainingQty());
                remainingSelfSale.setAmount(unit.getRate().multiply(BigDecimal.valueOf(unit.getRemainingQty())));
                remainingSelfSale.setIsSelfSale(Boolean.TRUE);
                remainingSelfSale.setIsScribble(Boolean.FALSE);
                remainingSelfSale.setTokenAdvance(BigDecimal.ZERO);
                remainingSelfSale.setExtraRate(BigDecimal.ZERO);
                remainingSelfSale.setBuyerName(entry.getBuyerName());
                remainingSelfSale.setBuyerMark(entry.getBuyerMark());
                remainingSelfSale.setCreatedAt(unit.getCreatedAt());
                displayEntries.add(remainingSelfSale);
            }
        }

        return buildSessionDTOFromDtos(auction, lot, displayEntries, lot.getBagCount(), lot.getBagCount());
    }

    private Auction createAuctionSession(Long lotId, Long traderId) {
        Auction auction = new Auction();
        auction.setLotId(lotId);
        auction.setTraderId(traderId);
        auction.setAuctionDatetime(Instant.now());
        auction.setCreatedAt(Instant.now());
        return auctionRepository.save(auction);
    }

    private Optional<Auction> findLatestNormalAuctionForLot(Long lotId) {
        return auctionRepository.findFirstByLotIdAndSelfSaleUnitIdIsNullOrderByAuctionDatetimeDesc(lotId);
    }

    private AuctionSelfSaleContextDTO buildSelfSaleContext(AuctionSelfSaleUnit unit, Lot lot) {
        AuctionSelfSaleContextDTO context = new AuctionSelfSaleContextDTO();
        context.setSelfSaleUnitId(unit.getId());
        context.setRate(unit.getRate());
        context.setQuantity(unit.getSelfSaleQty());
        context.setRemainingQty(unit.getRemainingQty());
        context.setAmount(unit.getAmount());
        context.setCreatedAt(unit.getCreatedAt());

        auctionRepository
            .findById(unit.getSourceAuctionId())
            .ifPresent(previousAuction -> {
                context.setPreviousCompletedAuctionId(previousAuction.getId());
                context.setPreviousCompletedAt(previousAuction.getCompletedAt());
                List<AuctionEntry> previousEntries = auctionEntryRepository.findAllByAuctionId(previousAuction.getId());
                context.setPreviousEntries(
                    previousEntries
                        .stream()
                        .sorted(Comparator.comparingInt(AuctionEntry::getBidNumber))
                        .map(this::toResultEntryDTO)
                        .collect(Collectors.toList())
                );
            });

        return context;
    }

    private AuctionResultDTO buildResultDTO(Auction auction, Lot lot, List<AuctionEntry> entries) {
        return buildResultDTO(auction, lot, entries, null);
    }

    private AuctionResultDTO buildResultDTO(Auction auction, Lot lot, List<AuctionEntry> entries, Long selfSaleUnitId) {
        AuctionResultDTO dto = new AuctionResultDTO();
        dto.setAuctionId(auction.getId());
        dto.setLotId(auction.getLotId());
        if (lot != null) {
            dto.setLotName(lot.getLotName());
            dto.setSellerVehicleId(lot.getSellerVehicleId());
            if (lot.getCommodityId() != null) {
                Commodity commodity = commodityRepository.findById(lot.getCommodityId()).orElse(null);
                dto.setCommodityName(commodity != null ? commodity.getCommodityName() : null);
            }
        }
        dto.setAuctionDatetime(auction.getAuctionDatetime());
        dto.setConductedBy(auction.getConductedBy());
        dto.setCompletedAt(auction.getCompletedAt());
        dto.setSelfSaleUnitId(selfSaleUnitId);

        List<AuctionResultEntryDTO> resultEntries = entries
            .stream()
            .sorted(Comparator.comparingInt(AuctionEntry::getBidNumber))
            .map(this::toResultEntryDTO)
            .collect(Collectors.toList());

        dto.setEntries(resultEntries);
        return dto;
    }

    private AuctionSelfSaleUnit getRequiredSelfSaleUnit(Long unitId, Long traderId) {
        AuctionSelfSaleUnit unit = auctionSelfSaleUnitRepository
            .findByIdAndTraderId(unitId, traderId)
            .orElseThrow(() -> new EntityNotFoundException("Self-sale unit not found: " + unitId));
        if (unit.getStatus() == AuctionSelfSaleUnitStatus.CLOSED || (unit.getRemainingQty() != null && unit.getRemainingQty() <= 0)) {
            throw new EntityNotFoundException("Self-sale unit not found: " + unitId);
        }
        return unit;
    }

    private Auction getRequiredActiveSelfSaleAuction(AuctionSelfSaleUnit unit) {
        if (unit.getLastReauctionAuctionId() == null) {
            throw new EntityNotFoundException("No active self-sale auction exists for unit: " + unit.getId());
        }
        Auction auction = auctionRepository
            .findById(unit.getLastReauctionAuctionId())
            .orElseThrow(() -> new EntityNotFoundException("Auction not found for self-sale unit: " + unit.getId()));
        if (auction.getSelfSaleUnitId() == null) {
            auction.setSelfSaleUnitId(unit.getId());
            auctionRepository.save(auction);
        }
        if (auction.getCompletedAt() != null) {
            throw new EntityNotFoundException("No active self-sale auction exists for unit: " + unit.getId());
        }
        return auction;
    }

    private Auction getOrCreateSelfSaleAuction(AuctionSelfSaleUnit unit, Long traderId) {
        if (unit.getLastReauctionAuctionId() != null) {
            Optional<Auction> existing = auctionRepository.findById(unit.getLastReauctionAuctionId());
            if (existing.isPresent() && existing.get().getCompletedAt() == null) {
                if (existing.get().getSelfSaleUnitId() == null) {
                    existing.get().setSelfSaleUnitId(unit.getId());
                    auctionRepository.save(existing.get());
                }
                return existing.get();
            }
        }
        Auction auction = createAuctionSession(unit.getLotId(), traderId);
        auction.setSelfSaleUnitId(unit.getId());
        auction = auctionRepository.save(auction);
        unit.setLastReauctionAuctionId(auction.getId());
        auctionSelfSaleUnitRepository.save(unit);
        return auction;
    }

    private AuctionResultDTO buildEffectiveLotResultDTO(Auction auction, Lot lot, List<AuctionEntry> baseEntries) {
        List<AuctionSelfSaleUnit> units = auctionSelfSaleUnitRepository.findBySourceAuctionId(auction.getId());
        if (units.isEmpty()) {
            return buildResultDTO(auction, lot, baseEntries);
        }

        Map<Long, AuctionSelfSaleUnit> unitBySourceEntryId = units
            .stream()
            .filter(u -> u.getSourceAuctionEntryId() != null)
            .collect(Collectors.toMap(AuctionSelfSaleUnit::getSourceAuctionEntryId, u -> u, (a, b) -> a));

        AuctionResultDTO dto = buildResultDTO(auction, lot, List.of(), null);
        List<AuctionResultEntryDTO> resultEntries = new ArrayList<>();
        Instant effectiveCompletedAt = auction.getCompletedAt();

        for (AuctionEntry entry : baseEntries.stream().sorted(Comparator.comparingInt(AuctionEntry::getBidNumber)).toList()) {
            if (!Boolean.TRUE.equals(entry.getIsSelfSale())) {
                resultEntries.add(toResultEntryDTO(entry));
                continue;
            }

            AuctionSelfSaleUnit unit = entry.getId() != null ? unitBySourceEntryId.get(entry.getId()) : null;
            if (unit == null) {
                resultEntries.add(toResultEntryDTO(entry));
                continue;
            }

            List<Auction> reAuctions = auctionRepository.findAllBySelfSaleUnitIdOrderByAuctionDatetimeAsc(unit.getId());
            List<Auction> completedReAuctions = reAuctions.stream().filter(a -> a.getCompletedAt() != null).toList();
            if (completedReAuctions.isEmpty()) {
                resultEntries.add(toResultEntryDTO(entry));
                continue;
            }

            List<Long> reAuctionIds = completedReAuctions.stream().map(Auction::getId).toList();
            Map<Long, List<AuctionEntry>> reAuctionEntries = auctionEntryRepository.findAllByAuctionIdIn(reAuctionIds)
                .stream()
                .collect(Collectors.groupingBy(AuctionEntry::getAuctionId));

            for (Auction reAuction : completedReAuctions) {
                if (effectiveCompletedAt == null || (reAuction.getCompletedAt() != null && reAuction.getCompletedAt().isAfter(effectiveCompletedAt))) {
                    effectiveCompletedAt = reAuction.getCompletedAt();
                }
                resultEntries.addAll(
                    reAuctionEntries
                        .getOrDefault(reAuction.getId(), List.of())
                        .stream()
                        .sorted(Comparator.comparingInt(AuctionEntry::getBidNumber))
                        .map(this::toResultEntryDTO)
                        .toList()
                );
            }

            if (unit.getRemainingQty() != null && unit.getRemainingQty() > 0) {
                AuctionResultEntryDTO remainingSelfSale = new AuctionResultEntryDTO();
                remainingSelfSale.setBidNumber(entry.getBidNumber());
                remainingSelfSale.setBuyerId(entry.getBuyerId());
                remainingSelfSale.setBuyerMark(entry.getBuyerMark());
                remainingSelfSale.setBuyerName(entry.getBuyerName());
                remainingSelfSale.setRate(unit.getRate());
                remainingSelfSale.setSummarySellerRate(
                    entry.getSummarySellerRate() != null ? entry.getSummarySellerRate() : entry.getBidRate()
                );
                remainingSelfSale.setQuantity(unit.getRemainingQty());
                remainingSelfSale.setAmount(unit.getRate().multiply(BigDecimal.valueOf(unit.getRemainingQty())));
                remainingSelfSale.setIsSelfSale(Boolean.TRUE);
                remainingSelfSale.setIsScribble(Boolean.FALSE);
                remainingSelfSale.setPresetApplied(entry.getPresetMargin());
                remainingSelfSale.setPresetType(entry.getPresetType());
                remainingSelfSale.setTokenAdvance(BigDecimal.ZERO);
                resultEntries.add(remainingSelfSale);
            }
        }

        dto.setCompletedAt(effectiveCompletedAt);
        dto.setEntries(resultEntries);
        return dto;
    }

    private void createOrMergeAuctionEntry(
        Auction auction,
        List<AuctionEntry> existingEntries,
        AuctionBidCreateRequest request,
        Long traderId
    ) {
        AuctionEntry merged = null;
        if (!request.isSelfSale()) {
            merged =
                existingEntries
                    .stream()
                    .filter(e -> Boolean.FALSE.equals(e.getIsSelfSale()))
                    .filter(e -> e.getBuyerMark() != null && e.getBuyerMark().equals(request.getBuyerMark()))
                    .filter(e -> e.getBidRate() != null && e.getBidRate().compareTo(request.getRate()) == 0)
                    .findFirst()
                    .orElse(null);
        }

        if (merged != null) {
            int newQty = merged.getQuantity() + request.getQuantity();
            merged.setQuantity(newQty);
            merged.setAmount(merged.getBidRate().multiply(BigDecimal.valueOf(newQty)));
            merged.setLastModifiedDate(Instant.now());
            auctionEntryRepository.save(merged);
        } else {
            AuctionEntry entry = new AuctionEntry();
            entry.setAuctionId(auction.getId());
            entry.setBuyerId(request.getBuyerId());
            entry.setBuyerName(request.getBuyerName());
            entry.setBuyerMark(request.getBuyerMark());
            int nextBidNumber = existingEntries.stream().map(AuctionEntry::getBidNumber).max(Integer::compareTo).orElse(0) + 1;
            entry.setBidNumber(nextBidNumber);

            BigDecimal rate = request.getRate();
            BigDecimal preset = request.getPresetApplied() != null ? request.getPresetApplied() : BigDecimal.ZERO;
            AuctionPresetType type = request.getPresetType() != null ? request.getPresetType() : AuctionPresetType.PROFIT;
            BigDecimal extra = request.getExtraRate() != null ? request.getExtraRate() : BigDecimal.ZERO;

            entry.setBidRate(rate);
            entry.setPresetMargin(preset);
            entry.setPresetType(type);
            entry.setSellerRate(rate);
            entry.setSummarySellerRate(rate);
            entry.setBuyerRate(rate.add(extra));
            entry.setQuantity(request.getQuantity());
            entry.setAmount(entry.getBuyerRate().multiply(BigDecimal.valueOf(request.getQuantity())));
            entry.setIsSelfSale(request.isSelfSale());
            entry.setIsScribble(request.isScribble());
            entry.setTokenAdvance(request.getTokenAdvance() != null ? request.getTokenAdvance() : BigDecimal.ZERO);
            entry.setExtraRate(extra);
            entry.setCreatedAt(Instant.now());

            auctionEntryRepository.save(entry);
        }

        if (request.getBuyerId() != null) {
            contactService.ensureTraderUsesPortalContact(traderId, request.getBuyerId());
        }
    }

    private void createSelfSaleUnitsFromCompletedAuction(Auction auction, List<AuctionEntry> entries, Long traderId) {
        for (AuctionEntry entry : entries) {
            if (!Boolean.TRUE.equals(entry.getIsSelfSale())) {
                continue;
            }
            if (entry.getId() == null || auctionSelfSaleUnitRepository.existsBySourceAuctionEntryId(entry.getId())) {
                continue;
            }

            AuctionSelfSaleUnit unit = new AuctionSelfSaleUnit();
            unit.setTraderId(traderId);
            unit.setLotId(auction.getLotId());
            unit.setSourceAuctionId(auction.getId());
            unit.setSourceAuctionEntryId(entry.getId());
            unit.setSelfSaleQty(entry.getQuantity());
            unit.setRemainingQty(entry.getQuantity());
            unit.setRate(entry.getBidRate());
            unit.setAmount(entry.getAmount());
            unit.setStatus(AuctionSelfSaleUnitStatus.OPEN);
            unit.setCreatedAt(auction.getCompletedAt() != null ? auction.getCompletedAt() : Instant.now());
            auctionSelfSaleUnitRepository.save(unit);
        }
    }

    private AuctionSelfSaleUnitDTO toAuctionSelfSaleUnitDTO(
        AuctionSelfSaleUnit unit,
        Lot lot,
        Map<Long, SellerInVehicle> sivById,
        Map<Long, Vehicle> vehicleById,
        Map<Long, Contact> contactById,
        Map<Long, Commodity> commodityById,
        VehicleSellerQtyIndex qtyIndex
    ) {
        if (lot == null) {
            return null;
        }
        AuctionSelfSaleUnitDTO dto = new AuctionSelfSaleUnitDTO();
        dto.setSelfSaleUnitId(unit.getId());
        dto.setLotId(lot.getId());
        dto.setLotName(lot.getLotName());
        dto.setBagCount(unit.getRemainingQty());
        dto.setOriginalBagCount(unit.getSelfSaleQty());
        dto.setSelfSaleQty(unit.getSelfSaleQty());
        dto.setRemainingQty(unit.getRemainingQty());
        dto.setRate(unit.getRate());
        dto.setAmount(unit.getAmount());
        dto.setStatus(unit.getStatus());
        dto.setCreatedAt(unit.getCreatedAt());
        dto.setSellerVehicleId(lot.getSellerVehicleId());
        SellerInVehicle siv = lot.getSellerVehicleId() != null ? sivById.get(lot.getSellerVehicleId()) : null;
        if (siv != null) {
            Contact contact = siv.getContactId() != null ? contactById.get(siv.getContactId()) : null;
            Vehicle vehicle = siv.getVehicleId() != null ? vehicleById.get(siv.getVehicleId()) : null;
            dto.setSellerName(resolveAuctionSellerName(contact, siv));
            dto.setSellerMark(resolveAuctionSellerMark(contact, siv));
            dto.setVehicleNumber(vehicle != null ? vehicle.getVehicleNumber() : null);
            if (vehicle != null && vehicle.getVehicleMarkAlias() != null && !vehicle.getVehicleMarkAlias().isBlank()) {
                dto.setVehicleMark(vehicle.getVehicleMarkAlias().trim());
            }
            if (qtyIndex != null && lot.getSellerVehicleId() != null) {
                dto.setSellerTotalQty(qtyIndex.sellerVehicleIdToTotal.get(lot.getSellerVehicleId()));
            }
            if (qtyIndex != null && siv.getVehicleId() != null) {
                dto.setVehicleTotalQty(qtyIndex.vehicleIdToTotal.get(siv.getVehicleId()));
            }
        }
        if (lot.getCommodityId() != null) {
            Commodity commodity = commodityById.get(lot.getCommodityId());
            dto.setCommodityName(commodity != null ? commodity.getCommodityName() : null);
        }
        return dto;
    }

    /**
     * Billing module: move auction bid ownership to the sales bill buyer (same trader).
     */
    private void applyBillingBuyerReassignFromPatch(
        AuctionEntry entry,
        Auction auction,
        AuctionBidUpdateRequest request,
        Long traderId
    ) {
        if (!Boolean.TRUE.equals(request.getBillingReassignBuyer())) {
            return;
        }
        String mark = request.getBuyerMark() != null ? request.getBuyerMark().trim() : "";
        String name = request.getBuyerName() != null ? request.getBuyerName().trim() : "";
        if (mark.isEmpty() || name.isEmpty()) {
            throw new IllegalArgumentException("buyer_name and buyer_mark are required when billing_reassign_buyer is true");
        }
        /* Print Hub stores BUYER_CHITI_BID completion by lotId:bidNumber only — clear so line can print under new buyer. */
        Long lotId = auction != null ? auction.getLotId() : null;
        Integer bidNum = entry.getBidNumber();
        if (lotId != null && bidNum != null && traderId != null) {
            String refId = lotId + ":" + bidNum;
            printLogRepository.deleteByTraderIdAndReferenceTypeAndReferenceId(traderId, PRINT_LOG_BUYER_CHITI_BID, refId);
            LOG.debug(
                "Cleared Print Hub BUYER_CHITI_BID logs for {} after billing buyer reassign (auction entry {})",
                refId,
                entry.getId()
            );
        }
        entry.setBuyerMark(mark);
        entry.setBuyerName(name);
        entry.setBuyerId(request.getBuyerId());
        if (entry.getBuyerId() != null) {
            contactService.ensureTraderUsesPortalContact(traderId, entry.getBuyerId());
        }
        LOG.debug("Billing reassigned auction entry id {} to buyer mark {}", entry.getId(), mark);
    }

    private AuctionResultEntryDTO toResultEntryDTO(AuctionEntry entry) {
        AuctionResultEntryDTO dto = new AuctionResultEntryDTO();
        dto.setBidNumber(entry.getBidNumber());
        dto.setAuctionEntryId(entry.getId());
        dto.setBuyerId(entry.getBuyerId());
        dto.setBuyerMark(entry.getBuyerMark());
        dto.setBuyerName(entry.getBuyerName());
        dto.setRate(entry.getBidRate());
        dto.setSummarySellerRate(entry.getSummarySellerRate() != null ? entry.getSummarySellerRate() : entry.getBidRate());
        dto.setQuantity(entry.getQuantity());
        dto.setAmount(entry.getAmount());
        dto.setIsSelfSale(entry.getIsSelfSale());
        dto.setIsScribble(entry.getIsScribble());
        dto.setPresetApplied(entry.getPresetMargin());
        dto.setPresetType(entry.getPresetType());
        dto.setTokenAdvance(entry.getTokenAdvance());
        return dto;
    }

    private boolean isLotOwnedByTrader(Lot lot, Long traderId) {
        if (lot == null || traderId == null) {
            return false;
        }
        Long lotTraderId = resolveLotTraderId(lot);
        return lotTraderId != null && Objects.equals(lotTraderId, traderId);
    }

    private Long resolveLotTraderId(Lot lot) {
        if (lot == null || lot.getSellerVehicleId() == null) {
            return null;
        }
        SellerInVehicle siv = sellerInVehicleRepository.findById(lot.getSellerVehicleId()).orElse(null);
        if (siv == null || siv.getVehicleId() == null) {
            return null;
        }
        Vehicle vehicle = vehicleRepository.findById(siv.getVehicleId()).orElse(null);
        return vehicle != null ? vehicle.getTraderId() : null;
    }

    private Long resolveTraderId() {
        return traderContextService.getCurrentTraderId();
    }

    public static class StaleBidEditException extends RuntimeException {

        public StaleBidEditException(String message) {
            super(message);
        }
    }

    public static class AuctionConflictException extends RuntimeException {

        private final String field;
        private final int currentTotal;
        private final int lotTotal;
        private final int attemptedQty;
        private final int newTotal;

        public AuctionConflictException(
            String message,
            String field,
            int currentTotal,
            int lotTotal,
            int attemptedQty,
            int newTotal
        ) {
            super(message);
            this.field = field;
            this.currentTotal = currentTotal;
            this.lotTotal = lotTotal;
            this.attemptedQty = attemptedQty;
            this.newTotal = newTotal;
        }

        public String getField() {
            return field;
        }

        public int getCurrentTotal() {
            return currentTotal;
        }

        public int getLotTotal() {
            return lotTotal;
        }

        public int getAttemptedQty() {
            return attemptedQty;
        }

        public int getNewTotal() {
            return newTotal;
        }
    }
}

