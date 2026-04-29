import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useTheme } from '@/context/ThemeContext';
import { useDesktopMode } from '@/hooks/use-desktop';

const SplashScreen = () => {
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const isDesktop = useDesktopMode();

  useEffect(() => {
    if (isDesktop) {
      navigate('/login', { replace: true });
      return;
    }
    const contentTimer = setTimeout(() => setShowContent(true), 300);
    const completeTimer = setTimeout(() => {
      navigate('/onboarding', { replace: true });
    }, 2500);
    return () => {
      clearTimeout(contentTimer);
      clearTimeout(completeTimer);
    };
  }, [navigate, isDesktop]);

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500" />
      <motion.div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent" initial={{ x: '-100%', opacity: 0 }} animate={{ x: '100%', opacity: 1 }} transition={{ duration: 1.5, delay: 0.5 }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(91,140,255,0.4)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.3)_0%,transparent_40%)]" />

      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div key={i} className="absolute w-1 h-1 bg-white/60 rounded-full"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ y: [-20, 20], opacity: [0.2, 1, 0.2], scale: [1, 1.5, 1] }}
            transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>

      <div className="relative z-20 flex justify-end px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={toggleTheme} className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-all duration-300 border border-white/20">
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <AnimatePresence>
          {showContent && (
            <>
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12, stiffness: 100 }} className="relative mb-6">
                <motion.div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-white/40 flex items-center justify-center" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/20">
                    <MercotraceIcon size={44} color="white" className="drop-shadow-lg" />
                  </div>
                </motion.div>
                <motion.div className="absolute inset-0 rounded-full border-2 border-white/30" animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
              </motion.div>

              <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-4xl sm:text-5xl font-bold text-white mb-2 drop-shadow-lg" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                Mercotrace
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-base sm:text-lg text-white/90 font-medium tracking-wide" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                Smart Mandi Trading Platform
              </motion.p>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="mt-12 flex gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div key={i} className="w-2 h-2 rounded-full bg-white/70" animate={{ y: [-5, 5] }} transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse', delay: i * 0.15 }} />
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <motion.div className="relative z-0 h-24 shrink-0" initial={{ y: 100 }} animate={{ y: 0 }} transition={{ delay: 0.5, duration: 0.8 }}>
        <svg viewBox="0 0 1440 120" className="w-full h-full fill-white/10" preserveAspectRatio="none">
          <path d="M0,64L48,69.3C96,75,192,85,288,90.7C384,96,480,96,576,85.3C672,75,768,53,864,48C960,43,1056,53,1152,58.7C1248,64,1344,64,1392,64L1440,64L1440,120L1392,120C1344,120,1248,120,1152,120C1056,120,960,120,864,120C768,120,672,120,576,120C480,120,384,120,288,120C192,120,96,120,48,120L0,120Z" />
        </svg>
      </motion.div>
    </div>
  );
};

export default SplashScreen;
