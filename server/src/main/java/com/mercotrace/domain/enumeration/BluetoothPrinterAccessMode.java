package com.mercotrace.domain.enumeration;

/**
 * OPEN: any user in the mandi (trader) may use the printer.
 * RESTRICTED: only trader owner, explicitly allowed users, or users with an allowed role may use it.
 */
public enum BluetoothPrinterAccessMode {
    OPEN,
    RESTRICTED,
}
