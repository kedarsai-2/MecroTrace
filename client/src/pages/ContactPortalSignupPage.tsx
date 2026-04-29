import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Mail, Phone, Lock, User as UserIcon, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useContactAuth } from '@/context/ContactAuthContext';

const loginBg = '/login-bg.webp';

const ContactPortalSignupPage = () => {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useContactAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mark, setMark] = useState('');
  const [touched, setTouched] = useState({ phone: false, password: false, email: false, name: false, mark: false });

  const phoneRegex = /^[6-9]\d{9}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /** Allows letters and spaces only (no digits, punctuation, or other symbols) */
  const nameRegex = /^[A-Za-z ]+$/;
  /** Alphanumeric only (letters and numbers, no special symbols) */
  const markRegex = /^[A-Za-z0-9]+$/;

  const phoneError =
    touched.phone && !phone
      ? 'Phone number is required'
      : touched.phone && !phoneRegex.test(phone)
      ? 'Enter a valid 10-digit mobile number'
      : '';

  const passwordError =
    touched.password && !password
      ? 'Password is required'
      : touched.password && password.length < 6
      ? 'Password must be at least 6 characters'
      : '';

  const emailError =
    touched.email && email && !emailRegex.test(email) ? 'Enter a valid email address' : '';

  const nameError =
    touched.name && name && !nameRegex.test(name) ? 'Only letters and spaces allowed' : '';

  const markError =
    touched.mark && !mark
      ? 'Mark is required'
      : touched.mark && mark && !markRegex.test(mark)
      ? 'Only letters and numbers allowed (no spaces or symbols)'
      : touched.mark && mark.length > 20
      ? 'Mark must be at most 20 characters'
      : '';

  const isFormValid =
    phoneRegex.test(phone) &&
    password.length >= 6 &&
    (!email || emailRegex.test(email)) &&
    (!name || nameRegex.test(name)) &&
    !!mark.trim() &&
    mark.trim().length <= 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ phone: true, password: true, email: true, name: true, mark: true });
    if (!isFormValid) return;
    try {
      await signup({
        phone,
        password,
        email: email || undefined,
        name: name || undefined,
        mark: mark.trim(),
      });
      navigate('/contact', { replace: true });
    } catch {
      // error handled in context
    }
  };

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950" role="presentation">
      <img
        src={loginBg}
        alt=""
        role="presentation"
        className="absolute inset-0 w-full h-full object-cover z-0"
        fetchPriority="high"
        decoding="async"
        width={1920}
        height={1080}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-emerald-800/70 to-slate-900/80 z-[1]" />

      <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-y-auto overscroll-y-contain">
        <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white px-3 h-9 min-w-[44px] min-h-[44px] border border-white/30 shadow-sm transition-colors"
            aria-label="Back to login"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            <span className="text-xs font-semibold hidden sm:inline">Back to login</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="relative mb-6"
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
              <MercotraceIcon size={44} color="white" className="drop-shadow-lg" />
            </div>
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/30"
              animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              aria-hidden="true"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-6"
          >
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 drop-shadow-lg">
              Contact Registration
            </h1>
            <p className="text-white/70 text-sm sm:text-base">
              Minimal details now. Add full profile later.
            </p>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="w-full max-w-sm mb-4 p-3 rounded-xl bg-red-500/20 border border-red-400/30 backdrop-blur-sm"
            >
              <p className="text-sm text-white text-center">{error}</p>
            </motion.div>
          )}

          <motion.form
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-sm space-y-4"
            onSubmit={handleSubmit}
            aria-label="Contact portal signup form"
          >
            <div>
              <label className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1 block">
                Phone Number *
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-800/60" aria-hidden="true" />
                <Input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={e => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                    clearError();
                  }}
                  onBlur={() => setTouched(p => ({ ...p, phone: true }))}
                  className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-emerald-900 placeholder:text-emerald-400"
                  maxLength={10}
                  required
                  aria-invalid={!!phoneError}
                />
              </div>
              {phoneError && (
                <p className="text-xs text-red-200 mt-1 ml-1" role="alert">
                  {phoneError}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1 block">
                Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-800/60" aria-hidden="true" />
                <Input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  onBlur={() => setTouched(p => ({ ...p, password: true }))}
                  className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-emerald-900 placeholder:text-emerald-400"
                  required
                  aria-invalid={!!passwordError}
                />
              </div>
              {passwordError && (
                <p className="text-xs text-red-200 mt-1 ml-1" role="alert">
                  {passwordError}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1 block">
                Mark *
              </label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-800/60" aria-hidden="true" />
                <Input
                  type="text"
                  placeholder="e.g. RJ"
                  value={mark}
                  onChange={e => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
                    setMark(val);
                    clearError();
                  }}
                  onBlur={() => setTouched(p => ({ ...p, mark: true }))}
                  className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-emerald-900 placeholder:text-emerald-400"
                  maxLength={20}
                  required
                  aria-invalid={!!markError}
                />
              </div>
              {markError && (
                <p className="text-xs text-red-200 mt-1 ml-1" role="alert">
                  {markError}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1 block">
                Email (optional)
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-800/60" aria-hidden="true" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  onBlur={() => setTouched(p => ({ ...p, email: true }))}
                  className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-emerald-900 placeholder:text-emerald-400"
                  aria-invalid={!!emailError}
                />
              </div>
              {emailError && (
                <p className="text-xs text-red-200 mt-1 ml-1" role="alert">
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1 block">
                Name (optional)
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-800/60" aria-hidden="true" />
                <Input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    clearError();
                  }}
                  onBlur={() => setTouched(p => ({ ...p, name: true }))}
                  className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-emerald-900 placeholder:text-emerald-400"
                  aria-invalid={!!nameError}
                />
              </div>
              {nameError && (
                <p className="text-xs text-red-200 mt-1 ml-1" role="alert">
                  {nameError}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-semibold bg-white text-emerald-700 hover:bg-white/90 shadow-xl disabled:opacity-70"
            >
              {isLoading ? (
                <motion.div
                  className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  aria-label="Loading"
                />
              ) : (
                <>
                  Create Contact Account <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </motion.form>
        </div>
      </div>
    </div>
  );
};

export default ContactPortalSignupPage;

