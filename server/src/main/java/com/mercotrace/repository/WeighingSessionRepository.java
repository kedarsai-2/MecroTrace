package com.mercotrace.repository;

import com.mercotrace.domain.WeighingSession;
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
 * Spring Data JPA repository for the {@link WeighingSession} entity.
 */
@Repository
public interface WeighingSessionRepository extends JpaRepository<WeighingSession, Long> {

    Optional<WeighingSession> findOneBySessionId(String sessionId);

    Page<WeighingSession> findAllByTraderIdOrderByCreatedDateDesc(Long traderId, Pageable pageable);

    List<WeighingSession> findAllByBidNumber(Integer bidNumber);

    List<WeighingSession> findByLotIdIn(Collection<Long> lotIds);

    @Query("SELECT CASE WHEN COUNT(w) > 0 THEN true ELSE false END FROM WeighingSession w WHERE w.lotId IN :lotIds")
    boolean existsByLotIdIn(@Param("lotIds") Collection<Long> lotIds);

    boolean existsByBidNumber(Integer bidNumber);
}
