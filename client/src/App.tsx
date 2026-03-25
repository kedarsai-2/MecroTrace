import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  RouterProvider,
  Route,
} from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeContext";
import { FontSizeProvider } from "@/context/FontSizeContext";
import { AuthProvider } from "@/context/AuthContext";
import { ContactAuthProvider } from "@/context/ContactAuthContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminProtectedRoute from "@/components/AdminProtectedRoute";
import TraderProtectedRoute from "@/components/TraderProtectedRoute";
import ContactProtectedRoute from "@/components/ContactProtectedRoute";
import ContactPortalLayout from "@/components/ContactPortalLayout";
import RootClassManager from "@/components/RootClassManager";
import ScrollToTop from "@/components/ScrollToTop";
import PortraitLock from "@/components/PortraitLock";
import TraderLayout from "@/components/TraderLayout";
import RouteAutofocus from "@/components/RouteAutofocus";
import ClickToFocusNewFields from "@/components/ClickToFocusNewFields";
import KeyboardAvoidance from "@/components/KeyboardAvoidance";
import LoginScreen from "./pages/LoginScreen";
import ContactPortalLoginPage from "./pages/ContactPortalLoginPage";
import ContactPortalSignupPage from "./pages/ContactPortalSignupPage";
import ContactPortalDashboardPage from "./pages/ContactPortalDashboardPage";
import ContactPortalArrivalsPage from "./pages/ContactPortalArrivalsPage";
import ContactPortalPurchasesPage from "./pages/ContactPortalPurchasesPage";
import ContactPortalStatementsPage from "./pages/ContactPortalStatementsPage";
import ContactPortalSettlementsPage from "./pages/ContactPortalSettlementsPage";
import ContactPortalProfilePage from "./pages/ContactPortalProfilePage";

// Eagerly loaded — all trader routes for instant navigation (no white flash)
import SplashScreen from "./pages/SplashScreen";
import OnboardingScreen from "./pages/OnboardingScreen";
import RegisterScreen from "./pages/RegisterScreen";
import TraderSetupPage from "./pages/TraderSetupPage";
import Homepage from "./pages/Homepage";
import NotFound from "./pages/NotFound";
import CommoditySettings from "./pages/CommoditySettings";
import AuctionsPage from "./pages/AuctionsPage";
import ProfilePage from "./pages/ProfilePage";
import ContactsPage from "./pages/ContactsPage";
import ArrivalsPage from "./pages/ArrivalsPage";
import ScribblePadPage from "./pages/ScribblePadPage";
import WeighingPage from "./pages/WeighingPage";
import WritersPadPage from "./pages/WritersPadPage";
import LogisticsPage from "./pages/LogisticsPage";
import SettlementPage from "./pages/SettlementPage";
import BillingPage from "./pages/BillingPage";
import AccountingPage from "./pages/AccountingPage";
import VouchersPage from "./pages/VouchersPage";
import LedgerViewPage from "./pages/LedgerViewPage";
import ContactLedgerViewPage from "./pages/ContactLedgerViewPage";
import SelfSalePage from "./pages/SelfSalePage";
import StockPurchasePage from "./pages/StockPurchasePage";
import CDNPage from "./pages/CDNPage";
import PrintsPage from "./pages/PrintsPage";
import SettingsPage from "./pages/SettingsPage";
import BluetoothPrinterSettingsPage from "./pages/settings/BluetoothPrinterSettingsPage";
import RoleManagementPage from "./pages/admin/settings/RoleManagementPage";
import UserManagementPage from "./pages/admin/settings/UserManagementPage";
import RoleAllocationPage from "./pages/admin/settings/RoleAllocationPage";
import RbacSettingsPage from "./pages/settings/RbacSettingsPage";
import PresetSettingsPage from "./pages/settings/PresetSettingsPage";

// Admin (lazy — traders-only surface)
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminTradersPage = lazy(() => import("./pages/admin/AdminTradersPage"));

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function AppShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return;
    }

    const listenerPromise = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }

      // No in-app history left: exit app on Android.
      CapacitorApp.exitApp();
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return (
    <>
      <ScrollToTop />
      <PortraitLock />
      <RootClassManager />
      <RouteAutofocus />
      <ClickToFocusNewFields />
      <KeyboardAvoidance />
      <Suspense fallback={<LazyFallback />}>
        <Outlet />
      </Suspense>
    </>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppShell />}>
      {/* Public routes */}
      <Route path="/" element={<SplashScreen />} />
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/login" element={<LoginScreen />} />

      {/* Legacy /portal/login & /portal/signup paths — redirect to unified /login */}
      <Route path="/portal/login" element={<Navigate to="/login" replace />} />
      <Route path="/portal/signup" element={<Navigate to="/login" replace />} />
      <Route path="/contact-registartion" element={<ContactPortalSignupPage />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/trader-setup" element={<TraderSetupPage />} />

      {/* Trader App — wrapped in TraderLayout (sidebar on desktop) */}
      <Route element={<TraderProtectedRoute><TraderLayout /></TraderProtectedRoute>}>
        <Route path="/home" element={<Homepage />} />
        <Route path="/commodity-settings" element={<CommoditySettings />} />
        <Route path="/auctions" element={<AuctionsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/arrivals" element={<ArrivalsPage />} />
        <Route path="/scribble-pad" element={<ScribblePadPage />} />
        <Route path="/logistics" element={<LogisticsPage />} />
        <Route path="/weighing" element={<WeighingPage />} />
        <Route path="/writers-pad" element={<WritersPadPage />} />
        <Route path="/settlement" element={<SettlementPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/vouchers" element={<VouchersPage />} />
        <Route path="/ledger-view/:ledgerId" element={<LedgerViewPage />} />
        <Route path="/contact-ledger/:contactId" element={<ContactLedgerViewPage />} />
        <Route path="/financial-reports" element={<Navigate to="/home" replace />} />
        <Route path="/self-sale" element={<SelfSalePage />} />
        <Route path="/stock-purchase" element={<StockPurchasePage />} />
        <Route path="/cdn" element={<CDNPage />} />
        <Route path="/prints-reports" element={<PrintsPage />} />
        <Route path="/prints" element={<PrintsPage />} />
        <Route path="/reports" element={<Navigate to="/home" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/bluetooth-printers" element={<BluetoothPrinterSettingsPage />} />
        <Route path="/settings/rbac" element={<RbacSettingsPage />} />
        <Route path="/settings/preset-settings" element={<PresetSettingsPage />} />
        <Route path="/settings/roles" element={<RoleManagementPage />} />
        <Route path="/settings/users" element={<UserManagementPage />} />
        <Route path="/settings/role-allocation" element={<RoleAllocationPage />} />
      </Route>

      {/* Contact Portal (protected, nested layout) */}
      <Route
        path="/contact"
        element={
          <ContactProtectedRoute>
            <ContactPortalLayout />
          </ContactProtectedRoute>
        }
      >
        <Route index element={<ContactPortalDashboardPage />} />
        <Route path="dashboard" element={<ContactPortalDashboardPage />} />
        <Route path="arrivals" element={<ContactPortalArrivalsPage />} />
        <Route path="purchases" element={<ContactPortalPurchasesPage />} />
        <Route path="statements" element={<ContactPortalStatementsPage />} />
        <Route path="settlements" element={<ContactPortalSettlementsPage />} />
        <Route path="profile" element={<ContactPortalProfilePage />} />
      </Route>

      {/* Legacy /portal/* front-end routes: redirect to /contact equivalents */}
      <Route path="/portal" element={<Navigate to="/contact" replace />} />
      <Route path="/portal/dashboard" element={<Navigate to="/contact/dashboard" replace />} />
      <Route path="/portal/arrivals" element={<Navigate to="/contact/arrivals" replace />} />
      <Route path="/portal/purchases" element={<Navigate to="/contact/purchases" replace />} />
      <Route path="/portal/statements" element={<Navigate to="/contact/statements" replace />} />
      <Route path="/portal/settlements" element={<Navigate to="/contact/settlements" replace />} />
      <Route path="/portal/profile" element={<Navigate to="/contact/profile" replace />} />

      {/* Admin Portal */}
      <Route
        path="/admin/login"
        element={
          <AdminAuthProvider>
            <AdminLoginPage />
          </AdminAuthProvider>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminAuthProvider>
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          </AdminAuthProvider>
        }
      >
        <Route index element={<Navigate to="/admin/traders" replace />} />
        <Route path="traders" element={<AdminTradersPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Route>
  )
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <FontSizeProvider>
        <AuthProvider>
          <ContactAuthProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <RouterProvider router={router} />
            </TooltipProvider>
          </ContactAuthProvider>
        </AuthProvider>
      </FontSizeProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;