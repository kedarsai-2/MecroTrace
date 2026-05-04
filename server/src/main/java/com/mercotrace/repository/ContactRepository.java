package com.mercotrace.repository;

import com.mercotrace.domain.Contact;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for the Contact entity.
 */
@SuppressWarnings("unused")
@Repository
public interface ContactRepository extends JpaRepository<Contact, Long>, JpaSpecificationExecutor<Contact> {

    Optional<Contact> findOneByTraderIdAndId(Long traderId, Long id);

    Optional<Contact> findOneByTraderIdAndPhone(Long traderId, String phone);

    List<Contact> findAllByTraderIdAndActiveTrue(Long traderId);

    /** Self-registered / portal contacts not owned by a trader (participant pool). */
    List<Contact> findAllByTraderIdIsNullAndActiveTrue();

    List<Contact> findAllByTraderIdAndMarkContainingIgnoreCaseAndActiveTrue(Long traderId, String mark);

    List<Contact> findAllByTraderIdAndNameContainingIgnoreCaseAndActiveTrue(Long traderId, String name);

    @Query(
        "select c from Contact c " +
        "where c.traderId = :traderId and c.active = true and " +
        "(:needle = '' or lower(coalesce(c.mark, '')) like concat('%', :needle, '%') or " +
        "lower(coalesce(c.name, '')) like concat('%', :needle, '%') or " +
        "coalesce(c.phone, '') like concat('%', :needle, '%')) " +
        "order by " +
        "case when lower(coalesce(c.mark, '')) = :needle then 0 " +
        "when lower(coalesce(c.mark, '')) like concat(:needle, '%') then 1 " +
        "when lower(coalesce(c.name, '')) like concat(:needle, '%') then 2 " +
        "else 3 end, lower(coalesce(c.mark, '')), lower(coalesce(c.name, '')), c.id"
    )
    List<Contact> searchActiveTraderContacts(
        @Param("traderId") Long traderId,
        @Param("needle") String needle,
        Pageable pageable
    );

    @Query(
        "select c from Contact c " +
        "where c.traderId is null and c.active = true and " +
        "(:needle = '' or lower(coalesce(c.mark, '')) like concat('%', :needle, '%') or " +
        "lower(coalesce(c.name, '')) like concat('%', :needle, '%') or " +
        "coalesce(c.phone, '') like concat('%', :needle, '%')) " +
        "order by " +
        "case when lower(coalesce(c.mark, '')) = :needle then 0 " +
        "when lower(coalesce(c.mark, '')) like concat(:needle, '%') then 1 " +
        "when lower(coalesce(c.name, '')) like concat(:needle, '%') then 2 " +
        "else 3 end, lower(coalesce(c.mark, '')), lower(coalesce(c.name, '')), c.id"
    )
    List<Contact> searchActivePortalParticipants(@Param("needle") String needle, Pageable pageable);

    Optional<Contact> findOneByPhone(String phone);

    /** Same as findOneByPhone but only active contacts (so soft-deleted contacts don't block new registration). */
    Optional<Contact> findOneByPhoneAndActiveTrue(String phone);

    Optional<Contact> findOneByEmailIgnoreCase(String email);

    /** Find self-registered contact by mark (trader_id IS NULL). Used for uniqueness check during registration. */
    Optional<Contact> findOneByMarkAndTraderIdIsNull(String mark);

    /** Find contact by trader and mark (case-insensitive). Used for mark uniqueness check when creating trader contacts. */
    Optional<Contact> findOneByTraderIdAndMarkIgnoreCase(Long traderId, String mark);

    /** Find contact by trader and mark excluding given id. Used for mark uniqueness check when updating trader contacts. */
    Optional<Contact> findOneByTraderIdAndMarkIgnoreCaseAndIdNot(Long traderId, String mark, Long id);
}
