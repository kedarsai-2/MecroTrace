package com.mercotrace.service;

import com.mercotrace.service.dto.PrintSettingDTO;
import java.util.List;

public interface PrintSettingService {
    List<PrintSettingDTO> listByTrader(Long traderId);

    PrintSettingDTO upsert(Long traderId, PrintSettingDTO dto);
}
