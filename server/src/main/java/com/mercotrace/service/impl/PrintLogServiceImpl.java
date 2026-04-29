package com.mercotrace.service.impl;

import com.mercotrace.domain.PrintLog;
import com.mercotrace.repository.PrintLogRepository;
import com.mercotrace.service.PrintLogService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.PrintLogCreateRequest;
import com.mercotrace.service.dto.PrintLogDTO;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Implementation of {@link PrintLogService}.
 */
@Service
@Transactional
public class PrintLogServiceImpl implements PrintLogService {

    private final PrintLogRepository printLogRepository;
    private final TraderContextService traderContextService;

    public PrintLogServiceImpl(PrintLogRepository printLogRepository, TraderContextService traderContextService) {
        this.printLogRepository = printLogRepository;
        this.traderContextService = traderContextService;
    }

    @Override
    @Transactional(readOnly = false)
    public PrintLogDTO create(PrintLogCreateRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        PrintLog entity = new PrintLog();
        entity.setTraderId(traderId);
        entity.setReferenceType(request.getReferenceType());
        entity.setReferenceId(request.getReferenceId());
        entity.setPrintType(request.getPrintType());
        entity.setPrintedAt(request.getPrintedAt() != null ? request.getPrintedAt() : Instant.now());
        entity = printLogRepository.save(entity);
        return toDto(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PrintLogDTO> list(Pageable pageable) {
        Long traderId = traderContextService.getCurrentTraderId();
        return printLogRepository.findAllByTraderIdOrderByPrintedAtDesc(traderId, pageable)
            .map(this::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> listDistinctReferenceIdsByReferenceType(String referenceType) {
        Long traderId = traderContextService.getCurrentTraderId();
        return printLogRepository.findDistinctReferenceIdsByTraderIdAndReferenceType(traderId, referenceType);
    }

    private PrintLogDTO toDto(PrintLog e) {
        PrintLogDTO dto = new PrintLogDTO();
        dto.setId(e.getId());
        dto.setReferenceType(e.getReferenceType());
        dto.setReferenceId(e.getReferenceId());
        dto.setPrintType(e.getPrintType());
        dto.setPrintedAt(e.getPrintedAt());
        return dto;
    }
}
