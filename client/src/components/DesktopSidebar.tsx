import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Settings, Users, Truck, Gavel, Printer, Scale, PenLine,
  FileText, Receipt, BookOpen, CreditCard, BarChart3, User,
  ChevronLeft, ChevronRight,
  ShoppingBag, Box, Send, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MercotraceIcon } from '@/components/MercotraceLogo';
import { useAuth } from '@/context/AuthContext';
import { usePermissions, getModuleKeyForRoute } from '@/lib/permissions';

/** Paths allowed in sidebar when trader is not yet approved. */
const ALLOWED_PATHS_WHEN_PENDING = ['/home', '/profile'];

const navSections = [
  {
    label: 'Main',
    items: [
      { icon: Home, title: 'Home', path: '/home' },
      { icon: User, title: 'Profile', path: '/profile' },
      { icon: Users, title: 'Contacts', path: '/contacts' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { icon: Settings, title: 'Commodity Settings', path: '/commodity-settings' },
      { icon: Truck, title: 'Arrivals', path: '/arrivals' },
      { icon: Gavel, title: 'Auctions / Sales', path: '/auctions' },
      { icon: ClipboardList, title: 'Summary page', path: '/summary-page' },
      { icon: Scale, title: 'Weighing', path: '/weighing' },
      { icon: PenLine, title: "Writer's Pad", path: '/writers-pad' },
      { icon: Printer, title: 'Print Hub', path: '/logistics' },
    ],
  },
  {
    label: 'Trading',
    items: [
      { icon: ShoppingBag, title: 'Self-Sale', path: '/self-sale' },
      { icon: Box, title: 'Stock Purchase', path: '/stock-purchase' },
      { icon: Send, title: 'CDN', path: '/cdn' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { icon: Receipt, title: 'Billing', path: '/billing' },
      { icon: FileText, title: 'Settlement', path: '/settlement' },
      { icon: BookOpen, title: 'Chart of Accounts', path: '/accounting' },
      { icon: CreditCard, title: 'Vouchers & Payments', path: '/vouchers' },
      { icon: BarChart3, title: 'Financial Reports', path: '/financial-reports' },
      { icon: Printer, title: 'Print Templates', path: '/prints' },
      { icon: BarChart3, title: 'Reports', path: '/reports' },
    ],
  },
  {
    label: 'System',
    items: [
      { icon: Settings, title: 'Settings', path: '/settings' },
    ],
  },
];

export type DesktopSidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

const DesktopSidebar = ({ collapsed, onCollapsedChange }: DesktopSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { trader } = useAuth();
  const { canAccessModule } = usePermissions();

  const isApproved = trader?.approval_status === 'APPROVED';

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #4B7CF3 0%, #5B8CFF 30%, #7B61FF 100%)' }}
    >
      {/* Shine overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_60%)] pointer-events-none" />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-5 border-b border-white/15">
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg flex-shrink-0 border border-white/25">
          <MercotraceIcon size={22} color="white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
              <h1 className="text-sm font-bold text-white whitespace-nowrap drop-shadow-sm">Mercotrace</h1>
              <p className="text-[10px] text-white/70 whitespace-nowrap">Smart Mandi Platform</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex-1 py-3 px-2 space-y-4 overflow-y-auto no-scrollbar">
        {navSections.map((section) => {
          const visibleItems = section.items.filter(item => {
            if (!isApproved) {
              return ALLOWED_PATHS_WHEN_PENDING.includes(item.path);
            }
            const moduleKey = getModuleKeyForRoute(item.path);
            if (!moduleKey) {
              return true;
            }
            return canAccessModule(moduleKey);
          });

          if (visibleItems.length === 0) {
            return null;
          }

          return (
            <div key={section.label}>
              {!collapsed && (
                <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold px-3 mb-1.5">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    (item.path !== '/home' && location.pathname.startsWith(item.path + '/'));
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group',
                        isActive
                          ? 'bg-white/25 text-white shadow-lg border border-white/30 backdrop-blur-md'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                          isActive ? 'bg-white/30 shadow-md' : 'bg-white/10 group-hover:bg-white/15'
                        )}
                      >
                        <item.icon
                          className={cn(
                            'w-4 h-4',
                            isActive ? 'text-white' : 'text-white/80 group-hover:text-white'
                          )}
                        />
                      </div>
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="whitespace-nowrap text-[13px]"
                          >
                            {item.title}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {isActive && !collapsed && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-sm animate-indicator-glow" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle — kept inside sidebar bounds so overflow-hidden does not clip it */}
      <button
        type="button"
        onClick={() => onCollapsedChange(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-pressed={collapsed}
        className="absolute top-6 right-2 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent shadow-xl shadow-primary/30 flex items-center justify-center text-white hover:scale-110 transition-all ease-in-out [transition-duration:250ms] z-50 border-2 border-white/30"
      >
        {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
      </button>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/25 rounded-full"
            style={{ left: `${15 + Math.random() * 70}%`, top: `${Math.random() * 100}%` }}
            animate={{ y: [-12, 12], opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>
    </motion.aside>
  );
};

export default DesktopSidebar;
