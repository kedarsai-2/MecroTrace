package com.mercotrace.web.rest;

import com.mercotrace.domain.Commodity;
import com.mercotrace.repository.CommodityRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.dto.CommodityDTO;
import com.mercotrace.service.mapper.CommodityMapper;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
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
 * Admin-only view of all commodities across traders.
 */
@RestController
@RequestMapping("/api/admin/commodities")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminCommodityResource {

    private static final Sort ADMIN_COMMODITY_SORT = Sort.by(
        Sort.Order.asc("commodityName").ignoreCase(),
        Sort.Order.asc("id")
    );

    private final CommodityRepository commodityRepository;

    private final CommodityMapper commodityMapper;

    public AdminCommodityResource(CommodityRepository commodityRepository, CommodityMapper commodityMapper) {
        this.commodityRepository = commodityRepository;
        this.commodityMapper = commodityMapper;
    }

    /**
     * {@code GET /api/admin/commodities} : list all commodities for admin overview.
     * Pagination/search are opt-in through page/size/q query parameters.
     *
     * @return the {@link ResponseEntity} with status {@code 200 (OK)} and the list of commodities in body.
     */
    @GetMapping("")
    public ResponseEntity<List<CommodityDTO>> listAllForAdmin(
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        @RequestParam(name = "q", required = false, defaultValue = "") String q
    ) {
        boolean hasPagination = page != null || size != null;
        boolean hasSearch = q != null && !q.isBlank();

        if (hasPagination) {
            int pageNumber = page == null ? 0 : Math.max(0, page);
            int pageSize = size == null ? 50 : Math.max(1, Math.min(size, 500));
            Pageable pageable = PageRequest.of(pageNumber, pageSize, ADMIN_COMMODITY_SORT);
            Page<Commodity> commodityPage = hasSearch
                ? commodityRepository.findAll(commoditySearchSpec(q), pageable)
                : commodityRepository.findAll(pageable);
            List<CommodityDTO> dtoList = commodityPage.getContent().stream().map(commodityMapper::toDto).collect(Collectors.toList());
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(
                ServletUriComponentsBuilder.fromCurrentRequest(),
                commodityPage
            );
            return ResponseEntity.ok().headers(headers).body(dtoList);
        }

        List<Commodity> entities = hasSearch
            ? commodityRepository.findAll(commoditySearchSpec(q), ADMIN_COMMODITY_SORT)
            : commodityRepository.findAll(ADMIN_COMMODITY_SORT);
        List<CommodityDTO> list = entities.stream().map(commodityMapper::toDto).collect(Collectors.toList());
        return ResponseEntity.ok().body(list);
    }

    private static Specification<Commodity> commoditySearchSpec(String rawQuery) {
        String query = rawQuery == null ? "" : rawQuery.trim().toLowerCase(Locale.ROOT);
        return (root, criteriaQuery, criteriaBuilder) ->
            criteriaBuilder.like(criteriaBuilder.lower(root.<String>get("commodityName")), "%" + query + "%");
    }
}
