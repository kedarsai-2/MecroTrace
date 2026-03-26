package com.mercotrace.service;

import com.mercotrace.service.dto.PresetMarkSettingDTO;
import java.util.List;

public interface GlobalPresetMarkSettingService {

    List<PresetMarkSettingDTO> findAll();

    PresetMarkSettingDTO create(PresetMarkSettingDTO dto);

    PresetMarkSettingDTO update(Long id, PresetMarkSettingDTO dto);

    void delete(Long id);
}
