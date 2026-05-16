package com.mercotrace.repository;

import com.mercotrace.domain.MultiTraderAccountRequest;
import com.mercotrace.domain.enumeration.MultiTraderAccountRequestStatus;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface MultiTraderAccountRequestRepository extends JpaRepository<MultiTraderAccountRequest, Long> {
    boolean existsByRequesterUserIdAndStatus(Long requesterUserId, MultiTraderAccountRequestStatus status);

    long countByRequesterUserIdAndStatus(Long requesterUserId, MultiTraderAccountRequestStatus status);

    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    List<MultiTraderAccountRequest> findAllByRequesterUserIdOrderByRequestedAtDesc(Long requesterUserId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    @Query("select r from MultiTraderAccountRequest r where r.id = :id")
    Optional<MultiTraderAccountRequest> findLockedById(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    @Query(
        """
            select r from MultiTraderAccountRequest r
            where r.requestGroupId = :requestGroupId
            order by r.requestGroupIndex asc, r.id asc
        """
    )
    List<MultiTraderAccountRequest> findLockedByRequestGroupId(@Param("requestGroupId") String requestGroupId);

    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    Page<MultiTraderAccountRequest> findAll(Pageable pageable);

    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    Page<MultiTraderAccountRequest> findAllByStatus(MultiTraderAccountRequestStatus status, Pageable pageable);

    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    @Query(
        """
            select r from MultiTraderAccountRequest r
            join r.requesterUser u
            join r.requesterTrader t
            where lower(r.businessName) like :pattern
               or lower(r.ownerName) like :pattern
               or lower(coalesce(r.city, '')) like :pattern
               or lower(coalesce(r.state, '')) like :pattern
               or lower(coalesce(r.email, '')) like :pattern
               or lower(coalesce(r.mobile, '')) like :pattern
               or lower(coalesce(u.login, '')) like :pattern
               or lower(coalesce(t.businessName, '')) like :pattern
        """
    )
    Page<MultiTraderAccountRequest> searchAdmin(@Param("pattern") String pattern, Pageable pageable);

    @EntityGraph(attributePaths = { "requesterUser", "requesterTrader", "createdTrader", "decidedByAdminUser" })
    @Query(
        """
            select r from MultiTraderAccountRequest r
            join r.requesterUser u
            join r.requesterTrader t
            where r.status = :status
              and (
                lower(r.businessName) like :pattern
                or lower(r.ownerName) like :pattern
                or lower(coalesce(r.city, '')) like :pattern
                or lower(coalesce(r.state, '')) like :pattern
                or lower(coalesce(r.email, '')) like :pattern
                or lower(coalesce(r.mobile, '')) like :pattern
                or lower(coalesce(u.login, '')) like :pattern
                or lower(coalesce(t.businessName, '')) like :pattern
              )
        """
    )
    Page<MultiTraderAccountRequest> searchAdminByStatus(
        @Param("status") MultiTraderAccountRequestStatus status,
        @Param("pattern") String pattern,
        Pageable pageable
    );
}
