import { useEffect, useState } from 'react';
import { scrollLoginFieldIntoView, useLoginScreenScrollAssist } from '@/hooks/useLoginScrollIntoView';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Mail, Lock, Sun, Moon, Building2, Phone, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useContactAuth } from '@/context/ContactAuthContext';
import { authApi } from '@/services/api';
import { contactPortalAuthApi, type ContactOtpVerifyResult } from '@/services/api/contactPortalAuth';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const loginBg = '/login-bg.webp';

// Pre-compute particle positions to avoid re-render jitter
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${10 + (i * 8.3) % 85}%`,
  top: `${5 + (i * 13.7) % 85}%`,
  delay: (i * 0.4) % 2,
}));

type LoginMode = 'phone' | 'email';
type LoginAudience = 'trader' | 'contact';

const LoginScreen = () => {
  const navigate = useNavigate();
  const [audience, setAudience] = useState<LoginAudience>('trader');
  const [loginMode, setLoginMode] = useState<LoginMode>('phone');

  // Shared phone + OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Shared email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { isDark, toggleTheme } = useTheme();
  const { login, loginWithOtp, isLoading: traderLoading, error: traderError, clearError: clearTraderError } = useAuth();
  const {
    login: contactLogin,
    loginWithProfile,
    loginAsGuest,
    isLoading: contactLoading,
    error: contactError,
    clearError: clearContactError,
  } = useContactAuth();

  const [touched, setTouched] = useState({ email: false, password: false, phone: false });
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestResult, setGuestResult] = useState<ContactOtpVerifyResult | null>(null);

  const isLoading = audience === 'trader' ? traderLoading : contactLoading;
  const error = audience === 'trader' ? traderError : contactError;
  const clearError = audience === 'trader' ? clearTraderError : clearContactError;

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailError = touched.email && !emailRegex.test(email) ? (email ? 'Enter a valid email address' : 'Email is required') : '';
  const passwordError = touched.password && !password ? 'Password is required' : touched.password && password.length < 6 ? 'Password must be at least 6 characters' : '';
  const isEmailValid = emailRegex.test(email) && password.length >= 6;

  // Phone validation
  const phoneRegex = /^[6-9]\d{9}$/;
  const phoneError = touched.phone && !phoneRegex.test(phone) ? (phone ? 'Enter a valid 10-digit mobile number' : 'Phone number is required') : '';
  const isPhoneValid = phoneRegex.test(phone);

  const handleSendOtp = async () => {
    setTouched(p => ({ ...p, phone: true }));
    if (!isPhoneValid || isSendingOtp || otpCooldown > 0) return;
    setIsSendingOtp(true);
    clearError();
    try {
      if (audience === 'trader') {
        await authApi.requestOtp(phone);
      } else {
        await contactPortalAuthApi.requestOtp(phone);
      }
      setOtpSent(true);
      setOtpCooldown(30);
      toast.success('OTP sent', { description: 'Please check your phone for the 4-digit OTP.' });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 4) return;
    clearError();
    if (audience === 'trader') {
      try {
        await loginWithOtp(phone, otp);
        navigate('/home', { replace: true });
      } catch (e: any) {
        toast.error(e?.message || 'Invalid or expired OTP.');
      }
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const result = await contactPortalAuthApi.verifyOtp(phone, otp);
      if (result.guest) {
        setGuestResult(result);
        setGuestDialogOpen(true);
      } else if (result.profile) {
        loginWithProfile(result.profile);
        navigate('/contact', { replace: true });
      } else {
        toast.error('We could not complete sign-in. Please try again.');
      }
    } catch (e: any) {
      toast.error(
        e?.message ||
          'The OTP you entered is invalid or has expired. Please request a new one.',
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleGuestLogin = () => {
    if (!guestResult) return;
    loginAsGuest(guestResult.phone);
    setGuestDialogOpen(false);
    navigate('/contact', { replace: true });
  };

  const handleContinueToSignup = () => {
    if (!guestResult) return;
    setGuestDialogOpen(false);
    navigate('/contact-registartion', { replace: false });
  };

  useEffect(() => {
    if (otpCooldown <= 0) return;

    const intervalId = window.setInterval(() => {
      setOtpCooldown(prev => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [otpCooldown]);

  useLoginScreenScrollAssist(loginMode, 'login-phone', 'login-email');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, phone: false });
    if (!isEmailValid) return;
    clearError();
    try {
      if (audience === 'trader') {
        await login(email, password);
        navigate('/home', { replace: true });
      } else {
        await contactLogin(email, password);
        navigate('/contact', { replace: true });
      }
    } catch (e: any) {
      const msg = e?.message || 'Login failed. Please try again.';
      toast.error(msg);
      // error is also set in respective context for inline display
    }
  };

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950" role="presentation">
      {/* Background image */}
      <img src={loginBg} alt="" role="presentation" className="absolute inset-0 w-full h-full object-cover z-0" fetchPriority="high" decoding="async" width={1920} height={1080} />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-blue-800/60 to-violet-900/70 z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(91,140,255,0.25)_0%,transparent_50%)] z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(123,97,255,0.3)_0%,transparent_40%)] z-[1]" />

      {/* Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]" aria-hidden="true">
        {PARTICLES.map((p) => (
          <motion.div key={p.id} className="absolute w-1.5 h-1.5 bg-white/25 rounded-full"
            style={{ left: p.left, top: p.top }}
            animate={{ y: [-15, 15], opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, delay: p.delay }} />
        ))}
      </div>

      {/* Content layer */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left side — Branding (desktop only) */}
        <div className="hidden lg:flex lg:w-[55%] items-end p-12">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                <MercotraceIcon size={32} color="white" className="drop-shadow-lg" />
              </div>
              <span className="text-3xl font-extrabold text-white tracking-tight drop-shadow-lg">Mercotrace</span>
            </div>
            <h1 className="text-4xl font-bold text-white leading-tight drop-shadow-lg mb-3">
              Smart Commodity<br />Trading Platform
            </h1>
            <p className="text-white/70 text-lg max-w-md">
              Digitize your mandi operations — arrivals, auctions, billing & settlements in one place.
            </p>
          </motion.div>
        </div>

        {/* Right side — Login form */}
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto overscroll-y-contain">
          {/* Theme Toggle */}
          <div className="flex justify-end px-5 pt-[max(1rem,env(safe-area-inset-top))]">
            <button onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-all duration-300 border border-white/20">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6">
            {/* Logo */}
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }} className="relative mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
                <MercotraceIcon size={44} color="white" className="drop-shadow-lg" />
              </div>
              <motion.div className="absolute inset-0 rounded-2xl border-2 border-white/30" animate={{ scale: [1, 1.2], opacity: [0.5, 0] }} transition={{ duration: 1.5, repeat: Infinity }} aria-hidden="true" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-center mb-6">
              <h1 className="lg:hidden text-2xl sm:text-3xl font-bold text-white mb-1 drop-shadow-lg">Welcome Back</h1>
              <h2 className="hidden lg:block text-2xl sm:text-3xl font-bold text-white mb-1 drop-shadow-lg">Welcome Back</h2>
              <p className="text-white/70 text-sm sm:text-base">
                {audience === 'trader'
                  ? 'Sign in as Trader or Trader Staff'
                  : 'Sign in as Contact (Seller / Buyer / Broker / Agent)'}
              </p>
            </motion.div>

            {/* Audience Toggle */}
            <div className="w-full max-w-sm flex gap-1 mb-3 bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/15">
              <button
                type="button"
                onClick={() => {
                  setAudience('trader');
                  setOtpSent(false);
                  setOtp('');
                  clearContactError();
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  audience === 'trader' ? 'bg-white text-blue-600 shadow-md' : 'text-white/70 hover:text-white'
                }`}
              >
                <Building2 className="w-4 h-4" /> Trader / Staff
              </button>
              <button
                type="button"
                onClick={() => {
                  setAudience('contact');
                  setOtpSent(false);
                  setOtp('');
                  clearTraderError();
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  audience === 'contact' ? 'bg-white text-blue-600 shadow-md' : 'text-white/70 hover:text-white'
                }`}
              >
                <Phone className="w-4 h-4" /> Contact / Guest
              </button>
            </div>

            {/* Login Mode Toggle */}
            <div className="w-full max-w-sm flex gap-1 mb-4 bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/15">
              <button onClick={() => { setLoginMode('phone'); clearError(); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${loginMode === 'phone' ? 'bg-white text-blue-600 shadow-md' : 'text-white/70 hover:text-white'}`}>
                <Phone className="w-4 h-4" /> Phone + OTP
              </button>
              <button onClick={() => { setLoginMode('email'); clearError(); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${loginMode === 'email' ? 'bg-white text-blue-600 shadow-md' : 'text-white/70 hover:text-white'}`}>
                <Mail className="w-4 h-4" /> Email
              </button>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} role="alert" className="w-full max-w-sm mb-4 p-3 rounded-xl bg-red-500/20 border border-red-400/30 backdrop-blur-sm">
                <p className="text-sm text-white text-center">{error}</p>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {loginMode === 'phone' ? (
                <motion.div key="phone" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  className="w-full max-w-sm space-y-4">
                  <div>
                    <label htmlFor="login-phone" className="sr-only">Phone number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" aria-hidden="true" />
                      <Input id="login-phone" type="tel" placeholder="Enter 10-digit mobile number"
                        value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); clearError(); }}
                        onFocus={(e) => scrollLoginFieldIntoView(e.currentTarget)}
                        onBlur={() => setTouched(p => ({ ...p, phone: true }))}
                        className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400"
                        maxLength={10} disabled={otpSent} />
                    </div>
                    {phoneError && <p className="text-xs text-red-200 mt-1 ml-1" role="alert">{phoneError}</p>}
                  </div>

                  {otpSent && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <label htmlFor="login-otp" className="sr-only">OTP</label>
                      <div className="relative">
                        <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" aria-hidden="true" />
                        <Input id="login-otp" type="text" placeholder="Enter 4-digit OTP"
                          value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          onFocus={(e) => scrollLoginFieldIntoView(e.currentTarget)}
                          className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400 tracking-[0.5em] text-center font-bold"
                          maxLength={4} autoFocus />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSendingOtp || otpCooldown > 0}
                        className="text-xs text-white/70 underline mt-2 ml-1 min-h-[44px] flex items-center disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        {otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : 'Resend OTP'}
                      </button>
                    </motion.div>
                  )}

                  {!otpSent ? (
                    <Button
                      onClick={handleSendOtp}
                      disabled={!isPhoneValid || isSendingOtp || otpCooldown > 0 || isLoading}
                      className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-semibold bg-white text-blue-600 hover:bg-white/90 shadow-xl disabled:opacity-70"
                    >
                      {isSendingOtp ? (
                        <motion.div
                          className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                      ) : otpCooldown > 0 ? (
                        <>Resend OTP in {otpCooldown}s</>
                      ) : (
                        <>
                          Send OTP <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button onClick={handleVerifyOtp} disabled={otp.length !== 4 || isLoading || isVerifyingOtp}
                      className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-semibold bg-white text-blue-600 hover:bg-white/90 shadow-xl disabled:opacity-70">
                      {isLoading || isVerifyingOtp ? (
                        <motion.div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} aria-label="Loading" />
                      ) : (
                        <>Verify &amp; Sign In <ArrowRight className="w-5 h-5 ml-2" /></>
                      )}
                    </Button>
                  )}
                </motion.div>
              ) : (
                <motion.form key="email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="w-full max-w-sm space-y-4" onSubmit={handleEmailLogin} aria-label="Sign in form">
                  <div>
                    <label htmlFor="login-email" className="sr-only">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" aria-hidden="true" />
                      <Input id="login-email" type="email" placeholder="Email address" autoComplete="email"
                        value={email} onChange={e => { setEmail(e.target.value); clearError(); }}
                        onFocus={(e) => scrollLoginFieldIntoView(e.currentTarget)}
                        onBlur={() => setTouched(p => ({ ...p, email: true }))}
                        className="pl-12 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400"
                        required aria-invalid={!!emailError} />
                    </div>
                    {emailError && <p className="text-xs text-red-200 mt-1 ml-1" role="alert">{emailError}</p>}
                  </div>
                  <div>
                    <label htmlFor="login-password" className="sr-only">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" aria-hidden="true" />
                      <Input id="login-password" type={showPassword ? 'text' : 'password'} placeholder="Password" autoComplete="current-password"
                        value={password} onChange={e => { setPassword(e.target.value); clearError(); }}
                        onFocus={(e) => scrollLoginFieldIntoView(e.currentTarget)}
                        onBlur={() => setTouched(p => ({ ...p, password: true }))}
                        className="pl-12 pr-14 h-12 sm:h-14 text-base sm:text-lg rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400"
                        required aria-invalid={!!passwordError} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-blue-800/50 rounded-lg">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {passwordError && <p className="text-xs text-red-200 mt-1 ml-1" role="alert">{passwordError}</p>}
                  </div>
                  <div className="flex justify-end">
                    <button type="button" className="text-sm text-white font-medium underline min-h-[44px] flex items-center">Forgot password?</button>
                  </div>
                  <Button type="submit" disabled={isLoading || !isEmailValid}
                    className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-semibold bg-white text-blue-600 hover:bg-white/90 shadow-xl disabled:opacity-70">
                    {isLoading ? (
                      <motion.div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} aria-label="Loading" />
                    ) : (
                      <>Sign In <ArrowRight className="w-5 h-5 ml-2" /></>
                    )}
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center shrink-0 space-y-3">
            <div className="w-full max-w-sm mx-auto space-y-2">
              <Button
                onClick={() => navigate('/trader-setup')}
                variant="outline"
                className="w-full h-12 rounded-xl text-sm font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm"
              >
                <Building2 className="w-4 h-4 mr-2" /> Register as Trader
              </Button>
              <Button
                onClick={() => navigate('/contact-registartion')}
                variant="outline"
                className="w-full h-12 rounded-xl text-sm font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm"
              >
                <LogIn className="w-4 h-4 mr-2" /> Register as Contact
              </Button>
            </div>
          </div>
        </main>
      </div>
      <Dialog open={guestDialogOpen} onOpenChange={open => setGuestDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No contact account found</DialogTitle>
            <DialogDescription>
              We verified this mobile number but couldn&apos;t find a contact portal account. You can
              register now to save your details and see your history, or continue as a guest without
              creating an account. You can use OTP again later to come back as a guest or register
              when you&apos;re ready.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleContinueToSignup} className="flex-1 gap-2">
              <UserPlus className="w-4 h-4" />
              Continue to register
            </Button>
            <Button onClick={handleGuestLogin} className="flex-1 gap-2">
              <LogIn className="w-4 h-4" />
              Login as guest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoginScreen;