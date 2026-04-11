package com.mercotrace.repository;

import com.mercotrace.domain.Patti;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link Patti} entity.
 */
@Repository
public interface PattiRepository extends JpaRepository<Patti, Long> {

    Optional<Patti> findByPattiId(String pattiId);

    Page<Patti> findAllByTraderIdOrderByCreatedDateDesc(Long traderId, Pageable pageable);

    Page<Patti> findAllByTraderIdAndInProgressFalseOrderByCreatedDateDesc(Long traderId, Pageable pageable);

    Page<Patti> findAllByTraderIdAndInProgressTrueOrderByCreatedDateDesc(Long traderId, Pageable pageable);

    boolean existsByPattiId(String pattiId);

    /** For REQ-PUT-008: next patti counter for date prefix (e.g. PT-20250302-). */
    Optional<Patti> findTopByPattiIdStartingWithOrderByIdDesc(String prefix);
}
