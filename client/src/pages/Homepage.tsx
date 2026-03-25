import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '@/components/BottomNav';
import { Sparkles, TrendingUp, Clock, Moon, Sun } from 'lucide-react';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useAuth } from '@/context/AuthContext';
import { useDesktopMode } from '@/hooks/use-desktop';
import { useTheme } from '@/context/ThemeContext';
import FontSizeControls from '@/components/FontSizeControls';
import { usePermissions, getModuleKeyForRoute } from '@/lib/permissions';

// Illustrated module images
import imgCommodity from '@/assets/modules/commodity-settings.png';
import imgContacts from '@/assets/modules/contacts.png';
import imgArrivals from '@/assets/modules/arrivals.png';
import imgAuctions from '@/assets/modules/auctions.png';
import imgLogistics from '@/assets/modules/logistics.png';
import imgWeighing from '@/assets/modules/weighing.png';
import imgWritersPad from '@/assets/modules/writers-pad.png';
import imgSettlement from '@/assets/modules/settlement.png';
import imgBilling from '@/assets/modules/billing.png';
import imgAccounting from '@/assets/modules/accounting.png';
import imgVouchers from '@/assets/modules/vouchers.png';
import imgFinancialReports from '@/assets/modules/financial-reports.png';
import imgSelfSale from '@/assets/modules/self-sale.png';
import imgStockPurchase from '@/assets/modules/stock-purchase.png';
import imgCdn from '@/assets/modules/cdn.png';
import imgPrints from '@/assets/modules/prints.png';
import imgReports from '@/assets/modules/reports.png';
import imgSettings from '@/assets/modules/settings.png';

const modules = [
  { image: imgCommodity, title: 'Commodity Settings', desc: 'Configure rates & deductions', path: '/commodity-settings', accent: 'from-amber-400 to-orange-500' },
  { image: imgContacts, title: 'Contacts', desc: 'Manage sellers, buyers & brokers', path: '/contacts', accent: 'from-cyan-400 to-blue-500' },
  { image: imgArrivals, title: 'Arrivals', desc: 'Vehicle entry, tonnage & lots', path: '/arrivals', accent: 'from-emerald-400 to-teal-500' },
  { image: imgAuctions, title: 'Auctions / Sales Pad', desc: 'Bidding & scribble pad', path: '/auctions', accent: 'from-violet-400 to-purple-600' },
  { image: imgLogistics, title: 'Print Hub', desc: 'Print stickers & chiti', path: '/logistics', accent: 'from-sky-400 to-indigo-500' },
  { image: imgWeighing, title: 'Weighing', desc: 'Liability management & dual records', path: '/weighing', accent: 'from-rose-400 to-pink-500' },
  { image: imgWritersPad, title: "Writer's Pad", desc: 'Scale-connected bid weighing', path: '/writers-pad', accent: 'from-fuchsia-400 to-violet-500' },
  { image: imgSettlement, title: 'Settlement (Patti)', desc: 'Seller payment & deductions', path: '/settlement', accent: 'from-lime-400 to-green-500' },
  { image: imgBilling, title: 'Billing (Sales Bill)', desc: 'Buyer invoicing & bills', path: '/billing', accent: 'from-blue-400 to-indigo-600' },
  { image: imgAccounting, title: 'Chart of Accounts', desc: 'Ledgers & double-entry COA', path: '/accounting', accent: 'from-teal-400 to-cyan-600' },
  { image: imgVouchers, title: 'Vouchers & Payments', desc: 'Receipt, payment & journal', path: '/vouchers', accent: 'from-orange-400 to-red-500' },
  { image: imgFinancialReports, title: 'Financial Reports', desc: 'P&L, balance sheet & aging', path: '/financial-reports', accent: 'from-indigo-400 to-blue-600' },
  { image: imgSelfSale, title: 'Self-Sale', desc: 'Close lots within entity', path: '/self-sale', accent: 'from-pink-400 to-rose-500' },
  { image: imgStockPurchase, title: 'Stock Purchase', desc: 'Vendor purchases & inventory', path: '/stock-purchase', accent: 'from-yellow-400 to-amber-500' },
  { image: imgCdn, title: 'CDN', desc: 'Consignment dispatch notes', path: '/cdn', accent: 'from-emerald-400 to-green-600' },
  { image: imgPrints, title: 'Print Templates', desc: 'Stage-wise document printing', path: '/prints', accent: 'from-purple-400 to-fuchsia-500' },
  { image: imgReports, title: 'Reports', desc: 'Analytics, metrics & exports', path: '/reports', accent: 'from-blue-400 to-violet-500' },
  { image: imgSettings, title: 'Settings', desc: 'Roles, users & permissions', path: '/settings', accent: 'from-indigo-400 to-blue-600' },
];

const WELCOME_MESSAGES = [
  "Let's make today productive! 🚀",
  "Ready to manage your Mandi operations ✨",
  "Your smart trading platform awaits 📊",
  "Streamline your operations today 💎",
  "Trade smarter, not harder 🎯",
];

const ModuleCard = memo(({ mod, onClick }: { mod: typeof modules[0]; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="glass-card flex flex-col items-center gap-2.5 p-4 sm:p-5 text-center group hover:shadow-xl hover:scale-[1.03] transition-all duration-300 active:scale-[0.97] relative overflow-hidden rounded-2xl animate-fade-in"
  >
    <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full bg-gradient-to-br ${mod.accent} opacity-[0.15] blur-xl group-hover:opacity-[0.3] group-hover:w-20 group-hover:h-20 transition-all duration-500 pointer-events-none`} />
    <div className={`absolute -bottom-3 -left-3 w-12 h-12 rounded-full bg-gradient-to-tr ${mod.accent} opacity-[0.08] blur-lg group-hover:opacity-[0.2] group-hover:w-16 group-hover:h-16 transition-all duration-500 pointer-events-none`} />
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.08)_50%,transparent_60%)]" />
    <div className="relative rounded-2xl flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-300 w-16 h-16">
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${mod.accent} opacity-[0.08] group-hover:opacity-[0.15] transition-opacity duration-300`} />
      <div className="absolute inset-[1px] rounded-2xl bg-card/80 backdrop-blur-sm" />
      <img
        src={mod.image}
        alt={mod.title}
        className="relative z-10 object-contain drop-shadow-md w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem]"
        loading="lazy"
        decoding="async"
      />
    </div>
    <div className="relative z-10">
      <p className="font-bold text-foreground leading-tight text-base">{mod.title}</p>
      <p className="text-muted-foreground mt-0.5 leading-snug text-[12px]">{mod.desc}</p>
    </div>
  </button>
));
ModuleCard.displayName = 'ModuleCard';

const Homepage = () => {
  const navigate = useNavigate();
  const { user, trader } = useAuth();
  const isDesktop = useDesktopMode();
  const { isDark, toggleTheme } = useTheme();
  const { canAccessModule } = usePermissions();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const welcomeMsg = WELCOME_MESSAGES[new Date().getDay() % WELCOME_MESSAGES.length];
  const displayName = trader?.business_name || user?.name || 'Trader';
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      {/* Hero Banner — mobile/tablet only */}
      {!isDesktop && (
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-400 via-primary to-violet-500 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 px-5 rounded-b-[2.5rem]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.3)_0%,transparent_40%)]" />
          
          {/* Top controls row — Font size + Theme toggle */}
          <div className="relative z-20 flex items-center justify-end gap-2 mb-3">
            <FontSizeControls variant="light" />
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-xl bg-white/15 backdrop-blur flex items-center justify-center text-white/80 hover:text-white hover:bg-white/25 transition-all duration-200"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/20 mb-3 animate-fade-in">
              <MercotraceIcon size={36} color="white" className="drop-shadow-md" />
            </div>
            <h1 className="font-bold text-white tracking-tight animate-fade-in text-xl">
              Mercotrace
            </h1>
            <p className="text-white/70 mt-1 animate-fade-in text-xs">
              Smart Mandi Operations Platform
            </p>
            <div className="mt-3 space-y-1 animate-fade-in">
              <p className="text-white/90 font-semibold text-sm">
                {greeting()}, {displayName} 👋
              </p>
              <p className="text-white/60 flex items-center justify-center gap-1 text-[11px]">
                <Sparkles className="w-3 h-3" /> {welcomeMsg}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: Enhanced Welcome Section */}
      {isDesktop && (
        <div className="px-8 pt-6 pb-4">
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden animate-fade-in">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-primary/15 via-violet-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-gradient-to-tr from-emerald-500/10 via-cyan-500/8 to-transparent rounded-full blur-2xl pointer-events-none" />
            
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center shadow-lg shadow-primary/30 border border-white/20">
                  <MercotraceIcon size={28} color="white" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground text-xl">
                    {greeting()}, <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">{displayName}</span> 👋
                  </h2>
                  <p className="text-muted-foreground flex items-center gap-1.5 mt-0.5 text-sm">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> {welcomeMsg}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <FontSizeControls />
                <div className="glass-card rounded-xl p-3 text-center border border-primary/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Today</p>
                  </div>
                  <p className="font-bold text-foreground text-xs">{todayStr}</p>
                </div>
                <div className="glass-card rounded-xl p-3 text-center border border-emerald-500/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Modules</p>
                  </div>
                  <p className="font-bold text-foreground text-xs">{modules.length} Active</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Module Cards */}
      <div className={`px-4 md:px-8 lg:px-8 relative z-10 ${isDesktop ? 'pt-2' : '-mt-5'}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {modules.map((mod) => {
            const moduleKey = getModuleKeyForRoute(mod.path);
            if (moduleKey && !canAccessModule(moduleKey)) {
              return null;
            }
            return (
              <ModuleCard
                key={mod.title}
                mod={mod}
                onClick={() => navigate(mod.path)}
              />
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Homepage;
