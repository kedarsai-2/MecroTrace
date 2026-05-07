package com.mercotrace.repository;

import com.mercotrace.domain.PrintLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link PrintLog} entity.
 */
@Repository
public interface PrintLogRepository extends JpaRepository<PrintLog, Long> {

    Page<PrintLog> findAllByTraderIdOrderByPrintedAtDesc(Long traderId, Pageable pageable);
}
