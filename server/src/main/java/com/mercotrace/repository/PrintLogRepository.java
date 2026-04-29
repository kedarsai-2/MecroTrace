package com.mercotrace.repository;

import com.mercotrace.domain.PrintLog;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link PrintLog} entity.
 */
@Repository
public interface PrintLogRepository extends JpaRepository<PrintLog, Long> {

    Page<PrintLog> findAllByTraderIdOrderByPrintedAtDesc(Long traderId, Pageable pageable);

    @Query("select distinct p.referenceId from PrintLog p where p.traderId = :traderId and p.referenceType = :refType and p.referenceId is not null")
    List<String> findDistinctReferenceIdsByTraderIdAndReferenceType(
        @Param("traderId") Long traderId,
        @Param("refType") String referenceType
    );

    /** Used when auction bid buyer changes — Print Hub completion is per line id, must reset for new buyer chitti. */
    void deleteByTraderIdAndReferenceTypeAndReferenceId(Long traderId, String referenceType, String referenceId);
}
