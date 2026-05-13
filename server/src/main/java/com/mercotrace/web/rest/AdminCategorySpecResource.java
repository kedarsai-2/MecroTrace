package com.mercotrace.web.rest;

import com.mercotrace.service.BusinessCategoryQueryService;
import com.mercotrace.service.BusinessCategoryService;
import com.mercotrace.service.criteria.BusinessCategoryCriteria;
import com.mercotrace.service.dto.BusinessCategoryDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Objects;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.PaginationUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * Module 1 spec — admin category paths: GET/POST/PUT/DELETE /api/admin/categories.
 */
@RestController
@RequestMapping("/api/admin/categories")
@PreAuthorize("hasAuthority(\"" + com.mercotrace.security.AuthoritiesConstants.ADMIN + "\")")
public class AdminCategorySpecResource {

    private static final String ENTITY_NAME = "businessCategory";

    private final BusinessCategoryService businessCategoryService;
    private final com.mercotrace.repository.BusinessCategoryRepository businessCategoryRepository;
    private final BusinessCategoryQueryService businessCategoryQueryService;

    public AdminCategorySpecResource(
        BusinessCategoryService businessCategoryService,
        com.mercotrace.repository.BusinessCategoryRepository businessCategoryRepository,
        BusinessCategoryQueryService businessCategoryQueryService
    ) {
        this.businessCategoryService = businessCategoryService;
        this.businessCategoryRepository = businessCategoryRepository;
        this.businessCategoryQueryService = businessCategoryQueryService;
    }

    @GetMapping("")
    public ResponseEntity<List<BusinessCategoryDTO>> list(
        BusinessCategoryCriteria criteria,
        @RequestParam(name = "q", required = false, defaultValue = "") String q,
        Pageable pageable
    ) {
        if (q != null && !q.isBlank()) {
            criteria.categoryName().setContains(q.trim());
        }
        Page<BusinessCategoryDTO> page = businessCategoryQueryService.findByCriteria(criteria, pageable);
        return ResponseEntity.ok()
            .headers(PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page))
            .body(page.getContent());
    }

    @PostMapping("")
    public ResponseEntity<BusinessCategoryDTO> create(@Valid @RequestBody BusinessCategoryDTO dto) throws URISyntaxException {
        if (dto.getId() != null) {
            throw new BadRequestAlertException("A new category cannot already have an ID", ENTITY_NAME, "idexists");
        }
        if (businessCategoryRepository.findOneByCategoryName(dto.getCategoryName()).isPresent()) {
            throw new BadRequestAlertException("A category with this name already exists", ENTITY_NAME, "categorynameexists");
        }
        dto = businessCategoryService.save(dto);
        return ResponseEntity.created(new URI("/api/admin/categories/" + dto.getId()))
            .headers(HeaderUtil.createEntityCreationAlert("mercotrace", true, ENTITY_NAME, dto.getId().toString()))
            .body(dto);
    }

    @PutMapping("/{id}")
    public ResponseEntity<BusinessCategoryDTO> update(
        @PathVariable Long id,
        @Valid @RequestBody BusinessCategoryDTO dto
    ) throws URISyntaxException {
        if (dto.getId() == null || !Objects.equals(id, dto.getId())) {
            throw new BadRequestAlertException("Invalid ID", ENTITY_NAME, "idinvalid");
        }
        if (!businessCategoryRepository.existsById(id)) {
            throw new BadRequestAlertException("Entity not found", ENTITY_NAME, "idnotfound");
        }
        businessCategoryRepository
            .findOneByCategoryName(dto.getCategoryName())
            .filter(c -> !c.getId().equals(id))
            .ifPresent(c -> {
                throw new BadRequestAlertException("A category with this name already exists", ENTITY_NAME, "categorynameexists");
            });
        dto = businessCategoryService.update(dto);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert("mercotrace", true, ENTITY_NAME, dto.getId().toString()))
            .body(dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        businessCategoryService.delete(id);
        return ResponseEntity.noContent()
            .headers(HeaderUtil.createEntityDeletionAlert("mercotrace", true, ENTITY_NAME, id.toString()))
            .build();
    }
}
