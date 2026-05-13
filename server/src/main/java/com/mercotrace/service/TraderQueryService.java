package com.mercotrace.service;

import com.mercotrace.domain.*; // for static metamodels
import com.mercotrace.domain.Trader;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.service.criteria.TraderCriteria;
import com.mercotrace.service.dto.TraderDTO;
import com.mercotrace.service.mapper.TraderMapper;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.service.QueryService;

/**
 * Service for executing complex queries for {@link Trader} entities in the database.
 * The main input is a {@link TraderCriteria} which gets converted to {@link Specification},
 * in a way that all the filters must apply.
 * It returns a {@link Page} of {@link TraderDTO} which fulfills the criteria.
 */
@Service
@Transactional(readOnly = true)
public class TraderQueryService extends QueryService<Trader> {

    private static final Logger LOG = LoggerFactory.getLogger(TraderQueryService.class);

    private final TraderRepository traderRepository;

    private final TraderMapper traderMapper;

    public TraderQueryService(TraderRepository traderRepository, TraderMapper traderMapper) {
        this.traderRepository = traderRepository;
        this.traderMapper = traderMapper;
    }

    /**
     * Return a {@link Page} of {@link TraderDTO} which matches the criteria from the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @param page The page, which should be returned.
     * @return the matching entities.
     */
    @Transactional(readOnly = true)
    public Page<TraderDTO> findByCriteria(TraderCriteria criteria, Pageable page) {
        LOG.debug("find by criteria : {}, page: {}", criteria, page);
        final Specification<Trader> specification = createSpecification(criteria);
        return traderRepository.findAll(specification, page).map(traderMapper::toDto);
    }

    /**
     * Return a {@link Page} of {@link TraderDTO} matching criteria plus a broad admin search term.
     */
    @Transactional(readOnly = true)
    public Page<TraderDTO> findByCriteria(TraderCriteria criteria, Pageable page, String search) {
        LOG.debug("find by criteria : {}, page: {}, search: {}", criteria, page, search);
        Specification<Trader> specification = createSpecification(criteria);
        if (search != null && !search.isBlank()) {
            specification = specification.and(adminSearchSpecification(search));
        }
        return traderRepository.findAll(specification, page).map(traderMapper::toDto);
    }

    /**
     * Return the number of matching entities in the database.
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the number of matching entities.
     */
    @Transactional(readOnly = true)
    public long countByCriteria(TraderCriteria criteria) {
        LOG.debug("count by criteria : {}", criteria);
        final Specification<Trader> specification = createSpecification(criteria);
        return traderRepository.count(specification);
    }

    /**
     * Function to convert {@link TraderCriteria} to a {@link Specification}
     * @param criteria The object which holds all the filters, which the entities should match.
     * @return the matching {@link Specification} of the entity.
     */
    protected Specification<Trader> createSpecification(TraderCriteria criteria) {
        Specification<Trader> specification = Specification.where(null);
        if (criteria != null) {
            // This has to be called first, because the distinct method returns null
            specification = Specification.allOf(
                Boolean.TRUE.equals(criteria.getDistinct()) ? distinct(criteria.getDistinct()) : null,
                buildRangeSpecification(criteria.getId(), Trader_.id),
                buildStringSpecification(criteria.getBusinessName(), Trader_.businessName),
                buildStringSpecification(criteria.getOwnerName(), Trader_.ownerName),
                buildStringSpecification(criteria.getCategory(), Trader_.category),
                buildSpecification(criteria.getApprovalStatus(), Trader_.approvalStatus),
                buildSpecification(criteria.getBusinessMode(), Trader_.businessMode),
                buildStringSpecification(criteria.getBillPrefix(), Trader_.billPrefix),
                buildRangeSpecification(criteria.getCreatedAt(), Trader_.createdAt),
                buildRangeSpecification(criteria.getUpdatedAt(), Trader_.updatedAt),
                buildSpecification(criteria.getActive(), Trader_.active)
            );
        }
        return specification;
    }

    private static Specification<Trader> adminSearchSpecification(String rawSearch) {
        String search = rawSearch.trim().toLowerCase(Locale.ROOT);
        return (root, query, builder) -> {
            String like = "%" + search + "%";
            return builder.or(
                builder.like(builder.lower(root.<String>get("businessName")), like),
                builder.like(builder.lower(root.<String>get("ownerName")), like),
                builder.like(builder.lower(root.<String>get("city")), like),
                builder.like(builder.lower(root.<String>get("state")), like),
                builder.like(builder.lower(root.<String>get("mobile")), like),
                builder.like(builder.lower(root.<String>get("email")), like),
                builder.like(builder.lower(root.<String>get("category")), like)
            );
        };
    }
}
