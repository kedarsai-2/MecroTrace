package com.mercotrace.repository;

import com.mercotrace.domain.UserTrader;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface UserTraderRepository extends JpaRepository<UserTrader, Long> {

    Optional<UserTrader> findFirstByUserIdAndPrimaryMappingTrue(Long userId);

    Optional<UserTrader> findFirstByTraderIdAndPrimaryMappingTrue(Long traderId);

    List<UserTrader> findAllByRoleInTraderAndPrimaryMappingTrue(String roleInTrader);

    List<UserTrader> findAllByTraderIdAndPrimaryMappingTrue(Long traderId);

    /**
     * Fetch primary user-trader mappings for a trader along with the associated {@link com.mercotrace.domain.User}
     * to avoid LazyInitializationException when accessing the user outside of a transactional context.
     */
    @Query(
        "select ut from UserTrader ut " +
        "join fetch ut.user u " +
        "where ut.trader.id = :traderId and ut.primaryMapping = true"
    )
    List<UserTrader> findAllWithUserByTraderIdAndPrimaryMappingTrue(@Param("traderId") Long traderId);

    /**
     * Same as above but only active (non soft-deleted) mappings. Use for listing staff users.
     */
    @Query(
        "select ut from UserTrader ut " +
        "join fetch ut.user u " +
        "where ut.trader.id = :traderId and ut.primaryMapping = true and ut.active = true"
    )
    List<UserTrader> findAllWithUserByTraderIdAndPrimaryMappingTrueAndActiveTrue(@Param("traderId") Long traderId);

    Optional<UserTrader> findFirstByUserIdAndTraderIdAndPrimaryMappingTrue(Long userId, Long traderId);

    Optional<UserTrader> findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(Long userId);

    Optional<UserTrader> findFirstByUserIdAndTraderIdAndPrimaryMappingTrueAndActiveTrue(Long userId, Long traderId);

    Optional<UserTrader> findFirstByUserIdAndTraderIdAndActiveTrue(Long userId, Long traderId);

    @EntityGraph(attributePaths = "trader")
    List<UserTrader> findAllByUserIdAndActiveTrue(Long userId);

    boolean existsByUserIdAndActiveTrue(Long userId);

    @Modifying(clearAutomatically = true)
    @Query("update UserTrader ut set ut.primaryMapping = false where ut.user.id = :userId")
    int clearPrimaryMappingsForUser(@Param("userId") Long userId);
}

