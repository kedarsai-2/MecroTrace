package com.mercotrace.service;

import com.mercotrace.service.dto.PrintLogCreateRequest;
import com.mercotrace.service.dto.PrintLogDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service for print event audit log.
 */
public interface PrintLogService {

    /**
     * Log a print event.
     */
    PrintLogDTO create(PrintLogCreateRequest request);

    /**
     * List print logs for current trader (paginated).
     */
    Page<PrintLogDTO> list(Pageable pageable);
}
