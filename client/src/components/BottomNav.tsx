import { useNavigate, useLocation } from 'react-router-dom';
import { Truck, Gavel, Receipt, Printer, User, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions, getModuleKeyForRoute } from '@/lib/permissions';
const tabs = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: Truck, label: 'Arrivals', path: '/arrivals' },
  { icon: Gavel, label: 'Auctions / Sales', path: '/auctions' },
  { icon: Receipt, label: 'Billings', path: '/billing' },
  { icon: Printer, label: 'PrintHub', path: '/logistics' },
  { icon: User, label: 'Profile', path: '/profile' },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { canAccessModule } = usePermissions();

  return (
    <nav className="bottom-nav z-50 w-full max-w-[56rem] left-1/2 -translate-x-1/2 lg:hidden">
      <div className="flex items-center justify-around h-14 px-2 md:px-6">
        {tabs.map((tab) => {
          const moduleKey = getModuleKeyForRoute(tab.path);
          if (moduleKey && !canAccessModule(moduleKey)) {
            return null;
          }
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-lg transition-all duration-200',
                isActive
                  ? 'text-primary scale-110'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className={cn('w-5 h-5 mb-0.5', isActive && 'drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]')} />
              <span className={cn('text-[10px] font-medium', isActive && 'font-bold')}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
