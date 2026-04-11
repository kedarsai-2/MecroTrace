package com.mercotrace.repository;

import com.mercotrace.domain.PrintSetting;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PrintSettingRepository extends JpaRepository<PrintSetting, Long> {
    List<PrintSetting> findAllByTraderIdOrderByModuleKeyAsc(Long traderId);

    Optional<PrintSetting> findByTraderIdAndModuleKey(Long traderId, String moduleKey);
}
