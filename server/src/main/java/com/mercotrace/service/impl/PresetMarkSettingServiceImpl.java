package com.mercotrace.service.impl;

import com.mercotrace.domain.GlobalPresetMarkSetting;
import com.mercotrace.domain.PresetMarkSetting;
import com.mercotrace.domain.Trader;
import com.mercotrace.repository.GlobalPresetMarkSettingRepository;
import com.mercotrace.repository.PresetMarkSettingRepository;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.service.PresetMarkSettingService;
import com.mercotrace.service.dto.PresetMarkSettingDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PresetMarkSettingServiceImpl implements PresetMarkSettingService {

    private static final String GLOBALLY_MANAGED = "presetGloballyManaged";

    private final PresetMarkSettingRepository repository;
    private final TraderRepository traderRepository;
    private final GlobalPresetMarkSettingRepository globalPresetMarkSettingRepository;

    public PresetMarkSettingServiceImpl(
        PresetMarkSettingRepository repository,
        TraderRepository traderRepository,
        GlobalPresetMarkSettingRepository globalPresetMarkSettingRepository
    ) {
        this.repository = repository;
        this.traderRepository = traderRepository;
        this.globalPresetMarkSettingRepository = globalPresetMarkSettingRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<PresetMarkSettingDTO> findAllByTrader(Long traderId) {
        Trader trader = traderRepository.findById(traderId).orElseThrow(() -> new EntityNotFoundException("Trader not found: " + traderId));
        if (Boolean.TRUE.equals(trader.getPresetEnabled())) {
            return repository.findAllByTraderIdOrderByIdAsc(traderId).stream().map(this::toTraderDto).collect(Collectors.toList());
        }
        return globalPresetMarkSettingRepository.findAllByOrderByIdAsc().stream().map(this::toGlobalDto).collect(Collectors.toList());
    }

    @Override
    public PresetMarkSettingDTO create(Long traderId, PresetMarkSettingDTO dto) {
        assertTraderPresetCustomizationEnabled(traderId);
        String mark = dto.getPredefinedMark().trim();
        if (repository.existsByTraderIdAndPredefinedMarkIgnoreCase(traderId, mark)) {
            throw new BadRequestAlertException("Predefined Mark already exists: " + mark, "presetMarkSetting", "duplicateMark");
        }
        PresetMarkSetting entity = new PresetMarkSetting();
        entity.setTraderId(traderId);
        entity.setPredefinedMark(mark);
        entity.setExtraAmount(dto.getExtraAmount());
        entity = repository.save(entity);
        return toTraderDto(entity);
    }

    @Override
    public PresetMarkSettingDTO update(Long traderId, Long id, PresetMarkSettingDTO dto) {
        assertTraderPresetCustomizationEnabled(traderId);
        PresetMarkSetting entity = repository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("PresetMarkSetting not found: " + id));
        if (!entity.getTraderId().equals(traderId)) {
            throw new EntityNotFoundException("PresetMarkSetting not found: " + id);
        }
        String mark = dto.getPredefinedMark().trim();
        if (repository.existsByTraderIdAndPredefinedMarkIgnoreCaseAndIdNot(traderId, mark, id)) {
            throw new BadRequestAlertException("Predefined Mark already exists: " + mark, "presetMarkSetting", "duplicateMark");
        }
        entity.setPredefinedMark(mark);
        entity.setExtraAmount(dto.getExtraAmount());
        entity = repository.save(entity);
        return toTraderDto(entity);
    }

    @Override
    public void delete(Long traderId, Long id) {
        assertTraderPresetCustomizationEnabled(traderId);
        PresetMarkSetting entity = repository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("PresetMarkSetting not found: " + id));
        if (!entity.getTraderId().equals(traderId)) {
            throw new EntityNotFoundException("PresetMarkSetting not found: " + id);
        }
        repository.delete(entity);
    }

    private void assertTraderPresetCustomizationEnabled(Long traderId) {
        Trader trader = traderRepository.findById(traderId).orElseThrow(() -> new EntityNotFoundException("Trader not found: " + traderId));
        if (!Boolean.TRUE.equals(trader.getPresetEnabled())) {
            throw new BadRequestAlertException(
                "Preset marks are managed by the administrator for this trader account.",
                "presetMarkSetting",
                GLOBALLY_MANAGED
            );
        }
    }

    private PresetMarkSettingDTO toTraderDto(PresetMarkSetting e) {
        PresetMarkSettingDTO d = new PresetMarkSettingDTO();
        d.setId(e.getId());
        d.setPredefinedMark(e.getPredefinedMark());
        d.setExtraAmount(e.getExtraAmount());
        return d;
    }

    private PresetMarkSettingDTO toGlobalDto(GlobalPresetMarkSetting e) {
        PresetMarkSettingDTO d = new PresetMarkSettingDTO();
        d.setId(e.getId());
        d.setPredefinedMark(e.getPredefinedMark());
        d.setExtraAmount(e.getExtraAmount());
        return d;
    }
}
