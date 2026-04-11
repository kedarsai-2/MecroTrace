import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, Cog, ChevronRight, Sparkles, Sliders, Bluetooth, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import BottomNav from '@/components/BottomNav';
import { usePermissions } from '@/lib/permissions';
import ForbiddenPage from '@/components/ForbiddenPage';
import { useAuth } from '@/context/AuthContext';

const settingsCards = [
  {
    icon: Shield,
    title: 'RBAC (Role-based Access Control)',
    desc: 'Roles, user management, and role allocation',
    path: '/settings/rbac',
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/20',
    accent: 'from-blue-400/15 to-indigo-500/10',
    iconBg: 'from-blue-500/20 to-indigo-600/15',
  },
  {
    icon: Sliders,
    title: 'Preset Settings',
    desc: 'Predefined marks and extra amounts for auction margin',
    path: '/settings/preset-settings',
    gradient: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-500/20',
    accent: 'from-amber-400/15 to-orange-500/10',
    iconBg: 'from-amber-500/20 to-orange-600/15',
  },
  {
    icon: Bluetooth,
    title: 'Bluetooth Printer Settings',
    desc: 'Bind ESC/POS thermal printer by MAC address',
    path: '/settings/bluetooth-printers',
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/20',
    accent: 'from-emerald-400/15 to-teal-500/10',
    iconBg: 'from-emerald-500/20 to-teal-600/15',
  },
  {
    icon: Printer,
    title: 'Print Settings',
    desc: 'Configure print size and header layout per module',
    path: '/settings/print-settings',
    gradient: 'from-violet-500 to-purple-600',
    glow: 'shadow-violet-500/20',
    accent: 'from-violet-400/15 to-purple-500/10',
    iconBg: 'from-violet-500/20 to-purple-600/15',
  },
];

function isTraderOwnerRole(role: string | undefined): boolean {
  return String(role ?? '').trim().toUpperCase() === 'TRADER_OWNER';
}

const SettingsPage = () => {
  const navigate = useNavigate();
  const { trader, user } = useAuth();
  const { canAccessModule, can } = usePermissions();

  const canViewSettings = canAccessModule('Settings');
  const canManageRoles = can('Settings', 'Manage Roles');
  const canManageUsers = can('Settings', 'Manage Users');

  if (!canViewSettings) {
    return <ForbiddenPage moduleName="Settings" />;
  }

  const canViewPresetSettings = can('Preset Settings', 'View');
  const canViewPrintSettings = can('Print Settings', 'View') || isTraderOwnerRole(user?.role);

  const traderCanCustomizePresets = trader?.preset_enabled !== false;

  const visibleCards = settingsCards.filter(card => {
    if (card.path === '/settings/rbac') return canManageRoles || canManageUsers;
    if (card.path === '/settings/preset-settings') return canViewPresetSettings && traderCanCustomizePresets;
    if (card.path === '/settings/print-settings') return canViewPrintSettings;
    return true;
  });

  return (
    <div className="min-h-[100dvh] bg-background pb-28 lg:pb-6">
      <div className="px-4 md:px-8 pt-4 lg:pt-6 space-y-6">
        {/* Header with aeroglass banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 sm:p-6 relative overflow-hidden border border-border/40"
        >
          {/* Decorative blobs */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/15 via-violet-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-gradient-to-tr from-indigo-500/10 via-cyan-500/8 to-transparent rounded-full blur-2xl pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20 flex-shrink-0">
              <Cog className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                System configuration & access management
              </p>
            </div>
          </div>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleCards.map((card, i) => (
            <motion.button
              key={card.title}
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(card.path)}
              className="glass-card rounded-2xl p-6 text-left hover:shadow-xl transition-all border border-border/40 group relative overflow-hidden"
            >
              {/* Multi-layer gradient blobs */}
              <div className={cn('absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl opacity-20 bg-gradient-to-br group-hover:opacity-35 group-hover:w-32 group-hover:h-32 transition-all duration-500', card.gradient)} />
              <div className={cn('absolute -bottom-4 -left-4 w-20 h-20 rounded-full blur-xl opacity-10 bg-gradient-to-tr group-hover:opacity-25 transition-all duration-500', card.gradient)} />
              {/* Inner shine */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.08)_50%,transparent_60%)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

              <div className="relative z-10">
                <div className={cn('w-13 h-13 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg mb-4 border border-white/20', card.gradient, card.glow)}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-foreground mb-1 text-[15px]">{card.title}</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{card.desc}</p>
                <div className="flex items-center gap-1 text-xs text-primary font-semibold group-hover:gap-2 transition-all">
                  Open <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default SettingsPage;
