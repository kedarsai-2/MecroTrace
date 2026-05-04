package com.mercotrace.service;

import com.mercotrace.service.dto.ContactDTO;
import java.util.List;
import java.util.Optional;

/**
 * Service Interface for managing {@link com.mercotrace.domain.Contact}.
 */
public interface ContactService {

    /**
     * Save a contact.
     *
     * This should be used for creating new contacts.
     *
     * @param contactDTO the entity to save.
     * @return the persisted entity.
     */
    ContactDTO save(ContactDTO contactDTO);

    /**
     * Updates a contact.
     *
     * @param contactDTO the entity to update.
     * @return the persisted entity.
     */
    ContactDTO update(ContactDTO contactDTO);

    /**
     * Partially updates a contact.
     *
     * @param contactDTO the entity to update partially.
     * @return the persisted entity.
     */
    Optional<ContactDTO> partialUpdate(ContactDTO contactDTO);

    /**
     * Get the "id" contact.
     *
     * @param id the id of the entity.
     * @return the entity.
     */
    Optional<ContactDTO> findOne(Long id);

    /**
     * Delete the "id" contact (soft delete: sets active = false).
     *
     * @param id the id of the entity.
     */
    void delete(Long id);

    /**
     * Restore a soft-deleted contact (sets active = true).
     *
     * @param id the id of the entity.
     * @return the restored entity, or empty if not found.
     */
    Optional<ContactDTO> restore(Long id);

    /**
     * Get a contact by trader and phone (active or inactive). For restore flow.
     *
     * @param traderId the owning trader id.
     * @param phone the phone number.
     * @return the contact if found.
     */
    Optional<ContactDTO> findOneByTraderIdAndPhone(Long traderId, String phone);

    /**
     * Lists contacts for UI lists: registry (Contacts module) or participant pool (Arrivals / Auctions search).
     *
     * @param traderId current trader.
     * @param scope registry vs participants.
     */
    List<ContactDTO> listContacts(Long traderId, ContactListScope scope);

    /**
     * When a portal (self-signup) contact is used in a trader flow, record the association so it appears in that trader's registry.
     */
    void ensureTraderUsesPortalContact(Long traderId, Long contactId);

    boolean isPortalContactLinkedToTrader(Long traderId, Long contactId);

    /**
     * Search contacts by mark fragment for a trader.
     *
     * @param traderId the owning trader id.
     * @param markFragment the mark fragment to search (case-insensitive contains).
     * @return list of contacts.
     */
    List<ContactDTO> searchByMark(Long traderId, String markFragment);

    /**
     * Bounded participant search for high-frequency pickers such as Auctions.
     *
     * @param traderId current trader.
     * @param query mark, name, or phone fragment.
     * @param limit max rows to return.
     * @return trader contacts first, then portal participants, deduplicated like participant lists.
     */
    List<ContactDTO> searchParticipants(Long traderId, String query, int limit);
}
