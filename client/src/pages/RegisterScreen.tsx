import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Eye, EyeOff, User, Mail, Phone, MapPin, Building, Lock, Sun, Moon, ChevronDown, Camera, FileText, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { categoryApi } from '@/services/api';
import type { BusinessCategory } from '@/types/models';
import { cn } from '@/lib/utils';
import loginBg from '@/assets/login-bg.jpg';

const RegisterScreen = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { register, isLoading, error, clearError } = useAuth();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    email: '',
    mobile: '',
    password: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    categoryId: '',
    categoryName: '',
    gstNumber: '',
    rmcApmcCode: '',
  });

  useEffect(() => {
    categoryApi.list().then(setCategories);
  }, []);

  const update = (field: string, value: string) => {
    setForm(p => ({ ...p, [field]: value }));
    clearError();
  };

  const touch = (field: string) => setTouched(p => ({ ...p, [field]: true }));

  // Validation helpers
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobileRegex = /^[6-9]\d{9}$/;
  const pinRegex = /^\d{6}$/;
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  /** Allows letters and spaces only (no digits, punctuation, or other symbols) */
  const nameRegex = /^[A-Za-z ]+$/;

  const validate = (field: string): string => {
    const v = form[field as keyof typeof form];
    if (!touched[field]) return '';
    switch (field) {
      case 'businessName': return !v ? 'Business name is required' : v.length < 3 ? 'Min 3 characters' : !nameRegex.test(v) ? 'Only letters and spaces allowed' : '';
      case 'ownerName': return !v ? 'Owner name is required' : v.length < 2 ? 'Min 2 characters' : !nameRegex.test(v) ? 'Only letters and spaces allowed' : '';
      case 'email': return !v ? 'Email is required' : !emailRegex.test(v) ? 'Enter a valid email' : '';
      case 'mobile': return !v ? 'Mobile number is required' : !mobileRegex.test(v) ? 'Enter valid 10-digit mobile (starts 6-9)' : '';
      case 'password': return !v ? 'Password is required' : v.length < 6 ? 'Min 6 characters' : '';
      case 'address': return !v ? 'Address is required' : '';
      case 'city': return !v ? 'City is required' : '';
      case 'state': return !v ? 'State is required (mandatory for GST)' : '';
      case 'pinCode': return !v ? 'PIN code is required' : !pinRegex.test(v) ? 'Enter valid 6-digit PIN' : '';
      case 'categoryName': return !v ? 'Select a business category' : '';
      case 'gstNumber': return v && !gstRegex.test(v) ? 'Enter valid 15-char GST (e.g., 22AAAAA0000A1Z5)' : '';
      default: return '';
    }
  };

  const step1Valid = form.businessName.length >= 3 && nameRegex.test(form.businessName) && form.ownerName.length >= 2 && nameRegex.test(form.ownerName) && emailRegex.test(form.email) && mobileRegex.test(form.mobile) && form.password.length >= 6;
  const step2Valid = !!form.address && !!form.city && !!form.state && pinRegex.test(form.pinCode) && !!form.categoryName;

  const handleNext = () => {
    setTouched({ businessName: true, ownerName: true, email: true, mobile: true, password: true });
    if (step1Valid) setStep(2);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photoFiles.length + files.length > 4) return;
    const newFiles = [...photoFiles, ...files].slice(0, 4);
    setPhotoFiles(newFiles);
    const previews = newFiles.map(f => URL.createObjectURL(f));
    setPhotoPreviews(previews);
  };

  const removePhoto = (idx: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) { handleNext(); return; }
    setTouched(p => ({ ...p, address: true, city: true, state: true, pinCode: true, categoryName: true }));
    if (!step2Valid) return;
    if (isLoading || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await register({ ...form, shopPhotos: photoPreviews });
      navigate('/home', { replace: true });
    } catch {
      // error shown via AuthContext error state
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "pl-12 h-12 sm:h-14 text-base rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400";

  const FieldError = ({ field }: { field: string }) => {
    const err = validate(field);
    return err ? <p className="text-xs text-red-200 mt-1 ml-1">{err}</p> : null;
  };

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950">
      <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/75 via-blue-800/65 to-violet-900/75 z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)] z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)] z-[1]" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
        {[...Array(10)].map((_, i) => (
          <motion.div key={i} className="absolute w-2 h-2 bg-white/30 rounded-full"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ y: [-20, 20], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            onClick={() => step > 1 ? setStep(1) : navigate('/login')}
            className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button onClick={toggleTheme} className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex-1 flex min-h-0 flex-col items-center overflow-y-auto overscroll-y-contain px-6 py-4 no-scrollbar">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }} className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
              <MercotraceIcon size={32} color="white" className="drop-shadow-lg" />
            </div>
          </motion.div>

          <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">Register Shop</h2>
          <p className="text-white/60 text-xs mb-1">Listing Only — Awaiting Approval</p>
          <p className="text-white/70 text-sm mb-2">Step {step} of 2 — {step === 1 ? 'Business Info' : 'Address, Category & Documents'}</p>

          <div className="flex gap-2 mb-5">
            {[1, 2].map(s => (
              <div key={s} className={cn('h-1.5 rounded-full transition-all', s === step ? 'w-8 bg-white' : 'w-4 bg-white/40')} />
            ))}
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm mb-3 p-3 rounded-xl bg-red-500/20 border border-red-400/30">
              <p className="text-sm text-white text-center">{error}</p>
            </motion.div>
          )}

          <motion.form key={step} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-sm space-y-3" onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                <div>
                  <div className="relative">
                    <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input placeholder="Business Name" value={form.businessName} onChange={e => update('businessName', e.target.value)} onBlur={() => touch('businessName')} className={inputClass} required />
                  </div>
                  <FieldError field="businessName" />
                </div>
                <div>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input placeholder="Owner Name" value={form.ownerName} onChange={e => update('ownerName', e.target.value)} onBlur={() => touch('ownerName')} className={inputClass} required />
                  </div>
                  <FieldError field="ownerName" />
                </div>
                <div>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input type="email" placeholder="Email Address" value={form.email} onChange={e => update('email', e.target.value)} onBlur={() => touch('email')} className={inputClass} required />
                  </div>
                  <FieldError field="email" />
                </div>
                <div>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input type="tel" placeholder="Mobile Number" value={form.mobile} onChange={e => update('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} onBlur={() => touch('mobile')} className={inputClass} maxLength={10} required />
                  </div>
                  <FieldError field="mobile" />
                </div>
                <div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create Password (min 6 chars)"
                      value={form.password}
                      onChange={e => update('password', e.target.value)}
                      onBlur={() => touch('password')}
                      className="pl-12 pr-12 h-12 sm:h-14 text-base rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-800/50">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <FieldError field="password" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input placeholder="Address" value={form.address} onChange={e => update('address', e.target.value)} onBlur={() => touch('address')} className={inputClass} required />
                  </div>
                  <FieldError field="address" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input placeholder="City" value={form.city} onChange={e => update('city', e.target.value)} onBlur={() => touch('city')} className="h-12 rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400" required />
                    <FieldError field="city" />
                  </div>
                  <div>
                    <Input placeholder="State *" value={form.state} onChange={e => update('state', e.target.value)} onBlur={() => touch('state')} className="h-12 rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400" required />
                    <FieldError field="state" />
                  </div>
                </div>
                <div>
                  <Input placeholder="PIN Code" value={form.pinCode} onChange={e => update('pinCode', e.target.value.replace(/\D/g, '').slice(0, 6))} onBlur={() => touch('pinCode')} className="h-12 rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400" maxLength={6} required />
                  <FieldError field="pinCode" />
                </div>

                {/* Category dropdown — from Master List (REQ-ONB-003) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowDropdown(!showDropdown)}
                    onBlur={() => touch('categoryName')}
                    className="w-full h-12 px-4 rounded-xl bg-white/90 text-sm flex items-center justify-between"
                  >
                    <span className={form.categoryName ? 'text-blue-900' : 'text-blue-400'}>{form.categoryName || 'Select Business Category'}</span>
                    <ChevronDown className={cn('w-4 h-4 text-blue-800/50 transition-transform', showDropdown && 'rotate-180')} />
                  </button>
                  {showDropdown && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="absolute z-50 top-full mt-2 w-full rounded-2xl py-2 max-h-48 overflow-auto bg-white/95 backdrop-blur-xl shadow-xl border border-white/50">
                      {categories.map(cat => (
                        <button
                          key={cat.category_id}
                          type="button"
                          onClick={() => { update('categoryId', cat.category_id); update('categoryName', cat.category_name); setShowDropdown(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-blue-900 hover:bg-blue-50 transition-colors"
                        >
                          {cat.category_name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                  <FieldError field="categoryName" />
                </div>

                {/* GST Number (SRS Page 6) */}
                <div>
                  <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input
                      placeholder="GST Number (optional)"
                      value={form.gstNumber}
                      onChange={e => update('gstNumber', e.target.value.toUpperCase().slice(0, 15))}
                      onBlur={() => touch('gstNumber')}
                      className={inputClass}
                      maxLength={15}
                    />
                  </div>
                  <FieldError field="gstNumber" />
                </div>

                {/* RMC / APMC Code (SRS Page 6) */}
                <div>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                    <Input
                      placeholder="RMC / APMC Code (optional)"
                      value={form.rmcApmcCode}
                      onChange={e => update('rmcApmcCode', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Photos — Shop/Farm upload slots (SRS Page 6) */}
                <div>
                  <label className="text-xs text-white/80 font-medium mb-2 block">Shop / Farm Photos (up to 4)</label>
                  <div className="flex gap-2 flex-wrap">
                    {photoPreviews.map((src, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-white/30">
                        <img src={src} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removePhoto(idx)} className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-bl-lg flex items-center justify-center">✕</button>
                      </div>
                    ))}
                    {photoFiles.length < 4 && (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-16 h-16 rounded-xl border-2 border-dashed border-white/40 flex items-center justify-center text-white/60 hover:bg-white/10 transition-colors"
                      >
                        <Camera className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                </div>
              </>
            )}

            <Button
              type="submit"
              disabled={(isLoading || isSubmitting) || (step === 1 ? !step1Valid : !step2Valid)}
              className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-semibold bg-white text-blue-600 hover:bg-white/90 shadow-xl disabled:opacity-70"
            >
              {(isLoading || isSubmitting) ? (
                <motion.div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
              ) : (
                <>
                  {step === 1 ? 'Next' : 'Register Shop'}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </motion.form>
        </div>

        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center shrink-0">
          <p className="text-sm text-white/70">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-white font-semibold underline">Sign In</button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterScreen;
