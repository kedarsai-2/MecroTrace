import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Eye, EyeOff, ArrowRight, Mail, Lock, Sun, Moon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useTheme } from '@/context/ThemeContext';
const loginBg = '/login-bg.webp';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailError = touched.email && !emailRegex.test(email) ? (email ? 'Enter a valid email' : 'Email is required') : '';
  const passwordError = touched.password && !password ? 'Password is required' : '';
  const isValid = emailRegex.test(email) && password.length > 0;

  const handleLogin = async () => {
    setTouched({ email: true, password: true });
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/admin');
    } catch (e: any) {
      setError(e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Full-screen HD background image */}
      <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover z-0" fetchPriority="high" decoding="async" />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-blue-800/60 to-violet-900/70 z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(91,140,255,0.25)_0%,transparent_50%)] z-[1]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(123,97,255,0.3)_0%,transparent_40%)] z-[1]" />

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
        {[...Array(20)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full bg-white/30"
            style={{ width: 2 + Math.random() * 5, height: 2 + Math.random() * 5, left: `${5 + Math.random() * 90}%`, top: `${5 + Math.random() * 90}%` }}
            animate={{ y: [-25, 25], x: [-8, 8], opacity: [0.1, 0.5, 0.1], scale: [1, 1.3, 1] }}
            transition={{ duration: 3 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 3, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Theme toggle */}
      <button onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} className="absolute top-6 right-6 z-20 w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-all duration-300 border border-white/20">
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-4 relative z-10">
        <div className="rounded-3xl p-8 shadow-2xl border border-white/20 bg-white/15 backdrop-blur-xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }} className="relative inline-block mb-4">
              <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20 mx-auto">
                <MercotraceIcon size={40} color="white" className="drop-shadow-lg" />
              </div>
              <motion.div className="absolute inset-0 rounded-3xl border-2 border-white/30" animate={{ scale: [1, 1.2], opacity: [0.5, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
            </motion.div>
            <h1 className="text-2xl font-bold text-white drop-shadow-lg">Mercotrace Admin</h1>
            <p className="text-sm text-white/70 mt-1 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-white/80" /> Super Admin Portal
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5 block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                <Input type="email" placeholder="admin@mercotrace.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => setTouched(p => ({ ...p, email: true }))}
                  className="pl-12 h-12 rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400" />
              </div>
              {emailError && <p className="text-xs text-red-200 mt-1 ml-1">{emailError}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-800/50" />
                <Input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => setTouched(p => ({ ...p, password: true }))}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="pl-12 pr-12 h-12 rounded-xl bg-white/90 border-0 text-blue-900 placeholder:text-blue-400" />
                <button onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-blue-800/50">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && <p className="text-xs text-red-200 mt-1 ml-1">{passwordError}</p>}
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-white text-center bg-red-500/20 border border-red-400/30 backdrop-blur-sm rounded-xl py-2">
                {error}
              </motion.p>
            )}

            <Button onClick={handleLogin} disabled={!isValid || loading}
              className="w-full h-12 rounded-xl bg-white text-blue-600 hover:bg-white/90 font-semibold shadow-xl text-base disabled:opacity-70">
              {loading ? (
                <motion.div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </div>

          <p className="text-center text-xs text-white/50 mt-6">Protected area • Authorized personnel only</p>
        </div>

        <p className="text-center text-xs text-white/60 mt-6">
          Trader? <button onClick={() => navigate('/login')} className="text-white font-medium underline hover:text-white/90">Go to Trader Login</button>
        </p>
      </motion.div>
    </div>
  );
};

export default AdminLoginPage;
