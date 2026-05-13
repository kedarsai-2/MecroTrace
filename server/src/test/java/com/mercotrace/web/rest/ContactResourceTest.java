package com.mercotrace.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.Contact;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.service.ChartOfAccountService;
import com.mercotrace.service.ContactIdentityService;
import com.mercotrace.service.ContactListScope;
import com.mercotrace.service.ContactService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.VoucherLineService;
import com.mercotrace.service.dto.ContactDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@ExtendWith(MockitoExtension.class)
class ContactResourceTest {

    private static final Long TRADER_ID = 101L;

    @Mock
    private ContactService contactService;

    @Mock
    private ContactRepository contactRepository;

    @Mock
    private TraderContextService traderContextService;

    @Mock
    private ContactIdentityService contactIdentityService;

    @Mock
    private ChartOfAccountService chartOfAccountService;

    @Mock
    private VoucherLineService voucherLineService;

    private ContactResource resource;

    @BeforeEach
    void setUp() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/contacts");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        resource = new ContactResource(
            contactService,
            contactRepository,
            traderContextService,
            contactIdentityService,
            chartOfAccountService,
            voucherLineService
        );
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void getAllContacts_withoutPagination_returnsArrayForBackwardCompatibility() throws Exception {
        when(contactService.listContacts(TRADER_ID, ContactListScope.REGISTRY)).thenReturn(List.of(contact(1L, "Alice")));

        ResponseEntity<List<ContactDTO>> response = resource.getAllContacts("registry", null, null, "");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).extracting(ContactDTO::getId).containsExactly(1L);
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Alice");
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isNull();

        verify(contactService).listContacts(TRADER_ID, ContactListScope.REGISTRY);
        verify(contactService, never()).listContactsPage(any(), any(), any(), any());
    }

    @Test
    void getAllContacts_withPagination_returnsPageContentAndTotalHeader() throws Exception {
        when(contactService.listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), any(Pageable.class), eq("")))
            .thenReturn(new PageImpl<>(List.of(contact(2L, "Bob")), Pageable.ofSize(1).withPage(0), 2));

        ResponseEntity<List<ContactDTO>> response = resource.getAllContacts("registry", 0, 1, "");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("2");
        assertThat(response.getBody()).extracting(ContactDTO::getId).containsExactly(2L);
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Bob");
    }

    @Test
    void getAllContacts_withPaginationAndSearchPassesQueryToService() throws Exception {
        when(contactService.listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), any(Pageable.class), eq("ali")))
            .thenReturn(new PageImpl<>(List.of(contact(3L, "Alina")), Pageable.ofSize(20).withPage(0), 1));

        ResponseEntity<List<ContactDTO>> response = resource.getAllContacts("registry", 0, 20, "ali");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("1");
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Alina");

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(contactService).listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), pageableCaptor.capture(), eq("ali"));
        assertThat(pageableCaptor.getValue().getPageNumber()).isEqualTo(0);
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void getAllContacts_withSearchOnlyKeepsArrayShape() throws Exception {
        when(contactService.listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), any(Pageable.class), eq("ali")))
            .thenReturn(new PageImpl<>(List.of(contact(3L, "Alina"))));

        ResponseEntity<List<ContactDTO>> response = resource.getAllContacts("registry", null, null, "ali");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Alina");
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isNull();
    }

    @Test
    void createContact_withExistingGlobalPhoneReturnsImportCandidateError() {
        String phone = "9876543210";
        ContactDTO request = newContactRequest("New Name", phone);
        Contact globalContact = contactEntity(55L, null, phone);

        when(contactIdentityService.normalizePhoneOrThrow(phone)).thenReturn(phone);
        when(contactRepository.findOneByPhoneAndActiveTrue(phone)).thenReturn(Optional.of(globalContact));

        assertThatThrownBy(() -> resource.createContact(request))
            .isInstanceOf(BadRequestAlertException.class)
            .extracting("errorKey")
            .isEqualTo("portalcontactexists");

        verify(contactService, never()).ensureTraderUsesPortalContact(any(), any());
        verify(contactService, never()).save(any());
        verify(contactIdentityService, never()).assertMobileAvailableForContact(any(), any());
    }

    @Test
    void createContact_withExistingTraderPhone_stillReturnsPhoneExists() {
        String phone = "9876543210";
        ContactDTO request = newContactRequest("Duplicate", phone);
        Contact traderContact = contactEntity(66L, TRADER_ID, phone);

        when(contactIdentityService.normalizePhoneOrThrow(phone)).thenReturn(phone);
        when(contactRepository.findOneByPhoneAndActiveTrue(phone)).thenReturn(Optional.of(traderContact));

        assertThatThrownBy(() -> resource.createContact(request))
            .isInstanceOf(BadRequestAlertException.class)
            .extracting("errorKey")
            .isEqualTo("phoneexists");

        verify(contactService, never()).ensureTraderUsesPortalContact(any(), any());
        verify(contactService, never()).save(any());
    }

    @Test
    void getPortalContactImportCandidateByPhone_returnsGlobalContactWithoutImporting() {
        String phone = "9876543210";
        Contact globalContact = contactEntity(77L, null, phone);
        ContactDTO globalDto = contact(77L, "Global Contact");
        globalDto.setTraderId(null);

        when(contactIdentityService.normalizePhoneOrThrow(phone)).thenReturn(phone);
        when(contactRepository.findOneByPhoneAndActiveTrue(phone)).thenReturn(Optional.of(globalContact));
        when(contactService.findOne(77L)).thenReturn(Optional.of(globalDto));

        ResponseEntity<ContactDTO> response = resource.getPortalContactImportCandidateByPhone(phone);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getId()).isEqualTo(77L);
        assertThat(response.getBody().getPortalSignupLinked()).isTrue();

        verify(contactService, never()).ensureTraderUsesPortalContact(any(), any());
    }

    private static ContactDTO contact(Long id, String name) {
        ContactDTO dto = new ContactDTO();
        dto.setId(id);
        dto.setName(name);
        dto.setPhone("9876543210");
        return dto;
    }

    private static ContactDTO newContactRequest(String name, String phone) {
        ContactDTO dto = new ContactDTO();
        dto.setName(name);
        dto.setPhone(phone);
        dto.setMark("MK");
        return dto;
    }

    private static Contact contactEntity(Long id, Long traderId, String phone) {
        Contact contact = new Contact();
        contact.setId(id);
        contact.setTraderId(traderId);
        contact.setPhone(phone);
        contact.setName("Existing");
        contact.setActive(Boolean.TRUE);
        return contact;
    }
}
