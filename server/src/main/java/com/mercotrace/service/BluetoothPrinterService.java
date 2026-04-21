package com.mercotrace.service;

import com.mercotrace.service.dto.BluetoothPrinterAccessUpdateRequest;
import com.mercotrace.service.dto.BluetoothPrinterDTO;
import com.mercotrace.service.dto.BluetoothPrinterRegisterRequest;
import java.util.List;

public interface BluetoothPrinterService {

    List<BluetoothPrinterDTO> listForTrader(Long traderId, Long currentUserId, boolean currentUserIsTraderOwner);

    BluetoothPrinterDTO register(Long traderId, Long currentUserId, BluetoothPrinterRegisterRequest request);

    BluetoothPrinterDTO updateAccess(Long traderId, Long printerId, BluetoothPrinterAccessUpdateRequest request);

    void delete(Long traderId, Long printerId);

    /**
     * When the MAC is not registered for the trader, printing is allowed (legacy / local MAC).
     * When registered, OPEN or RESTRICTED rules apply.
     */
    boolean isMacPrintAllowed(Long traderId, Long currentUserId, boolean currentUserIsTraderOwner, String normalizedMac);
}
