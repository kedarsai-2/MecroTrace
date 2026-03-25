import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Bluetooth, ArrowLeft, RefreshCw, Play, Save } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BottomNav from '@/components/BottomNav';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { useDesktopMode } from '@/hooks/use-desktop';
import { directPrint } from '@/utils/printTemplates';

type MercoPrinterPlugin = {
  listPrinters(): Promise<{ printers: { mac: string; name: string }[] }>;
  requestBluetoothPermissions(): Promise<{ granted: boolean }>;
};

const mercoPrinter = registerPlugin<MercoPrinterPlugin>('MercoPrinter');

const BOUND_PRINTER_MAC_KEY = 'merco.boundBluetoothPrinterMac';
const MAC_REGEX = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const BluetoothPrinterSettingsPage = () => {
  const navigate = useNavigate();
  const { canAccessModule, can } = usePermissions();
  const isDesktop = useDesktopMode();

  const canViewSettings = canAccessModule('Settings');
  const canManageSettings = can('Settings', 'Manage Roles') || can('Settings', 'Manage Users') || can('Settings', 'View');

  const [loading, setLoading] = useState(false);
  const [printers, setPrinters] = useState<{ mac: string; name: string }[]>([]);
  // `null` = not checked yet, `false` = explicitly denied, `true` = granted
  const [bluetoothPermissionGranted, setBluetoothPermissionGranted] = useState<boolean | null>(null);

  const [boundMac, setBoundMac] = useState<string>(() => {
    try {
      return normalizeMac(window.localStorage.getItem(BOUND_PRINTER_MAC_KEY) ?? '');
    } catch {
      return '';
    }
  });
  const [manualMac, setManualMac] = useState<string>(boundMac);

  useEffect(() => {
    setManualMac(boundMac);
  }, [boundMac]);

  const loadPrinters = async () => {
    if (!Capacitor.isNativePlatform()) {
      setPrinters([]);
      return;
    }
    try {
      setLoading(true);
      setBluetoothPermissionGranted(null);
      // On Android 12+, Bluetooth requires runtime permission. Request it first.
      const perm = await mercoPrinter.requestBluetoothPermissions();
      const granted = !!perm?.granted;
      setBluetoothPermissionGranted(granted);
      if (!granted) {
        toast.error('Bluetooth permission not granted. Please allow permissions and try again.');
        setPrinters([]);
        return;
      }
      const res = await mercoPrinter.listPrinters();
      setPrinters(Array.isArray(res?.printers) ? res.printers : []);
    } catch (e) {
      console.error(e);
      setBluetoothPermissionGranted(false);
      toast.error('Failed to load paired Bluetooth printers. Check Bluetooth permissions and try again.');
      setPrinters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPrinters();
  }, []);

  const isValidMac = useMemo(() => {
    if (!manualMac) return false;
    return MAC_REGEX.test(normalizeMac(manualMac));
  }, [manualMac]);

  const handleSave = () => {
    const mac = normalizeMac(manualMac);
    if (!mac || !MAC_REGEX.test(mac)) {
      toast.error('Enter a valid MAC address like AA:BB:CC:DD:EE:FF');
      return;
    }
    try {
      window.localStorage.setItem(BOUND_PRINTER_MAC_KEY, mac);
      setBoundMac(mac);
      toast.success('Bluetooth printer MAC saved');
    } catch {
      toast.error('Failed to save MAC on this device');
    }
  };

  const handleTestPrint = async () => {
    const mac = (boundMac || normalizeMac(manualMac)).trim();
    if (!mac || !MAC_REGEX.test(mac)) {
      toast.error('Please set a valid printer MAC first');
      return;
    }

    const sampleHtml = [
      '<div style="font-family:monospace">MERCOTRACE</div>',
      '<br/>',
      '<div style="font-family:monospace">Bluetooth Thermal Test</div>',
      '<br/>',
      `<div style="font-family:monospace">MAC: ${escapeHtml(mac)}</div>`,
    ].join('');
      const sampleThermalText = [
        '[C]<b>MERCOTRACE</b>',
        '[C]Bluetooth Thermal Test',
        `[L]MAC: ${mac}`,
      ].join('\n');

    try {
      // Ensure runtime permission is granted before attempting thermal printing.
      const perm = await mercoPrinter.requestBluetoothPermissions();
      if (!perm?.granted) {
        toast.error('Bluetooth permission not granted. Please allow permissions and try again.');
        return;
      }

      const ok = await directPrint({ html: sampleHtml, thermalText: sampleThermalText }, { mode: 'auto', deviceMac: mac });
      ok ? toast.success('Test print triggered') : toast.error('Could not trigger print');
    } catch {
      toast.error('Test print failed');
    }
  };

  if (!canViewSettings) {
    return <ForbiddenPage moduleName="Settings" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {/* Mobile hero (matches Print Hub style) */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => navigate('/settings')}
                aria-label="Go back"
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Bluetooth className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white">Bluetooth Printer Settings</h1>
                <p className="text-white/70 text-xs mt-1">Bind ESC/POS thermal printer MAC for Print Hub sticker/chiti</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={isDesktop ? 'px-4 md:px-8 pt-4 lg:pt-6 space-y-6' : 'px-4 md:px-8 pt-5 space-y-6'}>
        {isDesktop && (
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bluetooth className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Bluetooth Printer Settings</h1>
              <p className="text-sm text-muted-foreground">Bind ESC/POS thermal printer MAC for Print Hub sticker/chiti</p>
            </div>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-foreground">Paired Printers</h2>
              <p className="text-xs text-muted-foreground">Select one from the paired list or enter MAC manually.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadPrinters()} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="space-y-2">
            {loading && (
              <div className="text-xs text-muted-foreground">Loading paired printers…</div>
            )}
            {!loading && printers.length === 0 && bluetoothPermissionGranted === false && (
              <div className="text-xs text-red-600 font-semibold">Bluetooth permission not granted yet.</div>
            )}
            {!loading && printers.length === 0 && bluetoothPermissionGranted === true && (
              <div className="text-xs text-muted-foreground">No paired printers found.</div>
            )}
            {!loading && printers.length === 0 && bluetoothPermissionGranted === null && (
              <div className="text-xs text-muted-foreground">Tap “Refresh” to load paired printers.</div>
            )}
            {printers.map((p) => {
              const mac = normalizeMac(p.mac);
              const selected = mac && mac === boundMac;
              return (
                <button
                  key={mac || p.name}
                  type="button"
                  className={[
                    'w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left',
                    selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-border/50 hover:bg-muted/40',
                  ].join(' ')}
                  onClick={() => {
                    setManualMac(mac);
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{mac}</div>
                  </div>
                  <div className={selected ? 'text-emerald-600 font-bold text-sm' : 'text-muted-foreground text-xs'}>
                    {selected ? 'Bound' : 'Select'}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Save className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Manual MAC Binding</h2>
              <p className="text-xs text-muted-foreground">Use this when paired list is not detected.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mac">Printer MAC Address</Label>
            <Input
              id="mac"
              placeholder="AA:BB:CC:DD:EE:FF"
              value={manualMac}
              onChange={(e) => setManualMac(e.target.value)}
              className="font-mono"
            />
            {!manualMac ? (
              <div className="text-xs text-muted-foreground">Not set</div>
            ) : isValidMac ? (
              <div className="text-xs text-emerald-600 font-semibold">Valid MAC</div>
            ) : (
              <div className="text-xs text-red-600 font-semibold">Invalid MAC format</div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={handleSave} disabled={!canManageSettings || !isValidMac}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => void handleTestPrint()} disabled={!canManageSettings}>
              <Play className="w-4 h-4 mr-2" />
              Test Print
            </Button>
          </div>

          {boundMac && (
            <div className="text-xs text-muted-foreground mt-3">
              Current bound MAC: <span className="font-mono">{boundMac}</span>
            </div>
          )}
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default BluetoothPrinterSettingsPage;

