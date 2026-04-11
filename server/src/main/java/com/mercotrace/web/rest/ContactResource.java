package com.mercotrace.web.rest;

import com.mercotrace.repository.ContactRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.ChartOfAccountService;
import com.mercotrace.service.ContactIdentityService;
import com.mercotrace.service.ContactListScope;
import com.mercotrace.service.ContactService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.VoucherLineService;
import com.mercotrace.service.dto.ChartOfAccountDTO;
import com.mercotrace.service.dto.ContactDTO;
import com.mercotrace.service.dto.VoucherLineDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing {@link com.mercotrace.domain.Contact}.
 *
 * Note: This controller is intentionally kept simple (no criteria/pagination)
 * because the frontend loads all contacts client-side and performs its own filtering.
 */
@RestController
@RequestMapping("/api/contacts")
public class ContactResource {

    private static final Logger LOG = LoggerFactory.getLogger(ContactResource.class);

    private static final String ENTITY_NAME = "contact";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final ContactService contactService;

    private final ContactRepository contactRepository;

    private final TraderContextService traderContextService;

    private final ContactIdentityService contactIdentityService;

    private final ChartOfAccountService chartOfAccountService;

    private final VoucherLineService voucherLineService;

    public ContactResource(
        ContactService contactService,
        ContactRepository contactRepository,
        TraderContextService traderContextService,
        ContactIdentityService contactIdentityService,
        ChartOfAccountService chartOfAccountService,
        VoucherLineService voucherLineService
    ) {
        this.contactService = contactService;
        this.contactRepository = contactRepository;
        this.traderContextService = traderContextService;
        this.contactIdentityService = contactIdentityService;
        this.chartOfAccountService = chartOfAccountService;
        this.voucherLineService = voucherLineService;
    }

    /**
     * {@code POST  /contacts} : Create a new contact.
     *
     * @param contactDTO the contactDTO to create.
     * @return the {@link ResponseEntity} with status {@code 201 (Created)} and with body the new contactDTO,
     * or with status {@code 400 (Bad Request)} if the contact has already an ID.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PostMapping("")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_CREATE + "\")")
    public ResponseEntity<ContactDTO> createContact(@Valid @RequestBody ContactDTO contactDTO) throws URISyntaxException {
        LOG.debug("REST request to save Contact : {}", contactDTO);
        if (contactDTO.getId() != null) {
            throw new BadRequestAlertException("A new contact cannot already have an ID", ENTITY_NAME, "idexists");
        }

        // Resolve trader ownership from authenticated user
        Long traderId = resolveTraderId();
        contactDTO.setTraderId(traderId);

        // Enforce global mobile uniqueness across trader owner, trader staff and contacts
        contactIdentityService.assertMobileAvailableForContact(contactDTO.getPhone(), null);

        // Enforce phone uniqueness per trader (active or inactive)
        Optional<com.mercotrace.domain.Contact> existingByPhone = contactRepository
            .findOneByTraderIdAndPhone(traderId, contactDTO.getPhone());
        if (existingByPhone.isPresent()) {
            if (Boolean.TRUE.equals(existingByPhone.get().getActive())) {
                throw new BadRequestAlertException("This phone number is already registered", ENTITY_NAME, "phoneexists");
            }
            throw new BadRequestAlertException(
                "A contact with this phone was previously removed. You can restore it instead of creating a new one.",
                ENTITY_NAME,
                "phoneexistsinactive"
            );
        }

        // Enforce mark uniqueness per trader
        String mark = contactDTO.getMark();
        if (mark != null && !mark.isBlank()) {
            String trimmedMark = mark.trim();
            contactRepository
                .findOneByTraderIdAndMarkIgnoreCase(traderId, trimmedMark)
                .ifPresent(existing -> {
                    throw new BadRequestAlertException(
                        "This mark is already in use by another contact",
                        ENTITY_NAME,
                        "markexists"
                    );
                });
        }

        contactDTO = contactService.save(contactDTO);
        return ResponseEntity.created(new URI("/api/contacts/" + contactDTO.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(applicationName, true, ENTITY_NAME, contactDTO.getId().toString()))
            .body(contactDTO);
    }

    /**
     * {@code PUT  /contacts/:id} : Updates an existing contact.
     *
     * @param id the id of the contactDTO to save.
     * @param contactDTO the contactDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated contactDTO,
     * or with status {@code 400 (Bad Request)} if the contactDTO is not valid,
     * or with status {@code 500 (Internal Server Error)} if the contactDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_EDIT + "\")")
    public ResponseEntity<ContactDTO> updateContact(
        @PathVariable(value = "id", required = false) final Long id,
        @Valid @RequestBody ContactDTO contactDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to update Contact : {}, {}", id, contactDTO);
        if (contactDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, contactDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        Long traderId = resolveTraderId();
        ContactDTO existingDto = contactService
            .findOne(id)
            .orElseThrow(() -> new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound"));
        assertTraderMayEditContactRegistry(traderId, existingDto);

        contactDTO.setTraderId(traderId);

        // Enforce global mobile uniqueness across trader owner, trader staff and contacts (exclude current contact)
        contactIdentityService.assertMobileAvailableForContact(contactDTO.getPhone(), id);

        // Enforce phone uniqueness per trader, excluding the current record
        contactRepository
            .findOneByTraderIdAndPhone(traderId, contactDTO.getPhone())
            .ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw new BadRequestAlertException("This phone number is already registered", ENTITY_NAME, "phoneexists");
                }
            });

        // Enforce mark uniqueness per trader, excluding the current record
        String mark = contactDTO.getMark();
        if (mark != null && !mark.isBlank()) {
            String trimmedMark = mark.trim();
            contactRepository
                .findOneByTraderIdAndMarkIgnoreCaseAndIdNot(traderId, trimmedMark, id)
                .ifPresent(existing -> {
                    throw new BadRequestAlertException(
                        "This mark is already in use by another contact",
                        ENTITY_NAME,
                        "markexists"
                    );
                });
        }

        contactDTO = contactService.update(contactDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(applicationName, true, ENTITY_NAME, contactDTO.getId().toString()))
            .body(contactDTO);
    }

    /**
     * {@code PATCH  /contacts/:id} : Partial updates given fields of an existing contact, field will ignore if it is null.
     *
     * @param id the id of the contactDTO to save.
     * @param contactDTO the contactDTO to update.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the updated contactDTO,
     * or with status {@code 400 (Bad Request)} if the contactDTO is not valid,
     * or with status {@code 404 (Not Found)} if the contactDTO is not found,
     * or with status {@code 500 (Internal Server Error)} if the contactDTO couldn't be updated.
     * @throws URISyntaxException if the Location URI syntax is incorrect.
     */
    @PatchMapping(value = "/{id}", consumes = { "application/json", "application/merge-patch+json" })
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_EDIT + "\")")
    public ResponseEntity<ContactDTO> partialUpdateContact(
        @PathVariable(value = "id", required = false) final Long id,
        @NotNull @RequestBody ContactDTO contactDTO
    ) throws URISyntaxException {
        LOG.debug("REST request to partial update Contact partially : {}, {}", id, contactDTO);
        if (contactDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        if (!Objects.equals(id, contactDTO.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }

        Long traderId = resolveTraderId();
        ContactDTO existingDto = contactService
            .findOne(id)
            .orElseThrow(() -> new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound"));
        assertTraderMayEditContactRegistry(traderId, existingDto);

        // If phone is being updated, enforce global mobile uniqueness
        if (contactDTO.getPhone() != null) {
            contactIdentityService.assertMobileAvailableForContact(contactDTO.getPhone(), id);
        }

        // If mark is being updated, enforce uniqueness per trader
        if (contactDTO.getMark() != null && !contactDTO.getMark().isBlank()) {
            String trimmedMark = contactDTO.getMark().trim();
            contactRepository
                .findOneByTraderIdAndMarkIgnoreCaseAndIdNot(traderId, trimmedMark, id)
                .ifPresent(existing -> {
                    throw new BadRequestAlertException(
                        "This mark is already in use by another contact",
                        ENTITY_NAME,
                        "markexists"
                    );
                });
        }

        Optional<ContactDTO> result = contactService.partialUpdate(contactDTO);

        return ResponseUtil.wrapOrNotFound(
            result,
            HeaderUtil.createEntityUpdateAlert(applicationName, true, ENTITY_NAME, contactDTO.getId().toString())
        );
    }

    /**
     * {@code GET  /contacts} : contacts for the current trader.
     *
     * @param scope {@code registry} (Contacts module: trader-owned + portal participants already used here) or
     *              {@code participants} (Arrivals/Auctions: trader-owned + all active self-signup contacts).
     */
    @GetMapping("")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_VIEW + "\")")
    public ResponseEntity<List<ContactDTO>> getAllContacts(
        @RequestParam(name = "scope", required = false, defaultValue = "registry") String scope
    ) {
        LOG.debug("REST request to get Contacts for current trader, scope={}", scope);
        Long traderId = resolveTraderId();
        ContactListScope listScope = parseContactListScope(scope);
        List<ContactDTO> list = contactService.listContacts(traderId, listScope);
        return ResponseEntity.ok().body(list);
    }

    /**
     * {@code GET  /contacts/by-phone} : get the contact by phone for the current trader (active or inactive).
     * Used when create fails with "phone exists but inactive" so the client can get the id to call restore.
     *
     * @param phone the phone number.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and body the contactDTO, or {@code 404 (Not Found)}.
     */
    @GetMapping("/by-phone")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_VIEW + "\")")
    public ResponseEntity<ContactDTO> getContactByPhone(@RequestParam("phone") String phone) {
        LOG.debug("REST request to get Contact by phone : {}", phone);
        Long traderId = resolveTraderId();
        Optional<ContactDTO> contactDTO = contactService.findOneByTraderIdAndPhone(traderId, phone);
        return ResponseUtil.wrapOrNotFound(contactDTO);
    }

    /**
     * {@code GET  /contacts/:id} : get the "id" contact.
     *
     * @param id the id of the contactDTO to retrieve.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and with body the contactDTO, or with status {@code 404 (Not Found)}.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_VIEW + "\")")
    public ResponseEntity<ContactDTO> getContact(@PathVariable("id") Long id) {
        LOG.debug("REST request to get Contact : {}", id);
        Long traderId = resolveTraderId();
        Optional<ContactDTO> contactDTO = contactService.findOne(id).filter(dto -> isReadableParticipantContact(dto, traderId));
        return ResponseUtil.wrapOrNotFound(contactDTO);
    }

    /**
     * {@code PATCH  /contacts/:id/restore} : restore a soft-deleted contact (set active = true).
     *
     * @param id the id of the contact to restore.
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and body the restored contactDTO, or {@code 404 (Not Found)}.
     */
    @PatchMapping("/{id}/restore")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_EDIT + "\")")
    public ResponseEntity<ContactDTO> restoreContact(@PathVariable("id") Long id) {
        LOG.debug("REST request to restore Contact : {}", id);
        Long traderId = resolveTraderId();
        Optional<ContactDTO> restored = contactService.restore(id);
        if (restored.isEmpty() || !Objects.equals(restored.get().getTraderId(), traderId)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().body(restored.get());
    }

    private Long resolveTraderId() {
        return traderContextService.getCurrentTraderId();
    }

    /** Trader-owned contacts, plus self-registered (traderId null) participants visible in lists and flows. */
    private boolean isReadableParticipantContact(ContactDTO dto, Long traderId) {
        if (dto == null || traderId == null) {
            return false;
        }
        if (Objects.equals(dto.getTraderId(), traderId)) {
            return true;
        }
        return dto.getTraderId() == null;
    }

    /**
     * {@code DELETE  /contacts/:id} : delete the "id" contact.
     *
     * @param id the id of the contactDTO to delete.
     * @return the {@link ResponseEntity} with status {@code 204 (NO_CONTENT)}.
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CONTACTS_DELETE + "\")")
    public ResponseEntity<Void> deleteContact(@PathVariable("id") Long id) {
        LOG.debug("REST request to delete Contact : {}", id);
        Long traderId = resolveTraderId();
        Optional<ContactDTO> existing = contactService.findOne(id);
        if (existing.isEmpty() || !Objects.equals(existing.get().getTraderId(), traderId)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }
        contactService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert(applicationName, true, ENTITY_NAME, id.toString()))
            .build();
    }

    /**
     * {@code GET  /contacts/:id/ledgers} : get all ledgers linked to a contact.
     * Trader-scoped. Validates contact exists and belongs to trader.
     * Permission: CONTACTS_VIEW or CHART_OF_ACCOUNTS_VIEW.
     */
    @GetMapping("/{id}/ledgers")
    @PreAuthorize(
        "hasAuthority(\"" + AuthoritiesConstants.CONTACTS_VIEW + "\") or " +
        "hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW + "\")"
    )
    public ResponseEntity<List<ChartOfAccountDTO>> getContactLedgers(@PathVariable("id") Long id) {
        LOG.debug("REST request to get ledgers for contact : {}", id);
        Long traderId = resolveTraderId();
        Optional<ContactDTO> contact = contactService.findOne(id).filter(dto -> isReadableParticipantContact(dto, traderId));
        if (contact.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        List<ChartOfAccountDTO> ledgers = chartOfAccountService.getLedgersByContactId(id);
        return ResponseEntity.ok().body(ledgers);
    }

    /**
     * {@code GET  /contacts/:id/ledger-transactions} : get unified chronological transaction timeline
     * for all ledgers of a contact. Optional dateFrom, dateTo. Excludes REVERSED vouchers.
     * Permission: CONTACTS_VIEW or CHART_OF_ACCOUNTS_VIEW.
     */
    @GetMapping("/{id}/ledger-transactions")
    @PreAuthorize(
        "hasAuthority(\"" + AuthoritiesConstants.CONTACTS_VIEW + "\") or " +
        "hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW + "\")"
    )
    public ResponseEntity<List<VoucherLineDTO>> getContactLedgerTransactions(
        @PathVariable("id") Long id,
        @RequestParam(required = false) LocalDate dateFrom,
        @RequestParam(required = false) LocalDate dateTo
    ) {
        LOG.debug("REST request to get ledger transactions for contact : {}, dateFrom={}, dateTo={}", id, dateFrom, dateTo);
        Long traderId = resolveTraderId();
        Optional<ContactDTO> contact = contactService.findOne(id).filter(dto -> isReadableParticipantContact(dto, traderId));
        if (contact.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        List<VoucherLineDTO> lines = voucherLineService.getLinesByContactIdAndDateRange(id, dateFrom, dateTo);
        return ResponseEntity.ok().body(lines);
    }

    /**
     * {@code GET  /contacts/search} : search contacts by mark for a trader.
     *
     * @param traderId the trader id (optional for now).
     * @param mark the mark fragment.
     * @return the list of matching contacts.
     */
    @GetMapping("/search")
    public ResponseEntity<List<ContactDTO>> searchContactsByMark(@RequestParam("mark") String mark) {
        Long traderId = resolveTraderId();
        LOG.debug("REST request to search Contacts by mark for current trader. traderId={}, mark={}", traderId, mark);
        List<ContactDTO> list = contactService.searchByMark(traderId, mark);
        return ResponseEntity.ok().body(list);
    }

    private static ContactListScope parseContactListScope(String raw) {
        if (raw == null || raw.isBlank()) {
            return ContactListScope.REGISTRY;
        }
        return switch (raw.trim().toLowerCase(Locale.ROOT)) {
            case "participants", "participant" -> ContactListScope.PARTICIPANTS;
            default -> ContactListScope.REGISTRY;
        };
    }

    private void assertTraderMayEditContactRegistry(Long traderId, ContactDTO existing) {
        if (Objects.equals(existing.getTraderId(), traderId)) {
            return;
        }
        if (existing.getTraderId() == null && contactService.isPortalContactLinkedToTrader(traderId, existing.getId())) {
            throw new BadRequestAlertException(
                "This participant manages their profile via portal signup. Editing is not available from the trader registry.",
                ENTITY_NAME,
                "portalManagedContact"
            );
        }
        throw new BadRequestAlertException("You are not allowed to modify this contact", ENTITY_NAME, "forbidden");
    }
}

