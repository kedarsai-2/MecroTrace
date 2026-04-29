package com.mercotrace.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.domain.PrintSetting;
import com.mercotrace.repository.PrintSettingRepository;
import com.mercotrace.service.PrintSettingService;
import com.mercotrace.service.dto.PrintSettingDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import java.util.ArrayList;
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
    private static final String DEFAULT_PRINT_COPIES_JSON = "[{\"label\":\"ORIGINAL COPY\"}]";
    private static final int MAX_PRINT_COPIES = 20;
    private static final int MAX_COPY_LABEL_LEN = 120;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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
            // Do not touch bill_number_start_from / print_copies_json on NON_GST row (parity with paper-only row).
        } else {
            String wh = firstNonBlank(dto.getPaperSizeWithHeader(), "A4");
            String woh = firstNonBlank(dto.getPaperSizeWithoutHeader(), "A4");
            entity.setPaperSizeWithHeader(normalizePaperSize(wh));
            entity.setPaperSizeWithoutHeader(normalizePaperSize(woh));
            entity.setIncludeHeader(Boolean.TRUE.equals(dto.getIncludeHeader()));
            entity.setBillNumberStartFrom(dto.getBillNumberStartFrom());
            entity.setPrintCopiesJson(normalizePrintCopiesJsonForSave(dto.getPrintCopiesJson()));
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
        dto.setBillNumberStartFrom(entity.getBillNumberStartFrom());
        String copies = entity.getPrintCopiesJson();
        dto.setPrintCopiesJson(copies != null && !copies.isBlank() ? copies : DEFAULT_PRINT_COPIES_JSON);
        return dto;
    }

    private String normalizePrintCopiesJsonForSave(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            JsonNode root = OBJECT_MAPPER.readTree(raw);
            if (!root.isArray()) {
                throw new BadRequestAlertException("print_copies_json must be a JSON array", "printSetting", "printCopiesInvalid");
            }
            if (root.size() == 0) {
                return null;
            }
            if (root.size() > MAX_PRINT_COPIES) {
                throw new BadRequestAlertException("Too many print copies (max " + MAX_PRINT_COPIES + ")", "printSetting", "printCopiesInvalid");
            }
            List<JsonNode> normalizedElements = new ArrayList<>();
            for (JsonNode el : root) {
                if (el == null || !el.isObject()) {
                    throw new BadRequestAlertException("Each print copy must be an object with label", "printSetting", "printCopiesInvalid");
                }
                JsonNode labelNode = el.get("label");
                if (labelNode == null || !labelNode.isTextual()) {
                    throw new BadRequestAlertException("Each print copy must have a string label", "printSetting", "printCopiesInvalid");
                }
                String label = labelNode.asText().trim();
                if (label.isEmpty()) {
                    throw new BadRequestAlertException("Copy label cannot be blank", "printSetting", "printCopiesInvalid");
                }
                if (label.length() > MAX_COPY_LABEL_LEN) {
                    throw new BadRequestAlertException("Copy label too long (max " + MAX_COPY_LABEL_LEN + ")", "printSetting", "printCopiesInvalid");
                }
                normalizedElements.add(OBJECT_MAPPER.createObjectNode().put("label", label));
            }
            return OBJECT_MAPPER.writeValueAsString(normalizedElements);
        } catch (BadRequestAlertException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestAlertException("Invalid print_copies_json: " + e.getMessage(), "printSetting", "printCopiesInvalid");
        }
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
