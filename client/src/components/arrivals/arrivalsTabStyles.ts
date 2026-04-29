import { cn } from '@/lib/utils';

/** Arrivals / Summary / Settlement-style main tab bar buttons (matches Billing/Settlement desktop toggle language). */
export const arrivalsToggleTabBtn = (active: boolean) =>
  cn(
    'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-10',
    active
      ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
      : 'glass-card text-muted-foreground hover:text-foreground',
  );

/** Small count badge on desktop tab (Arrivals Summary tab pattern). */
export const arrivalsTabCountPill = (active: boolean) =>
  cn(
    'ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
    active ? 'bg-white/20 text-white' : 'bg-muted text-foreground',
  );

/** Mobile: two-pill switch inside gradient header (Arrivals Summary / New Arrival). */
export const mobileArrivalsStyleTab = (active: boolean) =>
  cn(
    'h-9 rounded-lg text-xs font-semibold transition-colors min-h-9 touch-manipulation',
    active ? 'bg-white text-[#6075FF]' : 'text-white/85 hover:text-white',
  );
