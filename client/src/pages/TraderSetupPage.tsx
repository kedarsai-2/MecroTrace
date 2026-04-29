import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Loader2, ChevronDown, Store, FileText, Navigation, Hash, Sun, Moon, Save, Building, Map, AlignLeft, User, Mail, Phone, Lock, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { categoryApi, traderApi } from '@/services/api';
import type { BusinessCategory } from '@/types/models';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import loginBg from '@/assets/login-bg.jpg';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';

const STATES = ['Karnataka'];
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
/** Business name: letters, numbers, spaces, & ' . - , / */
const BUSINESS_NAME_REGEX = /^[A-Za-z0-9 &'.,\-/]+$/;
/** Owner name: letters and spaces only (no special characters) */
const NAME_REGEX = /^[A-Za-z ]+$/;
/** City: letters, numbers, spaces, hyphen, period */
const CITY_REGEX = /^[A-Za-z0-9.\- ]+$/;
/** Address: alphanumeric, spaces, comma, period, #, hyphen, slash */
const ADDRESS_REGEX = /^[A-Za-z0-9\s,.#\-/]+$/;
/** Shop number: alphanumeric, hyphen, space */
const SHOP_NO_REGEX = /^[A-Za-z0-9\- ]+$/;
/** RMC/APMC code when provided: alphanumeric, hyphen */
const RMC_APMC_REGEX = /^[A-Za-z0-9\-]+$/;
const ACCEPTED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

// Deterministic particles (same pattern as login/register)
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${10 + (i * 8.3) % 85}%`,
  top: `${5 + (i * 13.7) % 85}%`,
  delay: (i * 0.4) % 2,
}));

interface FormData {
  businessName: string;
  ownerName: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  address: string;
  city: string;
  shopNo: string;
  state: string;
  categoryId: string;
  categoryName: string;
  gstNumber: string;
  rmcApmcCode: string;
  description: string;
}

const TraderSetupPage = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { register, refreshProfile, isLoading, error, clearError } = useAuth();

  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [companyImage, setCompanyImage] = useState<File | null>(null);
  const [companyImagePreview, setCompanyImagePreview] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    businessName: '',
    ownerName: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
    address: '',
    city: '',
    shopNo: '',
    state: 'Karnataka',
    categoryId: '',
    categoryName: '',
    gstNumber: '',
    rmcApmcCode: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [initialSnapshot] = useState(() =>
    JSON.stringify({
      form: {
        businessName: '',
        ownerName: '',
        email: '',
        mobile: '',
        password: '',
        confirmPassword: '',
        address: '',
        city: '',
        shopNo: '',
        state: 'Karnataka',
        categoryId: '',
        categoryName: '',
        gstNumber: '',
        rmcApmcCode: '',
        description: '',
      },
      companyImage: false,
    }),
  );

  const isDirty =
    JSON.stringify({ form, companyImage: !!companyImage }) !== initialSnapshot;

  const { confirmIfDirty, UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isDirty && !isSubmitting,
  });

  useEffect(() => {
    categoryApi
      .list()
      .then(setCategories)
      .catch(() => {
        toast.error('Failed to load business categories');
      });
  }, []);

  const inputClass = "pl-12 h-12 sm:h-14 text-base rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400";
  const inputClassPlain = "h-12 sm:h-14 text-base rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400";

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    clearError();
    const nextForm = { ...form, [field]: value };
    if (touched[field]) {
      const err = validateField(field, nextForm);
      setErrors(prev => err ? { ...prev, [field]: err } : (() => { const n = { ...prev }; delete n[field]; return n; })());
    } else if (errors[field]) {
      setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    }
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateField(field);
  };

  const validateField = (field: string, formSnapshot?: FormData): string => {
    const f = formSnapshot ?? form;
    let error = '';
    switch (field) {
      case 'businessName':
        if (!f.businessName.trim()) error = 'Business name is required';
        else if (f.businessName.trim().length < 3) error = 'Min 3 characters';
        else if (!BUSINESS_NAME_REGEX.test(f.businessName.trim())) error = 'Only letters, numbers, spaces and  & \' . - , / allowed';
        break;
      case 'ownerName':
        if (!f.ownerName.trim()) error = 'Owner name is required';
        else if (f.ownerName.trim().length < 2) error = 'Min 2 characters';
        else if (!NAME_REGEX.test(f.ownerName.trim())) error = 'Only letters and spaces allowed (no special characters)';
        break;
      case 'email':
        if (!f.email.trim()) error = 'Email is required';
        else if (!EMAIL_REGEX.test(f.email.trim())) error = 'Enter a valid email';
        break;
      case 'mobile':
        if (!f.mobile.trim()) error = 'Mobile number is required';
        else if (!MOBILE_REGEX.test(f.mobile.trim())) error = 'Enter valid 10-digit mobile (starts 6-9)';
        break;
      case 'password':
        if (!f.password) error = 'Password is required';
        else if (f.password.length < 6) error = 'Min 6 characters';
        else if (f.confirmPassword && f.confirmPassword !== f.password) {
          setErrors(prev => ({
            ...prev,
            confirmPassword: 'Passwords do not match',
          }));
        }
        break;
      case 'confirmPassword':
        if (!f.confirmPassword) error = 'Please confirm your password';
        else if (f.confirmPassword !== f.password) error = 'Passwords do not match';
        break;
      case 'address':
        if (!f.address.trim()) error = 'Address is required';
        else if (f.address.trim().length < 5) error = 'Address too short (min 5 characters)';
        else if (!ADDRESS_REGEX.test(f.address.trim())) error = 'Only letters, numbers, spaces and , . # - / allowed';
        break;
      case 'city':
        if (!f.city.trim()) error = 'City / Market is required';
        else if (!CITY_REGEX.test(f.city.trim())) error = 'Only letters, numbers, spaces and . - allowed';
        break;
      case 'state':
        if (!f.state.trim()) error = 'State is required (mandatory for GST)';
        break;
      case 'categoryName':
        if (!f.categoryName) error = 'Select a business category';
        break;
      case 'gstNumber':
        if (f.gstNumber && !GSTIN_REGEX.test(f.gstNumber.toUpperCase())) {
          error = 'Enter valid 15-char GST (e.g., 22AAAAA0000A1Z5)';
        }
        break;
      case 'shopNo':
        if (!f.shopNo.trim()) error = 'Shop number is required';
        else if (!SHOP_NO_REGEX.test(f.shopNo.trim())) error = 'Only letters, numbers, spaces and - allowed';
        break;
      case 'rmcApmcCode':
        if (f.rmcApmcCode.trim() && !RMC_APMC_REGEX.test(f.rmcApmcCode.trim())) {
          error = 'Only letters, numbers and - allowed';
        }
        break;
    }
    setErrors(prev => error ? { ...prev, [field]: error } : (() => { const n = { ...prev }; delete n[field]; return n; })());
    return error;
  };

  const validateAll = (): boolean => {
    const fields = [
      'businessName',
      'ownerName',
      'email',
      'mobile',
      'password',
      'confirmPassword',
      'address',
      'city',
      'state',
      'categoryName',
      'gstNumber',
      'shopNo',
    ];
    let valid = true;
    fields.forEach(f => { if (validateField(f)) valid = false; });
    setTouched(fields.reduce((a, f) => ({ ...a, [f]: true }), {}));
    return valid;
  };

  const handleCompanyImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ACCEPTED_IMAGE_EXT.includes(ext)) {
      toast.error('Please use JPEG, PNG, or WebP');
      return;
    }
    if (companyImagePreview) URL.revokeObjectURL(companyImagePreview);
    setCompanyImage(file);
    setCompanyImagePreview(URL.createObjectURL(file));
  }, [companyImagePreview]);

  const clearCompanyImage = useCallback(() => {
    if (companyImagePreview) URL.revokeObjectURL(companyImagePreview);
    setCompanyImage(null);
    setCompanyImagePreview(null);
  }, [companyImagePreview]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    setIsFetchingLocation(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`);
      if (!res.ok) throw new Error('Location fetch failure');
      const data = await res.json();
      updateField('address', data.display_name || `${latitude}, ${longitude}`);
      toast.success('Location fetched successfully');
    } catch (err: any) {
      if (err?.code === 1) toast.error('Location permission denied');
      else if (err?.code === 3) toast.error('Location request timed out');
      else toast.error('Could not fetch location. Enter manually.');
    } finally { setIsFetchingLocation(false); }
  }, []);

  const handleSubmit = async () => {
    if (!validateAll()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await register({
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        password: form.password,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        categoryName: form.categoryName,
        gstNumber: form.gstNumber.trim() || undefined,
        rmcApmcCode: form.rmcApmcCode.trim() || undefined,
      });
      if (companyImage && result?.trader?.trader_id) {
        try {
          await traderApi.uploadPhotos(result.trader.trader_id, [companyImage]);
          await refreshProfile();
        } catch (upErr) {
          toast.error('Profile saved but image upload failed. You can add it later.');
        }
      }
      toast.success('Trader profile saved successfully!');
      navigate('/home', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save profile. Please try again.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const FieldError = ({ field }: { field: string }) => {
    if (!touched[field] || !errors[field]) return null;
    return <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-200 mt-1 ml-1" role="alert">{errors[field]}</motion.p>;
  };

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950">
      <UnsavedChangesDialog />
      {/* Background — identical to login/register */}
      <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover z-0" fetchPriority="high" decoding="async" width={1920} height={1080} />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/75 via-blue-800/65 to-violet-900/75 z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)] z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)] z-[1]" />

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]" aria-hidden="true">
        {PARTICLES.map(p => (
          <motion.div key={p.id} className="absolute w-1.5 h-1.5 bg-white/25 rounded-full"
            style={{ left: p.left, top: p.top }}
            animate={{ y: [-15, 15], opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, delay: p.delay }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            onClick={() => {
              void (async () => {
                const ok = await confirmIfDirty();
                if (!ok) return;
                navigate('/login');
              })();
            }}
            className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button onClick={toggleTheme} className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20" aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 flex min-h-0 flex-col items-center overflow-y-auto overscroll-y-contain px-6 py-4 no-scrollbar">
          {/* Logo */}
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }} className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
              <MercotraceIcon size={32} color="white" className="drop-shadow-lg" />
            </div>
          </motion.div>

          <h1 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">Trader Setup</h1>
          <p className="text-white/70 text-sm mb-5">
            Create your Mercotrace account and set up your business profile
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-4xl mb-4 p-3 rounded-xl bg-red-500/20 border border-red-400/30"
              role="alert"
            >
              <p className="text-sm text-white text-center">{error}</p>
            </motion.div>
          )}

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full max-w-4xl pb-28"
          >
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-4 sm:p-6 lg:p-8 shadow-2xl">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
                {/* Left column — Business, owner, credentials */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider pt-1 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5" /> Business &amp; Owner
                  </p>

                  {/* Business Name */}
                  <div>
                    <div className="relative">
                      <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        placeholder="Business Name *"
                        value={form.businessName}
                        onChange={e => updateField('businessName', e.target.value)}
                        onBlur={() => handleBlur('businessName')}
                        className={cn(
                          inputClass,
                          touched.businessName && errors.businessName && 'ring-2 ring-red-400/50'
                        )}
                        maxLength={100}
                      />
                    </div>
                    <FieldError field="businessName" />
                  </div>

                  {/* Owner Name */}
                  <div>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        placeholder="Owner Name *"
                        value={form.ownerName}
                        onChange={e => updateField('ownerName', e.target.value)}
                        onBlur={() => handleBlur('ownerName')}
                        className={cn(
                          inputClass,
                          touched.ownerName && errors.ownerName && 'ring-2 ring-red-400/50'
                        )}
                        maxLength={100}
                      />
                    </div>
                    <FieldError field="ownerName" />
                  </div>

                  {/* Email */}
                  <div>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        type="email"
                        placeholder="Email Address *"
                        value={form.email}
                        onChange={e => updateField('email', e.target.value)}
                        onBlur={() => handleBlur('email')}
                        className={cn(
                          inputClass,
                          touched.email && errors.email && 'ring-2 ring-red-400/50'
                        )}
                      />
                    </div>
                    <FieldError field="email" />
                  </div>

                  {/* Mobile */}
                  <div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        type="tel"
                        placeholder="Mobile Number *"
                        value={form.mobile}
                        onChange={e =>
                          updateField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))
                        }
                        onBlur={() => handleBlur('mobile')}
                        className={cn(
                          inputClass,
                          touched.mobile && errors.mobile && 'ring-2 ring-red-400/50'
                        )}
                        maxLength={10}
                      />
                    </div>
                    <FieldError field="mobile" />
                  </div>

                  {/* Password */}
                  <div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        type="password"
                        placeholder="Create Password (min 6 chars) *"
                        value={form.password}
                        onChange={e => updateField('password', e.target.value)}
                        onBlur={() => handleBlur('password')}
                        className={cn(
                          inputClass,
                          touched.password && errors.password && 'ring-2 ring-red-400/50'
                        )}
                      />
                    </div>
                    <FieldError field="password" />
                  </div>

                    {/* Confirm Password */}
                    <div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                        <Input
                          type="password"
                          placeholder="Confirm Password *"
                          value={form.confirmPassword}
                          onChange={e => updateField('confirmPassword', e.target.value)}
                          onBlur={() => handleBlur('confirmPassword')}
                          className={cn(
                            inputClass,
                            touched.confirmPassword && errors.confirmPassword && 'ring-2 ring-red-400/50'
                          )}
                        />
                      </div>
                      <FieldError field="confirmPassword" />
                    </div>

                  {/* Shop No */}
                  <div>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        placeholder="Shop No *"
                        value={form.shopNo}
                        onChange={e => updateField('shopNo', e.target.value)}
                        onBlur={() => handleBlur('shopNo')}
                        className={cn(
                          inputClass,
                          touched.shopNo && errors.shopNo && 'ring-2 ring-red-400/50'
                        )}
                        maxLength={20}
                      />
                    </div>
                    <FieldError field="shopNo" />
                  </div>
                </div>

                {/* Right column — Address, location, category, tax, extras */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider pt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Address &amp; Location
                  </p>

                  {/* Address */}
                  <div>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                      <Input
                        placeholder="Search or enter address *"
                        value={form.address}
                        onChange={e => updateField('address', e.target.value)}
                        onBlur={() => handleBlur('address')}
                        className={cn(
                          inputClass,
                          touched.address && errors.address && 'ring-2 ring-red-400/50'
                        )}
                      />
                    </div>
                    <FieldError field="address" />
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isFetchingLocation}
                      className="mt-1.5 flex items-center gap-2 text-xs sm:text-sm text-white/80 font-medium hover:text-white transition-colors min-h-[44px] px-1"
                    >
                      {isFetchingLocation ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Navigation className="w-4 h-4" />
                      )}
                      {isFetchingLocation
                        ? 'Fetching location...'
                        : '📍 Use my current location as address'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* City / Market */}
                    <div>
                      <div className="relative">
                        <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                        <Input
                          placeholder="City / Market *"
                          value={form.city}
                          onChange={e => updateField('city', e.target.value)}
                          onBlur={() => handleBlur('city')}
                          className={cn(
                            inputClass,
                            touched.city && errors.city && 'ring-2 ring-red-400/50'
                          )}
                          maxLength={100}
                        />
                      </div>
                      <FieldError field="city" />
                    </div>

                    {/* State Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowStateDropdown(!showStateDropdown);
                          setShowCategoryDropdown(false);
                        }}
                        onBlur={() =>
                          setTimeout(() => {
                            setShowStateDropdown(false);
                            handleBlur('state');
                          }, 150)
                        }
                        className={cn(
                          'w-full h-12 sm:h-14 px-4 rounded-xl bg-white/90 text-sm flex items-center justify-between text-blue-900',
                          touched.state && errors.state && 'ring-2 ring-red-400/50'
                        )}
                      >
                        <span>{form.state || 'Select State *'}</span>
                        <ChevronDown
                          className={cn(
                            'w-4 h-4 text-blue-800/50 transition-transform',
                            showStateDropdown && 'rotate-180'
                          )}
                        />
                      </button>
                      {showStateDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute z-50 top-full mt-2 w-full rounded-2xl py-2 bg-white/95 backdrop-blur-xl shadow-xl border border-white/50"
                        >
                          {STATES.map(s => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                updateField('state', s);
                                setShowStateDropdown(false);
                              }}
                              className={cn(
                                'w-full text-left px-4 py-2.5 text-sm text-blue-900 hover:bg-blue-50 transition-colors',
                                form.state === s && 'bg-blue-50 font-medium'
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </motion.div>
                      )}
                      <FieldError field="state" />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                    {/* Category dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCategoryDropdown(!showCategoryDropdown);
                          setShowStateDropdown(false);
                        }}
                        onBlur={() =>
                          setTimeout(() => {
                            setShowCategoryDropdown(false);
                            handleBlur('categoryName');
                          }, 150)
                        }
                        className={cn(
                          'w-full h-12 sm:h-14 px-4 rounded-xl bg-white/90 text-sm flex items-center justify-between',
                          form.categoryName ? 'text-blue-900' : 'text-blue-400',
                          touched.categoryName && errors.categoryName && 'ring-2 ring-red-400/50'
                        )}
                      >
                        <span>{form.categoryName || 'Select Business Category *'}</span>
                        <ChevronDown
                          className={cn(
                            'w-4 h-4 text-blue-800/50 transition-transform',
                            showCategoryDropdown && 'rotate-180'
                          )}
                        />
                      </button>
                      {showCategoryDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute z-50 top-full mt-2 w-full rounded-2xl py-2 max-h-48 overflow-auto bg-white/95 backdrop-blur-xl shadow-xl border border-white/50"
                        >
                          {categories.map(cat => (
                            <button
                              key={cat.category_id}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                updateField('categoryId', cat.category_id);
                                updateField('categoryName', cat.category_name);
                                setShowCategoryDropdown(false);
                              }}
                              className={cn(
                                'w-full text-left px-4 py-2.5 text-sm text-blue-900 hover:bg-blue-50 transition-colors',
                                form.categoryId === cat.category_id && 'bg-blue-50 font-medium'
                              )}
                            >
                              {cat.category_name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                      <FieldError field="categoryName" />
                    </div>
                  </div>

                  {/* Tax / registration */}
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider pt-3 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Tax &amp; Registration
                  </p>

                  {/* GST + RMC */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* GST */}
                    <div>
                      <div className="relative">
                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                        <Input
                          placeholder="GST Number (optional)"
                          value={form.gstNumber}
                          onChange={e =>
                            updateField('gstNumber', e.target.value.toUpperCase().slice(0, 15))
                          }
                          onBlur={() => handleBlur('gstNumber')}
                          className={cn(
                            inputClass,
                            touched.gstNumber && errors.gstNumber && 'ring-2 ring-red-400/50'
                          )}
                          maxLength={15}
                        />
                      </div>
                      <FieldError field="gstNumber" />
                    </div>

                    {/* RMC / APMC */}
                    <div>
                      <div className="relative">
                        <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                        <Input
                          placeholder="RMC / APMC Code (optional)"
                          value={form.rmcApmcCode}
                          onChange={e => updateField('rmcApmcCode', e.target.value)}
                          onBlur={() => handleBlur('rmcApmcCode')}
                          className={cn(
                            inputClass,
                            touched.rmcApmcCode && errors.rmcApmcCode && 'ring-2 ring-red-400/50'
                          )}
                          maxLength={50}
                        />
                      </div>
                      <FieldError field="rmcApmcCode" />
                    </div>
                  </div>

                  {/* Trading Company Image */}
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider pt-3 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" /> Company Logo (optional)
                  </p>
                  <div className="flex items-center gap-4">
                    <label className="flex-shrink-0 w-24 h-24 rounded-xl bg-white/90 border-2 border-dashed border-blue-300 flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue-500 transition-colors">
                      <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleCompanyImageChange} />
                      {companyImagePreview ? (
                        <img src={companyImagePreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-blue-400" />
                      )}
                    </label>
                    <div className="flex-1">
                      <p className="text-sm text-white/80">JPEG, PNG or WebP.</p>
                      {companyImage && (
                        <button type="button" onClick={clearCompanyImage} className="mt-1 flex items-center gap-1 text-xs text-red-200 hover:text-red-100">
                          <X className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider pt-3 flex items-center gap-1.5">
                    <AlignLeft className="w-3.5 h-3.5" /> Additional Info
                  </p>

                  <textarea
                    placeholder="Tell us about your shop... (optional)"
                    value={form.description}
                    onChange={e => updateField('description', e.target.value)}
                    className="w-full min-h-[90px] px-4 py-3 rounded-xl bg-white/90 border-0 text-sm text-blue-900 placeholder:text-blue-400 resize-none focus:outline-none focus:ring-2 focus:ring-white/50"
                    maxLength={500}
                  />
                </div>
              </div>

              {/* Submit button */}
              <div className="mt-6">
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || isLoading}
                  className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-semibold bg-white text-blue-600 hover:bg-white/90 shadow-xl disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <motion.div
                      className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  ) : (
                    <>
                      <Save className="w-5 h-5 mr-2" /> Create Account &amp; Continue
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default TraderSetupPage;
