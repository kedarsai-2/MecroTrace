package com.mercotrace.service;

import com.mercotrace.domain.Auction;
import com.mercotrace.domain.AuctionEntry;
import com.mercotrace.domain.Commodity;
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
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service layer for Auction (Sales Pad) operations.
 */
@Service
@Transactional
public class AuctionService {

    private static final Logger LOG = LoggerFactory.getLogger(AuctionService.class);

    /** Calendar day for temporary-buyer expiry (scribble marks); aligns with primary market timezone. */
    private static final ZoneId BUSINESS_CALENDAR_ZONE = ZoneId.of("Asia/Kolkata");

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
        TraderContextService traderContextService
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

        List<Auction> auctions = auctionRepository.findAllByLotIdIn(lotIds);
        Set<Long> auctionIds = auctions.stream().map(Auction::getId).collect(Collectors.toSet());
        List<AuctionEntry> entries = auctionIds.isEmpty() ? List.of() : auctionEntryRepository.findAllByAuctionIdIn(auctionIds);

        Map<Long, List<Auction>> lotToAuctions = auctions.stream().collect(Collectors.groupingBy(Auction::getLotId));
        Map<Long, List<AuctionEntry>> auctionToEntries = entries.stream().collect(Collectors.groupingBy(AuctionEntry::getAuctionId));

        // Compute vehicle total qty and seller total qty for lot identifier (Vehicle QTY / Seller QTY / Lot Name-Lot QTY)
        List<SellerInVehicle> allSivsForVehicles = sellerInVehicleRepository.findAllByVehicleIdIn(vehicleIds);
        Set<Long> allSivIds = allSivsForVehicles.stream().map(SellerInVehicle::getId).collect(Collectors.toSet());
        List<Lot> allLotsOnVehicles = allSivIds.isEmpty() ? List.of() : lotRepository.findAllBySellerVehicleIdIn(allSivIds);
        Map<Long, Integer> vehicleIdToTotal = new HashMap<>();
        Map<Long, Integer> sellerVehicleIdToTotal = new HashMap<>();
        for (Lot l : allLotsOnVehicles) {
            if (l.getSellerVehicleId() != null) {
                sellerVehicleIdToTotal.merge(l.getSellerVehicleId(), l.getBagCount() != null ? l.getBagCount() : 0, Integer::sum);
            }
        }
        for (Long vid : vehicleIds) {
            List<Long> sivIdsOfVehicle = allSivsForVehicles.stream()
                .filter(s -> vid.equals(s.getVehicleId()))
                .map(SellerInVehicle::getId)
                .toList();
            int total = allLotsOnVehicles.stream()
                .filter(l -> sivIdsOfVehicle.contains(l.getSellerVehicleId()))
                .mapToInt(l -> l.getBagCount() != null ? l.getBagCount() : 0)
                .sum();
            vehicleIdToTotal.put(vid, total);
        }

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
            if (statusFilter == null || statusFilter.isBlank() || statusFilter.equalsIgnoreCase(dto.getStatus())) {
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
            Vehicle v = vehicleMap.get(siv.getVehicleId());
            Contact c = contactMap.get(siv.getContactId());
            dto.setVehicleNumber(v != null ? v.getVehicleNumber() : null);
            dto.setSellerName(resolveAuctionSellerName(c, siv));
            dto.setSellerMark(resolveAuctionSellerMark(c, siv));
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
        int soldBags = 0;
        if (latestAuction.isPresent()) {
            List<AuctionEntry> ent = auctionToEntries.getOrDefault(latestAuction.get().getId(), List.of());
            soldBags = ent.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        }
        dto.setSoldBags(soldBags);

        int bagCount = lot.getBagCount() != null ? lot.getBagCount() : 0;
        int remaining = Math.max(0, bagCount - soldBags);
        String status;
        if (latestAuction.isEmpty() || auctionToEntries.getOrDefault(latestAuction.get().getId(), List.of()).isEmpty()) {
            status = "AVAILABLE";
        } else if (latestAuction.get().getCompletedAt() != null) {
            status = remaining == 0 ? "SOLD" : "PARTIAL";
        } else {
            status = remaining == 0 ? "SOLD" : "PENDING";
        }
        dto.setStatus(status);
        return dto;
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

        Auction auction = auctionRepository
            .findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)
            .orElseGet(() -> {
                Auction a = new Auction();
                a.setLotId(lotId);
                a.setTraderId(traderId);
                a.setAuctionDatetime(Instant.now());
                a.setCreatedAt(Instant.now());
                return auctionRepository.save(a);
            });

        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());

        return buildSessionDTO(auction, lot, entries);
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
        Auction auction = auctionRepository
            .findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)
            .orElseGet(() -> {
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

        // Duplicate mark logic – merge when same mark and same rate and not self-sale
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
            int newQty = merged.getQuantity() + requestedQty;
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

            // Assign next bid number in a simple monotonic fashion per auction
            int nextBidNumber = existingEntries.stream().map(AuctionEntry::getBidNumber).max(Integer::compareTo).orElse(0) + 1;
            entry.setBidNumber(nextBidNumber);

            BigDecimal rate = request.getRate();
            BigDecimal preset = request.getPresetApplied() != null ? request.getPresetApplied() : BigDecimal.ZERO;
            AuctionPresetType type = request.getPresetType() != null ? request.getPresetType() : AuctionPresetType.PROFIT;
            BigDecimal extra = request.getExtraRate() != null ? request.getExtraRate() : BigDecimal.ZERO;

            entry.setBidRate(rate);
            entry.setPresetMargin(preset);
            entry.setPresetType(type);

            // seller_rate stores the base auction bid only; preset_margin is stored separately
            // (Billing, PrintHub, Settlement compute effective seller rate = bid_rate + preset_margin when needed).
            entry.setSellerRate(rate);
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

        Auction auction = auctionRepository
            .findFirstByLotIdOrderByAuctionDatetimeDesc(lotId)
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
        auctionRepository.save(auction);

        return buildResultDTO(auction, lot, entries);
    }

    @Transactional(readOnly = true)
    public Page<AuctionResultDTO> listResults(Pageable pageable) {
        Long traderId = resolveTraderId();
        Page<Lot> traderLots = lotRepository.findAllByTraderId(traderId, Pageable.unpaged());
        if (traderLots.isEmpty()) {
            return Page.empty(pageable);
        }
        java.util.List<Long> lotIds = traderLots.getContent().stream().map(Lot::getId).toList();
        Page<Auction> page = auctionRepository.findByCompletedAtIsNotNullAndLotIdIn(lotIds, pageable);
        return buildResultsPage(page, pageable);
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
        Page<Auction> page = auctionRepository.findByCompletedAtIsNotNullAndLotIdIn(filteredLotIds, pageable);
        return buildResultsPage(page, pageable);
    }

    private Page<AuctionResultDTO> buildResultsPage(Page<Auction> page, Pageable pageable) {
        List<Auction> auctions = page.getContent();
        if (auctions.isEmpty()) {
            return Page.empty(pageable);
        }
        List<Long> auctionIds = auctions.stream().map(Auction::getId).toList();
        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionIdIn(auctionIds);
        List<Lot> lots = lotRepository.findAllById(auctions.stream().map(Auction::getLotId).toList());

        List<AuctionResultDTO> content = auctions
            .stream()
            .map(a -> {
                Lot lot = lots.stream().filter(l -> l.getId().equals(a.getLotId())).findFirst().orElse(null);
                List<AuctionEntry> aEntries = entries.stream().filter(e -> e.getAuctionId().equals(a.getId())).toList();
                return buildResultDTO(a, lot, aEntries);
            })
            .collect(Collectors.toList());

        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public Optional<AuctionResultDTO> getResultByLot(Long lotId) {
        Long traderId = resolveTraderId();
        Optional<Auction> auctionOpt = auctionRepository.findFirstByLotIdOrderByAuctionDatetimeDesc(lotId);
        if (auctionOpt.isEmpty()) {
            return Optional.empty();
        }
        Auction auction = auctionOpt.get();
        Lot lot = lotRepository.findById(lotId).orElse(null);
        if (lot == null || !isLotOwnedByTrader(lot, traderId)) {
            return Optional.empty();
        }
        List<AuctionEntry> entries = auctionEntryRepository.findAllByAuctionId(auction.getId());
        return Optional.of(buildResultDTO(auction, lot, entries));
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
        return Optional.of(buildResultDTO(auction, lot, entries));
    }

    private AuctionSessionDTO buildSessionDTO(Auction auction, Lot lot, List<AuctionEntry> entries) {
        AuctionSessionDTO dto = new AuctionSessionDTO();
        dto.setAuctionId(auction.getId());

        LotSummaryDTO lotSummary = new LotSummaryDTO();
        lotSummary.setLotId(lot.getId());
        lotSummary.setLotName(lot.getLotName());
        lotSummary.setBagCount(lot.getBagCount());
        lotSummary.setOriginalBagCount(lot.getBagCount());
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

        int totalSold = entries.stream().mapToInt(e -> e.getQuantity() != null ? e.getQuantity() : 0).sum();
        int bagCount = lot.getBagCount() != null ? lot.getBagCount() : 0;
        int remaining = Math.max(0, bagCount - totalSold);
        int highestRate = entries
            .stream()
            .map(AuctionEntry::getBidRate)
            .filter(r -> r != null)
            .map(r -> r.intValue())
            .max(Integer::compareTo)
            .orElse(0);

        String status;
        if (entries.isEmpty()) {
            status = "AVAILABLE";
        } else if (remaining == 0) {
            status = "SOLD";
        } else {
            status = "PARTIAL";
        }

        dto.setLot(lotSummary);
        dto.setEntries(auctionEntryMapper.toDto(entries));
        dto.setTotalSoldBags(totalSold);
        dto.setRemainingBags(remaining);
        dto.setHighestBidRate(highestRate);
        dto.setStatus(status);

        return dto;
    }

    private AuctionResultDTO buildResultDTO(Auction auction, Lot lot, List<AuctionEntry> entries) {
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

        List<AuctionResultEntryDTO> resultEntries = entries
            .stream()
            .sorted(Comparator.comparingInt(AuctionEntry::getBidNumber))
            .map(e -> {
                AuctionResultEntryDTO re = new AuctionResultEntryDTO();
                re.setBidNumber(e.getBidNumber());
                re.setBuyerId(e.getBuyerId());
                re.setBuyerMark(e.getBuyerMark());
                re.setBuyerName(e.getBuyerName());
                re.setRate(e.getBidRate());
                re.setQuantity(e.getQuantity());
                re.setAmount(e.getAmount());
                re.setIsSelfSale(e.getIsSelfSale());
                re.setIsScribble(e.getIsScribble());
                re.setPresetApplied(e.getPresetMargin());
                re.setPresetType(e.getPresetType());
                return re;
            })
            .collect(Collectors.toList());

        dto.setEntries(resultEntries);
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

