package com.mercotrace.service.impl;

import com.mercotrace.domain.PrintSetting;
import com.mercotrace.repository.PrintSettingRepository;
import com.mercotrace.service.PrintSettingService;
import com.mercotrace.service.dto.PrintSettingDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PrintSettingServiceImpl implements PrintSettingService {

    private static final Set<String> ALLOWED_MODULE_KEYS = Set.of("SETTLEMENT", "BILLING", "BILLING_NON_GST");

    private final PrintSettingRepository printSettingRepository;

    public PrintSettingServiceImpl(PrintSettingRepository printSettingRepository) {
        this.printSettingRepository = printSettingRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<PrintSettingDTO> listByTrader(Long traderId) {
        return printSettingRepository.findAllByTraderIdOrderByModuleKeyAsc(traderId).stream().map(this::toDto).collect(Collectors.toList());
    }

    @Override
    public PrintSettingDTO upsert(Long traderId, PrintSettingDTO dto) {
        final String moduleKey = normalizeModuleKey(dto.getModuleKey());

        PrintSetting entity = printSettingRepository.findByTraderIdAndModuleKey(traderId, moduleKey).orElseGet(() -> {
            PrintSetting created = new PrintSetting();
            created.setTraderId(traderId);
            created.setModuleKey(moduleKey);
            return created;
        });

        if ("BILLING_NON_GST".equals(moduleKey)) {
            String single = firstNonBlank(dto.getPaperSizeWithoutHeader(), dto.getPaperSizeWithHeader(), "A5");
            String normalized = normalizePaperSize(single);
            entity.setPaperSizeWithHeader(normalized);
            entity.setPaperSizeWithoutHeader(normalized);
            entity.setIncludeHeader(false);
        } else {
            String wh = firstNonBlank(dto.getPaperSizeWithHeader(), "A4");
            String woh = firstNonBlank(dto.getPaperSizeWithoutHeader(), "A4");
            entity.setPaperSizeWithHeader(normalizePaperSize(wh));
            entity.setPaperSizeWithoutHeader(normalizePaperSize(woh));
            entity.setIncludeHeader(Boolean.TRUE.equals(dto.getIncludeHeader()));
        }
        return toDto(printSettingRepository.save(entity));
    }

    private PrintSettingDTO toDto(PrintSetting entity) {
        PrintSettingDTO dto = new PrintSettingDTO();
        dto.setId(entity.getId());
        dto.setModuleKey(entity.getModuleKey());
        dto.setPaperSizeWithHeader(entity.getPaperSizeWithHeader());
        dto.setPaperSizeWithoutHeader(entity.getPaperSizeWithoutHeader());
        dto.setIncludeHeader(entity.getIncludeHeader());
        return dto;
    }

    private String normalizeModuleKey(String raw) {
        String key = String.valueOf(raw == null ? "" : raw).trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_MODULE_KEYS.contains(key)) {
            throw new BadRequestAlertException("Unsupported module key: " + raw, "printSetting", "moduleKeyInvalid");
        }
        return key;
    }

    private String normalizePaperSize(String raw) {
        String value = String.valueOf(raw == null ? "" : raw).trim().toUpperCase(Locale.ROOT);
        if (!"A4".equals(value) && !"A5".equals(value)) {
            throw new BadRequestAlertException("Unsupported paper size: " + raw, "printSetting", "paperSizeInvalid");
        }
        return value;
    }

    private static String firstNonBlank(String... candidates) {
        for (String c : candidates) {
            if (c != null && !c.isBlank()) {
                return c.trim();
            }
        }
        return "";
    }
}
