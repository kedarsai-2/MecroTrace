package com.mercotrace.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.dantsu.escposprinter.EscPosPrinter;
import com.dantsu.escposprinter.EscPosPrinterCommands;
import com.dantsu.escposprinter.connection.bluetooth.BluetoothConnection;

import java.lang.reflect.Field;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "MercoPrinter")
public class MercoPrinterPlugin extends Plugin {

    /** Feed after slip content (manual tear / before cut), ~2 cm on 203 dpi roll printers. */
    private static final float THERMAL_SLIP_FEED_MM = 20f;
    private static final int THERMAL_CHARS_PER_LINE = 48;

    private static final int BLUETOOTH_PERMS_REQUEST_CODE = 5020;
    private PluginCall pendingBluetoothPermissionsCall;

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        // Only needed on Android 12+ where BLUETOOTH_* runtime permissions exist.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        Activity activity = getActivity();
        Context context = getContext();
        if (activity == null || context == null) {
            call.reject("Activity/context not available");
            return;
        }

        String[] perms = new String[] {
            android.Manifest.permission.BLUETOOTH_CONNECT,
            android.Manifest.permission.BLUETOOTH_SCAN
        };

        boolean allGranted = true;
        for (String p : perms) {
            if (context.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }

        if (allGranted) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        // Save call for callback
        pendingBluetoothPermissionsCall = call;
        activity.requestPermissions(perms, BLUETOOTH_PERMS_REQUEST_CODE);
    }

    @Override
    public void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != BLUETOOTH_PERMS_REQUEST_CODE) {
            super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
            return;
        }

        if (pendingBluetoothPermissionsCall == null) {
            return;
        }

        boolean granted = true;
        for (int r : grantResults) {
            if (r != PackageManager.PERMISSION_GRANTED) {
                granted = false;
                break;
            }
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        pendingBluetoothPermissionsCall.resolve(ret);
        pendingBluetoothPermissionsCall = null;
    }

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String mode = call.getString("mode", "auto"); // "system" | "thermal" | "auto"
        String deviceMac = call.getString("deviceMac", null);
        String thermalText = call.getString("thermalText", null);

        if ((html == null || html.isEmpty()) && (thermalText == null || thermalText.isEmpty())) {
            call.reject("html or thermalText is required");
            return;
        }

        if ("system".equalsIgnoreCase(mode)) {
            // System printing always needs HTML to render via WebView.
            if (html == null || html.isEmpty()) {
                call.reject("html is required for system printing");
                return;
            }
            printSystem(html, call);
            return;
        }

        if ("thermal".equalsIgnoreCase(mode)) {
            boolean ok = tryThermalByMac(html, deviceMac, thermalText);
            if (ok) {
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("printedMode", "thermal");
                call.resolve(ret);
            } else {
                call.reject("Thermal printing failed or MAC not found");
            }
            return;
        }

        // auto: try thermal with bound MAC (if present). If it fails, always fall back to system.
        boolean thermalOk = tryThermalByMac(html, deviceMac, thermalText);
        if (thermalOk) {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("printedMode", "thermal");
            call.resolve(ret);
        } else {
            if (html == null || html.isEmpty()) {
                call.reject("html is required for system fallback");
                return;
            }
            printSystem(html, call);
        }
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("Bluetooth adapter not available");
                return;
            }

            // This is the "paired devices" list from Android.
            BluetoothDevice[] bonded = null;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // On Android 12+, access to Bluetooth devices requires runtime permission.
                    // We rely on requestBluetoothPermissions() to have been called from UI.
                    bonded = new BluetoothDevice[0];
                }
                bonded = adapter.getBondedDevices() != null
                    ? adapter.getBondedDevices().toArray(new BluetoothDevice[0])
                    : new BluetoothDevice[0];
            } catch (SecurityException se) {
                call.reject("Bluetooth permission required to list paired printers");
                return;
            }

            List<JSObject> printerList = new ArrayList<>();
            if (bonded != null) {
                for (BluetoothDevice d : bonded) {
                    if (d == null) continue;
                    JSObject item = new JSObject();
                    String mac = d.getAddress();
                    String name = d.getName();
                    item.put("mac", mac);
                    item.put("name", name != null ? name : mac);
                    printerList.add(item);
                }
            }

            JSObject ret = new JSObject();
            ret.put("printers", printerList);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to list paired Bluetooth devices: " + e.getMessage(), e);
        }
    }

    private void printSystem(String html, PluginCall call) {
        Activity activity = getActivity();
        Context context = getContext();

        if (activity == null || context == null) {
            call.reject("No activity/context for system printing");
            return;
        }

        final PrintManager printManager =
            (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            call.reject("Print service not available");
            return;
        }

        // WebView used for printing must be rendered/attached in the view hierarchy.
        // Also, WebView creation/loading should run on the Android UI thread.
        activity.runOnUiThread(() -> {
            final ViewGroup root = activity.findViewById(android.R.id.content);
            if (root == null) {
                call.reject("Root view not available for printing");
                return;
            }

            final FrameLayout container = new FrameLayout(activity);
            container.setAlpha(0f);
            container.setX(-10000f);
            container.setY(-10000f);

            final FrameLayout.LayoutParams containerLp = new FrameLayout.LayoutParams(800, 600);
            root.addView(container, containerLp);

            final WebView webView = new WebView(activity);
            webView.getSettings().setJavaScriptEnabled(true);
            webView.setBackgroundColor(0x00000000);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                        private final PrintDocumentAdapter innerAdapter =
                            webView.createPrintDocumentAdapter("MercotraceDocument");

                        @Override
                        public void onLayout(
                            PrintAttributes oldAttributes,
                            PrintAttributes newAttributes,
                            CancellationSignal cancellationSignal,
                            LayoutResultCallback callback,
                            android.os.Bundle extras
                        ) {
                            innerAdapter.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
                        }

                        @Override
                        public void onWrite(
                            PageRange[] pages,
                            android.os.ParcelFileDescriptor destination,
                            CancellationSignal cancellationSignal,
                            WriteResultCallback callback
                        ) {
                            innerAdapter.onWrite(pages, destination, cancellationSignal, callback);
                        }

                        @Override
                        public void onFinish() {
                            super.onFinish();
                            try {
                                webView.destroy();
                            } catch (Exception ignored) {}
                            try {
                                root.removeView(container);
                            } catch (Exception ignored) {}
                        }
                    };

                    PrintAttributes attributes = new PrintAttributes.Builder()
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .build();

                    // Triggers Android system print picker (select printer / Save as PDF).
                    printManager.print("MercotraceJob", adapter, attributes);

                    try {
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("printedMode", "system");
                        call.resolve(ret);
                    } catch (Exception ignored) {}

                    // Safety cleanup if onFinish never fires.
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        try {
                            webView.destroy();
                        } catch (Exception ignored) {}
                        try {
                            root.removeView(container);
                        } catch (Exception ignored) {}
                    }, 8000);
                }

                @Override
                public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
                    try {
                        call.reject("System print HTML load failed");
                    } catch (Exception ignored) {}
                    try {
                        root.removeView(container);
                    } catch (Exception ignored) {}
                    try {
                        webView.destroy();
                    } catch (Exception ignored) {}
                }
            });

            container.addView(webView, new FrameLayout.LayoutParams(800, 600));
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    private static String thermalCutIndicatorLine() {
        char[] dash = new char[THERMAL_CHARS_PER_LINE];
        java.util.Arrays.fill(dash, '-');
        return "\n[L]" + new String(dash);
    }

    /**
     * After formatted print, attempt ESC/POS full cut. Printers without a cutter typically ignore or no-op;
     * failures are swallowed so the slip (already includes cut line + feed) still completes.
     */
    private static void tryHardwareCut(EscPosPrinter escPosPrinter) {
        if (escPosPrinter == null) return;
        try {
            Field f = EscPosPrinter.class.getDeclaredField("printer");
            f.setAccessible(true);
            Object raw = f.get(escPosPrinter);
            if (raw instanceof EscPosPrinterCommands) {
                ((EscPosPrinterCommands) raw).cutPaper();
            }
        } catch (Exception ignored) {
            // Reflection or cut unsupported: tear line + feed already printed
        }
    }

    private boolean tryThermalByMac(String html, String deviceMac, String thermalText) {
        if (deviceMac == null || deviceMac.trim().isEmpty()) {
            return false;
        }

        EscPosPrinter printer = null;
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) return false;

            BluetoothDevice matchedDevice = null;
            if (adapter.getBondedDevices() != null) {
                for (BluetoothDevice d : adapter.getBondedDevices()) {
                    if (d == null) continue;
                    String mac = d.getAddress();
                    if (mac != null && mac.equalsIgnoreCase(deviceMac.trim())) {
                        matchedDevice = d;
                        break;
                    }
                }
            }

            if (matchedDevice == null) return false;

            // Create connection directly from the Bluetooth device.
            // Use reflection to avoid compile-time dependency on a specific constructor signature.
            BluetoothConnection matched = null;
            try {
                matched = BluetoothConnection.class
                    .getConstructor(BluetoothDevice.class)
                    .newInstance(matchedDevice);
            } catch (Exception ignored) {
                matched = null;
            }

            if (matched == null) return false;

            // 80mm thermal paper width (per your requirement).
            // 203 DPI + 80mm => typically ~48 chars per line.
            printer = new EscPosPrinter(matched, 203, 80f, THERMAL_CHARS_PER_LINE);

            String text;
            if (thermalText != null && !thermalText.trim().isEmpty()) {
                // Send ESC/POS formatted text directly. This avoids any HTML/CSS parsing.
                text = thermalText;
            } else {
                text = htmlToPlainText(html);
            }

            if (text.isEmpty()) {
                text = "Mercotrace\nPrint job\n";
            }

            // Always append visible tear line + ~2 cm feed; then best-effort hardware cut (no settings).
            String body = text + thermalCutIndicatorLine();
            printer.printFormattedText(body, THERMAL_SLIP_FEED_MM);
            tryHardwareCut(printer);

            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (printer != null) {
                try {
                    printer.disconnectPrinter();
                } catch (Exception ignored) {}
            }
        }
    }

    private String htmlToPlainText(String html) {
        if (html == null) return "";
        // Thermal printers can't render HTML/CSS. Convert the provided HTML into
        // a readable plain-text representation that preserves the "receipt" content
        // and ignores CSS (otherwise we print class/style definitions).
        String text = html;

        // Templates in this project keep all CSS inside <head>.
        // Remove the whole <head> section first, so even if <style> tags are
        // malformed/stripped on the way in, CSS won't be printed on thermal.
        text = text.replaceAll("(?is)<head[^>]*>.*?</head>", " ");

        // Replace CSS-only separators with visible ASCII lines.
        // (On ESC/POS thermal, CSS borders/dashed lines won't render.)
        text = text.replaceAll("(?is)<div[^>]*class\\s*=\\s*\"[^\"]*cut-line[^\"]*\"[^>]*>\\s*</div>", "\n--------------------------------\n");
        text = text.replaceAll("(?is)<div[^>]*class\\s*=\\s*\"[^\"]*totals[^\"]*\"[^>]*>", "\n================ Totals ================\n");
        text = text.replaceAll("(?is)<div[^>]*class\\s*=\\s*\"[^\"]*sticker[^\"]*\"[^>]*>", "\n================== STICKER ==================\n");

        // Remove style/script/comments entirely (so we don't print CSS selectors/classes).
        text = text.replaceAll("(?is)<style[^>]*>.*?</style>", " ");
        text = text.replaceAll("(?is)<script[^>]*>.*?</script>", " ");
        text = text.replaceAll("(?is)<!--.*?-->", " ");

        // Extra hardening: sometimes CSS tags/sections can get partially stripped
        // before reaching this converter. Remove common CSS blocks even when
        // they are left as plain text.
        text = text.replaceAll("(?is)@page\\s*\\{.*?\\}", " ");
        text = text.replaceAll("(?is)@media\\s*[^\\{]*\\{.*?\\}", " ");
        // Remove basic "selector { ... }" rules (non-nested).
        text = text.replaceAll("(?is)[\\w@.#\\-\\s]+\\s*\\{[^\\}]*\\}", " ");

        // Basic formatting hints.
        text = text
            .replaceAll("(?i)<br\\s*/?>", "\n")
            .replaceAll("(?i)</p>", "\n\n")
            // Table rows are the natural line boundaries for chiti/stik.
            .replaceAll("(?i)</tr>", "\n")
            // Divs act like block sections.
            .replaceAll("(?i)</div>", "\n")
            // Separate cells a bit.
            .replaceAll("(?i)</td>", "  ")
            .replaceAll("(?i)</th>", "  ")
            // Many templates use span inside divs for label/value pairs.
            .replaceAll("(?i)</span>", "  ");

        // Strip all remaining tags.
        text = text.replaceAll("(?s)<[^>]*>", "");

        // Decode a few common HTML entities used in our templates.
        text = text
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");

        // Normalize whitespace while keeping newlines.
        // Preserve multiple spaces we intentionally add for thermal readability.
        // Only normalize tabs/other whitespace, not normal spaces.
        text = text.replaceAll("[\\t\\x0B\\f\\r]+", " ");
        text = text.replaceAll(" *\\n *", "\n");
        text = text.replaceAll("\\n{3,}", "\n\n");

        // Basic centering for the known receipt header.
        // (ESC/POS thermal can't render CSS, so we align text by padding.)
        final int charsPerLine = THERMAL_CHARS_PER_LINE; // matches new EscPosPrinter(..., 48)
        String[] lines = text.trim().split("\\n");
        for (int i = 0; i < lines.length; i++) {
            String t = lines[i].trim();
            if (t.equalsIgnoreCase("mercotrace") || t.equalsIgnoreCase("mercotrace".toUpperCase())) {
                lines[i] = centerToWidth(t.toUpperCase(), charsPerLine);
            }
        }
        return String.join("\n", lines).trim();
    }

    private String centerToWidth(String s, int width) {
        if (s == null) return "";
        if (width <= 0) return s;
        if (s.length() >= width) return s;
        int padding = width - s.length();
        int left = padding / 2;
        int right = padding - left;
        StringBuilder sb = new StringBuilder(width);
        for (int i = 0; i < left; i++) sb.append(' ');
        sb.append(s);
        for (int i = 0; i < right; i++) sb.append(' ');
        return sb.toString();
    }
}

