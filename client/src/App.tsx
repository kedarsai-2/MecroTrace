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

// Eagerly loaded trader routes. Very large routes can opt into local Suspense fallbacks below.
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
import LogisticsPage from "./pages/LogisticsPage";
import WeighingPage from "./pages/WeighingPage";
import SummaryPage from "./pages/SummaryPage";
import WritersPadPage from "./pages/WritersPadPage";
import BillingPage from "./pages/BillingPage";
import StockPurchasePage from "./pages/StockPurchasePage";
import CDNPage from "./pages/CDNPage";
import PrintsPage from "./pages/PrintsPage";
import ReportsPage from "./pages/ReportsPage";
import ReportsRoutesLayout from "./pages/reports/ReportsRoutesLayout";
import DailySalesSummaryPage from "./pages/reports/DailySalesSummaryPage";
import UserFeesReportPage from "./pages/reports/UserFeesReportPage";
import ArrivalsReportPage from "./pages/reports/ArrivalsReportPage";
import SettingsPage from "./pages/SettingsPage";
import BluetoothPrinterSettingsPage from "./pages/settings/BluetoothPrinterSettingsPage";
import PrintSettingsPage from "./pages/settings/PrintSettingsPage";
import RoleManagementPage from "./pages/admin/settings/RoleManagementPage";
import UserManagementPage from "./pages/admin/settings/UserManagementPage";
import RoleAllocationPage from "./pages/admin/settings/RoleAllocationPage";
import RbacSettingsPage from "./pages/settings/RbacSettingsPage";
import PresetSettingsPage from "./pages/settings/PresetSettingsPage";

// Admin (lazy — traders-only surface)
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminTradersPage = lazy(() => import("./pages/admin/AdminTradersPage"));
const AdminCategoriesPage = lazy(() => import("./pages/admin/AdminCategoriesPage"));
const AdminCommoditiesPage = lazy(() => import("./pages/admin/AdminCommoditiesPage"));
const AdminContactsPage = lazy(() => import("./pages/admin/AdminContactsPage"));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage"));
const AdminRbacSettingsPage = lazy(() => import("./pages/admin/settings/RbacSettingsPage"));
const AdminRoleManagementPage = lazy(() => import("./pages/admin/settings/AdminRoleManagementPage"));
const AdminUserManagementPage = lazy(() => import("./pages/admin/settings/AdminUserManagementPage"));
const AdminRoleAllocationPage = lazy(() => import("./pages/admin/settings/AdminRoleAllocationPage"));
const AdminGlobalPresetSettingsPage = lazy(() => import("./pages/admin/settings/AdminGlobalPresetSettingsPage"));
const SettlementPage = lazy(() => import("./pages/SettlementPage"));

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SettlementRouteFallback = () => (
  <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center bg-background">
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
      <Route path="/" element={<OnboardingScreen />} />
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
        <Route path="/summary-after-auction" element={<Navigate to="/summary-page" replace />} />
        <Route path="/summary-page/*" element={<SummaryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/arrivals" element={<ArrivalsPage />} />
        <Route path="/scribble-pad" element={<ScribblePadPage />} />
        <Route path="/logistics" element={<LogisticsPage />} />
        <Route
          path="/settlement"
          element={
            <Suspense fallback={<SettlementRouteFallback />}>
              <SettlementPage />
            </Suspense>
          }
        />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/financial-reports" element={<Navigate to="/home" replace />} />
        <Route path="/stock-purchase" element={<StockPurchasePage />} />
        <Route path="/cdn" element={<CDNPage />} />
        <Route path="/prints-reports" element={<PrintsPage />} />
        <Route path="/prints" element={<PrintsPage />} />
        <Route path="/reports" element={<ReportsRoutesLayout />}>
          <Route index element={<ReportsPage />} />
          <Route path="daily-sales-summary" element={<DailySalesSummaryPage />} />
          <Route path="user-fees-report" element={<UserFeesReportPage />} />
          <Route path="arrivals-report" element={<ArrivalsReportPage />} />
        </Route>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/bluetooth-printers" element={<BluetoothPrinterSettingsPage />} />
        <Route path="/settings/print-settings" element={<PrintSettingsPage />} />
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
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="commodities" element={<AdminCommoditiesPage />} />
        <Route path="contacts" element={<AdminContactsPage />} />
        <Route path="settings/rbac" element={<AdminRbacSettingsPage />} />
        <Route path="settings/global-presets" element={<AdminGlobalPresetSettingsPage />} />
        <Route path="settings/roles" element={<AdminRoleManagementPage />} />
        <Route path="settings/users" element={<AdminUserManagementPage />} />
        <Route path="settings/role-allocation" element={<AdminRoleAllocationPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
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
