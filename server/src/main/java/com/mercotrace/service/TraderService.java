package com.mercotrace.service;

import com.mercotrace.service.dto.TraderDTO;
import java.util.Optional;

/**
 * Service Interface for managing {@link com.mercotrace.domain.Trader}.
 */
public interface TraderService {
    /**
     * Save a trader.
     *
     * @param traderDTO the entity to save.
     * @return the persisted entity.
     */
    TraderDTO save(TraderDTO traderDTO);

    /**
     * Updates a trader.
     *
     * @param traderDTO the entity to update.
     * @return the persisted entity.
     */
    TraderDTO update(TraderDTO traderDTO);

    /**
     * Partially updates a trader.
     *
     * @param traderDTO the entity to update partially.
     * @return the persisted entity.
     */
    Optional<TraderDTO> partialUpdate(TraderDTO traderDTO);

    /**
     * Get the "id" trader.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    Optional<TraderDTO> findOne(Long id);

    /**
     * Delete the "id" trader.
     *
     * @param id the id of the entity.
     */
    void delete(Long id);

    /**
     * Set trader active status (true = active, false = inactive).
     * Inactive traders and their staff cannot log in.
     *
     * @param id the trader id.
     * @param active true to activate, false to deactivate.
     * @return the updated trader.
     */
    TraderDTO setActive(Long id, boolean active);

    /**
     * Set trader active status via direct DB update. Use when setActive triggers cache issues.
     *
     * @param id the trader id.
     * @param active true to activate, false to deactivate.
     */
    void setActiveDirect(Long id, boolean active);

    /**
     * Permanently delete a trader from the system.
     * Only allowed for inactive traders. Use with caution.
     *
     * @param id the trader id.
     */
    void permanentDelete(Long id);

    /**
     * When true, trader manages own preset marks; when false, global admin presets apply.
     */
    TraderDTO setPresetEnabled(Long id, boolean enabled);
}
