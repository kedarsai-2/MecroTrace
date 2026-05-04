package com.mercotrace.repository;

import com.mercotrace.domain.WriterPadSession;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the {@link WriterPadSession} entity.
 */
@Repository
public interface WriterPadSessionRepository extends JpaRepository<WriterPadSession, Long> {

    Optional<WriterPadSession> findFirstByTraderIdAndLotIdAndBidNumberOrderByStartedAtDesc(Long traderId, Long lotId, Integer bidNumber);

    Page<WriterPadSession> findAllByTraderIdOrderByStartedAtDesc(Long traderId, Pageable pageable);

    List<WriterPadSession> findAllByTraderIdAndBidNumber(Long traderId, Integer bidNumber);

    @Query("SELECT CASE WHEN COUNT(w) > 0 THEN true ELSE false END FROM WriterPadSession w WHERE w.lotId IN :lotIds")
    boolean existsByLotIdIn(@Param("lotIds") Collection<Long> lotIds);
}

