import type { CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Moon, Sun, Bell, User, AlertCircle } from 'lucide-react';
import DesktopSidebar from '@/components/DesktopSidebar';
import FontSizeControls from '@/components/FontSizeControls';
import { useDesktopMode } from '@/hooks/use-desktop';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useFontSize } from '@/context/FontSizeContext';

/** Paths allowed when trader is not yet approved (pending registration). */
const ALLOWED_PATHS_WHEN_PENDING = ['/home', '/profile'];

const pageTitles: Record<string, string> = {
  '/home': 'Dashboard',
  '/contacts': 'Contacts',
  '/profile': 'Profile',
  '/commodity-settings': 'Commodity Settings',
  '/arrivals': 'Arrivals',
  '/auctions': 'Auctions / Sales Pad',
  '/weighing': 'Weighing',
  '/writers-pad': "Writer's Pad",
  '/logistics': 'Logistics & Navigation',
  '/settlement': 'Settlement (Patti)',
  '/billing': 'Billing (Sales Bill)',
  '/accounting': 'Chart of Accounts',
  '/vouchers': 'Vouchers & Payments',
  '/financial-reports': 'Financial Reports',
  '/scribble-pad': 'Scribble Pad',
  '/self-sale': 'Self-Sale',
  '/stock-purchase': 'Stock Purchase',
  '/cdn': 'Consignment Dispatch Note',
  '/prints-reports': 'Print Templates',
  '/prints': 'Print Templates',
  '/reports': 'Analytics Reports',
  '/settings': 'Settings',
  '/settings/roles': 'Role Management',
  '/settings/users': 'User Management',
  '/settings/role-allocation': 'Role Allocation',
};

const pageGradients: Record<string, string> = {
  '/home': 'from-primary/8 to-violet-500/5',
  '/contacts': 'from-emerald-500/8 to-teal-500/5',
  '/commodity-settings': 'from-emerald-500/8 to-teal-500/5',
  '/arrivals': 'from-blue-500/8 to-cyan-500/5',
  '/auctions': 'from-amber-500/8 to-orange-500/5',
  '/weighing': 'from-indigo-500/8 to-blue-500/5',
  '/settlement': 'from-rose-500/8 to-pink-500/5',
  '/billing': 'from-cyan-500/8 to-blue-500/5',
  '/accounting': 'from-emerald-500/8 to-teal-500/5',
  '/vouchers': 'from-violet-500/8 to-purple-500/5',
  '/financial-reports': 'from-red-500/8 to-rose-500/5',
  '/self-sale': 'from-lime-500/8 to-green-500/5',
  '/stock-purchase': 'from-sky-500/8 to-blue-500/5',
  '/cdn': 'from-orange-500/8 to-amber-500/5',
};

const TraderLayout = () => {
  const isDesktop = useDesktopMode();
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { user, trader } = useAuth();
  const { scale } = useFontSize();

  // Scale only page body (not sidebar / sticky header). `transform: scale` shrinks the
  // layout box so scroll height is wrong and content gets cropped; `zoom` updates layout
  // size in Chromium so the full page stays scrollable and visible.
  const scaledBodyStyle: CSSProperties | undefined =
    scale === 1 ? undefined : { zoom: scale };

  const isApproved = trader?.approval_status === 'APPROVED';
  const pathAllowedWhenPending = ALLOWED_PATHS_WHEN_PENDING.some(
    (p) => location.pathname === p || (p !== '/home' && location.pathname.startsWith(p + '/'))
  );

  // Unapproved traders may only access dashboard and profile; redirect others to /home
  if (!isApproved && !pathAllowedWhenPending) {
    return <Navigate to="/home" replace />;
  }

  if (!isDesktop) {
    return (
      <div className="min-h-[100dvh] w-full min-w-0">
        <div id="route-autofocus-root" className="min-h-[100dvh] w-full min-w-0" style={scaledBodyStyle}>
          <Outlet />
        </div>
      </div>
    );
  }

  const pageTitle = pageTitles[location.pathname] || 
    Object.entries(pageTitles).find(([k]) => location.pathname.startsWith(k))?.[1] || 
    'Mercotrace';

  const headerGradient = pageGradients[location.pathname] || 'from-primary/8 to-violet-500/5';

  return (
    <div className="flex min-h-screen w-full bg-background">
      <DesktopSidebar />
      <div className="flex-1 min-h-screen lg:ml-[260px] transition-all duration-250 min-w-0">
        {/* Subtle background blobs */}
        <div className="fixed pointer-events-none inset-0 lg:left-[260px]">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-primary/8 via-accent/5 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-accent/6 via-primary/4 to-transparent rounded-full blur-3xl" />
        </div>

        {/* Aeroglass Desktop Top Bar */}
        <header
          className="sticky top-0 z-30 h-16 flex items-center justify-between px-8 border-b border-border/40 relative overflow-hidden"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Subtle gradient accent behind header */}
          <div className={`absolute inset-0 bg-gradient-to-r ${headerGradient} pointer-events-none`} />
          {/* Inner shine */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
          
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-violet-500 animate-pulse" />
            <h2 className="text-lg font-bold text-foreground">{pageTitle}</h2>
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <FontSizeControls />
            <button aria-label="Notifications" className="w-9 h-9 rounded-xl glass flex items-center justify-center hover:bg-muted/50 transition-all relative border border-border/30">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gradient-to-r from-primary to-violet-500 shadow-sm shadow-primary/40" />
            </button>
            <button onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} className="w-9 h-9 rounded-xl glass flex items-center justify-center hover:bg-muted/50 transition-all border border-border/30">
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl glass cursor-pointer hover:bg-muted/50 transition-all border border-border/30"
              onClick={() => navigate('/profile')}
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shadow-md shadow-primary/20">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{trader?.business_name || user?.name || 'Trader'}</p>
                <p className="text-[10px] text-muted-foreground">Trader Account</p>
              </div>
            </div>
          </div>
        </header>

        <main
          id="route-autofocus-root"
          className="relative z-10 w-full min-w-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          style={scaledBodyStyle}
        >
          {!isApproved && (
            <div
              className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-800 dark:text-amber-200"
              role="alert"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-medium">
                Your account is pending approval. Only Dashboard and Profile are available. Full access to all modules will be enabled after an admin approves your registration.
              </p>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TraderLayout;
