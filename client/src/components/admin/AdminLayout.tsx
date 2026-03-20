import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Bell,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import FontSizeControls from '@/components/FontSizeControls';
import { useTheme } from '@/context/ThemeContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import type { AdminModuleKey } from '@/admin/types/rbac';

type AdminNavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  moduleKey?: AdminModuleKey;
};

const navItems: AdminNavItem[] = [
  { icon: Users, label: 'Traders', path: '/admin/traders', moduleKey: 'Traders' },
];

const AdminLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAdminAuth();
  const { canAccessModule } = useAdminPermissions();

  const visibleNavItems = navItems.filter((item) =>
    item.moduleKey ? canAccessModule(item.moduleKey) : false
  );

  const handleLogout = async () => {
    await Promise.resolve(logout());
    navigate('/admin/login');
  };

  return (
    <div className="flex min-h-screen w-full bg-background relative">
      {/* Sidebar — strong blue-violet gradient */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed left-0 top-0 bottom-0 z-40 flex flex-col overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #4B7CF3 0%, #5B8CFF 30%, #7B61FF 100%)' }}
      >
        {/* Subtle shine overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_60%)] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 px-4 py-5 border-b border-white/15">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg flex-shrink-0 border border-white/25">
            <MercotraceIcon size={22} color="white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
                <h1 className="text-sm font-bold text-white whitespace-nowrap drop-shadow-sm">Merkotrace</h1>
                <p className="text-[10px] text-white/70 whitespace-nowrap flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-white/80" /> Admin Portal
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="relative z-10 flex-1 py-3 px-2 space-y-1 overflow-y-auto no-scrollbar">
          {visibleNavItems.map((item) => {
            const isActive =
              location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                  isActive
                    ? 'bg-white/25 text-white shadow-lg border border-white/30 backdrop-blur-md'
                    : 'text-white/75 hover:text-white hover:bg-white/10'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                  isActive ? 'bg-white/30 shadow-md' : 'bg-white/10 group-hover:bg-white/15'
                )}>
                  <item.icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-white/80 group-hover:text-white')} />
                </div>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-sm animate-indicator-glow" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="relative z-10 p-3 border-t border-white/15 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2">
            <FontSizeControls variant="light" />
            {!collapsed && <span className="text-sm text-white/75 whitespace-nowrap">Font size</span>}
          </div>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-white/75 hover:text-white hover:bg-white/10 transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </div>
            {!collapsed && <span className="whitespace-nowrap">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-200 hover:bg-red-500/20 transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </div>
            {!collapsed && <span className="whitespace-nowrap">Sign Out</span>}
          </button>
        </div>

        {/* Collapse Toggle — prominent & always visible */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-6 -right-5 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent shadow-xl shadow-primary/30 flex items-center justify-center text-white hover:scale-110 hover:shadow-2xl hover:shadow-primary/40 transition-all duration-300 z-50 border-2 border-white/30"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>

        {/* Floating particles in sidebar */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/30 rounded-full"
              style={{ left: `${15 + Math.random() * 70}%`, top: `${Math.random() * 100}%` }}
              animate={{ y: [-15, 15], opacity: [0.15, 0.5, 0.15] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
      </motion.aside>

      {/* Main Content — white/light background */}
      <motion.div
        animate={{ marginLeft: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="flex-1 min-h-screen relative"
      >
        {/* Subtle gradient accent blobs on corners */}
        <div className="fixed pointer-events-none" style={{ left: collapsed ? 72 : 260, right: 0, top: 0, bottom: 0 }}>
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-primary/8 via-accent/5 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-accent/6 via-primary/4 to-transparent rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-primary/3 rounded-full blur-3xl" />
        </div>

        {/* Top Header — glass style */}
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b border-border/50"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">
              {visibleNavItems.find(n => location.pathname === n.path || (n.path !== '/admin' && location.pathname.startsWith(n.path)))?.label || 'Admin'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <FontSizeControls />
            <button className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted transition-all relative">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
            </button>
            <button onClick={toggleTheme} className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted transition-all">
              {isDark ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{user?.name || 'Super Admin'}</p>
                <p className="text-[10px] text-muted-foreground">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 relative z-10">
          <Outlet />
        </main>
      </motion.div>
    </div>
  );
};

export default AdminLayout;
