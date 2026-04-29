package com.mercotrace.service.impl;

import com.mercotrace.domain.*;
import com.mercotrace.domain.enumeration.VoucherLifecycleStatus;
import com.mercotrace.domain.enumeration.VoucherType;
import com.mercotrace.repository.ChartOfAccountRepository;
import com.mercotrace.repository.CommodityConfigRepository;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.FreightCalculationRepository;
import com.mercotrace.repository.BillNumberSequenceRepository;
import com.mercotrace.repository.PrintSettingRepository;
import com.mercotrace.repository.HamaliSlabRepository;
import com.mercotrace.repository.LotRepository;
import com.mercotrace.repository.PattiRepository;
import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.repository.SalesBillLineItemRepository;
import com.mercotrace.repository.SellerInVehicleRepository;
import com.mercotrace.repository.SettlementQuickExpenseStateRepository;
import com.mercotrace.repository.SettlementVoucherTempRepository;
import com.mercotrace.repository.VehicleRepository;
import com.mercotrace.repository.VehicleWeightRepository;
import com.mercotrace.repository.VoucherLineRepository;
import com.mercotrace.repository.WeighingSessionRepository;
import com.mercotrace.service.AuctionService;
import com.mercotrace.service.ContactService;
import com.mercotrace.service.SettlementService;
import com.mercotrace.service.TraderContextService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mercotrace.service.dto.AuctionResultDTO;
import com.mercotrace.service.dto.AuctionResultEntryDTO;
import com.mercotrace.service.dto.SettlementDTOs;
import com.mercotrace.service.dto.SettlementDTOs.*;
import java.math.BigDecimal;
import java.math.MathContext;
import java.util.*;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Implementation of {@link SettlementService}. Builds seller list from auction results
 * and arrival/weighing data; CRUD for Sales Patti.
 */
@Service
@Transactional
public class SettlementServiceImpl implements SettlementService {

    private static final Logger LOG = LoggerFactory.getLogger(SettlementServiceImpl.class);
    private static final int MAX_RESULTS_FOR_SELLERS = 2000;
    private static final String PATTI_BASE_SEQUENCE_KEY = "PATTI";

    private static final String RECEIVABLE_CLASSIFICATION = "RECEIVABLE";

    private final TraderContextService traderContextService;
    private final BillNumberSequenceRepository billNumberSequenceRepository;
    private final LotRepository lotRepository;
    private final AuctionService auctionService;
    private final PattiRepository pattiRepository;
    private final WeighingSessionRepository weighingSessionRepository;
    private final SellerInVehicleRepository sellerInVehicleRepository;
    private final ContactRepository contactRepository;
    private final VehicleRepository vehicleRepository;
    private final CommodityRepository commodityRepository;
    private final FreightCalculationRepository freightCalculationRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;
    private final VoucherLineRepository voucherLineRepository;
    private final VehicleWeightRepository vehicleWeightRepository;
    private final SalesBillLineItemRepository salesBillLineItemRepository;
    private final SalesBillRepository salesBillRepository;
    private final SettlementQuickExpenseStateRepository settlementQuickExpenseStateRepository;
    private final SettlementVoucherTempRepository settlementVoucherTempRepository;
    private final ContactService contactService;
    private final HamaliSlabRepository hamaliSlabRepository;
    private final CommodityConfigRepository commodityConfigRepository;
    private final PrintSettingRepository printSettingRepository;
    private final ObjectMapper objectMapper;

    public SettlementServiceImpl(
        TraderContextService traderContextService,
        BillNumberSequenceRepository billNumberSequenceRepository,
        LotRepository lotRepository,
        AuctionService auctionService,
        PattiRepository pattiRepository,
        WeighingSessionRepository weighingSessionRepository,
        SellerInVehicleRepository sellerInVehicleRepository,
        ContactRepository contactRepository,
        VehicleRepository vehicleRepository,
        CommodityRepository commodityRepository,
        FreightCalculationRepository freightCalculationRepository,
        ChartOfAccountRepository chartOfAccountRepository,
        VoucherLineRepository voucherLineRepository,
        VehicleWeightRepository vehicleWeightRepository,
        SalesBillLineItemRepository salesBillLineItemRepository,
        SalesBillRepository salesBillRepository,
        SettlementQuickExpenseStateRepository settlementQuickExpenseStateRepository,
        SettlementVoucherTempRepository settlementVoucherTempRepository,
        ContactService contactService,
        HamaliSlabRepository hamaliSlabRepository,
        CommodityConfigRepository commodityConfigRepository,
        PrintSettingRepository printSettingRepository,
        ObjectMapper objectMapper
    ) {
        this.traderContextService = traderContextService;
        this.billNumberSequenceRepository = billNumberSequenceRepository;
        this.lotRepository = lotRepository;
        this.auctionService = auctionService;
        this.pattiRepository = pattiRepository;
        this.weighingSessionRepository = weighingSessionRepository;
        this.sellerInVehicleRepository = sellerInVehicleRepository;
        this.contactRepository = contactRepository;
        this.vehicleRepository = vehicleRepository;
        this.commodityRepository = commodityRepository;
        this.freightCalculationRepository = freightCalculationRepository;
        this.chartOfAccountRepository = chartOfAccountRepository;
        this.voucherLineRepository = voucherLineRepository;
        this.vehicleWeightRepository = vehicleWeightRepository;
        this.salesBillLineItemRepository = salesBillLineItemRepository;
        this.salesBillRepository = salesBillRepository;
        this.settlementQuickExpenseStateRepository = settlementQuickExpenseStateRepository;
        this.settlementVoucherTempRepository = settlementVoucherTempRepository;
        this.contactService = contactService;
        this.hamaliSlabRepository = hamaliSlabRepository;
        this.commodityConfigRepository = commodityConfigRepository;
        this.printSettingRepository = printSettingRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SellerSettlementDTO> listSellers(Pageable pageable, String search) {
        Long traderId = traderContextService.getCurrentTraderId();
        List<Lot> traderLots = lotRepository.findAllByTraderId(traderId, Pageable.unpaged()).getContent();
        if (traderLots.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, 0);
        }
        List<Long> lotIds = traderLots.stream().map(Lot::getId).toList();
        Page<AuctionResultDTO> resultsPage = auctionService.listResultsByLotIds(
            lotIds,
            Pageable.ofSize(MAX_RESULTS_FOR_SELLERS)
        );
        List<AuctionResultDTO> results = resultsPage.getContent();
        if (results.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, 0);
        }

        Set<Long> sivIds = traderLots.stream().map(Lot::getSellerVehicleId).collect(Collectors.toSet());
        List<SellerInVehicle> sivs = sellerInVehicleRepository.findAllById(sivIds);
        Set<Long> contactIds = sivs.stream().map(SellerInVehicle::getContactId).collect(Collectors.toSet());
        Set<Long> vehicleIds = sivs.stream().map(SellerInVehicle::getVehicleId).collect(Collectors.toSet());
        Set<Long> commodityIds = traderLots.stream().map(Lot::getCommodityId).collect(Collectors.toSet());

        Map<Long, Contact> contactMap = contactRepository.findAllById(contactIds).stream().collect(Collectors.toMap(Contact::getId, c -> c));
        Map<Long, Vehicle> vehicleMap = vehicleRepository.findAllById(vehicleIds).stream().collect(Collectors.toMap(Vehicle::getId, v -> v));
        Map<Long, Commodity> commodityMap = commodityRepository.findAllById(commodityIds).stream().collect(Collectors.toMap(Commodity::getId, c -> c));
        Map<Long, Lot> lotMap = traderLots.stream().collect(Collectors.toMap(Lot::getId, l -> l));
        Map<Long, SellerInVehicle> sivMap = sivs.stream().collect(Collectors.toMap(SellerInVehicle::getId, s -> s));

        List<WeighingSession> weighingSessions = weighingSessionRepository.findAllByTraderIdOrderByCreatedDateDesc(
            traderId, Pageable.ofSize(MAX_RESULTS_FOR_SELLERS)).getContent();
        Map<Integer, BigDecimal> bidToWeight = weighingSessions.stream()
            .collect(Collectors.toMap(WeighingSession::getBidNumber, WeighingSession::getNetWeight, (a, b) -> a));

        Map<String, SellerSettlementDTO> sellerMap = new LinkedHashMap<>();
        for (AuctionResultDTO ar : results) {
            Lot lot = lotMap.get(ar.getLotId());
            if (lot == null) continue;
            SellerInVehicle siv = sivMap.get(lot.getSellerVehicleId());
            if (siv == null) continue;
            Contact contact = contactMap.get(siv.getContactId());
            Vehicle vehicle = vehicleMap.get(siv.getVehicleId());
            Commodity commodity = lot.getCommodityId() != null ? commodityMap.get(lot.getCommodityId()) : null;
            String sellerName = contact != null
                ? contact.getName()
                : (siv.getSellerName() != null && !siv.getSellerName().isBlank() ? siv.getSellerName() : "Unknown");
            String sellerMark = contact != null
                ? (contact.getMark() != null ? contact.getMark() : "")
                : (siv.getSellerMark() != null ? siv.getSellerMark() : "");
            String vehicleNumber = vehicle != null ? vehicle.getVehicleNumber() : "";
            String sellerIdKey = String.valueOf(lot.getSellerVehicleId());

            SellerSettlementDTO seller = sellerMap.computeIfAbsent(sellerIdKey, k -> {
                SellerSettlementDTO dto = new SellerSettlementDTO();
                dto.setSellerId(sellerIdKey);
                dto.setSellerName(sellerName);
                dto.setSellerMark(sellerMark);
                dto.setVehicleId(siv.getVehicleId());
                dto.setVehicleNumber(vehicleNumber);
                dto.setFromLocation(vehicle != null ? vehicle.getOrigin() : null);
                dto.setSellerSerialNo(lot.getSellerSerialNo());
                dto.setDate(vehicle != null ? vehicle.getArrivalDatetime() : lot.getCreatedAt());
                dto.setLots(new ArrayList<>());
                return dto;
            });

            String lotIdStr = String.valueOf(ar.getLotId());
            SettlementLotDTO lotDto = seller.getLots().stream().filter(l -> lotIdStr.equals(l.getLotId())).findFirst().orElse(null);
            if (lotDto == null) {
                lotDto = new SettlementLotDTO();
                lotDto.setLotId(lotIdStr);
                lotDto.setLotName(ar.getLotName() != null ? ar.getLotName() : "");
                lotDto.setCommodityName(commodity != null ? commodity.getCommodityName() : "");
                lotDto.setArrivalBagCount(lot.getBagCount() != null ? lot.getBagCount() : 0);
                lotDto.setEntries(new ArrayList<>());
                seller.getLots().add(lotDto);
            }

            for (AuctionResultEntryDTO entry : ar.getEntries()) {
                SettlementEntryDTO se = new SettlementEntryDTO();
                se.setBidNumber(entry.getBidNumber());
                se.setBuyerMark(entry.getBuyerMark());
                se.setBuyerName(entry.getBuyerName());
                se.setRate(entry.getRate());
                se.setSummarySellerRate(
                    entry.getSummarySellerRate() != null ? entry.getSummarySellerRate() : entry.getRate()
                );
                se.setPresetMargin(entry.getPresetApplied());
                se.setQuantity(entry.getQuantity());
                BigDecimal weight = bidToWeight.getOrDefault(entry.getBidNumber(), entry.getQuantity() != null ? BigDecimal.valueOf(entry.getQuantity() * 50) : BigDecimal.ZERO);
                se.setWeight(weight);
                lotDto.getEntries().add(se);
            }
        }

        Map<String, BigDecimal> billingWeightByLotId = new HashMap<>();
        List<String> allLotIdStrs = traderLots.stream().map(l -> String.valueOf(l.getId())).toList();
        if (!allLotIdStrs.isEmpty()) {
            List<Object[]> billingRows = salesBillLineItemRepository.sumWeightGroupedByLotId(traderId, allLotIdStrs);
            for (Object[] row : billingRows) {
                if (row[0] != null && row[1] != null) {
                    billingWeightByLotId.put((String) row[0], (BigDecimal) row[1]);
                }
            }
        }

        Map<Long, BigDecimal> vehicleBillableKg = new HashMap<>();
        for (Long vid : vehicleIds) {
            vehicleWeightRepository
                .findOneByVehicleId(vid)
                .ifPresent(w -> {
                    double net = w.getNetWeight() != null ? w.getNetWeight() : 0d;
                    double ded = w.getDeductedWeight() != null ? w.getDeductedWeight() : 0d;
                    vehicleBillableKg.put(vid, BigDecimal.valueOf(Math.max(0d, net - ded)));
                });
        }

        for (SellerSettlementDTO seller : sellerMap.values()) {
            SellerInVehicle sivRow;
            try {
                sivRow = sivMap.get(Long.parseLong(seller.getSellerId()));
            } catch (NumberFormatException e) {
                sivRow = null;
            }
            if (sivRow != null && sivRow.getVehicleId() != null) {
                BigDecimal vkg = vehicleBillableKg.get(sivRow.getVehicleId());
                seller.setVehicleArrivalNetBillableKg(vkg);
            }
            if (sivRow != null) {
                if (sivRow.getContactId() != null) {
                    seller.setContactId(String.valueOf(sivRow.getContactId()));
                    Contact c = contactMap.get(sivRow.getContactId());
                    if (c != null && c.getPhone() != null && !c.getPhone().isBlank()) {
                        seller.setSellerPhone(c.getPhone());
                    }
                } else {
                    seller.setContactId(null);
                    String ph = sivRow.getSellerPhone();
                    if (ph != null && !ph.isBlank()) {
                        seller.setSellerPhone(ph);
                    }
                }
            }
            int arrivalBags = 0;
            BigDecimal billingNet = BigDecimal.ZERO;
            for (SettlementLotDTO lotDto : seller.getLots()) {
                String lid = lotDto.getLotId();
                lotDto.setBillingWeightKg(billingWeightByLotId.get(lid));
                try {
                    Lot lotEntity = lotMap.get(Long.parseLong(lid));
                    if (lotEntity != null && lotEntity.getBagCount() != null) {
                        arrivalBags += lotEntity.getBagCount();
                    }
                } catch (NumberFormatException ignored) {
                    // ignore malformed lot id
                }
                billingNet = billingNet.add(billingWeightByLotId.getOrDefault(lid, BigDecimal.ZERO));
            }
            seller.setArrivalTotalBags(arrivalBags);
            seller.setBillingNetWeightKg(billingNet);
        }

        List<SellerSettlementDTO> allSellers = new ArrayList<>(sellerMap.values());
        if (search != null && !search.isBlank()) {
            String q = search.toLowerCase().trim();
            allSellers = allSellers.stream()
                .filter(s -> (s.getSellerName() != null && s.getSellerName().toLowerCase().contains(q))
                    || (s.getSellerMark() != null && s.getSellerMark().toLowerCase().contains(q))
                    || (s.getVehicleNumber() != null && s.getVehicleNumber().toLowerCase().contains(q)))
                .toList();
        }
        int total = allSellers.size();
        int from = (int) pageable.getOffset();
        int to = Math.min(from + pageable.getPageSize(), total);
        List<SellerSettlementDTO> pageContent = from < total ? allSellers.subList(from, to) : List.of();
        return new PageImpl<>(pageContent, pageable, total);
    }

    @Override
    @Transactional(readOnly = false)
    public PattiDTO createPatti(PattiSaveRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        String pattiBaseNumber = normalizePattiBaseNumber(request.getPattiBaseNumber());
        if (pattiBaseNumber == null) {
            pattiBaseNumber = reserveNextPattiBaseNumber(request.getSellerId());
        }
        int sellerSequence = normalizeSellerSequence(request.getSellerSequenceNumber());
        String pattiId = buildPattiId(pattiBaseNumber, sellerSequence);
        Patti entity = new Patti();
        entity.setTraderId(traderId);
        entity.setPattiId(pattiId);
        entity.setPattiBaseNumber(pattiBaseNumber);
        entity.setSellerSequenceNumber(sellerSequence);
        entity.setSellerId(request.getSellerId());
        entity.setSellerName(request.getSellerName());
        entity.setGrossAmount(request.getGrossAmount());
        entity.setTotalDeductions(request.getTotalDeductions());
        entity.setNetPayable(request.getNetPayable());
        entity.setUseAverageWeight(Boolean.TRUE.equals(request.getUseAverageWeight()));
        entity.setInProgress(Boolean.TRUE.equals(request.getInProgress()));
        entity.setExtensionJson(blankToNull(request.getExtensionJson()));
        entity = pattiRepository.save(entity);
        mapRequestDeductionsAndClustersToEntity(request, entity);
        applyOriginalSnapshotIfEmpty(entity, request.getOriginalSnapshotJson());
        pattiRepository.save(entity);
        return toPattiDTO(pattiRepository.findById(entity.getId()).orElseThrow());
    }

    private void mapRequestDeductionsAndClustersToEntity(PattiSaveRequest request, Patti entity) {
        int so = 0;
        for (RateClusterDTO rc : request.getRateClusters()) {
            PattiRateCluster c = new PattiRateCluster();
            c.setPatti(entity);
            c.setRate(rc.getRate());
            c.setTotalQuantity(rc.getTotalQuantity() != null ? rc.getTotalQuantity() : 0);
            c.setTotalWeight(rc.getTotalWeight() != null ? rc.getTotalWeight() : BigDecimal.ZERO);
            c.setAmount(rc.getAmount() != null ? rc.getAmount() : BigDecimal.ZERO);
            c.setSortOrder(so++);
            entity.getRateClusters().add(c);
        }
        so = 0;
        for (DeductionItemDTO d : request.getDeductions()) {
            PattiDeduction pd = new PattiDeduction();
            pd.setPatti(entity);
            pd.setDeductionKey(d.getKey());
            pd.setLabel(d.getLabel());
            pd.setAmount(d.getAmount() != null ? d.getAmount() : BigDecimal.ZERO);
            pd.setEditable(Boolean.TRUE.equals(d.getEditable()));
            pd.setAutoPulled(Boolean.TRUE.equals(d.getAutoPulled()));
            pd.setSortOrder(so++);
            entity.getDeductions().add(pd);
        }
    }

    private static String buildPattiId(String pattiBaseNumber, int sellerSequence) {
        return pattiBaseNumber + "-" + sellerSequence;
    }

    private static int normalizeSellerSequence(Integer sellerSequenceNumber) {
        if (sellerSequenceNumber == null || sellerSequenceNumber <= 0) {
            return 1;
        }
        return sellerSequenceNumber;
    }

    private static String normalizePattiBaseNumber(String base) {
        if (base == null) {
            return null;
        }
        String trimmed = base.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String cleaned = trimmed.toUpperCase().replaceAll("[^A-Z0-9-]", "");
        return cleaned.isBlank() ? null : cleaned;
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s;
    }

    /** Persist original snapshot once when the column is still empty. */
    private void applyOriginalSnapshotIfEmpty(Patti patti, String fromRequest) {
        if (patti.getOriginalSnapshotJson() != null && !patti.getOriginalSnapshotJson().isBlank()) {
            return;
        }
        if (fromRequest == null || fromRequest.isBlank()) {
            return;
        }
        patti.setOriginalSnapshotJson(sanitizeOriginalSnapshotJsonForStorage(fromRequest.trim()));
    }

    /** Drop legacy keys (e.g. versions[]) so JDBC maps TEXT as a single string field reliably. */
    private String sanitizeOriginalSnapshotJsonForStorage(String raw) {
        try {
            JsonNode node = objectMapper.readTree(raw);
            if (node instanceof ObjectNode obj) {
                obj.remove("versions");
                return objectMapper.writeValueAsString(obj);
            }
        } catch (JsonProcessingException e) {
            LOG.warn("Could not sanitize original snapshot JSON, storing as-is: {}", e.getMessage());
        }
        return raw;
    }

    @Override
    @Transactional(readOnly = false)
    public String reserveNextPattiBaseNumber(String sellerId) {
        Long traderId = traderContextService.getCurrentTraderId();
        String billPrefix = resolveCommodityPrefixForSeller(sellerId);
        String seqKey = billPrefix != null ? billPrefix : PATTI_BASE_SEQUENCE_KEY;
        BillNumberSequence seq = billNumberSequenceRepository
            .findByPrefixForUpdate(seqKey)
            .orElseGet(() -> {
                BillNumberSequence s = new BillNumberSequence();
                s.setPrefix(seqKey);
                s.setNextValue(1L);
                return s;
            });
        long seqNext = seq.getNextValue() != null && seq.getNextValue() > 0 ? seq.getNextValue() : 1L;
        Integer floor = printSettingRepository
            .findByTraderIdAndModuleKey(traderId, "SETTLEMENT")
            .map(PrintSetting::getBillNumberStartFrom)
            .orElse(null);
        long effective = floor != null ? Math.max(seqNext, floor.longValue()) : seqNext;
        seq.setNextValue(effective + 1L);
        billNumberSequenceRepository.save(seq);
        if (billPrefix != null) {
            return billPrefix + "-" + String.format("%05d", effective);
        }
        return String.valueOf(effective);
    }

    private String resolveCommodityPrefixForSeller(String sellerId) {
        if (sellerId == null || sellerId.isBlank()) {
            return null;
        }
        long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            return null;
        }
        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            return null;
        }
        List<Lot> sellerLots = lotRepository.findAllBySellerVehicleIdAndTraderId(sivId, traderId);
        if (sellerLots.isEmpty()) {
            return null;
        }
        Set<String> prefixes = new LinkedHashSet<>();
        for (Lot lot : sellerLots) {
            Long commodityId = lot.getCommodityId();
            if (commodityId == null) continue;
            commodityConfigRepository
                .findOneByCommodityId(commodityId)
                .map(CommodityConfig::getBillPrefix)
                .map(p -> p != null ? p.trim().toUpperCase() : "")
                .filter(p -> !p.isBlank())
                .ifPresent(prefixes::add);
        }
        if (prefixes.size() == 1) {
            return prefixes.iterator().next();
        }
        return null;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PattiDTO> getPattiById(Long id) {
        Long traderId = traderContextService.getCurrentTraderId();
        return pattiRepository
            .findById(id)
            .filter(p -> traderId.equals(p.getTraderId()))
            .map(this::toPattiDTO);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PattiDTO> getPattiByPattiId(String pattiId) {
        Long traderId = traderContextService.getCurrentTraderId();
        return pattiRepository
            .findByPattiId(pattiId)
            .filter(p -> traderId.equals(p.getTraderId()))
            .map(this::toPattiDTO);
    }

    @Override
    @Transactional(readOnly = false)
    public Optional<PattiDTO> updatePatti(Long id, PattiSaveRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        Optional<Patti> opt = pattiRepository.findById(id).filter(p -> traderId.equals(p.getTraderId()));
        if (opt.isEmpty()) {
            return Optional.empty();
        }
        Patti patti = opt.get();
        applyOriginalSnapshotIfEmpty(patti, request.getOriginalSnapshotJson());
        patti.setSellerName(request.getSellerName());
        patti.setGrossAmount(request.getGrossAmount());
        patti.setTotalDeductions(request.getTotalDeductions());
        patti.setNetPayable(request.getNetPayable());
        patti.setUseAverageWeight(Boolean.TRUE.equals(request.getUseAverageWeight()));
        patti.setInProgress(Boolean.TRUE.equals(request.getInProgress()));
        patti.setExtensionJson(blankToNull(request.getExtensionJson()));
        patti.getRateClusters().clear();
        patti.getDeductions().clear();
        mapRequestDeductionsAndClustersToEntity(request, patti);
        pattiRepository.save(patti);
        return pattiRepository.findById(id).map(this::toPattiDTO);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PattiDTO> listPattis(Pageable pageable) {
        Long traderId = traderContextService.getCurrentTraderId();
        return pattiRepository.findAllByTraderIdAndInProgressFalseOrderByCreatedDateDesc(traderId, pageable).map(this::toPattiDTO);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PattiDTO> listInProgressPattis(Pageable pageable) {
        Long traderId = traderContextService.getCurrentTraderId();
        return pattiRepository.findAllByTraderIdAndInProgressTrueOrderByCreatedDateDesc(traderId, pageable).map(this::toPattiDTO);
    }

    @Override
    @Transactional(readOnly = true)
    public SellerChargesDTO getSellerCharges(String sellerId) {
        SellerChargesDTO dto = new SellerChargesDTO();
        dto.setFreight(BigDecimal.ZERO);
        dto.setAdvance(BigDecimal.ZERO);
        dto.setFreightAutoPulled(Boolean.FALSE);
        dto.setAdvanceAutoPulled(Boolean.FALSE);

        if (sellerId == null || sellerId.isBlank()) {
            return dto;
        }
        Long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            LOG.debug("Invalid sellerId for getSellerCharges: {}", sellerId);
            return dto;
        }

        Optional<SellerInVehicle> sivOpt = sellerInVehicleRepository.findById(sivId);
        if (sivOpt.isEmpty()) {
            return dto;
        }

        SellerInVehicle siv = sivOpt.get();
        Long vehicleId = siv.getVehicleId();
        Long traderId = traderContextService.getCurrentTraderId();

        BigDecimal advanceFromFreight = BigDecimal.ZERO;
        BigDecimal freight = BigDecimal.ZERO;

        Optional<FreightCalculation> fcOpt = freightCalculationRepository.findOneByVehicleId(vehicleId);
        if (fcOpt.isPresent()) {
            FreightCalculation fc = fcOpt.get();
            freight = BigDecimal.valueOf(fc.getTotalAmount() != null ? fc.getTotalAmount() : 0d);
            advanceFromFreight = BigDecimal.valueOf(fc.getAdvancePaid() != null ? fc.getAdvancePaid() : 0d);
        }

        BigDecimal ledgerAdvance = BigDecimal.ZERO;
        Long contactId = siv.getContactId();
        if (contactId != null && traderId != null) {
            Optional<ChartOfAccount> ledgerOpt = chartOfAccountRepository
                .findFirstByTraderIdAndContactIdAndClassification(traderId, contactId, RECEIVABLE_CLASSIFICATION);
            if (ledgerOpt.isPresent()) {
                BigDecimal sum = voucherLineRepository.sumCreditByLedgerIdAndVoucherTypeExcludingStatus(
                    ledgerOpt.get().getId(), VoucherType.ADVANCE, VoucherLifecycleStatus.REVERSED
                );
                ledgerAdvance = sum != null ? sum : BigDecimal.ZERO;
            }
        }

        BigDecimal totalAdvance = advanceFromFreight.add(ledgerAdvance);
        dto.setFreight(freight);
        dto.setAdvance(totalAdvance);
        dto.setFreightAutoPulled(freight.compareTo(BigDecimal.ZERO) > 0);
        dto.setAdvanceAutoPulled(totalAdvance.compareTo(BigDecimal.ZERO) > 0);
        return dto;
    }

    @Override
    @Transactional(readOnly = true)
    public SellerExpenseSnapshotDTO getSellerExpenseSnapshot(String sellerId) {
        SellerExpenseSnapshotDTO out = new SellerExpenseSnapshotDTO();
        out.setFreight(BigDecimal.ZERO);
        out.setUnloading(BigDecimal.ZERO);
        out.setWeighing(BigDecimal.ZERO);
        out.setCashAdvance(BigDecimal.ZERO);
        out.setFreightAutoPulled(Boolean.FALSE);
        out.setUnloadingAutoPulled(Boolean.FALSE);
        out.setWeighingAutoPulled(Boolean.FALSE);
        out.setCashAdvanceJournalPending(Boolean.TRUE);

        if (sellerId == null || sellerId.isBlank()) {
            return out;
        }
        long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            LOG.debug("Invalid sellerId for getSellerExpenseSnapshot: {}", sellerId);
            return out;
        }

        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            return out;
        }

        Optional<SellerInVehicle> sivOpt = sellerInVehicleRepository.findById(sivId);
        if (sivOpt.isEmpty()) {
            return out;
        }
        SellerInVehicle siv = sivOpt.get();
        Long vehicleId = siv.getVehicleId();
        if (vehicleId == null) {
            return out;
        }

        SellerChargesDTO charges = getSellerCharges(sellerId);
        BigDecimal advance = charges.getAdvance() != null ? charges.getAdvance() : BigDecimal.ZERO;
        out.setCashAdvance(advance);
        out.setCashAdvanceJournalPending(Boolean.TRUE);

        BigDecimal freightTotal = BigDecimal.ZERO;
        Optional<FreightCalculation> fcOpt = freightCalculationRepository.findOneByVehicleId(vehicleId);
        if (fcOpt.isPresent() && fcOpt.get().getTotalAmount() != null) {
            freightTotal = BigDecimal.valueOf(fcOpt.get().getTotalAmount());
        }

        List<SellerInVehicle> vehicleSivs = sellerInVehicleRepository.findAllByVehicleId(vehicleId);
        Map<Long, List<Lot>> lotsBySellerVehicleId = new HashMap<>();
        List<Lot> allVehicleLots = new ArrayList<>();
        for (SellerInVehicle vs : vehicleSivs) {
            List<Lot> vlots = lotRepository.findAllBySellerVehicleIdAndTraderId(vs.getId(), traderId);
            lotsBySellerVehicleId.put(vs.getId(), vlots);
            allVehicleLots.addAll(vlots);
        }
        List<Lot> sellerLots = lotsBySellerVehicleId.getOrDefault(sivId, List.of());

        List<WeighingSession> weighingSessions =
            weighingSessionRepository.findAllByTraderIdOrderByCreatedDateDesc(traderId, Pageable.ofSize(MAX_RESULTS_FOR_SELLERS))
                .getContent();
        Map<Integer, BigDecimal> bidToWeight =
            weighingSessions
                .stream()
                .filter(ws -> ws.getBidNumber() != null)
                .collect(
                    Collectors.toMap(
                        WeighingSession::getBidNumber,
                        ws -> ws.getNetWeight() != null ? ws.getNetWeight() : BigDecimal.ZERO,
                        (a, b) -> a
                    )
                );

        List<String> allLotIdStrs = allVehicleLots.stream().map(l -> String.valueOf(l.getId())).toList();
        Map<String, BigDecimal> billingByLot = new HashMap<>();
        if (!allLotIdStrs.isEmpty()) {
            List<Object[]> billingRows = salesBillLineItemRepository.sumWeightGroupedByLotId(traderId, allLotIdStrs);
            for (Object[] row : billingRows) {
                if (row[0] != null && row[1] != null) {
                    billingByLot.put((String) row[0], (BigDecimal) row[1]);
                }
            }
        }

        List<Long> lotIds = allVehicleLots.stream().map(Lot::getId).toList();
        Map<Long, AuctionResultDTO> arByLot = new HashMap<>();
        if (!lotIds.isEmpty()) {
            Page<AuctionResultDTO> arPage = auctionService.listResultsByLotIds(lotIds, Pageable.unpaged());
            for (AuctionResultDTO ar : arPage.getContent()) {
                arByLot.put(ar.getLotId(), ar);
            }
        }

        double totalVehicleActualWeightKg = 0d;
        for (Lot lot : allVehicleLots) {
            BigDecimal billingKg = billingByLot.get(String.valueOf(lot.getId()));
            AuctionResultDTO ar = arByLot.get(lot.getId());
            BigDecimal actualW = resolveLotWeightKgForCharges(billingKg, ar, bidToWeight);
            totalVehicleActualWeightKg += actualW.doubleValue();
        }
        double sellerActualWeightKg = 0d;
        for (Lot lot : sellerLots) {
            BigDecimal billingKg = billingByLot.get(String.valueOf(lot.getId()));
            AuctionResultDTO ar = arByLot.get(lot.getId());
            BigDecimal actualW = resolveLotWeightKgForCharges(billingKg, ar, bidToWeight);
            sellerActualWeightKg += actualW.doubleValue();
        }

        BigDecimal sellerFreight = BigDecimal.ZERO;
        if (totalVehicleActualWeightKg > 0d && freightTotal.compareTo(BigDecimal.ZERO) > 0) {
            sellerFreight =
                freightTotal
                    .multiply(BigDecimal.valueOf(sellerActualWeightKg))
                    .divide(BigDecimal.valueOf(totalVehicleActualWeightKg), new MathContext(20));
        }
        out.setFreight(sellerFreight);
        out.setFreightAutoPulled(sellerFreight.compareTo(BigDecimal.ZERO) > 0);

        BigDecimal unloadingSum = BigDecimal.ZERO;
        BigDecimal weighingSum = BigDecimal.ZERO;
        for (Lot lot : sellerLots) {
            Long commodityId = lot.getCommodityId();
            if (commodityId == null) {
                continue;
            }
            BigDecimal billingKg = billingByLot.get(String.valueOf(lot.getId()));
            AuctionResultDTO ar = arByLot.get(lot.getId());
            BigDecimal actualW = resolveLotWeightKgForCharges(billingKg, ar, bidToWeight);
            double actual = actualW.doubleValue();

            List<HamaliSlab> slabs = hamaliSlabRepository.findAllByCommodityIdOrderByThresholdWeight(commodityId);
            slabs.sort(Comparator.comparing(HamaliSlab::getThresholdWeight));
            HamaliSlab firstSlab = slabs.isEmpty() ? null : slabs.get(0);
            if (firstSlab != null && firstSlab.getThresholdWeight() != null && firstSlab.getThresholdWeight() > 0) {
                double fr = firstSlab.getFixedRate() != null ? firstSlab.getFixedRate() : 0d;
                double u = computeSlabChargeTotal(actual, fr, firstSlab.getThresholdWeight());
                unloadingSum = unloadingSum.add(BigDecimal.valueOf(u));
            }

            Optional<CommodityConfig> cfgOpt = commodityConfigRepository.findOneByCommodityId(commodityId);
            if (cfgOpt.isPresent()) {
                CommodityConfig cfg = cfgOpt.get();
                Double wTh = cfg.getWeighingThreshold();
                Double wCh = cfg.getWeighingCharge();
                if (wTh != null && wTh > 0 && wCh != null) {
                    double w = computeSlabChargeTotal(actual, wCh, wTh);
                    weighingSum = weighingSum.add(BigDecimal.valueOf(w));
                }
            }
        }

        out.setUnloading(unloadingSum);
        out.setWeighing(weighingSum);
        out.setUnloadingAutoPulled(unloadingSum.compareTo(BigDecimal.ZERO) > 0);
        out.setWeighingAutoPulled(weighingSum.compareTo(BigDecimal.ZERO) > 0);

        return out;
    }

    @Override
    public QuickExpenseStateResponse hydrateQuickExpenseState(QuickExpenseStateUpsertRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        QuickExpenseStateResponse out = new QuickExpenseStateResponse();
        if (traderId == null || request == null || request.getRows() == null || request.getRows().isEmpty()) {
            out.setRows(List.of());
            return out;
        }

        List<QuickExpenseStateUpsertRowDTO> rows = request.getRows();
        List<String> sellerIds = rows.stream().map(QuickExpenseStateUpsertRowDTO::getSellerId).filter(Objects::nonNull).toList();
        Map<String, SettlementQuickExpenseState> existingBySellerId = settlementQuickExpenseStateRepository
            .findAllByTraderIdAndSellerIdIn(traderId, sellerIds)
            .stream()
            .collect(Collectors.toMap(SettlementQuickExpenseState::getSellerId, s -> s));

        List<QuickExpenseStateRowDTO> resultRows = new ArrayList<>();
        for (QuickExpenseStateUpsertRowDTO row : rows) {
            if (row == null || row.getSellerId() == null || row.getSellerId().isBlank()) continue;
            SettlementQuickExpenseState state = existingBySellerId.get(row.getSellerId());
            if (state == null) {
                state = new SettlementQuickExpenseState();
                state.setTraderId(traderId);
                state.setSellerId(row.getSellerId().trim());
                BigDecimal freight = clampMoney(row.getFreight());
                BigDecimal unloading = clampMoney(row.getUnloading());
                BigDecimal weighing = clampMoney(row.getWeighing());
                BigDecimal gunnies = clampMoney(row.getGunnies());
                state.setFreightOriginal(freight);
                state.setUnloadingOriginal(unloading);
                state.setWeighingOriginal(weighing);
                state.setGunniesOriginal(gunnies);
                state.setFreightCurrent(freight);
                state.setUnloadingCurrent(unloading);
                state.setWeighingCurrent(weighing);
                state.setGunniesCurrent(gunnies);
                state = settlementQuickExpenseStateRepository.save(state);
            }
            resultRows.add(toQuickExpenseStateRowDTO(state));
        }
        out.setRows(resultRows);
        return out;
    }

    @Override
    public QuickExpenseStateResponse saveQuickExpenseState(QuickExpenseStateUpsertRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        QuickExpenseStateResponse out = new QuickExpenseStateResponse();
        if (traderId == null || request == null || request.getRows() == null || request.getRows().isEmpty()) {
            out.setRows(List.of());
            return out;
        }

        List<QuickExpenseStateUpsertRowDTO> rows = request.getRows();
        List<String> sellerIds = rows.stream().map(QuickExpenseStateUpsertRowDTO::getSellerId).filter(Objects::nonNull).toList();
        Map<String, SettlementQuickExpenseState> existingBySellerId = settlementQuickExpenseStateRepository
            .findAllByTraderIdAndSellerIdIn(traderId, sellerIds)
            .stream()
            .collect(Collectors.toMap(SettlementQuickExpenseState::getSellerId, s -> s));

        List<QuickExpenseStateRowDTO> resultRows = new ArrayList<>();
        for (QuickExpenseStateUpsertRowDTO row : rows) {
            if (row == null || row.getSellerId() == null || row.getSellerId().isBlank()) continue;
            SettlementQuickExpenseState state = existingBySellerId.get(row.getSellerId());
            BigDecimal freight = clampMoney(row.getFreight());
            BigDecimal unloading = clampMoney(row.getUnloading());
            BigDecimal weighing = clampMoney(row.getWeighing());
            BigDecimal gunnies = clampMoney(row.getGunnies());
            if (state == null) {
                state = new SettlementQuickExpenseState();
                state.setTraderId(traderId);
                state.setSellerId(row.getSellerId().trim());
                state.setFreightOriginal(freight);
                state.setUnloadingOriginal(unloading);
                state.setWeighingOriginal(weighing);
                state.setGunniesOriginal(gunnies);
            }
            state.setFreightCurrent(freight);
            state.setUnloadingCurrent(unloading);
            state.setWeighingCurrent(weighing);
            state.setGunniesCurrent(gunnies);
            SettlementQuickExpenseState saved = settlementQuickExpenseStateRepository.save(state);
            resultRows.add(toQuickExpenseStateRowDTO(saved));
        }
        out.setRows(resultRows);
        return out;
    }

    private static BigDecimal clampMoney(BigDecimal value) {
        if (value == null) return BigDecimal.ZERO.setScale(2, java.math.RoundingMode.HALF_UP);
        BigDecimal n = value.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : value;
        return n.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static QuickExpenseStateRowDTO toQuickExpenseStateRowDTO(SettlementQuickExpenseState state) {
        QuickExpenseStateRowDTO dto = new QuickExpenseStateRowDTO();
        dto.setSellerId(state.getSellerId());
        dto.setFreightOriginal(state.getFreightOriginal());
        dto.setUnloadingOriginal(state.getUnloadingOriginal());
        dto.setWeighingOriginal(state.getWeighingOriginal());
        dto.setGunniesOriginal(state.getGunniesOriginal());
        dto.setFreightCurrent(state.getFreightCurrent());
        dto.setUnloadingCurrent(state.getUnloadingCurrent());
        dto.setWeighingCurrent(state.getWeighingCurrent());
        dto.setGunniesCurrent(state.getGunniesCurrent());
        return dto;
    }

    /** SRS hamali / weighing: Rf × max(1, W / T), aligned with SettlementPage {@code computeSlabChargeTotal}. */
    private static double computeSlabChargeTotal(double actualWeight, double fixedRate, double threshold) {
        double w = Math.max(0d, actualWeight);
        double t = Math.max(0d, threshold);
        double f = Math.max(0d, fixedRate);
        if (t <= 0d) {
            return 0d;
        }
        return f * Math.max(1d, w / t);
    }

    private static BigDecimal resolveLotWeightKgForCharges(
        BigDecimal billingKg,
        AuctionResultDTO ar,
        Map<Integer, BigDecimal> bidToWeight
    ) {
        if (billingKg != null && billingKg.compareTo(BigDecimal.ZERO) > 0) {
            return billingKg;
        }
        if (ar == null || ar.getEntries() == null || ar.getEntries().isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal sum = BigDecimal.ZERO;
        for (AuctionResultEntryDTO e : ar.getEntries()) {
            Integer bid = e.getBidNumber();
            BigDecimal w =
                bid != null
                    ? bidToWeight.getOrDefault(
                        bid,
                        e.getQuantity() != null ? BigDecimal.valueOf(e.getQuantity().longValue() * 50L) : BigDecimal.ZERO
                    )
                    : BigDecimal.ZERO;
            sum = sum.add(w != null ? w : BigDecimal.ZERO);
        }
        return sum;
    }

    @Override
    @Transactional(readOnly = true)
    public SettlementAmountSummaryDTO getSettlementAmountSummary(String sellerId, String invoiceNameFilter) {
        SettlementAmountSummaryDTO out = new SettlementAmountSummaryDTO();
        out.setArrivalFreightAmount(BigDecimal.ZERO);
        out.setFreightInvoiced(BigDecimal.ZERO);
        out.setPayableInvoiced(BigDecimal.ZERO);

        if (sellerId == null || sellerId.isBlank()) {
            return out;
        }
        Long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            LOG.debug("Invalid sellerId for getSettlementAmountSummary: {}", sellerId);
            return out;
        }

        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            return out;
        }

        Optional<SellerInVehicle> sivOpt = sellerInVehicleRepository.findById(sivId);
        if (sivOpt.isEmpty()) {
            return out;
        }
        SellerInVehicle siv = sivOpt.get();
        if (siv.getVehicleId() == null) {
            return out;
        }
        // Same access rule as expense snapshot / settlement list: trader must have lots for this seller (SIV → Vehicle join).
        // Do not gate on vehicle.trader_id alone — it can disagree with how lots are scoped while FreightCalculation still exists.
        if (lotRepository.findAllBySellerVehicleIdAndTraderId(sivId, traderId).isEmpty()) {
            return out;
        }

        SellerChargesDTO charges = getSellerCharges(sellerId);
        BigDecimal arrival = charges.getFreight() != null ? charges.getFreight() : BigDecimal.ZERO;
        out.setArrivalFreightAmount(arrival);

        List<SellerInVehicle> vehicleSellers = sellerInVehicleRepository.findAllByVehicleId(siv.getVehicleId());
        List<Long> sellerVehicleIds = vehicleSellers.stream().map(SellerInVehicle::getId).toList();
        if (sellerVehicleIds.isEmpty()) {
            return out;
        }
        List<Lot> lots = lotRepository.findAllBySellerVehicleIdIn(sellerVehicleIds);
        if (lots.isEmpty()) {
            return out;
        }
        List<Long> lotIdsLong = lots.stream().map(Lot::getId).distinct().toList();
        List<String> lotIdStrs = lotIdsLong.stream().map(String::valueOf).toList();

        String nameFilter = invoiceNameFilter != null && !invoiceNameFilter.isBlank() ? invoiceNameFilter.trim() : null;

        BigDecimal payableInvoiced =
            salesBillLineItemRepository.sumLineAmountByTraderLotsForSettlement(traderId, lotIdStrs, lotIdsLong, nameFilter);
        BigDecimal payableGross = payableInvoiced != null ? payableInvoiced : BigDecimal.ZERO;

        List<Long> billIds =
            salesBillLineItemRepository.findDistinctBillIdsByTraderAndLotsForSettlement(traderId, lotIdStrs, lotIdsLong, nameFilter);
        if (billIds.isEmpty()) {
            return out;
        }
        BigDecimal freightInv = salesBillRepository.sumOutboundFreightByTraderAndBillIds(traderId, billIds);
        BigDecimal freightInvoiced = freightInv != null ? freightInv : BigDecimal.ZERO;
        out.setFreightInvoiced(freightInvoiced);
        out.setPayableInvoiced(payableGross.subtract(freightInvoiced));
        return out;
    }

    @Override
    @Transactional
    public SellerRegistrationDTO linkSellerContact(String sellerVehicleId, LinkSellerContactRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            throw new IllegalArgumentException("Trader context required");
        }
        if (sellerVehicleId == null || sellerVehicleId.isBlank() || request == null || request.getContactId() == null) {
            throw new IllegalArgumentException("sellerId and contactId are required");
        }
        long sivId;
        try {
            sivId = Long.parseLong(sellerVehicleId.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid seller id");
        }
        SellerInVehicle siv = sellerInVehicleRepository
            .findById(sivId)
            .orElseThrow(() -> new IllegalArgumentException("Seller not found"));
        List<Lot> traderLots = lotRepository.findAllByTraderId(traderId, Pageable.unpaged()).getContent();
        boolean owns = traderLots.stream().anyMatch(l -> sivId == l.getSellerVehicleId());
        if (!owns) {
            throw new IllegalArgumentException("Seller not in scope for this trader");
        }
        Long contactId = request.getContactId();
        contactService.ensureTraderUsesPortalContact(traderId, contactId);
        Contact c = contactRepository.findById(contactId).orElseThrow(() -> new IllegalArgumentException("Contact not found"));
        siv.setContactId(contactId);
        siv.setSellerName(null);
        siv.setSellerPhone(null);
        siv.setSellerMark(null);
        sellerInVehicleRepository.save(siv);
        SellerRegistrationDTO out = new SellerRegistrationDTO();
        out.setSellerId(sellerVehicleId.trim());
        out.setContactId(String.valueOf(contactId));
        out.setSellerName(c.getName());
        out.setSellerMark(c.getMark() != null ? c.getMark() : "");
        out.setSellerPhone(c.getPhone() != null ? c.getPhone() : "");
        return out;
    }

    @Override
    @Transactional
    public SellerReplacementDTO replaceSeller(String sellerVehicleId, ReplaceSellerRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            throw new IllegalArgumentException("Trader context required");
        }
        if (sellerVehicleId == null || sellerVehicleId.isBlank() || request == null || request.getReplacementSellerId() == null) {
            throw new IllegalArgumentException("sellerId and replacementSellerId are required");
        }
        long targetId;
        long replacementId;
        try {
            targetId = Long.parseLong(sellerVehicleId.trim());
            replacementId = Long.parseLong(request.getReplacementSellerId().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid seller id");
        }
        SellerInVehicle target = sellerInVehicleRepository
            .findById(targetId)
            .orElseThrow(() -> new IllegalArgumentException("Seller not found"));
        SellerInVehicle replacement = sellerInVehicleRepository
            .findById(replacementId)
            .orElseThrow(() -> new IllegalArgumentException("Replacement seller not found"));

        List<Lot> traderLots = lotRepository.findAllByTraderId(traderId, Pageable.unpaged()).getContent();
        boolean ownsTarget = traderLots.stream().anyMatch(l -> targetId == l.getSellerVehicleId());
        boolean ownsReplacement = traderLots.stream().anyMatch(l -> replacementId == l.getSellerVehicleId());
        if (!ownsTarget || !ownsReplacement) {
            throw new IllegalArgumentException("Seller not in scope for this trader");
        }

        target.setContactId(replacement.getContactId());
        if (replacement.getContactId() != null) {
            target.setSellerName(null);
            target.setSellerPhone(null);
            target.setSellerMark(null);
        } else {
            target.setSellerName(replacement.getSellerName());
            target.setSellerPhone(replacement.getSellerPhone());
            target.setSellerMark(replacement.getSellerMark());
        }
        sellerInVehicleRepository.save(target);

        SellerReplacementDTO out = new SellerReplacementDTO();
        out.setSellerId(String.valueOf(targetId));
        if (target.getContactId() != null) {
            Contact c = contactRepository.findById(target.getContactId()).orElse(null);
            out.setContactId(String.valueOf(target.getContactId()));
            out.setSellerName(c != null && c.getName() != null ? c.getName() : "");
            out.setSellerMark(c != null && c.getMark() != null ? c.getMark() : "");
            out.setSellerPhone(c != null && c.getPhone() != null ? c.getPhone() : "");
        } else {
            out.setContactId(null);
            out.setSellerName(target.getSellerName() != null ? target.getSellerName() : "");
            out.setSellerMark(target.getSellerMark() != null ? target.getSellerMark() : "");
            out.setSellerPhone(target.getSellerPhone() != null ? target.getSellerPhone() : "");
        }
        return out;
    }

    @Override
    @Transactional
    public SettlementVoucherTempDTO createSettlementVoucherTemp(String sellerId, SettlementVoucherTempCreateRequest request) {
        if (sellerId == null || sellerId.isBlank()) {
            throw new IllegalArgumentException("sellerId is required");
        }
        if (request == null) {
            throw new IllegalArgumentException("Voucher payload is required");
        }
        String normalizedName = request.getVoucherName() != null ? request.getVoucherName().trim() : "";
        if (normalizedName.isBlank()) {
            throw new IllegalArgumentException("Voucher name is required");
        }
        BigDecimal amount = clampMoney(request.getExpenseAmount());
        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            throw new IllegalArgumentException("Trader context required");
        }
        long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid seller id");
        }
        if (lotRepository.findAllBySellerVehicleIdAndTraderId(sivId, traderId).isEmpty()) {
            throw new IllegalArgumentException("Seller not in scope for this trader");
        }

        SettlementVoucherTemp entity = new SettlementVoucherTemp();
        entity.setTraderId(traderId);
        entity.setSellerId(sellerId.trim());
        entity.setVoucherName(normalizedName);
        entity.setForWhoName(request.getForWhoName() != null ? request.getForWhoName().trim() : null);
        entity.setDescription(request.getDescription() != null ? request.getDescription().trim() : null);
        entity.setExpenseAmount(amount);
        SettlementVoucherTemp saved = settlementVoucherTempRepository.save(entity);

        SettlementVoucherTempDTO dto = new SettlementVoucherTempDTO();
        dto.setId(saved.getId());
        dto.setSellerId(saved.getSellerId());
        dto.setVoucherName(saved.getVoucherName());
        dto.setDescription(saved.getDescription());
        dto.setExpenseAmount(saved.getExpenseAmount());
        dto.setCreatedAt(saved.getCreatedDate());
        return dto;
    }

    @Override
    @Transactional(readOnly = true)
    public SettlementVoucherTempListResponse listSettlementVoucherTemps(String sellerId) {
        Scope scope = validateSellerScope(sellerId);
        List<SettlementVoucherTempDTO> rows = settlementVoucherTempRepository
            .findAllByTraderIdAndSellerIdOrderByCreatedDateAsc(scope.traderId(), scope.sellerId())
            .stream()
            .map(this::toSettlementVoucherTempDTO)
            .toList();
        SettlementVoucherTempListResponse out = new SettlementVoucherTempListResponse();
        out.setRows(rows);
        out.setTotalExpenseAmount(rows.stream().map(SettlementVoucherTempDTO::getExpenseAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        return out;
    }

    @Override
    @Transactional
    public SettlementVoucherTempListResponse saveSettlementVoucherTemps(String sellerId, SettlementVoucherTempUpsertRequest request) {
        Scope scope = validateSellerScope(sellerId);
        if (request == null || request.getRows() == null) {
            throw new IllegalArgumentException("Voucher rows are required");
        }
        settlementVoucherTempRepository.deleteAllByTraderIdAndSellerId(scope.traderId(), scope.sellerId());
        List<SettlementVoucherTempDTO> savedRows = new ArrayList<>();
        for (SettlementVoucherTempUpsertRowDTO row : request.getRows()) {
            if (row == null) {
                continue;
            }
            String name = row.getVoucherName() != null ? row.getVoucherName().trim() : "";
            if (name.isBlank()) {
                continue;
            }
            BigDecimal amount = clampMoney(row.getExpenseAmount());
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            SettlementVoucherTemp entity = new SettlementVoucherTemp();
            entity.setTraderId(scope.traderId());
            entity.setSellerId(scope.sellerId());
            entity.setVoucherName(name);
            entity.setForWhoName(row.getForWhoName() != null ? row.getForWhoName().trim() : null);
            entity.setDescription(row.getDescription() != null ? row.getDescription().trim() : null);
            entity.setExpenseAmount(amount);
            savedRows.add(toSettlementVoucherTempDTO(settlementVoucherTempRepository.save(entity)));
        }

        SettlementVoucherTempListResponse out = new SettlementVoucherTempListResponse();
        out.setRows(savedRows);
        out.setTotalExpenseAmount(savedRows.stream().map(SettlementVoucherTempDTO::getExpenseAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        return out;
    }

    private SettlementVoucherTempDTO toSettlementVoucherTempDTO(SettlementVoucherTemp saved) {
        SettlementVoucherTempDTO dto = new SettlementVoucherTempDTO();
        dto.setId(saved.getId());
        dto.setSellerId(saved.getSellerId());
        dto.setVoucherName(saved.getVoucherName());
        dto.setForWhoName(saved.getForWhoName());
        dto.setDescription(saved.getDescription());
        dto.setExpenseAmount(saved.getExpenseAmount());
        dto.setCreatedAt(saved.getCreatedDate());
        return dto;
    }

    private Scope validateSellerScope(String sellerId) {
        if (sellerId == null || sellerId.isBlank()) {
            throw new IllegalArgumentException("sellerId is required");
        }
        Long traderId = traderContextService.getCurrentTraderId();
        if (traderId == null) {
            throw new IllegalArgumentException("Trader context required");
        }
        long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid seller id");
        }
        if (lotRepository.findAllBySellerVehicleIdAndTraderId(sivId, traderId).isEmpty()) {
            throw new IllegalArgumentException("Seller not in scope for this trader");
        }
        return new Scope(traderId, sellerId.trim());
    }

    private record Scope(Long traderId, String sellerId) {}

    private PattiDTO toPattiDTO(Patti e) {
        PattiDTO dto = new PattiDTO();
        dto.setId(e.getId());
        dto.setPattiId(e.getPattiId());
        dto.setPattiBaseNumber(e.getPattiBaseNumber());
        dto.setSellerSequenceNumber(e.getSellerSequenceNumber());
        dto.setSellerId(e.getSellerId());
        dto.setSellerName(e.getSellerName());
        enrichPattiArrivalMeta(dto, e.getSellerId(), e.getTraderId());
        dto.setGrossAmount(e.getGrossAmount());
        dto.setTotalDeductions(e.getTotalDeductions());
        dto.setNetPayable(e.getNetPayable());
        dto.setCreatedAt(e.getCreatedDate());
        dto.setUseAverageWeight(e.getUseAverageWeight());
        dto.setInProgress(Boolean.TRUE.equals(e.getInProgress()));
        dto.setExtensionJson(e.getExtensionJson());
        for (PattiRateCluster c : e.getRateClusters()) {
            RateClusterDTO rc = new RateClusterDTO();
            rc.setRate(c.getRate());
            rc.setTotalQuantity(c.getTotalQuantity());
            rc.setTotalWeight(c.getTotalWeight());
            rc.setAmount(c.getAmount());
            dto.getRateClusters().add(rc);
        }
        for (PattiDeduction d : e.getDeductions()) {
            DeductionItemDTO dd = new DeductionItemDTO();
            dd.setKey(d.getDeductionKey());
            dd.setLabel(d.getLabel());
            dd.setAmount(d.getAmount());
            dd.setEditable(d.getEditable());
            dd.setAutoPulled(d.getAutoPulled());
            dto.getDeductions().add(dd);
        }
        String origJson = e.getOriginalSnapshotJson();
        if (origJson != null && !origJson.isBlank()) {
            try {
                dto.setOriginalData(objectMapper.readValue(origJson, java.util.Map.class));
            } catch (JsonProcessingException ex) {
                LOG.warn("Could not parse patti original snapshot: {}", ex.getMessage());
            }
        }
        return dto;
    }

    private void enrichPattiArrivalMeta(PattiDTO dto, String sellerId, Long traderId) {
        if (sellerId == null || sellerId.isBlank() || traderId == null) {
            return;
        }
        long sivId;
        try {
            sivId = Long.parseLong(sellerId.trim());
        } catch (NumberFormatException e) {
            return;
        }
        Optional<SellerInVehicle> sivOpt = sellerInVehicleRepository.findById(sivId);
        if (sivOpt.isEmpty()) {
            return;
        }
        SellerInVehicle siv = sivOpt.get();
        if (siv.getVehicleId() != null) {
            vehicleRepository.findById(siv.getVehicleId()).ifPresent(v -> {
                dto.setVehicleNumber(v.getVehicleNumber());
                dto.setFromLocation(v.getOrigin());
                dto.setDate(v.getArrivalDatetime());
            });
        }
        List<Lot> sellerLots = lotRepository.findAllBySellerVehicleIdAndTraderId(sivId, traderId);
        Integer serial = sellerLots.stream()
            .map(Lot::getSellerSerialNo)
            .filter(Objects::nonNull)
            .min(Integer::compareTo)
            .orElse(null);
        if (serial != null) {
            dto.setSellerSerialNo(serial);
        }
    }
}
