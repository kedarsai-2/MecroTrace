package com.mercotrace.repository;

import com.mercotrace.domain.DailySerial;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DailySerialRepository extends JpaRepository<DailySerial, Long> {

    Optional<DailySerial> findOneByTraderIdAndSerialDate(Long traderId, LocalDate serialDate);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM DailySerial d WHERE d.traderId = :traderId AND d.serialDate = :serialDate")
    Optional<DailySerial> findOneByTraderIdAndSerialDateForUpdate(
        @Param("traderId") Long traderId,
        @Param("serialDate") LocalDate serialDate
    );
}

