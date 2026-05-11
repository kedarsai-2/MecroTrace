package com.mercotrace.repository;

import com.mercotrace.domain.Contact;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;
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

    List<Contact> findAllByTraderIdAndMarkContainingIgnoreCaseAndActiveTrue(Long traderId, String mark);

    List<Contact> findAllByTraderIdAndNameContainingIgnoreCaseAndActiveTrue(Long traderId, String name);

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
