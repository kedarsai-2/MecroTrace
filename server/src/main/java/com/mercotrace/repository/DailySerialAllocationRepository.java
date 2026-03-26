package com.mercotrace.repository;

import com.mercotrace.domain.DailySerialAllocation;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DailySerialAllocationRepository extends JpaRepository<DailySerialAllocation, Long> {

    List<DailySerialAllocation> findAllByTraderIdAndSerialDateAndKeyType(
        Long traderId,
        LocalDate serialDate,
        String keyType
    );

    Optional<DailySerialAllocation> findOneByTraderIdAndSerialDateAndKeyTypeAndKeyValue(
        Long traderId,
        LocalDate serialDate,
        String keyType,
        String keyValue
    );

    @Query(
        "SELECT MAX(d.serialNumber) FROM DailySerialAllocation d WHERE d.traderId = :traderId AND d.serialDate = :serialDate AND d.keyType = :keyType"
    )
    Optional<Integer> findMaxSerialNumberByTraderIdAndSerialDateAndKeyType(
        @Param("traderId") Long traderId,
        @Param("serialDate") LocalDate serialDate,
        @Param("keyType") String keyType
    );
}
