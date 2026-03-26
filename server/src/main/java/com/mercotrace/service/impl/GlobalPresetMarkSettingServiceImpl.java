package com.mercotrace.service.impl;

import com.mercotrace.domain.GlobalPresetMarkSetting;
import com.mercotrace.repository.GlobalPresetMarkSettingRepository;
import com.mercotrace.service.GlobalPresetMarkSettingService;
import com.mercotrace.service.dto.PresetMarkSettingDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class GlobalPresetMarkSettingServiceImpl implements GlobalPresetMarkSettingService {

    private final GlobalPresetMarkSettingRepository repository;

    public GlobalPresetMarkSettingServiceImpl(GlobalPresetMarkSettingRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<PresetMarkSettingDTO> findAll() {
        return repository.findAllByOrderByIdAsc().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    public PresetMarkSettingDTO create(PresetMarkSettingDTO dto) {
        if (dto.getId() != null) {
            throw new BadRequestAlertException("A new global preset must not have an id", "globalPresetMarkSetting", "idexists");
        }
        String mark = dto.getPredefinedMark().trim();
        if (repository.existsByPredefinedMarkIgnoreCase(mark)) {
            throw new BadRequestAlertException("Predefined Mark already exists: " + mark, "globalPresetMarkSetting", "duplicateMark");
        }
        GlobalPresetMarkSetting entity = new GlobalPresetMarkSetting();
        entity.setPredefinedMark(mark);
        entity.setExtraAmount(dto.getExtraAmount());
        entity = repository.save(entity);
        return toDto(entity);
    }

    @Override
    public PresetMarkSettingDTO update(Long id, PresetMarkSettingDTO dto) {
        GlobalPresetMarkSetting entity = repository.findById(id).orElseThrow(() -> new EntityNotFoundException("GlobalPresetMarkSetting not found: " + id));
        String mark = dto.getPredefinedMark().trim();
        if (repository.existsByPredefinedMarkIgnoreCaseAndIdNot(mark, id)) {
            throw new BadRequestAlertException("Predefined Mark already exists: " + mark, "globalPresetMarkSetting", "duplicateMark");
        }
        entity.setPredefinedMark(mark);
        entity.setExtraAmount(dto.getExtraAmount());
        entity = repository.save(entity);
        return toDto(entity);
    }

    @Override
    public void delete(Long id) {
        GlobalPresetMarkSetting entity = repository.findById(id).orElseThrow(() -> new EntityNotFoundException("GlobalPresetMarkSetting not found: " + id));
        repository.delete(entity);
    }

    private PresetMarkSettingDTO toDto(GlobalPresetMarkSetting e) {
        PresetMarkSettingDTO dto = new PresetMarkSettingDTO();
        dto.setId(e.getId());
        dto.setPredefinedMark(e.getPredefinedMark());
        dto.setExtraAmount(e.getExtraAmount());
        return dto;
    }
}
