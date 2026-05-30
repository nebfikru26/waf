import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import DomainsPage from "./pages/DomainsPage";
import PoliciesPage from "./pages/PoliciesPage";
import AlertsPage from "./pages/AlertsPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import UsersPage from "./pages/UsersPage";
import BillingPage from "./pages/BillingPage";
import APIProtectionPage from "./pages/APIProtectionPage";
import BotProtectionPage from "./pages/BotProtectionPage";
import AccountTakeoverPage from "./pages/AccountTakeoverPage";
import DDoSProtectionPage from "./pages/DDoSProtectionPage";
import SSLManagementPage from "./pages/SSLManagementPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import InstantAlertsPage from "./pages/InstantAlertsPage";
import ThreatIntelligencePage from "./pages/ThreatIntelligencePage";
import RateLimitingPage from "./pages/RateLimitingPage";
import ProfilePage from "./pages/ProfilePage";
import CrsRulesPage from "./pages/CrsRulesPage";
import CrsDashboardPage from "./pages/CrsDashboardPage";
import AuditPage from "./pages/AuditPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {!isAuthenticated ? (
          <>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/policies" element={<PoliciesPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/crs-rules" element={<CrsRulesPage />} />
            <Route path="/crs-dashboard" element={<CrsDashboardPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/api-protection" element={<APIProtectionPage />} />
            <Route path="/bot-protection" element={<BotProtectionPage />} />
            <Route path="/account-takeover" element={<AccountTakeoverPage />} />
            <Route path="/ddos-protection" element={<DDoSProtectionPage />} />
            <Route path="/ssl-management" element={<SSLManagementPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/instant-alerts" element={<InstantAlertsPage />} />
            <Route path="/threat-intelligence" element={<ThreatIntelligencePage />} />
            <Route path="/rate-limiting" element={<RateLimitingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/audit-logs" element={<AuditPage />} />
            <Route path="*" element={<NotFound />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppRoutes />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
