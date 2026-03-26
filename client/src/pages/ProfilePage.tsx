import BottomNav from '@/components/BottomNav';
import { User, Shield, Bell, Settings, HelpCircle, LogOut, ChevronRight, ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDesktopMode } from '@/hooks/use-desktop';
import { API_ORIGIN } from '@/services/api/http';

const menuSections = [
  {
    section: 'Account',
    items: [
      { id: 'details', icon: User, label: 'Account Details', desc: 'Personal info & KYC' },
      { id: 'security', icon: Shield, label: 'Security', desc: 'Password & 2FA', badge: 'Verified', badgeColor: 'success' },
    ],
  },
  {
    section: 'General',
    items: [
      { id: 'notifications', icon: Bell, label: 'Notifications', desc: 'Alerts & preferences' },
      { id: 'settings', icon: Settings, label: 'Settings', desc: 'Roles, users & permissions', path: '/settings' },
      { id: 'help', icon: HelpCircle, label: 'Help & Support', desc: 'FAQs & contact' },
    ],
  },
];

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, trader, logout } = useAuth();
  const isDesktop = useDesktopMode();

  const handleLogout = async () => {
    await Promise.resolve(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      {!isDesktop && (
        <div className="bg-gradient-to-br from-blue-400 via-blue-500 to-violet-500 pt-[max(2rem,env(safe-area-inset-top))] pb-28 px-4 rounded-b-[2.5rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(123,97,255,0.2)_0%,transparent_40%)]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse"
                style={{ left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 25}%`, animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">Profile</h1>
                <p className="text-white/80">Manage your account</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={cn("relative z-10 space-y-5", isDesktop ? "px-8 pt-6 max-w-3xl" : "px-4 -mt-20")}>
        <div className="glass-card p-5 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-4">
            {trader?.shop_photos?.[0] ? (
              <img
                src={`${API_ORIGIN}${trader.shop_photos[0].startsWith('/') ? '' : '/'}${trader.shop_photos[0]}`}
                alt="Company"
                className="w-16 h-16 rounded-full object-cover shadow-lg"
                crossOrigin="use-credentials"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shadow-lg">
                <User className="w-8 h-8 text-white" />
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-xl font-bold text-foreground">{user?.name || 'User'}</h3>
              <p className="text-sm text-muted-foreground">{user?.username || ''}</p>
              {trader && (
                <div className="mt-2">
                  {trader.approval_status === 'APPROVED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approved
                    </span>
                  ) : trader.approval_status === 'REJECTED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                      <XCircle className="w-3.5 h-3.5" />
                      Rejected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Approval
                    </span>
                  )}
                </div>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>

        {trader && (
          <div className="glass-card p-4 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: '50ms' }}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Business</h4>
            <p className="font-semibold text-foreground">{trader.business_name}</p>
            <p className="text-xs text-muted-foreground">{trader.category} · {trader.city}, {trader.state}</p>
          </div>
        )}

        {menuSections.map((section, sectionIndex) => (
          <div key={section.section} className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${sectionIndex * 100}ms` }}>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 px-1">{section.section}</h4>
            <div className="glass-card rounded-2xl p-0 overflow-hidden">
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => (item as any).path ? navigate((item as any).path) : undefined} className={cn("w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors", itemIndex < section.items.length - 1 && "border-b border-border")}>
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <div className="text-left">
                        <span className="font-medium text-foreground">{item.label}</span>
                        {item.desc && <p className="text-xs text-muted-foreground">{item.desc}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", item.badgeColor === 'success' ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary")}>
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 text-red-500 font-medium border border-red-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: '400ms' }}>
          <LogOut className="w-5 h-5" /> Log Out
        </button>
        <p className="text-center text-xs text-muted-foreground">Version 1.0.0</p>
      </div>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
