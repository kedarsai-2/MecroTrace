package com.mercotrace.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.domain.BillNumberSequence;
import com.mercotrace.domain.Commodity;
import com.mercotrace.domain.SalesBill;
import com.mercotrace.domain.SalesBillCommodityGroup;
import com.mercotrace.domain.SalesBillLineItem;
import com.mercotrace.domain.SalesBillVersion;
import com.mercotrace.domain.PrintSetting;
import com.mercotrace.domain.Trader;
import com.mercotrace.domain.Voucher;
import com.mercotrace.repository.BillNumberSequenceRepository;
import com.mercotrace.repository.PrintSettingRepository;
import com.mercotrace.repository.CommodityConfigRepository;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.repository.SalesBillRepository;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.repository.VoucherRepository;
import com.mercotrace.service.SalesBillService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.SalesBillDTOs.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sales Bill service: bill number generation per prefix, versioning, voucher creation.
 */
@Service
@Transactional
public class SalesBillServiceImpl implements SalesBillService {

    private static final Logger LOG = LoggerFactory.getLogger(SalesBillServiceImpl.class);
    private static final String DEFAULT_BILL_PREFIX = "MT";

    private final TraderContextService traderContextService;
    private final SalesBillRepository salesBillRepository;
    private final TraderRepository traderRepository;
    private final BillNumberSequenceRepository billNumberSequenceRepository;
    private final VoucherRepository voucherRepository;
    private final CommodityRepository commodityRepository;
    private final CommodityConfigRepository commodityConfigRepository;
    private final PrintSettingRepository printSettingRepository;
    private final ObjectMapper objectMapper;

    public SalesBillServiceImpl(
        TraderContextService traderContextService,
        SalesBillRepository salesBillRepository,
        TraderRepository traderRepository,
        BillNumberSequenceRepository billNumberSequenceRepository,
        VoucherRepository voucherRepository,
        CommodityRepository commodityRepository,
        CommodityConfigRepository commodityConfigRepository,
        PrintSettingRepository printSettingRepository,
        ObjectMapper objectMapper
    ) {
        this.traderContextService = traderContextService;
        this.salesBillRepository = salesBillRepository;
        this.traderRepository = traderRepository;
        this.billNumberSequenceRepository = billNumberSequenceRepository;
        this.voucherRepository = voucherRepository;
        this.commodityRepository = commodityRepository;
        this.commodityConfigRepository = commodityConfigRepository;
        this.printSettingRepository = printSettingRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SalesBillDTO> getBills(Pageable pageable, String billNumber, String buyerName,
                                       Instant dateFrom, Instant dateTo) {
        Long traderId = traderContextService.getCurrentTraderId();
        String bn = (billNumber != null && !billNumber.isBlank()) ? billNumber.trim() : null;
        String bn2 = (buyerName != null && !buyerName.isBlank()) ? buyerName.trim() : null;
        if (bn == null && bn2 == null && dateFrom == null && dateTo == null) {
            return salesBillRepository.findAllByTraderId(traderId, pageable).map(this::toDto);
        }
        return salesBillRepository.findByTraderIdAndFilters(traderId, bn, bn2, dateFrom, dateTo, pageable)
            .map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public SalesBillDTO getById(Long id) {
        Long traderId = traderContextService.getCurrentTraderId();
        SalesBill bill = salesBillRepository.findByIdWithGroupsAndVersions(id)
            .orElseThrow(() -> new IllegalArgumentException("Sales bill not found: " + id));
        if (!bill.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Sales bill not found: " + id);
        }
        return toDto(bill);
    }

    @Override
    public SalesBillDTO create(SalesBillCreateOrUpdateRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        SalesBill bill = new SalesBill();
        mapRequestToEntity(request, bill);
        bill.setTraderId(traderId);
        bill = salesBillRepository.save(bill);

        // Compute total coolie from per-commodity values
        BigDecimal totalCoolie = bill.getCommodityGroups().stream()
            .map(g -> g.getCoolieAmount() != null ? g.getCoolieAmount() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        createVouchersIfNeeded(traderId, bill.getId(), totalCoolie, bill.getOutboundFreight());
        return toDto(bill);
    }

    @Override
    public SalesBillDTO update(Long id, SalesBillCreateOrUpdateRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        SalesBill bill = salesBillRepository.findByIdWithGroupsAndVersions(id)
            .orElseThrow(() -> new IllegalArgumentException("Sales bill not found: " + id));
        if (!bill.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Sales bill not found: " + id);
        }

        // Version snapshot (current state before update)
        try {
            SalesBillDTO currentDto = toDto(bill);
            String snapshot = objectMapper.writeValueAsString(currentDto);
            SalesBillVersion version = new SalesBillVersion();
            version.setSalesBill(bill);
            version.setVersionNumber(bill.getVersions().size() + 1);
            version.setSavedAt(Instant.now());
            version.setSnapshotJson(snapshot);
            bill.getVersions().add(version);
        } catch (JsonProcessingException e) {
            LOG.warn("Could not serialize bill snapshot for version: {}", e.getMessage());
        }

        // Clear children and re-map (replace groups/items)
        bill.getCommodityGroups().clear();
        salesBillRepository.flush();
        mapRequestToEntity(request, bill);
        bill.setBillNumber(bill.getBillNumber() != null ? bill.getBillNumber() : request.getBillNumber());
        bill = salesBillRepository.save(bill);
        // REQ-BIL-008: keep expense recovery vouchers reconciled with current bill fields
        // Compute total coolie from per-commodity values
        BigDecimal totalCoolie = bill.getCommodityGroups().stream()
            .map(g -> g.getCoolieAmount() != null ? g.getCoolieAmount() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        createVouchersIfNeeded(traderId, bill.getId(), totalCoolie, bill.getOutboundFreight());
        return toDto(bill);
    }

    private String getTraderFallbackPrefix(Long traderId) {
        return traderRepository
            .findById(traderId)
            .map(Trader::getBillPrefix)
            .filter(p -> p != null && !p.isBlank())
            .map(String::trim)
            .orElse(DEFAULT_BILL_PREFIX);
    }

    /**
     * Assigns the next number for the given {@code prefix}. Uses {@code print_settings.bill_number_start_from}
     * from the BILLING module as a floor for this prefix's row in {@code bill_number_sequence}
     * ({@code max(sequenceNext, floor)}), same idea as settlement / patti using the SETTLEMENT floor per sequence key.
     * Each prefix (MT, ON, …) has its own counter; the floor applies when assigning sales bills, independent of
     * settlement print settings.
     */
    private String generateBillNumber(String prefix, Long traderId) {
        String key = prefix != null && !prefix.isBlank() ? prefix.trim().toUpperCase() : DEFAULT_BILL_PREFIX;

        BillNumberSequence seq = billNumberSequenceRepository.findByPrefixForUpdate(key)
            .orElseGet(() -> {
                BillNumberSequence newSeq = new BillNumberSequence();
                newSeq.setPrefix(key);
                newSeq.setNextValue(1L);
                return newSeq;
            });
        long seqNext = seq.getNextValue() != null && seq.getNextValue() > 0 ? seq.getNextValue() : 1L;
        Integer floor = printSettingRepository
            .findByTraderIdAndModuleKey(traderId, "BILLING")
            .map(PrintSetting::getBillNumberStartFrom)
            .orElse(null);
        long effective = floor != null ? Math.max(seqNext, floor.longValue()) : seqNext;
        seq.setNextValue(effective + 1);
        billNumberSequenceRepository.save(seq);
        return key + "-" + String.format("%05d", effective);
    }

    /**
     * Resolve bill prefix based on the bill's commodity groups and commodity config billPrefix values.
     * If exactly one distinct non-blank commodity billPrefix is found, use it.
     * Otherwise fall back to trader-level bill prefix.
     */
    private String resolveBillPrefixFromCommodities(SalesBill bill) {
        Long traderId = bill.getTraderId();
        if (traderId == null) {
            traderId = traderContextService.getCurrentTraderId();
        }
        List<SalesBillCommodityGroup> groups = bill.getCommodityGroups();
        if (groups == null || groups.isEmpty()) {
            return getTraderFallbackPrefix(traderId);
        }

        // SRS (REQ-CNF-007) describes bill prefix rules based on commodity combinations.
        // Best-effort implementation for common combinations:
        // Onion => ON, Onion+Potato => OP, Dry Chili => DC, Onion+Dry Chili => OS
        // For any other mix, fall back to config-prefix heuristic and then trader prefix.
        boolean hasOnion = groups.stream()
            .map(SalesBillCommodityGroup::getCommodityName)
            .filter(n -> n != null)
            .map(String::toLowerCase)
            .anyMatch(n -> n.contains("onion"));
        boolean hasPotato = groups.stream()
            .map(SalesBillCommodityGroup::getCommodityName)
            .filter(n -> n != null)
            .map(String::toLowerCase)
            .anyMatch(n -> n.contains("potato"));
        boolean hasDryChili = groups.stream()
            .map(SalesBillCommodityGroup::getCommodityName)
            .filter(n -> n != null)
            .map(String::toLowerCase)
            .anyMatch(n ->
                (n.contains("dry") && (n.contains("chili") || n.contains("chilli"))) ||
                    n.contains("drychili") ||
                    n.contains("drychilli")
            );

        String targetPrefixKey = null;
        if (hasOnion && !hasPotato && !hasDryChili) {
            targetPrefixKey = "ON";
        } else if (hasOnion && hasPotato && !hasDryChili) {
            targetPrefixKey = "OP";
        } else if (!hasOnion && !hasPotato && hasDryChili) {
            targetPrefixKey = "DC";
        } else if (hasOnion && !hasPotato && hasDryChili) {
            targetPrefixKey = "OS";
        }
        java.util.Set<String> prefixes = new java.util.LinkedHashSet<>();
        for (SalesBillCommodityGroup g : groups) {
            String commodityName = g.getCommodityName();
            if (commodityName == null || commodityName.isBlank()) {
                continue;
            }
            Commodity commodity = commodityRepository
                .findOneByTraderIdAndCommodityNameIgnoreCase(traderId, commodityName.trim())
                .orElse(null);
            if (commodity == null) {
                continue;
            }
            commodityConfigRepository
                .findOneByCommodityId(commodity.getId())
                .map(cc -> cc.getBillPrefix())
                .filter(p -> p != null && !p.isBlank())
                .map(String::trim)
                .ifPresent(prefixes::add);
        }
        if (targetPrefixKey != null && !prefixes.isEmpty()) {
            for (String p : prefixes) {
                if (p != null && p.trim().equalsIgnoreCase(targetPrefixKey)) {
                    return p.trim();
                }
            }
        }
        if (prefixes.size() == 1) {
            return prefixes.iterator().next();
        }
        return getTraderFallbackPrefix(traderId);
    }

    @Override
    public SalesBillDTO assignNumber(Long id) {
        Long traderId = traderContextService.getCurrentTraderId();
        SalesBill bill = salesBillRepository
            .findByIdWithGroupsAndVersions(id)
            .orElseThrow(() -> new IllegalArgumentException("Sales bill not found: " + id));
        if (!bill.getTraderId().equals(traderId)) {
            throw new IllegalArgumentException("Sales bill not found: " + id);
        }
        if (bill.getBillNumber() != null && !bill.getBillNumber().isBlank()) {
            return toDto(bill);
        }
        String prefix = resolveBillPrefixFromCommodities(bill);
        String billNumber = generateBillNumber(prefix, traderId);
        bill.setBillNumber(billNumber);
        bill = salesBillRepository.save(bill);
        return toDto(bill);
    }

    private void createVouchersIfNeeded(Long traderId, Long billId, BigDecimal buyerCoolie, BigDecimal outboundFreight) {
        Instant now = Instant.now();
        // Make voucher creation idempotent across bill updates.
        voucherRepository.deleteByReferenceTypeAndReferenceId("BUYER_COOLIE", billId);
        voucherRepository.deleteByReferenceTypeAndReferenceId("OUTBOUND_FREIGHT", billId);

        if (buyerCoolie != null && buyerCoolie.compareTo(BigDecimal.ZERO) > 0) {
            Voucher v = new Voucher();
            v.setTraderId(traderId);
            v.setReferenceType("BUYER_COOLIE");
            v.setReferenceId(billId);
            v.setAmount(buyerCoolie);
            v.setStatus(com.mercotrace.domain.enumeration.VoucherStatus.OPEN);
            v.setCreatedAt(now);
            voucherRepository.save(v);
        }
        if (outboundFreight != null && outboundFreight.compareTo(BigDecimal.ZERO) > 0) {
            Voucher v = new Voucher();
            v.setTraderId(traderId);
            v.setReferenceType("OUTBOUND_FREIGHT");
            v.setReferenceId(billId);
            v.setAmount(outboundFreight);
            v.setStatus(com.mercotrace.domain.enumeration.VoucherStatus.OPEN);
            v.setCreatedAt(now);
            voucherRepository.save(v);
        }
    }

    private void mapRequestToEntity(SalesBillCreateOrUpdateRequest request, SalesBill bill) {
        bill.setBuyerName(request.getBuyerName());
        bill.setBuyerMark(request.getBuyerMark());
        bill.setBuyerContactId(parseLongOrNull(request.getBuyerContactId()));
        bill.setBuyerPhone(request.getBuyerPhone());
        bill.setBuyerAddress(request.getBuyerAddress());
        bill.setBuyerAsBroker(Boolean.TRUE.equals(request.getBuyerAsBroker()));
        bill.setBrokerName(request.getBrokerName());
        bill.setBrokerMark(request.getBrokerMark());
        bill.setBrokerContactId(parseLongOrNull(request.getBrokerContactId()));
        bill.setBrokerPhone(request.getBrokerPhone());
        bill.setBrokerAddress(request.getBrokerAddress());
        bill.setBillingName(request.getBillingName());
        bill.setBillDate(parseInstant(request.getBillDate()));
        bill.setOutboundFreight(nullToZero(request.getOutboundFreight()));
        bill.setOutboundVehicle(request.getOutboundVehicle());
        bill.setTokenAdvance(nullToZero(request.getTokenAdvance()));
        bill.setGrandTotal(request.getGrandTotal() != null ? request.getGrandTotal() : BigDecimal.ZERO);
        bill.setBrokerageType(request.getBrokerageType() != null ? request.getBrokerageType() : "AMOUNT");
        bill.setBrokerageValue(nullToZero(request.getBrokerageValue()));
        bill.setGlobalOtherCharges(nullToZero(request.getGlobalOtherCharges()));
        bill.setPendingBalance(nullToZero(request.getPendingBalance()));

        int go = 0;
        for (CommodityGroupDTO g : request.getCommodityGroups()) {
            SalesBillCommodityGroup group = new SalesBillCommodityGroup();
            group.setSalesBill(bill);
            group.setCommodityName(g.getCommodityName());
            group.setHsnCode(g.getHsnCode());
            group.setCommissionPercent(nullToZero(g.getCommissionPercent()));
            group.setUserFeePercent(nullToZero(g.getUserFeePercent()));
            group.setSubtotal(g.getSubtotal() != null ? g.getSubtotal() : BigDecimal.ZERO);
            group.setCommissionAmount(nullToZero(g.getCommissionAmount()));
            group.setUserFeeAmount(nullToZero(g.getUserFeeAmount()));
            group.setTotalCharges(nullToZero(g.getTotalCharges()));
            int sumLineQty = sumLineItemQuantities(g);
            group.setCoolieChargeQty(g.getCoolieChargeQty());
            group.setWeighmanChargeQty(g.getWeighmanChargeQty());
            BigDecimal coolieRate = nullToZero(g.getCoolieRate());
            BigDecimal weighmanRate = nullToZero(g.getWeighmanChargeRate());
            group.setCoolieRate(coolieRate);
            group.setWeighmanChargeRate(weighmanRate);
            int effCoolieQty = effectiveChargeQty(g.getCoolieChargeQty(), sumLineQty);
            int effWeighmanQty = effectiveChargeQty(g.getWeighmanChargeQty(), sumLineQty);
            group.setCoolieAmount(roundedRateTimesQty(coolieRate, effCoolieQty));
            group.setWeighmanChargeAmount(roundedRateTimesQty(weighmanRate, effWeighmanQty));
            // Per-commodity discount and round-off
            group.setDiscount(nullToZero(g.getDiscount()));
            group.setDiscountType(g.getDiscountType() != null ? g.getDiscountType() : "AMOUNT");
            group.setManualRoundOff(nullToZero(g.getManualRoundOff()));
            // Backend enforces split-tax behavior used by Billing UI:
            // - combined GST is deprecated for bills (always stored as 0)
            // - GST mode uses SGST+CGST (IGST forced to 0)
            // - IGST mode uses IGST (SGST+CGST forced to 0)
            BigDecimal sgstRate = nullToZero(g.getSgstRate());
            BigDecimal cgstRate = nullToZero(g.getCgstRate());
            BigDecimal igstRate = nullToZero(g.getIgstRate());
            boolean hasIgst = igstRate.compareTo(BigDecimal.ZERO) > 0;
            boolean hasSplit = sgstRate.compareTo(BigDecimal.ZERO) > 0 || cgstRate.compareTo(BigDecimal.ZERO) > 0;
            if (hasIgst) {
                sgstRate = BigDecimal.ZERO;
                cgstRate = BigDecimal.ZERO;
            } else if (hasSplit) {
                igstRate = BigDecimal.ZERO;
            }
            group.setGstRate(BigDecimal.ZERO);
            group.setGstInputMode(null);
            group.setSgstRate(sgstRate);
            group.setSgstInputMode(g.getSgstInputMode());
            group.setCgstRate(cgstRate);
            group.setCgstInputMode(g.getCgstInputMode());
            group.setIgstRate(igstRate);
            group.setIgstInputMode(g.getIgstInputMode());
            group.setSortOrder(go++);
            bill.getCommodityGroups().add(group);
            int io = 0;
            for (BillLineItemDTO it : g.getItems()) {
                SalesBillLineItem item = new SalesBillLineItem();
                item.setCommodityGroup(group);
                item.setBidNumber(it.getBidNumber() != null ? it.getBidNumber() : 0);
                item.setLotName(it.getLotName());
                String lotId = it.getLotId();
                item.setLotId(lotId != null && !lotId.isBlank() ? lotId.trim() : null);
                item.setAuctionEntryId(it.getAuctionEntryId());
                item.setSelfSaleUnitId(it.getSelfSaleUnitId());
                item.setSellerName(it.getSellerName());
                item.setLotTotalQty(it.getLotTotalQty());
                item.setVehicleTotalQty(it.getVehicleTotalQty());
                item.setSellerVehicleQty(it.getSellerVehicleQty());
                item.setVehicleMark(it.getVehicleMark());
                item.setSellerMark(it.getSellerMark());
                item.setQuantity(it.getQuantity() != null ? it.getQuantity() : 0);
                item.setWeight(it.getWeight() != null ? it.getWeight() : BigDecimal.ZERO);
                item.setBaseRate(it.getBaseRate() != null ? it.getBaseRate() : BigDecimal.ZERO);
                item.setBrokerage(nullToZero(it.getBrokerage()));
                item.setPresetApplied(nullToZero(it.getPresetApplied()));
                item.setOtherCharges(nullToZero(it.getOtherCharges()));
                item.setNewRate(it.getNewRate() != null ? it.getNewRate() : BigDecimal.ZERO);
                item.setAmount(it.getAmount() != null ? it.getAmount() : BigDecimal.ZERO);
                item.setTokenAdvance(nullToZero(it.getTokenAdvance()));
                item.setSortOrder(io++);
                group.getItems().add(item);
            }
        }
    }

    private SalesBillDTO toDto(SalesBill bill) {
        SalesBillDTO dto = new SalesBillDTO();
        dto.setBillId(String.valueOf(bill.getId()));
        dto.setBillNumber(bill.getBillNumber());
        dto.setBuyerName(bill.getBuyerName());
        dto.setBuyerMark(bill.getBuyerMark());
        dto.setBuyerContactId(bill.getBuyerContactId() != null ? String.valueOf(bill.getBuyerContactId()) : null);
        dto.setBuyerPhone(bill.getBuyerPhone());
        dto.setBuyerAddress(bill.getBuyerAddress());
        dto.setBuyerAsBroker(Boolean.TRUE.equals(bill.getBuyerAsBroker()));
        dto.setBrokerName(bill.getBrokerName());
        dto.setBrokerMark(bill.getBrokerMark());
        dto.setBrokerContactId(bill.getBrokerContactId() != null ? String.valueOf(bill.getBrokerContactId()) : null);
        dto.setBrokerPhone(bill.getBrokerPhone());
        dto.setBrokerAddress(bill.getBrokerAddress());
        dto.setBillingName(bill.getBillingName());
        dto.setBillDate(bill.getBillDate() != null ? bill.getBillDate().toString() : null);
        dto.setOutboundFreight(bill.getOutboundFreight());
        dto.setOutboundVehicle(bill.getOutboundVehicle());
        dto.setTokenAdvance(bill.getTokenAdvance());
        dto.setGrandTotal(bill.getGrandTotal());
        dto.setBrokerageType(bill.getBrokerageType());
        dto.setBrokerageValue(bill.getBrokerageValue());
        dto.setGlobalOtherCharges(bill.getGlobalOtherCharges());
        dto.setPendingBalance(bill.getPendingBalance());

        List<CommodityGroupDTO> groups = new ArrayList<>();
        for (SalesBillCommodityGroup g : bill.getCommodityGroups()) {
            CommodityGroupDTO gdto = new CommodityGroupDTO();
            gdto.setId(g.getId());
            gdto.setCommodityName(g.getCommodityName());
            gdto.setHsnCode(g.getHsnCode());
            gdto.setCommissionPercent(g.getCommissionPercent());
            gdto.setUserFeePercent(g.getUserFeePercent());
            gdto.setSubtotal(g.getSubtotal());
            gdto.setCommissionAmount(g.getCommissionAmount());
            gdto.setUserFeeAmount(g.getUserFeeAmount());
            gdto.setTotalCharges(g.getTotalCharges());
            // Per-commodity coolie charge
            gdto.setCoolieRate(g.getCoolieRate());
            gdto.setCoolieAmount(g.getCoolieAmount());
            gdto.setCoolieChargeQty(g.getCoolieChargeQty());
            // Per-commodity weighman charge
            gdto.setWeighmanChargeRate(g.getWeighmanChargeRate());
            gdto.setWeighmanChargeAmount(g.getWeighmanChargeAmount());
            gdto.setWeighmanChargeQty(g.getWeighmanChargeQty());
            // Per-commodity discount and round-off
            gdto.setDiscount(g.getDiscount());
            gdto.setDiscountType(g.getDiscountType());
            gdto.setManualRoundOff(g.getManualRoundOff());
            // Keep API responses aligned with split-tax UX (no combined GST value returned).
            gdto.setGstRate(BigDecimal.ZERO);
            gdto.setGstInputMode(null);
            gdto.setSgstRate(g.getSgstRate());
            gdto.setSgstInputMode(g.getSgstInputMode());
            gdto.setCgstRate(g.getCgstRate());
            gdto.setCgstInputMode(g.getCgstInputMode());
            gdto.setIgstRate(g.getIgstRate());
            gdto.setIgstInputMode(g.getIgstInputMode());
            List<BillLineItemDTO> items = new ArrayList<>();
            for (SalesBillLineItem it : g.getItems()) {
                BillLineItemDTO idto = new BillLineItemDTO();
                idto.setId(it.getId());
                idto.setBidNumber(it.getBidNumber());
                idto.setLotName(it.getLotName());
                idto.setLotId(it.getLotId());
                idto.setAuctionEntryId(it.getAuctionEntryId());
                idto.setSelfSaleUnitId(it.getSelfSaleUnitId());
                idto.setSellerName(it.getSellerName());
                idto.setLotTotalQty(it.getLotTotalQty());
                idto.setVehicleTotalQty(it.getVehicleTotalQty());
                idto.setSellerVehicleQty(it.getSellerVehicleQty());
                idto.setVehicleMark(it.getVehicleMark());
                idto.setSellerMark(it.getSellerMark());
                idto.setQuantity(it.getQuantity());
                idto.setWeight(it.getWeight());
                idto.setBaseRate(it.getBaseRate());
                idto.setBrokerage(it.getBrokerage());
                idto.setPresetApplied(it.getPresetApplied());
                idto.setOtherCharges(it.getOtherCharges());
                idto.setNewRate(it.getNewRate());
                idto.setAmount(it.getAmount());
                idto.setTokenAdvance(it.getTokenAdvance());
                items.add(idto);
            }
            gdto.setItems(items);
            groups.add(gdto);
        }
        dto.setCommodityGroups(groups);

        List<BillVersionDTO> versions = new ArrayList<>();
        for (SalesBillVersion v : bill.getVersions()) {
            BillVersionDTO vdto = new BillVersionDTO();
            vdto.setVersion(v.getVersionNumber());
            vdto.setSavedAt(v.getSavedAt() != null ? v.getSavedAt().toString() : null);
            if (v.getSnapshotJson() != null) {
                try {
                    vdto.setData(objectMapper.readValue(v.getSnapshotJson(), Object.class));
                } catch (JsonProcessingException e) {
                    vdto.setData(null);
                }
            }
            versions.add(vdto);
        }
        dto.setVersions(versions);
        return dto;
    }

    private static int sumLineItemQuantities(CommodityGroupDTO g) {
        if (g.getItems() == null || g.getItems().isEmpty()) {
            return 0;
        }
        int s = 0;
        for (BillLineItemDTO it : g.getItems()) {
            s += it.getQuantity() != null ? it.getQuantity() : 0;
        }
        return s;
    }

    private static int effectiveChargeQty(Integer storedOverride, int sumLineQty) {
        if (storedOverride == null) {
            return sumLineQty;
        }
        return Math.max(0, storedOverride);
    }

    private static BigDecimal roundedRateTimesQty(BigDecimal rate, int qty) {
        if (rate == null || rate.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        return rate.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private static Instant parseInstant(String s) {
        if (s == null || s.isBlank()) return Instant.now();
        try {
            return Instant.parse(s);
        } catch (DateTimeParseException e) {
            return Instant.now();
        }
    }

    private static Long parseLongOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
