package com.mercotrace.service.impl;

import com.mercotrace.domain.*;
import com.mercotrace.repository.*;
import com.mercotrace.service.CommodityConfigService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.*;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads and saves full commodity config (config, deduction rules, hamali slabs, dynamic charges).
 * Audit fields (created_by, created_date, last_modified_by, last_modified_date) are set by JPA listeners.
 */
@Service
@Transactional
public class CommodityConfigServiceImpl implements CommodityConfigService {

    private static final String ENTITY_NAME = "commodityConfig";
    private static final Logger LOG = LoggerFactory.getLogger(CommodityConfigServiceImpl.class);

    private final CommodityRepository commodityRepository;
    private final CommodityConfigRepository commodityConfigRepository;
    private final DeductionRuleRepository deductionRuleRepository;
    private final HamaliSlabRepository hamaliSlabRepository;
    private final DynamicChargeRepository dynamicChargeRepository;
    private final TraderContextService traderContextService;

    @PersistenceContext
    private EntityManager entityManager;

    public CommodityConfigServiceImpl(
        CommodityRepository commodityRepository,
        CommodityConfigRepository commodityConfigRepository,
        DeductionRuleRepository deductionRuleRepository,
        HamaliSlabRepository hamaliSlabRepository,
        DynamicChargeRepository dynamicChargeRepository,
        TraderContextService traderContextService
    ) {
        this.commodityRepository = commodityRepository;
        this.commodityConfigRepository = commodityConfigRepository;
        this.deductionRuleRepository = deductionRuleRepository;
        this.hamaliSlabRepository = hamaliSlabRepository;
        this.dynamicChargeRepository = dynamicChargeRepository;
        this.traderContextService = traderContextService;
    }

    @Override
    @Transactional(readOnly = true)
    public java.util.List<FullCommodityConfigDTO> getAllFullConfigs() {
        Long traderId = traderContextService.getCurrentTraderId();
        return commodityRepository
            .findAllByTraderIdAndActiveTrue(traderId)
            .stream()
            .map(c -> getFullConfig(c.getId()))
            .collect(java.util.stream.Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public FullCommodityConfigDTO getFullConfig(Long commodityId) {
        Long traderId = traderContextService.getCurrentTraderId();
        if (
            commodityRepository
                .findById(commodityId)
                .filter(c -> traderId.equals(c.getTraderId()))
                .isEmpty()
        ) {
            throw new BadRequestAlertException("Commodity not found", ENTITY_NAME, "commoditynotfound");
        }
        FullCommodityConfigDTO out = new FullCommodityConfigDTO();
        out.setCommodityId(commodityId);

        Optional<CommodityConfig> configOpt = commodityConfigRepository.findOneByCommodityId(commodityId);
        if (configOpt.isPresent()) {
            out.setConfig(toConfigDTO(configOpt.get()));
            out.getConfig().setHamaliEnabled(configOpt.get().getHamaliEnabled());
        } else {
            CommodityConfigDTO defaultConfig = new CommodityConfigDTO();
            defaultConfig.setCommodityId(commodityId);
            defaultConfig.setRatePerUnit(0D);
            defaultConfig.setMinWeight(0D);
            defaultConfig.setMaxWeight(0D);
            defaultConfig.setGovtDeductionEnabled(false);
            defaultConfig.setRoundoffEnabled(false);
            defaultConfig.setCommissionPercent(0D);
            defaultConfig.setUserFeePercent(0D);
            defaultConfig.setHamaliEnabled(false);
            out.setConfig(defaultConfig);
        }

        List<DeductionRule> rules = deductionRuleRepository.findAllByCommodityIdOrderByMinWeight(commodityId);
        out.setDeductionRules(rules.stream().map(this::toDeductionRuleDTO).collect(Collectors.toList()));

        List<HamaliSlab> slabs = hamaliSlabRepository.findAllByCommodityIdOrderByThresholdWeight(commodityId);
        out.setHamaliSlabs(slabs.stream().map(this::toHamaliSlabDTO).collect(Collectors.toList()));

        List<DynamicCharge> charges = dynamicChargeRepository.findAllByCommodityId(commodityId);
        out.setDynamicCharges(charges.stream().map(this::toDynamicChargeDTO).collect(Collectors.toList()));

        return out;
    }

    @Override
    public FullCommodityConfigDTO saveFullConfig(FullCommodityConfigDTO dto) {
        Long commodityId = dto.getCommodityId();
        if (commodityId == null) {
            throw new BadRequestAlertException("commodityId is required", ENTITY_NAME, "idnull");
        }
        Long traderId = traderContextService.getCurrentTraderId();
        if (
            commodityRepository
                .findById(commodityId)
                .filter(c -> traderId.equals(c.getTraderId()))
                .isEmpty()
        ) {
            throw new BadRequestAlertException("Commodity not found", ENTITY_NAME, "commoditynotfound");
        }

        // Remove existing config and children
        commodityConfigRepository.deleteByCommodityId(commodityId);
        deductionRuleRepository.deleteByCommodityId(commodityId);
        hamaliSlabRepository.deleteByCommodityId(commodityId);
        dynamicChargeRepository.deleteByCommodityId(commodityId);

        // Flush so DELETEs are executed before INSERTs (avoids unique constraint violation)
        entityManager.flush();

        // Save config (includes bill_prefix and hamali_enabled)
        CommodityConfigDTO configDto = dto.getConfig();
        if (configDto != null) {
            if (configDto.getGstRate() != null) {
                double gstRate = configDto.getGstRate();
                if (gstRate < 0D || gstRate > 100D) {
                    throw new BadRequestAlertException("GST rate must be between 0 and 100 (max 2 decimal places)", ENTITY_NAME, "invalidgstrate");
                }
                // Max 2 decimal places
                double rounded = Math.round(gstRate * 100) / 100.0;
                if (Math.abs(gstRate - rounded) > 0.0001) {
                    throw new BadRequestAlertException("GST rate allows max 2 decimal places (e.g. 12.50)", ENTITY_NAME, "invalidgstrate");
                }
            }
            validateOptionalGstComponentRate(configDto.getSgstRate(), "SGST");
            validateOptionalGstComponentRate(configDto.getCgstRate(), "CGST");
            validateOptionalGstComponentRate(configDto.getIgstRate(), "IGST");
            validateGstStructure(configDto);
            if (configDto.getHsnCode() != null && !configDto.getHsnCode().trim().isEmpty()) {
                String hsn = configDto.getHsnCode().trim().replaceAll("\\D", "");
                if (hsn.length() != 6 && hsn.length() != 8) {
                    throw new BadRequestAlertException("HSN must be 6 digits (goods), SAC must be 8 digits (services). Digits only.", ENTITY_NAME, "invalidhsn");
                }
            }
            if (configDto.getGstRate() != null && configDto.getGstRate() > 0 && (configDto.getHsnCode() == null || configDto.getHsnCode().trim().isEmpty())) {
                throw new BadRequestAlertException("HSN/SAC code is required when GST is applicable", ENTITY_NAME, "invalidhsn");
            }
            if (configDto.getWeighingThreshold() != null) {
                double threshold = configDto.getWeighingThreshold();
                if (threshold <= 0D) {
                    throw new BadRequestAlertException("Weighing threshold must be greater than 0", ENTITY_NAME, "invalidweighingthreshold");
                }
            }
            CommodityConfig config = toConfigEntity(configDto);
            config.setCommodityId(commodityId);
            commodityConfigRepository.save(config);
        }

        // Save deduction rules
        if (dto.getDeductionRules() != null) {
            for (DeductionRuleDTO r : dto.getDeductionRules()) {
                DeductionRule rule = toDeductionRuleEntity(r);
                rule.setCommodityId(commodityId);
                deductionRuleRepository.save(rule);
            }
        }

        // Save hamali slabs
        if (dto.getHamaliSlabs() != null) {
            for (HamaliSlabDTO s : dto.getHamaliSlabs()) {
                HamaliSlab slab = toHamaliSlabEntity(s);
                slab.setCommodityId(commodityId);
                hamaliSlabRepository.save(slab);
            }
        }

        // Save dynamic charges
        if (dto.getDynamicCharges() != null) {
            for (DynamicChargeDTO c : dto.getDynamicCharges()) {
                DynamicCharge charge = toDynamicChargeEntity(c);
                charge.setCommodityId(commodityId);
                dynamicChargeRepository.save(charge);
            }
        }

        return getFullConfig(commodityId);
    }

    private static void validateOptionalGstComponentRate(Double rate, String label) {
        if (rate == null) {
            return;
        }
        double v = rate;
        if (v < 0D || v > 100D) {
            throw new BadRequestAlertException(
                label + " rate must be between 0 and 100 (max 2 decimal places)",
                ENTITY_NAME,
                "invalidgstrate"
            );
        }
        double rounded = Math.round(v * 100) / 100.0;
        if (Math.abs(v - rounded) > 0.0001) {
            throw new BadRequestAlertException(
                label + " rate allows max 2 decimal places (e.g. 2.50)",
                ENTITY_NAME,
                "invalidgstrate"
            );
        }
    }

    private static void validateGstStructure(CommodityConfigDTO configDto) {
        Double gstRate = configDto.getGstRate();
        Double sgstRate = configDto.getSgstRate();
        Double cgstRate = configDto.getCgstRate();
        Double igstRate = configDto.getIgstRate();

        // If no GST at all, no further structure validation required.
        if ((gstRate == null || gstRate <= 0D) && sgstRate == null && cgstRate == null && igstRate == null) {
            return;
        }

        boolean hasSplit = sgstRate != null || cgstRate != null;
        boolean hasIgst = igstRate != null;
        boolean hasGst = gstRate != null && gstRate > 0D;

        if (hasSplit && hasIgst) {
            throw new BadRequestAlertException(
                "Do not mix split GST with IGST. Send one tax structure only.",
                ENTITY_NAME,
                "invalidgstrate"
            );
        }

        // Split GST (with optional base GST): SGST+CGST must be complete and can optionally match GST.
        if (hasSplit) {
            if (sgstRate == null || cgstRate == null) {
                throw new BadRequestAlertException(
                    "Both SGST and CGST are required for split GST",
                    ENTITY_NAME,
                    "invalidgstrate"
                );
            }
            if (hasGst && Math.abs((sgstRate + cgstRate) - gstRate) > 0.01D) {
                throw new BadRequestAlertException(
                    "SGST + CGST must match GST rate",
                    ENTITY_NAME,
                    "invalidgstrate"
                );
            }
            return;
        }

        if (!hasGst && !hasIgst) {
            return;
        }

        // New model: either GST only (intra-state auto split handled elsewhere) OR IGST only.
        if (hasGst && hasIgst) {
            throw new BadRequestAlertException(
                "Select only one tax type: GST or IGST",
                ENTITY_NAME,
                "invalidgstrate"
            );
        }
    }

    private CommodityConfigDTO toConfigDTO(CommodityConfig e) {
        CommodityConfigDTO d = new CommodityConfigDTO();
        d.setId(e.getId());
        d.setCommodityId(e.getCommodityId());
        d.setRatePerUnit(e.getRatePerUnit());
        d.setMinWeight(e.getMinWeight());
        d.setMaxWeight(e.getMaxWeight());
        d.setGovtDeductionEnabled(e.getGovtDeductionEnabled());
        d.setRoundoffEnabled(e.getRoundoffEnabled());
        d.setCommissionPercent(e.getCommissionPercent());
        d.setUserFeePercent(e.getUserFeePercent());
        d.setHsnCode(e.getHsnCode());
        d.setWeighingCharge(e.getWeighingCharge());
        d.setBillPrefix(e.getBillPrefix());
        d.setHamaliEnabled(e.getHamaliEnabled());
        d.setGstRate(e.getGstRate());
        d.setSgstRate(e.getSgstRate());
        d.setCgstRate(e.getCgstRate());
        d.setIgstRate(e.getIgstRate());
        d.setWeighingThreshold(e.getWeighingThreshold());
        d.setCreatedBy(e.getCreatedBy());
        d.setCreatedDate(e.getCreatedDate());
        d.setLastModifiedBy(e.getLastModifiedBy());
        d.setLastModifiedDate(e.getLastModifiedDate());
        return d;
    }

    private CommodityConfig toConfigEntity(CommodityConfigDTO d) {
        CommodityConfig e = new CommodityConfig();
        e.setId(d.getId());
        e.setCommodityId(d.getCommodityId());
        e.setRatePerUnit(d.getRatePerUnit() != null ? d.getRatePerUnit() : 0D);
        e.setMinWeight(d.getMinWeight() != null ? d.getMinWeight() : 0D);
        e.setMaxWeight(d.getMaxWeight() != null ? d.getMaxWeight() : 0D);
        e.setGovtDeductionEnabled(d.getGovtDeductionEnabled() != null ? d.getGovtDeductionEnabled() : false);
        e.setRoundoffEnabled(d.getRoundoffEnabled() != null ? d.getRoundoffEnabled() : false);
        e.setCommissionPercent(d.getCommissionPercent() != null ? d.getCommissionPercent() : 0D);
        e.setUserFeePercent(d.getUserFeePercent() != null ? d.getUserFeePercent() : 0D);
        e.setHsnCode(d.getHsnCode());
        e.setWeighingCharge(d.getWeighingCharge());
        e.setBillPrefix(d.getBillPrefix());
        e.setHamaliEnabled(d.getHamaliEnabled() != null ? d.getHamaliEnabled() : false);
        e.setGstRate(d.getGstRate());
        e.setSgstRate(d.getSgstRate());
        e.setCgstRate(d.getCgstRate());
        e.setIgstRate(d.getIgstRate());
        e.setWeighingThreshold(d.getWeighingThreshold());
        return e;
    }

    private DeductionRuleDTO toDeductionRuleDTO(DeductionRule e) {
        DeductionRuleDTO d = new DeductionRuleDTO();
        d.setId(e.getId());
        d.setCommodityId(e.getCommodityId());
        d.setMinWeight(e.getMinWeight());
        d.setMaxWeight(e.getMaxWeight());
        d.setDeductionValue(e.getDeductionValue());
        d.setCreatedBy(e.getCreatedBy());
        d.setCreatedDate(e.getCreatedDate());
        d.setLastModifiedBy(e.getLastModifiedBy());
        d.setLastModifiedDate(e.getLastModifiedDate());
        return d;
    }

    private DeductionRule toDeductionRuleEntity(DeductionRuleDTO d) {
        DeductionRule e = new DeductionRule();
        e.setMinWeight(d.getMinWeight());
        e.setMaxWeight(d.getMaxWeight());
        e.setDeductionValue(d.getDeductionValue());
        return e;
    }

    private HamaliSlabDTO toHamaliSlabDTO(HamaliSlab e) {
        HamaliSlabDTO d = new HamaliSlabDTO();
        d.setId(e.getId());
        d.setCommodityId(e.getCommodityId());
        d.setThresholdWeight(e.getThresholdWeight());
        d.setFixedRate(e.getFixedRate());
        d.setPerKgRate(e.getPerKgRate() != null ? e.getPerKgRate() : 0D);
        d.setCreatedBy(e.getCreatedBy());
        d.setCreatedDate(e.getCreatedDate());
        d.setLastModifiedBy(e.getLastModifiedBy());
        d.setLastModifiedDate(e.getLastModifiedDate());
        return d;
    }

    private HamaliSlab toHamaliSlabEntity(HamaliSlabDTO d) {
        HamaliSlab e = new HamaliSlab();
        e.setThresholdWeight(d.getThresholdWeight());
        e.setFixedRate(d.getFixedRate());
        e.setPerKgRate(d.getPerKgRate() != null ? d.getPerKgRate() : 0D);
        return e;
    }

    private DynamicChargeDTO toDynamicChargeDTO(DynamicCharge e) {
        DynamicChargeDTO d = new DynamicChargeDTO();
        d.setId(e.getId());
        d.setCommodityId(e.getCommodityId());
        d.setTraderId(e.getTraderId());
        d.setChargeName(e.getChargeName());
        d.setChargeType(e.getChargeType());
        d.setValueAmount(e.getValueAmount());
        d.setAppliesTo(e.getAppliesTo());
        d.setPercentBasis(e.getPercentBasis());
        d.setFixedBasis(e.getFixedBasis());
        d.setCreatedBy(e.getCreatedBy());
        d.setCreatedDate(e.getCreatedDate());
        d.setLastModifiedBy(e.getLastModifiedBy());
        d.setLastModifiedDate(e.getLastModifiedDate());
        return d;
    }

    private DynamicCharge toDynamicChargeEntity(DynamicChargeDTO d) {
        DynamicCharge e = new DynamicCharge();
        e.setCommodityId(d.getCommodityId());
        e.setTraderId(d.getTraderId());
        e.setChargeName(d.getChargeName());
        e.setChargeType(d.getChargeType() != null ? d.getChargeType() : "FIXED");
        e.setValueAmount(d.getValueAmount() != null ? d.getValueAmount() : BigDecimal.ZERO);
        e.setAppliesTo(d.getAppliesTo() != null ? d.getAppliesTo() : "BUYER");
        e.setPercentBasis(d.getPercentBasis());
        e.setFixedBasis(d.getFixedBasis());
        return e;
    }
}
