package com.mercotrace.web.rest;

import com.mercotrace.domain.Contact;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.dto.ContactDTO;
import com.mercotrace.service.mapper.ContactMapper;
import com.mercotrace.repository.ContactRepository;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * Admin-only REST controller for viewing {@link com.mercotrace.domain.Contact} records
 * across all traders.
 *
 * This controller is intentionally read-only and does not apply trader scoping.
 * Access is restricted to admin tokens via {@link AuthoritiesConstants#ADMIN}
 * and the admin security filter chain.
 */
@RestController
@RequestMapping("/api/admin/contacts")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminContactResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminContactResource.class);

    private static final Sort ADMIN_CONTACT_SORT = Sort.by(
        Sort.Order.asc("name").ignoreCase(),
        Sort.Order.asc("mark").ignoreCase(),
        Sort.Order.asc("phone").ignoreCase(),
        Sort.Order.asc("id")
    );

    private final ContactRepository contactRepository;

    private final ContactMapper contactMapper;

    public AdminContactResource(ContactRepository contactRepository, ContactMapper contactMapper) {
        this.contactRepository = contactRepository;
        this.contactMapper = contactMapper;
    }

    /**
     * {@code GET  /api/admin/contacts} : get all contacts across all traders.
     *
     * This endpoint is intentionally not trader-scoped and is meant for
     * supervisory/admin views. It is read-only; mutations should continue to
     * use the tenant-scoped {@link ContactResource}.
     * Pagination/search are opt-in through page/size/q query parameters.
     *
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of contacts in body.
     */
    @GetMapping("")
    public ResponseEntity<List<ContactDTO>> getAllContactsForAdmin(
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        @RequestParam(name = "q", required = false, defaultValue = "") String q
    ) {
        LOG.debug("REST request to get all Contacts (admin, unscoped), page={}, size={}, q={}", page, size, q);
        boolean hasPagination = page != null || size != null;
        boolean hasSearch = q != null && !q.isBlank();

        if (hasPagination) {
            int pageNumber = page == null ? 0 : Math.max(0, page);
            int pageSize = size == null ? 50 : Math.max(1, Math.min(size, 500));
            Pageable pageable = PageRequest.of(pageNumber, pageSize, ADMIN_CONTACT_SORT);
            Page<Contact> contactPage = hasSearch
                ? contactRepository.findAll(contactSearchSpec(q), pageable)
                : contactRepository.findAll(pageable);
            List<ContactDTO> dtoList = contactPage.getContent().stream().map(contactMapper::toDto).collect(Collectors.toList());
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(
                ServletUriComponentsBuilder.fromCurrentRequest(),
                contactPage
            );
            return ResponseEntity.ok().headers(headers).body(dtoList);
        }

        List<Contact> entities = hasSearch ? contactRepository.findAll(contactSearchSpec(q), ADMIN_CONTACT_SORT) : contactRepository.findAll();
        List<ContactDTO> dtoList = entities.stream().map(contactMapper::toDto).collect(Collectors.toList());
        return ResponseEntity.ok().body(dtoList);
    }

    private static Specification<Contact> contactSearchSpec(String rawQuery) {
        String query = rawQuery == null ? "" : rawQuery.trim().toLowerCase(Locale.ROOT);
        return (root, criteriaQuery, criteriaBuilder) -> {
            String like = "%" + query + "%";
            return criteriaBuilder.or(
                criteriaBuilder.like(criteriaBuilder.lower(root.<String>get("name")), like),
                criteriaBuilder.like(criteriaBuilder.lower(root.<String>get("phone")), like),
                criteriaBuilder.like(criteriaBuilder.lower(root.<String>get("mark")), like)
            );
        };
    }
}
