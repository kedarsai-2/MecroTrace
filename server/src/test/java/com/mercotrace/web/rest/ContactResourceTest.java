package com.mercotrace.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.mercotrace.repository.ContactRepository;
import com.mercotrace.service.ChartOfAccountService;
import com.mercotrace.service.ContactIdentityService;
import com.mercotrace.service.ContactListScope;
import com.mercotrace.service.ContactService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.VoucherLineService;
import com.mercotrace.service.dto.ContactDTO;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        when(traderContextService.getCurrentTraderId()).thenReturn(TRADER_ID);
        ContactResource resource = new ContactResource(
            contactService,
            contactRepository,
            traderContextService,
            contactIdentityService,
            chartOfAccountService,
            voucherLineService
        );
        mockMvc = MockMvcBuilders.standaloneSetup(resource).build();
    }

    @Test
    void getAllContacts_withoutPagination_returnsArrayForBackwardCompatibility() throws Exception {
        when(contactService.listContacts(TRADER_ID, ContactListScope.REGISTRY)).thenReturn(List.of(contact(1L, "Alice")));

        mockMvc
            .perform(get("/api/contacts?scope=registry"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[0].name").value("Alice"))
            .andExpect(header().doesNotExist("X-Total-Count"));

        verify(contactService).listContacts(TRADER_ID, ContactListScope.REGISTRY);
        verify(contactService, never()).listContactsPage(any(), any(), any(), any());
    }

    @Test
    void getAllContacts_withPagination_returnsPageContentAndTotalHeader() throws Exception {
        when(contactService.listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), any(Pageable.class), eq("")))
            .thenReturn(new PageImpl<>(List.of(contact(2L, "Bob")), Pageable.ofSize(1).withPage(0), 2));

        mockMvc
            .perform(get("/api/contacts?scope=registry&page=0&size=1"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Total-Count", "2"))
            .andExpect(jsonPath("$[0].id").value(2))
            .andExpect(jsonPath("$[0].name").value("Bob"));
    }

    @Test
    void getAllContacts_withPaginationAndSearchPassesQueryToService() throws Exception {
        when(contactService.listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), any(Pageable.class), eq("ali")))
            .thenReturn(new PageImpl<>(List.of(contact(3L, "Alina")), Pageable.ofSize(20).withPage(0), 1));

        mockMvc
            .perform(get("/api/contacts?scope=registry&page=0&size=20&q=ali"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Total-Count", "1"))
            .andExpect(jsonPath("$[0].name").value("Alina"));

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(contactService).listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), pageableCaptor.capture(), eq("ali"));
        assertThat(pageableCaptor.getValue().getPageNumber()).isEqualTo(0);
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void getAllContacts_withSearchOnlyKeepsArrayShape() throws Exception {
        when(contactService.listContactsPage(eq(TRADER_ID), eq(ContactListScope.REGISTRY), any(Pageable.class), eq("ali")))
            .thenReturn(new PageImpl<>(List.of(contact(3L, "Alina"))));

        mockMvc
            .perform(get("/api/contacts?scope=registry&q=ali"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].name").value("Alina"))
            .andExpect(header().doesNotExist("X-Total-Count"));
    }

    private static ContactDTO contact(Long id, String name) {
        ContactDTO dto = new ContactDTO();
        dto.setId(id);
        dto.setName(name);
        dto.setPhone("9876543210");
        return dto;
    }
}
