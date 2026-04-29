import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingBag, BarChart3, Shield, Gift, ChevronLeft, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { useDesktopMode } from '@/hooks/use-desktop';

const slides = [
  {
    id: 1,
    icon: ShoppingBag,
    title: 'Smart Commerce',
    description: 'Manage your shop with intelligent tools designed for modern commodity marketplace operations.',
    gradient: 'from-blue-400 via-blue-500 to-violet-500',
    bgPattern: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%)',
  },
  {
    id: 2,
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description: 'Track commodities, auctions, and billing with precision — all at your fingertips.',
    gradient: 'from-blue-500 via-violet-500 to-blue-400',
    bgPattern: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)',
  },
  {
    id: 3,
    icon: Shield,
    title: 'Secure & Trusted',
    description: 'Enterprise-grade security with approval workflows that keep your business safe.',
    gradient: 'from-violet-500 via-blue-500 to-violet-400',
    bgPattern: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 60%)',
  },
  {
    id: 4,
    icon: Gift,
    title: 'Premium Experience',
    description: 'Beautiful billing, commodity settings, and shop management — crafted for the modern merchant.',
    gradient: 'from-blue-400 via-violet-500 to-blue-500',
    bgPattern: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.1) 0%, transparent 50%)',
  },
];

const OnboardingScreen = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const isDesktop = useDesktopMode();

  useEffect(() => {
    if (isDesktop) {
      navigate('/login', { replace: true });
    }
  }, [isDesktop, navigate]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      navigate('/login', { replace: true });
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) setCurrentSlide(currentSlide - 1);
  };

  const handleSkip = () => navigate('/login', { replace: true });

  const slide = slides[currentSlide];
  const Icon = slide.icon;
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-slate-950">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className={`absolute inset-0 bg-gradient-to-br ${slide.gradient}`}
        />
      </AnimatePresence>

      <div className="absolute inset-0 opacity-30" style={{ background: slide.bgPattern }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />

      {/* Floating Particle Stars */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [-30, 30],
              x: [-10, 10],
              opacity: [0.1, 0.5, 0.1],
            }}
            transition={{
              duration: 3 + Math.random() * 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Top Navigation */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 shrink-0">
        {currentSlide > 0 ? (
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        ) : (
          <div className="w-10" />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30 transition-all"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={handleSkip} className="text-white/80 font-medium text-sm">
            Skip
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="relative mb-8"
            >
              <div className="absolute inset-0 bg-white/30 rounded-full blur-2xl scale-150" />
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-2xl">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-white/40 to-white/10 flex items-center justify-center">
                  <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-white drop-shadow-lg" />
                </div>
              </div>
              <motion.div
                className="absolute w-3 h-3 bg-white rounded-full shadow-lg"
                style={{ top: '50%', left: '50%' }}
                animate={{
                  x: [40, 0, -40, 0, 40],
                  y: [0, 40, 0, -40, 0],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl sm:text-3xl font-bold text-white mb-3 drop-shadow-lg"
              style={{ textShadow: '0 4px 20px rgba(0,0,0,0.2)' }}
            >
              {slide.title}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-white/90 text-base sm:text-lg leading-relaxed max-w-xs"
              style={{ textShadow: '0 2px 10px rgba(0,0,0,0.1)' }}
            >
              {slide.description}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Section */}
      <div className="relative z-20 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0">
        <div className="flex justify-center gap-2 mb-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === currentSlide
                  ? 'w-8 bg-white'
                  : 'w-2 bg-white/40 hover:bg-white/60'
              )}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Button
            onClick={handleNext}
            className="w-full h-14 rounded-2xl text-lg font-semibold bg-white text-blue-600 hover:bg-white/90 shadow-xl"
          >
            {isLastSlide ? 'Get Started' : 'Next'}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default OnboardingScreen;
