package com.mercotrace.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        // Capacitor loads plugins from generated `capacitor.plugins.json`.
        // In some build setups that file may be incomplete, which causes
        // JS `registerPlugin('MercoPrinter')` to fail at runtime.
        // Explicitly registering the plugin ensures the native implementation
        // is always available.
        registerPlugin(MercoPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
