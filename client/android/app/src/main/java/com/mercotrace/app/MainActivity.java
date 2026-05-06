package com.mercotrace.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;

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
        registerPlugin(MercoDigitalInkPlugin.class);
        registerPlugin(MercoSecureStorePlugin.class);
        super.onCreate(savedInstanceState);
        // Reinforce manifest portrait lock (some OEMs / WebView stacks ignore manifest alone).
        applyPortraitOrientationLock();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyPortraitOrientationLock();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyPortraitOrientationLock();
    }

    private void applyPortraitOrientationLock() {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }
}
