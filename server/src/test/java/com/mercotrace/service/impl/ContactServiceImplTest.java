package com.mercotrace.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.Contact;
import com.mercotrace.domain.TraderPortalContactLink;
import com.mercotrace.repository.ChartOfAccountRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.repository.TraderPortalContactLinkRepository;
import com.mercotrace.service.ChartOfAccountService;
import com.mercotrace.service.ContactIdentityService;
import com.mercotrace.service.ContactListScope;
import com.mercotrace.service.dto.ContactDTO;
import com.mercotrace.service.mapper.ContactMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;

@ExtendWith(MockitoExtension.class)
class ContactServiceImplTest {

    private static final Long TRADER_ID = 101L;

    @Mock
    private ContactRepository contactRepository;

    @Mock
    private ContactMapper contactMapper;

    @Mock
    private CacheManager cacheManager;

    @Mock
    private ContactIdentityService contactIdentityService;

    @Mock
    private ChartOfAccountService chartOfAccountService;

    @Mock
    private ChartOfAccountRepository chartOfAccountRepository;

    @Mock
    private TraderPortalContactLinkRepository traderPortalContactLinkRepository;

    private ContactServiceImpl contactService;

    @BeforeEach
    void setUp() {
        contactService = new ContactServiceImpl(
            contactRepository,
            contactMapper,
            cacheManager,
            contactIdentityService,
            chartOfAccountService,
            chartOfAccountRepository,
            traderPortalContactLinkRepository
        );
        when(contactMapper.toDto(any(Contact.class))).thenAnswer(invocation -> toDto(invocation.getArgument(0)));
    }

    @Test
    void saveDefaultsNewTraderContactsToPortalLoginEnabled() {
        ContactDTO dto = new ContactDTO();
        dto.setTraderId(TRADER_ID);
        dto.setName("Trader Contact");
        dto.setPhone("9876543210");
        dto.setMark("TC");

        when(contactMapper.toEntity(any(ContactDTO.class))).thenAnswer(invocation -> toEntity(invocation.getArgument(0)));
        when(contactRepository.save(any(Contact.class))).thenAnswer(invocation -> {
            Contact contact = invocation.getArgument(0);
            contact.setId(99L);
            return contact;
        });

        ContactDTO saved = contactService.save(dto);

        assertThat(saved.getCanLogin()).isTrue();
        ArgumentCaptor<Contact> contactCaptor = ArgumentCaptor.forClass(Contact.class);
        verify(contactRepository).save(contactCaptor.capture());
        assertThat(contactCaptor.getValue().getCanLogin()).isTrue();
    }

    @Test
    void listRegistry_batchesPortalLinkedContactsAndPreservesDedupeRules() {
        Contact traderOwned = contact(1L, TRADER_ID, "Trader Owned", "9876543210", "TO");
        Contact linkedUnique = contact(2L, null, "Portal Unique", "9876543211", "PU");
        Contact linkedDuplicatePhone = contact(3L, null, "Portal Duplicate", "9876543210", "PD");
        Contact linkedOwnedElsewhere = contact(4L, 202L, "Other Trader", "9876543212", "OT");
        Contact linkedInactive = contact(5L, null, "Inactive Portal", "9876543213", "IP");
        linkedInactive.setActive(false);

        when(contactRepository.findAllByTraderIdAndActiveTrue(TRADER_ID)).thenReturn(List.of(traderOwned));
        when(traderPortalContactLinkRepository.findAllByTraderIdOrderByLinkedAtDesc(TRADER_ID))
            .thenReturn(List.of(link(2L), link(3L), link(4L), link(5L), link(2L)));
        when(contactRepository.findAllById(any()))
            .thenReturn(List.of(linkedUnique, linkedDuplicatePhone, linkedOwnedElsewhere, linkedInactive));

        List<ContactDTO> result = contactService.listContacts(TRADER_ID, ContactListScope.REGISTRY);

        assertThat(result).extracting(ContactDTO::getId).containsExactly(1L, 2L);
        assertThat(result.get(0).getPortalSignupLinked()).isFalse();
        assertThat(result.get(1).getPortalSignupLinked()).isTrue();

        ArgumentCaptor<Iterable<Long>> idsCaptor = ArgumentCaptor.forClass(Iterable.class);
        verify(contactRepository).findAllById(idsCaptor.capture());
        List<Long> requestedIds = new ArrayList<>();
        idsCaptor.getValue().forEach(requestedIds::add);
        assertThat(requestedIds).containsExactly(2L, 3L, 4L, 5L);
        verify(contactRepository, never()).findById(any());
    }

    @Test
    void listParticipantsUsesRegistryScopeWithoutLoadingUnlinkedPortalContacts() {
        Contact traderOwned = contact(1L, TRADER_ID, "Trader Owned", "9876543210", "TO");

        when(contactRepository.findAllByTraderIdAndActiveTrue(TRADER_ID)).thenReturn(List.of(traderOwned));
        when(traderPortalContactLinkRepository.findAllByTraderIdOrderByLinkedAtDesc(TRADER_ID)).thenReturn(List.of());

        List<ContactDTO> result = contactService.listContacts(TRADER_ID, ContactListScope.PARTICIPANTS);

        assertThat(result).extracting(ContactDTO::getId).containsExactly(1L);
    }

    @Test
    void searchParticipantsUsesRegistryScopeWithoutSearchingUnlinkedPortalContacts() {
        Contact traderOwned = contact(1L, TRADER_ID, "Trader Owned", "9876543210", "TO");

        when(contactRepository.findAllByTraderIdAndActiveTrue(TRADER_ID)).thenReturn(List.of(traderOwned));
        when(traderPortalContactLinkRepository.findAllByTraderIdOrderByLinkedAtDesc(TRADER_ID)).thenReturn(List.of());

        List<ContactDTO> result = contactService.searchParticipants(TRADER_ID, "trader", 50);

        assertThat(result).extracting(ContactDTO::getId).containsExactly(1L);
    }

    private static Contact contact(Long id, Long traderId, String name, String phone, String mark) {
        Contact contact = new Contact();
        contact.setId(id);
        contact.setTraderId(traderId);
        contact.setName(name);
        contact.setPhone(phone);
        contact.setMark(mark);
        contact.setActive(true);
        return contact;
    }

    private static TraderPortalContactLink link(Long contactId) {
        TraderPortalContactLink link = new TraderPortalContactLink();
        link.setTraderId(TRADER_ID);
        link.setContactId(contactId);
        return link;
    }

    private static ContactDTO toDto(Contact contact) {
        ContactDTO dto = new ContactDTO();
        dto.setId(contact.getId());
        dto.setTraderId(contact.getTraderId());
        dto.setName(contact.getName());
        dto.setPhone(contact.getPhone());
        dto.setMark(contact.getMark());
        dto.setCanLogin(contact.getCanLogin());
        return dto;
    }

    private static Contact toEntity(ContactDTO dto) {
        Contact contact = new Contact();
        contact.setId(dto.getId());
        contact.setTraderId(dto.getTraderId());
        contact.setName(dto.getName());
        contact.setPhone(dto.getPhone());
        contact.setMark(dto.getMark());
        contact.setOpeningBalance(dto.getOpeningBalance());
        contact.setCurrentBalance(dto.getCurrentBalance());
        contact.setCanLogin(dto.getCanLogin());
        contact.setActive(dto.getActive());
        return contact;
    }
}
