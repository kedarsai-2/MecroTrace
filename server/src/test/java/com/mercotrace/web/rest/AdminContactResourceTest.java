package com.mercotrace.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.Contact;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.service.dto.ContactDTO;
import com.mercotrace.service.mapper.ContactMapper;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@ExtendWith(MockitoExtension.class)
class AdminContactResourceTest {

    @Mock
    private ContactRepository contactRepository;

    @Mock
    private ContactMapper contactMapper;

    private AdminContactResource resource;

    @BeforeEach
    void setUp() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/admin/contacts");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        resource = new AdminContactResource(contactRepository, contactMapper);
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void getAllContactsForAdmin_withoutPaginationKeepsArrayResponse() {
        Contact contact = contact(1L, "Alice");
        ContactDTO dto = contactDto(1L, "Alice");
        when(contactRepository.findAll()).thenReturn(List.of(contact));
        when(contactMapper.toDto(contact)).thenReturn(dto);

        ResponseEntity<List<ContactDTO>> response = resource.getAllContactsForAdmin(null, null, "");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isNull();
        assertThat(response.getBody()).extracting(ContactDTO::getId).containsExactly(1L);

        verify(contactRepository).findAll();
        verify(contactRepository, never()).findAll(any(Pageable.class));
    }

    @Test
    void getAllContactsForAdmin_withPaginationReturnsTotalHeader() {
        Contact contact = contact(2L, "Bob");
        ContactDTO dto = contactDto(2L, "Bob");
        when(contactRepository.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(contact), Pageable.ofSize(1), 2));
        when(contactMapper.toDto(contact)).thenReturn(dto);

        ResponseEntity<List<ContactDTO>> response = resource.getAllContactsForAdmin(0, 1, "");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("2");
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Bob");

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(contactRepository).findAll(pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isZero();
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(1);
    }

    @Test
    void getAllContactsForAdmin_withPaginationAndSearchUsesSpecification() {
        Contact contact = contact(3L, "Alina");
        ContactDTO dto = contactDto(3L, "Alina");
        when(contactRepository.findAll(anySpecification(), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(contact), Pageable.ofSize(20), 1));
        when(contactMapper.toDto(contact)).thenReturn(dto);

        ResponseEntity<List<ContactDTO>> response = resource.getAllContactsForAdmin(0, 20, "ali");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("1");
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Alina");

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(contactRepository).findAll(anySpecification(), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isZero();
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void getAllContactsForAdmin_withSearchOnlyKeepsArrayShape() {
        Contact contact = contact(4L, "Alicia");
        ContactDTO dto = contactDto(4L, "Alicia");
        when(contactRepository.findAll(anySpecification(), any(Sort.class))).thenReturn(List.of(contact));
        when(contactMapper.toDto(contact)).thenReturn(dto);

        ResponseEntity<List<ContactDTO>> response = resource.getAllContactsForAdmin(null, null, "ali");

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isNull();
        assertThat(response.getBody()).extracting(ContactDTO::getName).containsExactly("Alicia");
    }

    @SuppressWarnings("unchecked")
    private static Specification<Contact> anySpecification() {
        return any(Specification.class);
    }

    private static Contact contact(Long id, String name) {
        Contact contact = new Contact();
        contact.setId(id);
        contact.setName(name);
        contact.setPhone("9876543210");
        return contact;
    }

    private static ContactDTO contactDto(Long id, String name) {
        ContactDTO dto = new ContactDTO();
        dto.setId(id);
        dto.setName(name);
        dto.setPhone("9876543210");
        return dto;
    }
}
