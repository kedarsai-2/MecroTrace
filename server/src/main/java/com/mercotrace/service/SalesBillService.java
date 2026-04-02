package com.mercotrace.service;

import com.mercotrace.service.dto.SalesBillDTOs.SalesBillCreateOrUpdateRequest;
import com.mercotrace.service.dto.SalesBillDTOs.SalesBillDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service for Sales Bill (Billing) module. Bill number generation, versioning, voucher creation.
 */
public interface SalesBillService {

    /**
     * Paginated list for current trader. Optional filters: billNumber, buyerName, dateFrom, dateTo.
     */
    Page<SalesBillDTO> getBills(Pageable pageable, String billNumber, String buyerName,
                               java.time.Instant dateFrom, java.time.Instant dateTo);

    /**
     * Get one bill by id (current trader only).
     */
    SalesBillDTO getById(Long id);

    /**
     * Create a new bill: assign bill number from trader prefix, persist, optionally create vouchers.
     */
    SalesBillDTO create(SalesBillCreateOrUpdateRequest request);

    /**
     * Update existing bill: append version snapshot, then update.
     */
    SalesBillDTO update(Long id, SalesBillCreateOrUpdateRequest request);

    /**
     * Assign a bill number based on commodity combination and trader/commodity prefixes.
     * If the bill already has a number, this is a no-op and returns the existing bill.
     */
    SalesBillDTO assignNumber(Long id);
}
