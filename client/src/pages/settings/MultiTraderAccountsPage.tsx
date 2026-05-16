import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CheckCircle2, ChevronDown, FileText, Hash, Loader2, MapPin, Navigation, Plus, RefreshCw, Send, Store, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';

import BottomNav from '@/components/BottomNav';
import ForbiddenPage from '@/components/ForbiddenPage';
import LocationSearchInput from '@/components/LocationSearchInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  categoryApi,
  multiTraderAccountsApi,
  type MultiTraderAccountRequest,
  type MultiTraderAccountRequestCreate,
  type MultiTraderCurrentSummary,
} from '@/services/api';
import type { TraderAccountOption } from '@/services/api/auth';
import type { BusinessCategory } from '@/types/models';

type TabKey = 'apply' | 'requests' | 'accounts';

type MandiForm = {
  localId: string;
  businessName: string;
  ownerName: string;
  address: string;
  city: string;
  shopNo: string;
  state: string;
  categoryId: string;
  categoryName: string;
  gstNumber: string;
  rmcApmcCode: string;
  description: string;
};

type MandiFormKey = keyof Omit<MandiForm, 'localId'>;

const STATES = ['Karnataka'];
const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const businessNameRegex = /^[A-Za-z0-9 &'.,\-/]+$/;
const ownerNameRegex = /^[A-Za-z ]+$/;
const cityRegex = /^[A-Za-z0-9.\- ]+$/;
const addressRegex = /^[A-Za-z0-9\s,.#\-/]+$/;
const shopNoRegex = /^[A-Za-z0-9\- ]+$/;
const rmcApmcRegex = /^[A-Za-z0-9\-]+$/;

function createMandiForm(): MandiForm {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    businessName: '',
    ownerName: '',
    address: '',
    city: '',
    shopNo: '',
    state: 'Karnataka',
    categoryId: '',
    categoryName: '',
    gstNumber: '',
    rmcApmcCode: '',
    description: '',
  };
}

function isTraderOwnerRole(role: string | undefined): boolean {
  return String(role ?? '').trim().toUpperCase() === 'TRADER_OWNER';
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'APPROVED') return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Approved</Badge>;
  if (status === 'REJECTED') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Pending</Badge>;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function accountLocation(account: { city?: string | null; state?: string | null }): string {
  return [account.city, account.state].filter(Boolean).join(', ');
}

const tabTriggerClass = cn(
  'flex-1 min-h-11 rounded-xl px-2 text-center text-xs font-semibold leading-tight sm:text-sm',
  'data-[state=active]:bg-[linear-gradient(90deg,#4B7CF3_0%,#5B8CFF_45%,#7B61FF_100%)] data-[state=active]:text-white',
);

const MultiTraderAccountsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { trader, user, refreshProfile } = useAuth();
  const { canAccessModule } = usePermissions();
  const [summary, setSummary] = useState<MultiTraderCurrentSummary | null>(null);
  const [requests, setRequests] = useState<MultiTraderAccountRequest[]>([]);
  const [accounts, setAccounts] = useState<TraderAccountOption[]>([]);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [tab, setTab] = useState<TabKey>('apply');
  const [forms, setForms] = useState<MandiForm[]>(() => [createMandiForm()]);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [touched, setTouched] = useState<Record<string, Record<string, boolean>>>({});
  const [categoryDropdownId, setCategoryDropdownId] = useState<string | null>(null);
  const [stateDropdownId, setStateDropdownId] = useState<string | null>(null);
  const [locationLoadingId, setLocationLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const canOpen = canAccessModule('Settings') && isTraderOwnerRole(user?.role) && trader?.approval_status === 'APPROVED';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, nextRequests, nextAccounts] = await Promise.all([
        multiTraderAccountsApi.current(),
        multiTraderAccountsApi.requests(),
        multiTraderAccountsApi.accounts(),
      ]);
      setSummary(nextSummary);
      setRequests(nextRequests);
      setAccounts(nextAccounts);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load multi-account details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canOpen) void load();
  }, [canOpen, load]);

  useEffect(() => {
    if (!canOpen) return;
    categoryApi.list()
      .then(setCategories)
      .catch(() => toast.error('Failed to load business categories'));
  }, [canOpen]);

  if (!canOpen) {
    return <ForbiddenPage moduleName="Settings" />;
  }

  const currentAccount = summary?.current_trader ?? accounts.find(account => account.primary_mapping);

  const validateFieldValue = (field: MandiFormKey, form: MandiForm): string => {
    const value = String(form[field] ?? '').trim();
    switch (field) {
      case 'businessName':
        return !value
          ? 'Business name is required'
          : value.length < 3
            ? 'Min 3 characters'
            : !businessNameRegex.test(value)
              ? "Only letters, numbers, spaces and & ' . - , / allowed"
              : '';
      case 'ownerName':
        return !value
          ? 'Owner name is required'
          : value.length < 2
            ? 'Min 2 characters'
            : !ownerNameRegex.test(value)
              ? 'Only letters and spaces allowed'
              : '';
      case 'address':
        return !value
          ? 'Address is required'
          : value.length < 5
            ? 'Address too short (min 5 characters)'
            : !addressRegex.test(value)
              ? 'Only letters, numbers, spaces and , . # - / allowed'
              : '';
      case 'city':
        return !value
          ? 'City / Market is required'
          : !cityRegex.test(value)
            ? 'Only letters, numbers, spaces and . - allowed'
            : '';
      case 'shopNo':
        return !value
          ? 'Shop number is required'
          : !shopNoRegex.test(value)
            ? 'Only letters, numbers, spaces and - allowed'
            : '';
      case 'state':
        return !value ? 'State is required (mandatory for GST)' : '';
      case 'categoryName':
        return !value ? 'Select a business category' : '';
      case 'gstNumber':
        return value && !gstRegex.test(value.toUpperCase()) ? 'Enter valid 15-char GST (e.g., 22AAAAA0000A1Z5)' : '';
      case 'rmcApmcCode':
        return value && !rmcApmcRegex.test(value) ? 'Only letters, numbers and - allowed' : '';
      case 'description':
        return value.length > 500 ? 'Maximum 500 characters allowed' : '';
      default:
        return '';
    }
  };

  const setFieldError = (formId: string, field: MandiFormKey, error: string) => {
    setErrors(prev => {
      const nextForForm = { ...(prev[formId] ?? {}) };
      if (error) nextForForm[field] = error;
      else delete nextForForm[field];
      return { ...prev, [formId]: nextForForm };
    });
  };

  const updateForm = (formId: string, field: MandiFormKey, value: string) => {
    let nextForValidation: MandiForm | null = null;
    setForms(prev => prev.map(form => {
      if (form.localId !== formId) return form;
      const next = { ...form, [field]: value };
      nextForValidation = next;
      return next;
    }));
    if (touched[formId]?.[field] && nextForValidation) {
      setFieldError(formId, field, validateFieldValue(field, nextForValidation));
    }
  };

  const touch = (formId: string, field: MandiFormKey) => {
    const form = forms.find(item => item.localId === formId);
    if (!form) return;
    setTouched(prev => ({ ...prev, [formId]: { ...(prev[formId] ?? {}), [field]: true } }));
    setFieldError(formId, field, validateFieldValue(field, form));
  };

  const FieldError = ({ formId, field }: { formId: string; field: MandiFormKey }) => {
    const error = touched[formId]?.[field] ? errors[formId]?.[field] : '';
    return error ? <p className="mt-1 text-xs font-medium text-destructive">{error}</p> : null;
  };

  const addMandiForm = () => {
    setForms(prev => [...prev, createMandiForm()]);
  };

  const removeMandiForm = (formId: string) => {
    if (forms.length === 1) return;
    setForms(prev => prev.filter(form => form.localId !== formId));
    setErrors(prev => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
    setTouched(prev => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
  };

  const useCurrentLocation = async (formId: string) => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setLocationLoadingId(formId);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      });
      const { latitude, longitude } = position.coords;
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`);
      if (!res.ok) throw new Error('Location fetch failure');
      const data = await res.json();
      updateForm(formId, 'address', data.display_name || `${latitude}, ${longitude}`);
      setTouched(prev => ({ ...prev, [formId]: { ...(prev[formId] ?? {}), address: true } }));
      toast.success('Location fetched successfully');
    } catch (e: any) {
      if (e?.code === 1) toast.error('Location permission denied');
      else if (e?.code === 3) toast.error('Location request timed out');
      else toast.error('Could not fetch location. Enter manually.');
    } finally {
      setLocationLoadingId(null);
    }
  };

  const validateForms = (): boolean => {
    const fields: MandiFormKey[] = [
      'businessName',
      'ownerName',
      'address',
      'city',
      'shopNo',
      'state',
      'categoryName',
      'gstNumber',
      'rmcApmcCode',
      'description',
    ];
    let valid = true;
    const nextTouched: Record<string, Record<string, boolean>> = {};
    const nextErrors: Record<string, Record<string, string>> = {};
    forms.forEach(form => {
      nextTouched[form.localId] = fields.reduce((acc, field) => ({ ...acc, [field]: true }), {});
      nextErrors[form.localId] = {};
      fields.forEach(field => {
        const error = validateFieldValue(field, form);
        if (error) {
          valid = false;
          nextErrors[form.localId][field] = error;
        }
      });
    });
    setTouched(nextTouched);
    setErrors(nextErrors);
    return valid;
  };

  const submit = async () => {
    if (!validateForms()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    const payload: MultiTraderAccountRequestCreate[] = forms.map(form => ({
      business_name: form.businessName.trim(),
      owner_name: form.ownerName.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      shop_no: form.shopNo.trim(),
      category: form.categoryName.trim(),
      gst_number: form.gstNumber.trim().toUpperCase() || undefined,
      rmc_apmc_code: form.rmcApmcCode.trim() || undefined,
      description: form.description.trim() || undefined,
    }));
    setSubmitting(true);
    try {
      await multiTraderAccountsApi.createRequests(payload);
      toast.success(forms.length === 1 ? 'Mandi request submitted' : `${forms.length} mandi requests submitted`);
      setForms([createMandiForm()]);
      setErrors({});
      setTouched({});
      await load();
      setTab('requests');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit mandi requests');
    } finally {
      setSubmitting(false);
    }
  };

  const switchAccount = async (account: TraderAccountOption) => {
    setSwitchingId(account.trader_id);
    try {
      await multiTraderAccountsApi.switchAccount(account.trader_id);
      queryClient.clear();
      await refreshProfile();
      toast.success(`Switched to ${account.business_name}`);
      navigate('/home', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to switch account');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      <div className="space-y-5 px-4 pt-4 md:px-8 lg:pt-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')} aria-label="Back to settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Multi Trader Acc Setup</h1>
            <p className="text-sm text-muted-foreground">Apply, track requests, and switch linked trader accounts.</p>
          </div>
        </div>

        <section className="rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Current account</p>
              <h2 className="text-lg font-bold text-foreground">{currentAccount?.business_name ?? trader?.business_name}</h2>
              <p className="text-sm text-muted-foreground">
                {currentAccount?.owner_name ?? trader?.owner_name}
                {accountLocation(currentAccount ?? trader ?? {}) ? ` · ${accountLocation(currentAccount ?? trader ?? {})}` : ''}
              </p>
            </div>
            <StatusBadge status={trader?.approval_status} />
          </div>
        </section>

        <Tabs value={tab} onValueChange={value => setTab(value as TabKey)} className="space-y-4">
          <TabsList className="grid h-auto grid-cols-3 gap-2 bg-transparent p-0">
            <TabsTrigger value="apply" className={tabTriggerClass}>Apply For New Mandi</TabsTrigger>
            <TabsTrigger value="requests" className={tabTriggerClass}>My Requests</TabsTrigger>
            <TabsTrigger value="accounts" className={tabTriggerClass}>My Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="apply" className="space-y-4">
            <div className="space-y-4">
              {forms.map((mandi, index) => (
                <section key={mandi.localId} className="rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-foreground">Mandi {index + 1}</h3>
                      <p className="text-xs text-muted-foreground">Business, owner, address and registration details.</p>
                    </div>
                    {forms.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeMandiForm(mandi.localId)}
                        className="h-9 gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`business-${mandi.localId}`}>Business Name</Label>
                      <div className="relative mt-1">
                        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`business-${mandi.localId}`}
                          value={mandi.businessName}
                          onChange={e => updateForm(mandi.localId, 'businessName', e.target.value)}
                          onBlur={() => touch(mandi.localId, 'businessName')}
                          className="h-11 rounded-xl pl-10"
                        />
                      </div>
                      <FieldError formId={mandi.localId} field="businessName" />
                    </div>

                    <div>
                      <Label htmlFor={`owner-${mandi.localId}`}>Owner Name</Label>
                      <div className="relative mt-1">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`owner-${mandi.localId}`}
                          value={mandi.ownerName}
                          onChange={e => updateForm(mandi.localId, 'ownerName', e.target.value)}
                          onBlur={() => touch(mandi.localId, 'ownerName')}
                          className="h-11 rounded-xl pl-10"
                        />
                      </div>
                      <FieldError formId={mandi.localId} field="ownerName" />
                    </div>

                    <div>
                      <Label htmlFor={`shop-${mandi.localId}`}>Shop No</Label>
                      <div className="relative mt-1">
                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`shop-${mandi.localId}`}
                          value={mandi.shopNo}
                          onChange={e => updateForm(mandi.localId, 'shopNo', e.target.value)}
                          onBlur={() => touch(mandi.localId, 'shopNo')}
                          className="h-11 rounded-xl pl-10"
                          maxLength={20}
                        />
                      </div>
                      <FieldError formId={mandi.localId} field="shopNo" />
                    </div>

                    <div>
                      <Label htmlFor={`city-${mandi.localId}`}>City / Market</Label>
                      <div className="relative mt-1">
                        <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`city-${mandi.localId}`}
                          value={mandi.city}
                          onChange={e => updateForm(mandi.localId, 'city', e.target.value)}
                          onBlur={() => touch(mandi.localId, 'city')}
                          className="h-11 rounded-xl pl-10"
                          maxLength={100}
                        />
                      </div>
                      <FieldError formId={mandi.localId} field="city" />
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor={`address-${mandi.localId}`}>Address</Label>
                      <LocationSearchInput
                        id={`address-${mandi.localId}`}
                        value={mandi.address}
                        onChange={value => updateForm(mandi.localId, 'address', value)}
                        placeholder="Search or enter address"
                        className="mt-1"
                      />
                      <button
                        type="button"
                        onClick={() => void useCurrentLocation(mandi.localId)}
                        disabled={locationLoadingId === mandi.localId}
                        className="mt-1.5 flex min-h-10 items-center gap-2 px-1 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-60"
                      >
                        {locationLoadingId === mandi.localId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                        {locationLoadingId === mandi.localId ? 'Fetching location...' : 'Use current location as address'}
                      </button>
                      <FieldError formId={mandi.localId} field="address" />
                    </div>

                    <div className="relative">
                      <Label>State</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setStateDropdownId(prev => (prev === mandi.localId ? null : mandi.localId));
                          setCategoryDropdownId(null);
                        }}
                        onBlur={() => window.setTimeout(() => {
                          setStateDropdownId(null);
                          touch(mandi.localId, 'state');
                        }, 150)}
                        className="mt-1 flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-left text-sm"
                      >
                        <span>{mandi.state || 'Select State'}</span>
                        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', stateDropdownId === mandi.localId && 'rotate-180')} />
                      </button>
                      {stateDropdownId === mandi.localId && (
                        <div className="absolute z-50 mt-2 w-full rounded-xl border border-border/50 bg-card py-1 shadow-xl">
                          {STATES.map(state => (
                            <button
                              key={state}
                              type="button"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => {
                                updateForm(mandi.localId, 'state', state);
                                setStateDropdownId(null);
                              }}
                              className={cn(
                                'w-full px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60',
                                mandi.state === state && 'bg-muted font-medium'
                              )}
                            >
                              {state}
                            </button>
                          ))}
                        </div>
                      )}
                      <FieldError formId={mandi.localId} field="state" />
                    </div>

                    <div className="relative">
                      <Label>Business Category</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryDropdownId(prev => (prev === mandi.localId ? null : mandi.localId));
                          setStateDropdownId(null);
                        }}
                        onBlur={() => window.setTimeout(() => {
                          setCategoryDropdownId(null);
                          touch(mandi.localId, 'categoryName');
                        }, 150)}
                        className="mt-1 flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background px-3 text-left text-sm"
                      >
                        <span className={mandi.categoryName ? 'text-foreground' : 'text-muted-foreground'}>
                          {mandi.categoryName || 'Select Business Category'}
                        </span>
                        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', categoryDropdownId === mandi.localId && 'rotate-180')} />
                      </button>
                      {categoryDropdownId === mandi.localId && (
                        <div className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-border/50 bg-card py-1 shadow-xl">
                          {categories.map(category => (
                            <button
                              key={category.category_id}
                              type="button"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => {
                                updateForm(mandi.localId, 'categoryId', category.category_id);
                                updateForm(mandi.localId, 'categoryName', category.category_name);
                                setCategoryDropdownId(null);
                              }}
                              className={cn(
                                'w-full px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60',
                                mandi.categoryId === category.category_id && 'bg-muted font-medium'
                              )}
                            >
                              {category.category_name}
                            </button>
                          ))}
                        </div>
                      )}
                      <FieldError formId={mandi.localId} field="categoryName" />
                    </div>

                    <div>
                      <Label htmlFor={`gst-${mandi.localId}`}>GST Number</Label>
                      <div className="relative mt-1">
                        <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`gst-${mandi.localId}`}
                          value={mandi.gstNumber}
                          onChange={e => updateForm(mandi.localId, 'gstNumber', e.target.value.toUpperCase().slice(0, 15))}
                          onBlur={() => touch(mandi.localId, 'gstNumber')}
                          className="h-11 rounded-xl pl-10"
                          maxLength={15}
                        />
                      </div>
                      <FieldError formId={mandi.localId} field="gstNumber" />
                    </div>

                    <div>
                      <Label htmlFor={`rmc-${mandi.localId}`}>RMC / APMC Code</Label>
                      <div className="relative mt-1">
                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`rmc-${mandi.localId}`}
                          value={mandi.rmcApmcCode}
                          onChange={e => updateForm(mandi.localId, 'rmcApmcCode', e.target.value)}
                          onBlur={() => touch(mandi.localId, 'rmcApmcCode')}
                          className="h-11 rounded-xl pl-10"
                          maxLength={50}
                        />
                      </div>
                      <FieldError formId={mandi.localId} field="rmcApmcCode" />
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor={`description-${mandi.localId}`}>Additional Info</Label>
                      <textarea
                        id={`description-${mandi.localId}`}
                        value={mandi.description}
                        onChange={e => updateForm(mandi.localId, 'description', e.target.value)}
                        onBlur={() => touch(mandi.localId, 'description')}
                        className="mt-1 min-h-[90px] w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        maxLength={500}
                      />
                      <FieldError formId={mandi.localId} field="description" />
                    </div>
                  </div>
                </section>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={addMandiForm} className="h-10 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Mandi
                </Button>
                <Button onClick={() => void submit()} disabled={submitting} className="h-10 gap-2">
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {forms.length === 1 ? 'Submit Mandi Request' : `Submit ${forms.length} Mandi Requests`}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-3">
            {loading ? <p className="p-6 text-center text-muted-foreground">Loading requests...</p> : null}
            {!loading && requests.length === 0 ? <p className="p-6 text-center text-muted-foreground">No requests yet.</p> : null}
            {requests.map(request => (
              <section key={request.id} className="rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-foreground">{request.business_name}</h3>
                    <p className="text-sm text-muted-foreground">{[request.city, request.state].filter(Boolean).join(', ') || '-'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Requested {formatDate(request.requested_at)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                {request.decision_at && <p className="mt-3 text-sm text-muted-foreground">Decision: {formatDate(request.decision_at)}</p>}
                {request.decision_reason && (
                  <div className={cn('mt-3 rounded-xl p-3 text-sm', request.status === 'REJECTED' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
                    {request.decision_reason}
                  </div>
                )}
              </section>
            ))}
          </TabsContent>

          <TabsContent value="accounts" className="space-y-3">
            {accounts.map(account => {
              const isCurrent = account.primary_mapping || account.trader_id === trader?.trader_id;
              return (
                <section key={account.trader_id} className="rounded-2xl border border-border/40 bg-card/80 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-foreground">{account.business_name}</h3>
                      <p className="text-sm text-muted-foreground">{account.owner_name}</p>
                      {accountLocation(account) && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {accountLocation(account)}
                        </p>
                      )}
                    </div>
                    {isCurrent ? (
                      <span className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                        <CheckCircle2 className="h-4 w-4" />
                        Current Account
                      </span>
                    ) : (
                      <Button onClick={() => void switchAccount(account)} disabled={!!switchingId} className="gap-2">
                        {switchingId === account.trader_id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Switch
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
      <BottomNav />
    </div>
  );
};

export default MultiTraderAccountsPage;
