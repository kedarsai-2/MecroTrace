package com.mercotrace.repository;

import com.mercotrace.domain.BluetoothPrinter;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BluetoothPrinterRepository extends JpaRepository<BluetoothPrinter, Long> {
    List<BluetoothPrinter> findAllByTraderIdOrderByCreatedAtDesc(Long traderId);

    Optional<BluetoothPrinter> findByIdAndTraderId(Long id, Long traderId);

    boolean existsByTraderIdAndMacAddressIgnoreCase(Long traderId, String macAddress);

    Optional<BluetoothPrinter> findByTraderIdAndMacAddressIgnoreCase(Long traderId, String macAddress);
}
