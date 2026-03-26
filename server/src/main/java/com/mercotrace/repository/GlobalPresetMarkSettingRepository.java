package com.mercotrace.repository;

import com.mercotrace.domain.GlobalPresetMarkSetting;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GlobalPresetMarkSettingRepository extends JpaRepository<GlobalPresetMarkSetting, Long> {

    List<GlobalPresetMarkSetting> findAllByOrderByIdAsc();

    boolean existsByPredefinedMarkIgnoreCase(String predefinedMark);

    boolean existsByPredefinedMarkIgnoreCaseAndIdNot(String predefinedMark, Long id);
}
