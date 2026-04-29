import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Bluetooth, ArrowLeft, RefreshCw, Play, Save, Trash2, Link2, Shield } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import ForbiddenPage from '@/components/ForbiddenPage';
import { usePermissions } from '@/lib/permissions';
import { useDesktopMode } from '@/hooks/use-desktop';
import { useAuth } from '@/context/AuthContext';
import { directPrint } from '@/utils/printTemplates';
import {
  bluetoothPrintersApi,
  type BluetoothPrinterAccessMode,
  type BluetoothPrinterDTO,
} from '@/services/api/bluetoothPrinters';
import { traderRbacApi } from '@/services/api/rbac';
import type { Profile, Role } from '@/types/rbac';
import { mercoPrinter } from '@/plugins/mercoPrinter';

const BOUND_PRINTER_MAC_KEY = 'merco.boundBluetoothPrinterMac';
const MAC_REGEX = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTraderOwnerRole(role: string | undefined): boolean {
  return String(role ?? '').trim().toUpperCase() === 'TRADER_OWNER';
}

type LocalPaired = { mac: string; name: string };

type DeviceStatus = 'connected' | 'available' | 'not_on_device' | 'no_access';

function deviceStatusFor(
  mac: string,
  boundMac: string,
  bonded: Set<string>,
  canUse: boolean,
  isNative: boolean
): DeviceStatus {
  if (!canUse) return 'no_access';
  if (boundMac && mac === boundMac) return 'connected';
  if (!isNative) return 'available';
  return bonded.has(mac) ? 'available' : 'not_on_device';
}

function statusLabel(s: DeviceStatus): string {
  switch (s) {
    case 'connected':
      return 'Connected';
    case 'available':
      return 'Available';
    case 'not_on_device':
      return 'Not on this device';
    case 'no_access':
      return 'No access';
    default:
      return s;
  }
}

const BluetoothPrinterSettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAccessModule, can } = usePermissions();
  const isDesktop = useDesktopMode();

  const canViewSettings = canAccessModule('Settings');
  const isNative = Capacitor.isNativePlatform();

  const canRegisterOrRemove =
    isTraderOwnerRole(user?.role) ||
    can('Print Settings', 'edit') ||
    can('Settings', 'Manage Roles') ||
    can('Settings', 'Manage Users');

  const canManageAccess =
    isTraderOwnerRole(user?.role) || can('Settings', 'Manage Roles') || can('Settings', 'Manage Users');

  const [localLoading, setLocalLoading] = useState(false);
  const [localPaired, setLocalPaired] = useState<LocalPaired[]>([]);
  const [bluetoothPermissionGranted, setBluetoothPermissionGranted] = useState<boolean | null>(null);

  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedPrinters, setSharedPrinters] = useState<BluetoothPrinterDTO[]>([]);

  const [boundMac, setBoundMac] = useState<string>(() => {
    try {
      return normalizeMac(window.localStorage.getItem(BOUND_PRINTER_MAC_KEY) ?? '');
    } catch {
      return '';
    }
  });
  const [manualMac, setManualMac] = useState<string>(boundMac);

  const [accessPrinterId, setAccessPrinterId] = useState<string>('');
  const [accessMode, setAccessMode] = useState<BluetoothPrinterAccessMode>('OPEN');
  const [allowedUserIds, setAllowedUserIds] = useState<Set<number>>(new Set());
  const [allowedRoleIds, setAllowedRoleIds] = useState<Set<number>>(new Set());
  const [rbacUsers, setRbacUsers] = useState<(Profile & { mappingActive?: boolean })[]>([]);
  const [rbacRoles, setRbacRoles] = useState<Role[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);

  useEffect(() => {
    setManualMac(boundMac);
  }, [boundMac]);

  const bondedSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of localPaired) {
      const m = normalizeMac(p.mac);
      if (m) s.add(m);
    }
    return s;
  }, [localPaired]);

  const loadShared = useCallback(async () => {
    try {
      setSharedLoading(true);
      const list = await bluetoothPrintersApi.list();
      setSharedPrinters(list);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to load organization printers');
      setSharedPrinters([]);
    } finally {
      setSharedLoading(false);
    }
  }, []);

  const loadLocalPaired = useCallback(async () => {
    if (!isNative) {
      setLocalPaired([]);
      return;
    }
    try {
      setLocalLoading(true);
      setBluetoothPermissionGranted(null);
      const perm = await mercoPrinter.requestBluetoothPermissions();
      const granted = !!perm?.granted;
      setBluetoothPermissionGranted(granted);
      if (!granted) {
        toast.error('Bluetooth permission not granted. Please allow permissions and try again.');
        setLocalPaired([]);
        return;
      }
      const res = await mercoPrinter.listPrinters();
      setLocalPaired(Array.isArray(res?.printers) ? res.printers : []);
    } catch (e) {
      console.error(e);
      setBluetoothPermissionGranted(false);
      toast.error('Failed to load paired Bluetooth printers.');
      setLocalPaired([]);
    } finally {
      setLocalLoading(false);
    }
  }, [isNative]);

  useEffect(() => {
    void loadShared();
  }, [loadShared]);

  useEffect(() => {
    void loadLocalPaired();
  }, [loadLocalPaired]);

  const unregisteredLocal = useMemo(() => {
    const reg = new Set(sharedPrinters.map((p) => normalizeMac(p.mac_address)));
    return localPaired.filter((p) => {
      const m = normalizeMac(p.mac);
      return m && MAC_REGEX.test(m) && !reg.has(m);
    });
  }, [localPaired, sharedPrinters]);

  const selectedAccessPrinter = useMemo(
    () => sharedPrinters.find((p) => String(p.id) === accessPrinterId),
    [sharedPrinters, accessPrinterId]
  );

  useEffect(() => {
    if (!accessPrinterId && sharedPrinters.length > 0) {
      setAccessPrinterId(String(sharedPrinters[0].id));
    }
  }, [sharedPrinters, accessPrinterId]);

  useEffect(() => {
    const p = selectedAccessPrinter;
    if (!p) return;
    setAccessMode(p.access_mode);
    setAllowedUserIds(new Set(p.allowed_user_ids ?? []));
    setAllowedRoleIds(new Set(p.allowed_role_ids ?? []));
  }, [selectedAccessPrinter]);

  const loadRbacForAccess = useCallback(async () => {
    if (!canManageAccess) return;
    try {
      setRbacLoading(true);
      const [users, roles] = await Promise.all([traderRbacApi.listProfiles(), traderRbacApi.listRoles()]);
      setRbacUsers(users.filter((u) => u.mappingActive !== false));
      setRbacRoles(roles);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load users and roles for access control.');
    } finally {
      setRbacLoading(false);
    }
  }, [canManageAccess]);

  useEffect(() => {
    if (canManageAccess) void loadRbacForAccess();
  }, [canManageAccess, loadRbacForAccess]);

  const isValidMac = useMemo(() => {
    if (!manualMac) return false;
    return MAC_REGEX.test(normalizeMac(manualMac));
  }, [manualMac]);

  const persistBoundMac = (mac: string) => {
    const n = normalizeMac(mac);
    try {
      window.localStorage.setItem(BOUND_PRINTER_MAC_KEY, n);
      setBoundMac(n);
    } catch {
      toast.error('Failed to save MAC on this device');
    }
  };

  const tryBindMac = async (mac: string, serverSaysCanUse: boolean) => {
    const n = normalizeMac(mac);
    if (!n || !MAC_REGEX.test(n)) {
      toast.error('Invalid MAC');
      return;
    }
    if (!serverSaysCanUse) {
      toast.error('You are not allowed to use this printer.');
      return;
    }
    if (isNative && !bondedSet.has(n)) {
      toast.error('Pair this printer with this device in Android Bluetooth settings first.');
      return;
    }
    try {
      const allowed = await bluetoothPrintersApi.checkMacAccess(n);
      if (!allowed) {
        toast.error('You are not allowed to use this printer.');
        return;
      }
    } catch {
      toast.error('Could not verify printer access. Check your connection.');
      return;
    }
    persistBoundMac(n);
    toast.success('Active printer updated on this device');
  };

  const handleSaveManual = async () => {
    const mac = normalizeMac(manualMac);
    if (!mac || !MAC_REGEX.test(mac)) {
      toast.error('Enter a valid MAC address like AA:BB:CC:DD:EE:FF');
      return;
    }
    try {
      const allowed = await bluetoothPrintersApi.checkMacAccess(mac);
      if (!allowed) {
        toast.error('You are not allowed to use this MAC.');
        return;
      }
    } catch {
      toast.error('Could not verify printer access. Check your connection.');
      return;
    }

    const alreadyOrg = sharedPrinters.some((p) => normalizeMac(p.mac_address) === mac);

    if (!alreadyOrg && canRegisterOrRemove) {
      try {
        await bluetoothPrintersApi.register({ mac_address: mac, display_name: mac });
        await loadShared();
        persistBoundMac(mac);
        toast.success('Printer registered for your organization and set active on this device');
        return;
      } catch (e) {
        const raw = e instanceof Error ? e.message : '';
        const lower = raw.toLowerCase();
        if (lower.includes('already') || lower.includes('conflict')) {
          await loadShared();
          persistBoundMac(mac);
          toast.success('Printer already on the organization list; active MAC saved on this device');
          return;
        }
        persistBoundMac(mac);
        toast.error(
          `${raw || 'Could not register printer for organization'} Active MAC still saved on this device only.`
        );
        return;
      }
    }

    if (!alreadyOrg && !canRegisterOrRemove) {
      persistBoundMac(mac);
      toast.success(
        'Saved on this device. This MAC is not on the shared list yet—ask an owner or someone with Print Settings edit or user/role management access to register it for all devices.'
      );
      return;
    }

    persistBoundMac(mac);
    toast.success('Active printer saved on this device');
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
    const sampleThermalText = ['[C]<b>MERCOTRACE</b>', '[C]Bluetooth Thermal Test', `[L]MAC: ${mac}`].join('\n');

    try {
      if (isNative) {
        const perm = await mercoPrinter.requestBluetoothPermissions();
        if (!perm?.granted) {
          toast.error('Bluetooth permission not granted. Please allow permissions and try again.');
          return;
        }
      }

      const ok = await directPrint({ html: sampleHtml, thermalText: sampleThermalText }, { mode: 'auto', deviceMac: mac });
      ok ? toast.success('Test print triggered') : toast.error('Could not trigger print');
    } catch {
      toast.error('Test print failed');
    }
  };

  const handleRegisterLocal = async (p: LocalPaired) => {
    const mac = normalizeMac(p.mac);
    if (!canRegisterOrRemove) return;
    try {
      await bluetoothPrintersApi.register({
        mac_address: mac,
        display_name: p.name || mac,
      });
      toast.success('Printer registered for your organization');
      await loadShared();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed');
    }
  };

  const handleRemove = async (id: number) => {
    if (!canRegisterOrRemove) return;
    if (!window.confirm('Remove this printer from the organization? It stays paired on devices until unpaired in OS.')) return;
    try {
      await bluetoothPrintersApi.remove(id);
      toast.success('Printer removed');
      await loadShared();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const handleSaveAccess = async () => {
    const id = Number(accessPrinterId);
    if (!id || Number.isNaN(id)) return;
    try {
      const dto = await bluetoothPrintersApi.updateAccess(id, {
        access_mode: accessMode,
        allowed_user_ids: Array.from(allowedUserIds),
        allowed_role_ids: Array.from(allowedRoleIds),
      });
      toast.success('Access rules saved');
      setSharedPrinters((prev) => prev.map((p) => (p.id === dto.id ? dto : p)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save access');
    }
  };

  const refreshAll = () => {
    void loadShared();
    void loadLocalPaired();
  };

  if (!canViewSettings) {
    return <ForbiddenPage moduleName="Settings" />;
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {!isDesktop && (
        <div className="bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <button
                type="button"
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
                <p className="text-white/70 text-xs mt-1">
                  Organization printers, active device, and access control
                </p>
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
              <p className="text-sm text-muted-foreground">
                Organization-wide printers (mandi), this device, and permissions
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => refreshAll()} disabled={sharedLoading || localLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh all
          </Button>
        </div>

        {/* Active printer */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40"
        >
          <h2 className="font-bold text-foreground mb-1">Active / connected printer (this device)</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Print Hub and settlement use this MAC on Android. Stored locally per device; organization list is shared.
          </p>
          {boundMac ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground">MAC </span>
                <span className="font-mono font-semibold">{boundMac}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(BOUND_PRINTER_MAC_KEY);
                  } catch {
                    // ignore
                  }
                  setBoundMac('');
                  setManualMac('');
                  toast.message('Active printer cleared on this device');
                }}
              >
                Clear active
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active printer on this device. Choose one below.</p>
          )}
        </motion.div>

        {/* Shared printers */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-foreground">Shared printers (organization)</h2>
              <p className="text-xs text-muted-foreground">
                Visible to all users in your mandi. &quot;Not on this device&quot; means not paired here or out of
                range.
              </p>
            </div>
          </div>

          {sharedLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
          {!sharedLoading && sharedPrinters.length === 0 && (
            <div className="text-xs text-muted-foreground">No organization printers yet. Register one from paired devices.</div>
          )}

          <div className="space-y-2 mt-2">
            {sharedPrinters.map((p) => {
              const mac = normalizeMac(p.mac_address);
              const st = deviceStatusFor(mac, boundMac, bondedSet, p.current_user_can_use, isNative);
              return (
                <div
                  key={p.id}
                  className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">{p.display_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{mac}</div>
                    <div
                      className={[
                        'text-[11px] font-semibold mt-1',
                        st === 'no_access' ? 'text-red-600' : st === 'not_on_device' ? 'text-amber-600' : 'text-emerald-600',
                      ].join(' ')}
                    >
                      {statusLabel(st)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!p.current_user_can_use}
                      onClick={() => void tryBindMac(mac, p.current_user_can_use)}
                    >
                      <Link2 className="w-4 h-4 mr-1" />
                      Use as active
                    </Button>
                    {canRegisterOrRemove && (
                      <Button type="button" size="sm" variant="destructive" onClick={() => void handleRemove(p.id)}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canRegisterOrRemove && unregisteredLocal.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/40">
              <h3 className="text-sm font-semibold mb-2">Register paired device to organization</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Pair in Android first, refresh, then add here so other users see the same printer.
              </p>
              <div className="space-y-2">
                {unregisteredLocal.map((p) => {
                  const mac = normalizeMac(p.mac);
                  return (
                    <div key={mac} className="flex items-center justify-between gap-2 rounded-lg border px-2 py-2">
                      <div className="min-w-0 text-sm truncate">{p.name}</div>
                      <Button type="button" size="sm" onClick={() => void handleRegisterLocal(p)}>
                        Register
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* Local paired list */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold text-foreground">This device — Bluetooth paired</h2>
              <p className="text-xs text-muted-foreground">OS-level paired devices (Android only).</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadLocalPaired()} disabled={localLoading || !isNative}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {!isNative && (
            <div className="text-xs text-muted-foreground">Bluetooth pairing is available on the Android app only.</div>
          )}
          {isNative && localLoading && <div className="text-xs text-muted-foreground">Loading paired printers…</div>}
          {isNative && !localLoading && localPaired.length === 0 && bluetoothPermissionGranted === false && (
            <div className="text-xs text-red-600 font-semibold">Bluetooth permission not granted yet.</div>
          )}
          {isNative && !localLoading && localPaired.length === 0 && bluetoothPermissionGranted === true && (
            <div className="text-xs text-muted-foreground">No paired printers found.</div>
          )}
          {isNative &&
            localPaired.map((p) => {
              const mac = normalizeMac(p.mac);
              const selected = mac && mac === boundMac;
              return (
                <button
                  key={mac || p.name}
                  type="button"
                  className={[
                    'w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left mb-2',
                    selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-border/50 hover:bg-muted/40',
                  ].join(' ')}
                  onClick={() => setManualMac(mac)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{mac}</div>
                  </div>
                  <div className={selected ? 'text-emerald-600 font-bold text-sm' : 'text-muted-foreground text-xs'}>
                    {selected ? 'Active' : 'Fill MAC'}
                  </div>
                </button>
              );
            })}
        </motion.div>

        {/* Access management */}
        {canManageAccess && sharedPrinters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-5 sm:p-6 border border-border/40"
          >
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-foreground">Access management</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Default is open to everyone in the organization. Restrict to specific users and/or roles as needed.
            </p>

            <div className="space-y-4">
              <div>
                <Label>Printer</Label>
                <Select value={accessPrinterId} onValueChange={setAccessPrinterId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select printer" />
                  </SelectTrigger>
                  <SelectContent>
                    {sharedPrinters.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.display_name} ({normalizeMac(p.mac_address)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Access mode</Label>
                <Select value={accessMode} onValueChange={(v) => setAccessMode(v as BluetoothPrinterAccessMode)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open — all users in mandi</SelectItem>
                    <SelectItem value="RESTRICTED">Restricted — allowed users/roles only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {accessMode === 'RESTRICTED' && (
                <>
                  <div>
                    <Label className="mb-2 block">Users</Label>
                    {rbacLoading ? (
                      <div className="text-xs text-muted-foreground">Loading users…</div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-2 rounded-md border p-2">
                        {rbacUsers.map((u) => {
                          const id = Number(u.user_id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={allowedUserIds.has(id)}
                                onCheckedChange={(c) => {
                                  setAllowedUserIds((prev) => {
                                    const n = new Set(prev);
                                    if (c === true) n.add(id);
                                    else n.delete(id);
                                    return n;
                                  });
                                }}
                              />
                              <span className="truncate">{u.full_name || u.email}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="mb-2 block">Roles</Label>
                    {rbacLoading ? (
                      <div className="text-xs text-muted-foreground">Loading roles…</div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-2 rounded-md border p-2">
                        {rbacRoles.map((r) => {
                          const id = Number(r.id);
                          return (
                            <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={allowedRoleIds.has(id)}
                                onCheckedChange={(c) => {
                                  setAllowedRoleIds((prev) => {
                                    const n = new Set(prev);
                                    if (c === true) n.add(id);
                                    else n.delete(id);
                                    return n;
                                  });
                                }}
                              />
                              <span className="truncate">{r.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              <Button type="button" onClick={() => void handleSaveAccess()} disabled={!accessPrinterId}>
                Save access rules
              </Button>
            </div>
          </motion.div>
        )}

        {/* Manual MAC */}
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
              <h2 className="font-bold text-foreground">Manual MAC</h2>
              <p className="text-xs text-muted-foreground">
                When the paired list does not show the device. If you can register printers (owner, Print Settings edit,
                or manage users/roles), saving also adds this MAC to the organization so other devices see it—same as
                Register from paired list. Otherwise it stays on this device only until an admin registers it.
              </p>
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

          <div className="flex flex-wrap gap-3 mt-4">
            <Button type="button" onClick={() => void handleSaveManual()} disabled={!isValidMac}>
              Save as active
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleTestPrint()}
              disabled={!MAC_REGEX.test(normalizeMac(boundMac || manualMac))}
            >
              <Play className="w-4 h-4 mr-2" />
              Test print
            </Button>
          </div>
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default BluetoothPrinterSettingsPage;
