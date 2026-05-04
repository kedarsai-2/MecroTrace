import { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

/**
 * Shows a fullscreen overlay when device is in landscape orientation,
 * asking the user to rotate back to portrait.
 * Native Android also uses this as a fallback for tablet builds that ignore
 * app-requested orientation locks.
 */
const PortraitLock = () => {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

    const checkOrientation = () => {
      const isLandscapeViewport = window.innerWidth > window.innerHeight;

      if (isNativeAndroid) {
        setIsLandscape(isLandscapeViewport);
        return;
      }

      // Only enforce portrait on mobile/tablet, not desktop.
      const isLand = isLandscapeViewport && window.innerHeight < 600 && window.innerWidth < 1024;
      setIsLandscape(isLand);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isLandscape) return null;

  return (
    <div className="portrait-lock-overlay fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
        <RotateCcw className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Please Rotate Your Device</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Mercotrace works best in portrait mode. Please rotate your device to continue.
      </p>
    </div>
  );
};

export default PortraitLock;
