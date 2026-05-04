package com.mercotrace.service.impl;

import com.mercotrace.domain.Contact;
import com.mercotrace.domain.TraderPortalContactLink;
import com.mercotrace.repository.ChartOfAccountRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.TraderPortalContactLinkRepository;
import com.mercotrace.service.ChartOfAccountService;
import com.mercotrace.service.ContactIdentityService;
import com.mercotrace.service.ContactListScope;
import com.mercotrace.service.ContactService;
import com.mercotrace.service.dto.ChartOfAccountCreateRequest;
import com.mercotrace.service.dto.ContactDTO;
import com.mercotrace.service.mapper.ContactMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service Implementation for managing {@link com.mercotrace.domain.Contact}.
 */
@Service
@Transactional
public class ContactServiceImpl implements ContactService {

    /** Cache for vendor list by trader (Stock Purchase and other modules). Evicted on contact save/update/delete. */
    public static final String STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE = "stockPurchaseVendorsByTrader";

    private static final Logger LOG = LoggerFactory.getLogger(ContactServiceImpl.class);

    private final ContactRepository contactRepository;

    private final ContactMapper contactMapper;

    private final CacheManager cacheManager;

    private final ContactIdentityService contactIdentityService;

    private final ChartOfAccountService chartOfAccountService;

    private final ChartOfAccountRepository chartOfAccountRepository;

    private final TraderPortalContactLinkRepository traderPortalContactLinkRepository;

    public ContactServiceImpl(
        ContactRepository contactRepository,
        ContactMapper contactMapper,
        CacheManager cacheManager,
        ContactIdentityService contactIdentityService,
        ChartOfAccountService chartOfAccountService,
        ChartOfAccountRepository chartOfAccountRepository,
        TraderPortalContactLinkRepository traderPortalContactLinkRepository
    ) {
        this.contactRepository = contactRepository;
        this.contactMapper = contactMapper;
        this.cacheManager = cacheManager;
        this.contactIdentityService = contactIdentityService;
        this.chartOfAccountService = chartOfAccountService;
        this.chartOfAccountRepository = chartOfAccountRepository;
        this.traderPortalContactLinkRepository = traderPortalContactLinkRepository;
    }

    @Override
    @CacheEvict(cacheNames = STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE, key = "#contactDTO.traderId")
    public ContactDTO save(ContactDTO contactDTO) {
        LOG.debug("Request to save Contact : {}", contactDTO);

        boolean isNewContact = contactDTO.getId() == null;

        // Default values for new contacts (aligned with frontend mock)
        if (contactDTO.getCreatedAt() == null) {
            contactDTO.setCreatedAt(Instant.now());
        }
        if (contactDTO.getOpeningBalance() == null) {
            contactDTO.setOpeningBalance(BigDecimal.ZERO);
        }
        if (contactDTO.getCurrentBalance() == null) {
            contactDTO.setCurrentBalance(BigDecimal.ZERO);
        }
        if (contactDTO.getCanLogin() == null) {
            contactDTO.setCanLogin(Boolean.FALSE);
        }

        Contact contact = contactMapper.toEntity(contactDTO);
        if (contact.getActive() == null) {
            contact.setActive(true);
        }
        contact = contactRepository.save(contact);

        // REQ-CON-003: Auto-create Receivable ledger for new contacts (not on update/restore)
        if (isNewContact && contact.getTraderId() != null) {
            createReceivableLedgerForContact(contact);
        }

        return contactMapper.toDto(contact);
    }

    /**
     * Creates a Receivable ledger for a newly registered contact.
     * Wrapped in try-catch so contact creation is never blocked by ledger creation failures.
     */
    private void createReceivableLedgerForContact(Contact contact) {
        try {
            Long traderId = contact.getTraderId();
            String baseName = "Receivable - " + (contact.getName() != null ? contact.getName().trim() : "Contact");
            String ledgerName = resolveUniqueLedgerName(traderId, baseName, contact.getMark(), contact.getPhone());

            ChartOfAccountCreateRequest request = new ChartOfAccountCreateRequest();
            request.setLedgerName(ledgerName);
            request.setClassification("RECEIVABLE");
            request.setContactId(contact.getId());

            chartOfAccountRepository
                .findFirstByTraderIdAndClassificationAndLedgerNameContainingIgnoreCase(traderId, "CONTROL", "accounts receivable")
                .map(ar -> ar.getId())
                .ifPresent(request::setParentControlId);

            chartOfAccountService.create(request);
            LOG.debug("Created Receivable ledger for contact id={}, name={}", contact.getId(), contact.getName());
        } catch (Exception e) {
            LOG.warn("Failed to create Receivable ledger for contact id={}, name={}: {}",
                contact.getId(), contact.getName(), e.getMessage());
        }
    }

    private String resolveUniqueLedgerName(Long traderId, String baseName, String mark, String phone) {
        if (chartOfAccountRepository.findOneByTraderIdAndLedgerNameIgnoreCase(traderId, baseName).isEmpty()) {
            return baseName;
        }
        String withMark = baseName + " (" + (mark != null && !mark.isBlank() ? mark : (phone != null ? phone : "dup")) + ")";
        if (chartOfAccountRepository.findOneByTraderIdAndLedgerNameIgnoreCase(traderId, withMark).isEmpty()) {
            return withMark;
        }
        String withPhone = baseName + " - " + (phone != null ? phone : System.currentTimeMillis());
        return withPhone;
    }

    @Override
    @CacheEvict(cacheNames = STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE, key = "#contactDTO.traderId")
    public ContactDTO update(ContactDTO contactDTO) {
        LOG.debug("Request to update Contact : {}", contactDTO);
        if (contactDTO.getOpeningBalance() == null) {
            contactDTO.setOpeningBalance(BigDecimal.ZERO);
        }
        if (contactDTO.getCurrentBalance() == null) {
            contactDTO.setCurrentBalance(BigDecimal.ZERO);
        }
        if (contactDTO.getCanLogin() == null) {
            contactDTO.setCanLogin(Boolean.FALSE);
        }
        Contact contact = contactMapper.toEntity(contactDTO);
        if (contact.getActive() == null) {
            contact.setActive(true);
        }
        contact = contactRepository.save(contact);
        return contactMapper.toDto(contact);
    }

    @Override
    public Optional<ContactDTO> partialUpdate(ContactDTO contactDTO) {
        LOG.debug("Request to partially update Contact : {}", contactDTO);

        return contactRepository
            .findById(contactDTO.getId())
            .map(existingContact -> {
                contactMapper.partialUpdate(existingContact, contactDTO);

                return existingContact;
            })
            .map(contactRepository::save)
            .map(
                saved -> {
                    Long traderId = saved.getTraderId();
                    if (traderId != null && cacheManager.getCache(STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE) != null) {
                        cacheManager.getCache(STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE).evict(traderId);
                    }
                    return contactMapper.toDto(saved);
                }
            );
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ContactDTO> findOne(Long id) {
        LOG.debug("Request to get Contact : {}", id);
        return contactRepository.findById(id).map(contactMapper::toDto);
    }

    @Override
    public void delete(Long id) {
        LOG.debug("Request to soft-delete Contact : {}", id);
        contactRepository
            .findById(id)
            .ifPresent(
                c -> {
                    Long traderId = c.getTraderId();
                    if (traderId != null && cacheManager.getCache(STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE) != null) {
                        cacheManager.getCache(STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE).evict(traderId);
                    }
                    c.setActive(false);
                    contactRepository.save(c);
                }
            );
    }

    @Override
    public Optional<ContactDTO> restore(Long id) {
        LOG.debug("Request to restore Contact : {}", id);
        return contactRepository
            .findById(id)
            .map(
                c -> {
                    c.setActive(true);
                    Contact saved = contactRepository.save(c);
                    if (saved.getTraderId() != null && cacheManager.getCache(STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE) != null) {
                        cacheManager.getCache(STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE).evict(saved.getTraderId());
                    }
                    return contactMapper.toDto(saved);
                }
            );
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ContactDTO> findOneByTraderIdAndPhone(Long traderId, String phone) {
        LOG.debug("Request to get Contact by trader and phone : {}, {}", traderId, phone);
        return contactRepository
            .findOneByTraderIdAndPhone(traderId, phone)
            .map(contactMapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ContactDTO> listContacts(Long traderId, ContactListScope scope) {
        LOG.debug("Request to list contacts for trader : {}, scope={}", traderId, scope);
        if (scope == ContactListScope.PARTICIPANTS) {
            return listParticipantPool(traderId);
        }
        return listRegistry(traderId);
    }

    @Override
    @CacheEvict(cacheNames = STOCK_PURCHASE_VENDORS_BY_TRADER_CACHE, key = "#traderId")
    public void ensureTraderUsesPortalContact(Long traderId, Long contactId) {
        if (traderId == null || contactId == null) {
            return;
        }
        Contact c = contactRepository
            .findById(contactId)
            .orElseThrow(() -> new IllegalArgumentException("Contact not found: " + contactId));
        if (Boolean.FALSE.equals(c.getActive())) {
            throw new IllegalArgumentException("Contact is inactive: " + contactId);
        }
        if (c.getTraderId() != null) {
            if (!c.getTraderId().equals(traderId)) {
                throw new IllegalArgumentException("Contact belongs to another trader");
            }
            return;
        }
        if (!traderPortalContactLinkRepository.existsByTraderIdAndContactId(traderId, contactId)) {
            TraderPortalContactLink link = new TraderPortalContactLink();
            link.setTraderId(traderId);
            link.setContactId(contactId);
            link.setLinkedAt(Instant.now());
            traderPortalContactLinkRepository.save(link);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isPortalContactLinkedToTrader(Long traderId, Long contactId) {
        if (traderId == null || contactId == null) {
            return false;
        }
        return traderPortalContactLinkRepository.existsByTraderIdAndContactId(traderId, contactId);
    }

    private List<ContactDTO> listParticipantPool(Long traderId) {
        List<Contact> traderContacts = contactRepository.findAllByTraderIdAndActiveTrue(traderId);
        Set<String> phoneKeys = new HashSet<>();
        Set<String> markKeysLower = new HashSet<>();
        for (Contact c : traderContacts) {
            String pk = phoneKey(c.getPhone());
            if (!pk.isEmpty()) {
                phoneKeys.add(pk);
            }
            if (c.getMark() != null && !c.getMark().isBlank()) {
                markKeysLower.add(c.getMark().trim().toLowerCase(Locale.ROOT));
            }
        }

        List<ContactDTO> out = traderContacts.stream().map(contactMapper::toDto).collect(Collectors.toList());
        for (Contact global : contactRepository.findAllByTraderIdIsNullAndActiveTrue()) {
            String pk = phoneKey(global.getPhone());
            if (!pk.isEmpty() && phoneKeys.contains(pk)) {
                continue;
            }
            if (global.getMark() != null && !global.getMark().isBlank()) {
                if (markKeysLower.contains(global.getMark().trim().toLowerCase(Locale.ROOT))) {
                    continue;
                }
            }
            out.add(contactMapper.toDto(global));
        }
        return out;
    }

    private List<ContactDTO> listRegistry(Long traderId) {
        List<Contact> traderContacts = contactRepository.findAllByTraderIdAndActiveTrue(traderId);
        Set<String> phoneKeys = new HashSet<>();
        Set<String> markKeysLower = new HashSet<>();
        Set<Long> seenIds = new HashSet<>();
        for (Contact c : traderContacts) {
            seenIds.add(c.getId());
            String pk = phoneKey(c.getPhone());
            if (!pk.isEmpty()) {
                phoneKeys.add(pk);
            }
            if (c.getMark() != null && !c.getMark().isBlank()) {
                markKeysLower.add(c.getMark().trim().toLowerCase(Locale.ROOT));
            }
        }

        List<ContactDTO> out = traderContacts
            .stream()
            .map(contactMapper::toDto)
            .peek(d -> d.setPortalSignupLinked(Boolean.FALSE))
            .collect(Collectors.toList());

        for (TraderPortalContactLink link : traderPortalContactLinkRepository.findAllByTraderIdOrderByLinkedAtDesc(traderId)) {
            Long cid = link.getContactId();
            if (cid == null || seenIds.contains(cid)) {
                continue;
            }
            Contact global = contactRepository.findById(cid).orElse(null);
            if (global == null || Boolean.FALSE.equals(global.getActive()) || global.getTraderId() != null) {
                continue;
            }
            String pk = phoneKey(global.getPhone());
            if (!pk.isEmpty() && phoneKeys.contains(pk)) {
                continue;
            }
            if (global.getMark() != null && !global.getMark().isBlank()) {
                if (markKeysLower.contains(global.getMark().trim().toLowerCase(Locale.ROOT))) {
                    continue;
                }
            }
            ContactDTO dto = contactMapper.toDto(global);
            dto.setPortalSignupLinked(Boolean.TRUE);
            out.add(dto);
            seenIds.add(cid);
            if (!pk.isEmpty()) {
                phoneKeys.add(pk);
            }
            if (global.getMark() != null && !global.getMark().isBlank()) {
                markKeysLower.add(global.getMark().trim().toLowerCase(Locale.ROOT));
            }
        }
        return out;
    }

    /**
     * Normalize phone for deduplication: prefer 10-digit Indian mobile when possible.
     */
    private static String phoneKey(String phone) {
        if (phone == null || phone.isBlank()) {
            return "";
        }
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() == 10 && digits.matches("^[6-9]\\d{9}$")) {
            return digits;
        }
        return digits.isEmpty() ? phone.trim().toLowerCase(Locale.ROOT) : digits;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ContactDTO> searchByMark(Long traderId, String markFragment) {
        LOG.debug("Request to search Contacts by fragment. traderId={}, fragment={}", traderId, markFragment);
        List<ContactDTO> all = listContacts(traderId, ContactListScope.PARTICIPANTS);
        if (markFragment == null || markFragment.isBlank()) {
            return all;
        }
        final String lower = markFragment.toLowerCase();
        return all
            .stream()
            .filter(
                dto ->
                    (dto.getName() != null && dto.getName().toLowerCase().contains(lower)) ||
                    (dto.getPhone() != null && dto.getPhone().contains(markFragment)) ||
                    (dto.getMark() != null && dto.getMark().toLowerCase().contains(lower))
            )
            .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ContactDTO> searchParticipants(Long traderId, String query, int limit) {
        int cappedLimit = Math.max(1, Math.min(limit, 100));
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        LOG.debug("Request to bounded-search participant contacts. traderId={}, query={}, limit={}", traderId, needle, cappedLimit);

        List<Contact> traderMatches = contactRepository.searchActiveTraderContacts(traderId, needle, PageRequest.of(0, cappedLimit));
        List<Contact> portalMatches = contactRepository.searchActivePortalParticipants(needle, PageRequest.of(0, cappedLimit));

        List<ContactDTO> out = new ArrayList<>(cappedLimit);
        Set<String> phoneKeys = new HashSet<>();
        Set<String> markKeysLower = new HashSet<>();

        for (Contact contact : traderMatches) {
            if (out.size() >= cappedLimit) {
                break;
            }
            addParticipantSearchResult(contact, out, phoneKeys, markKeysLower);
        }

        for (Contact contact : portalMatches) {
            if (out.size() >= cappedLimit) {
                break;
            }
            addParticipantSearchResult(contact, out, phoneKeys, markKeysLower);
        }

        return out;
    }

    private void addParticipantSearchResult(
        Contact contact,
        List<ContactDTO> out,
        Set<String> phoneKeys,
        Set<String> markKeysLower
    ) {
        String pk = phoneKey(contact.getPhone());
        if (!pk.isEmpty() && phoneKeys.contains(pk)) {
            return;
        }
        String markKey = contact.getMark() != null && !contact.getMark().isBlank()
            ? contact.getMark().trim().toLowerCase(Locale.ROOT)
            : "";
        if (!markKey.isEmpty() && markKeysLower.contains(markKey)) {
            return;
        }

        out.add(contactMapper.toDto(contact));
        if (!pk.isEmpty()) {
            phoneKeys.add(pk);
        }
        if (!markKey.isEmpty()) {
            markKeysLower.add(markKey);
        }
    }
}

