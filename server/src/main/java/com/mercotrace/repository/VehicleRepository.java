package com.mercotrace.repository;

import com.mercotrace.domain.Vehicle;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, Long> {

    List<Vehicle> findAllByTraderIdOrderByArrivalDatetimeDesc(Long traderId);

    Page<Vehicle> findAllByTraderIdOrderByArrivalDatetimeDesc(Long traderId, Pageable pageable);

    Page<Vehicle> findAllByTraderIdAndPartiallyCompletedOrderByArrivalDatetimeDesc(Long traderId, Boolean partiallyCompleted, Pageable pageable);
}

