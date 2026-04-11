package com.mercotrace.service;

import com.mercotrace.service.dto.SettlementDTOs.*;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Service for Settlement (Sales Patti): sellers list, patti CRUD.
 * Frontend contract: SettlementPage.tsx.
 */
public interface SettlementService {

    /**
     * List sellers available for settlement (from completed auctions, trader-scoped).
     * Enriched with arrival/weighing data. Paginated by seller.
     */
    Page<SellerSettlementDTO> listSellers(Pageable pageable, String search);

    /**
     * Create a new patti. Patti ID generated as base-sellerSequence (e.g. 2255-1).
     */
    PattiDTO createPatti(PattiSaveRequest request);

    /**
     * Reserve and return next Sales Patti base number.
     * Uses commodity bill-prefix when available for the given seller scope; otherwise plain numeric sequence.
     */
    String reserveNextPattiBaseNumber(String sellerId);

    /**
     * Get patti by database id.
     */
    Optional<PattiDTO> getPattiById(Long id);

    /**
     * Get patti by business key pattiId.
     */
    Optional<PattiDTO> getPattiByPattiId(String pattiId);

    /**
     * Update existing patti (e.g. deductions). Idempotent.
     */
    Optional<PattiDTO> updatePatti(Long id, PattiSaveRequest request);

    /**
     * List pattis for current trader. Paginated.
     */
    Page<PattiDTO> listPattis(Pageable pageable);

    /**
     * List in-progress pattis for current trader. Paginated.
     */
    Page<PattiDTO> listInProgressPattis(Pageable pageable);

    /**
     * Compute seller-level charges (e.g. freight, advance) for a new Patti.
     * This replaces prototype localStorage-based voucher lookups.
     */
    SellerChargesDTO getSellerCharges(String sellerId);

    /**
     * Amount card: arrival freight (Arrivals), invoiced freight and payable from sales bills for this seller's lots.
     * Optional {@code invoiceNameFilter} narrows to bills whose billing name matches (case-insensitive contains).
     */
    SettlementAmountSummaryDTO getSettlementAmountSummary(String sellerId, String invoiceNameFilter);

    /**
     * Freight (Arrivals bag share), unloading/weighing (commodity settings), and cash advance (freight advance + ledger).
     * Values are computed server-side for Sales Patti reflection only.
     */
    SellerExpenseSnapshotDTO getSellerExpenseSnapshot(String sellerId);

    /**
     * Hydrate quick-expense DB state: create missing baseline from provided defaults and return persisted original/current values.
     */
    QuickExpenseStateResponse hydrateQuickExpenseState(QuickExpenseStateUpsertRequest request);

    /**
     * Save quick-expense current values while preserving original baseline.
     */
    QuickExpenseStateResponse saveQuickExpenseState(QuickExpenseStateUpsertRequest request);

    /**
     * Link a settlement seller row ({@code seller_in_vehicle} id) to an existing contact (registered trader).
     */
    SellerRegistrationDTO linkSellerContact(String sellerVehicleId, LinkSellerContactRequest request);

    /**
     * Replace seller identity on one settlement row using another settlement seller row.
     */
    SellerReplacementDTO replaceSeller(String sellerVehicleId, ReplaceSellerRequest request);

    /**
     * Create a temporary voucher entry for Settlement seller and return persisted row.
     */
    SettlementVoucherTempDTO createSettlementVoucherTemp(String sellerId, SettlementVoucherTempCreateRequest request);

    /**
     * List temporary settlement vouchers for one seller.
     */
    SettlementVoucherTempListResponse listSettlementVoucherTemps(String sellerId);

    /**
     * Replace seller temporary vouchers with current rows and return saved rows + total.
     */
    SettlementVoucherTempListResponse saveSettlementVoucherTemps(String sellerId, SettlementVoucherTempUpsertRequest request);
}
