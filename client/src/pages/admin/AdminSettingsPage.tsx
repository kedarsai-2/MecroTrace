import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, Cog, ChevronRight, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';

const settingsCards = [
  {
    icon: Shield,
    title: 'RBAC (Role-based Access Control)',
    desc: 'Roles, user management, and role allocation',
    path: '/admin/settings/rbac',
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/20',
  },
];

const AdminSettingsPage = () => {
  const navigate = useNavigate();
  const { canAccessModule, can } = useAdminPermissions();

  const canView = canAccessModule('Settings');
  const canManageRbac = can('Settings', 'Manage RBAC');

  if (!canView) {
    return <AdminForbiddenPage moduleName="Settings" />;
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Cog className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">System configuration & access management</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {canManageRbac &&
          settingsCards.map((card, i) => (
            <motion.button
              key={card.title}
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.02, y: -3 }}
              onClick={() => navigate(card.path)}
              className="glass-card rounded-2xl p-6 text-left hover:shadow-elevated transition-all border border-border/50 group relative overflow-hidden"
            >
              <div className={cn('absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 bg-gradient-to-br', card.gradient)} />
              <div className="relative z-10">
                <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg mb-4', card.gradient, card.glow)}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-foreground mb-1">{card.title}</h3>
                <p className="text-xs text-muted-foreground mb-4">{card.desc}</p>
                <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
                  Open <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </motion.button>
          ))}
        {canView && (
          <motion.button
            key="global-presets"
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: (canManageRbac ? settingsCards.length : 0) * 0.08 }}
            whileHover={{ scale: 1.02, y: -3 }}
            onClick={() => navigate('/admin/settings/global-presets')}
            className="glass-card rounded-2xl p-6 text-left hover:shadow-elevated transition-all border border-border/50 group relative overflow-hidden"
          >
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 bg-gradient-to-br from-amber-500 to-orange-600" />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg mb-4 shadow-amber-500/20">
                <Sliders className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-foreground mb-1">Global preset marks</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Default auction margin presets for traders without their own preset settings
              </p>
              <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
                Open <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default AdminSettingsPage;
