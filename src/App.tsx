import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UserRole } from '../shared/types';
import { AuthProvider, getDefaultRouteForRole, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { ApprovalDashboardPage } from './pages/ApprovalDashboardPage';
import { CorrectionRequestsPage } from './pages/CorrectionRequestsPage';
import { LandingPage } from './pages/LandingPage';
import { LedgerExplorerPage } from './pages/LedgerExplorerPage';
import { LoginPage } from './pages/LoginPage';
import { MarksheetPreviewPage } from './pages/MarksheetPreviewPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicVerifyPage } from './pages/PublicVerifyPage';
import { PublishedResultsPage } from './pages/PublishedResultsPage';
import { PublishResultPage } from './pages/PublishResultPage';
import { SecurityAuditPage } from './pages/SecurityAuditPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { TamperLabPage } from './pages/TamperLabPage';

function ProtectedRoute({
  roles,
  children,
}: {
  roles?: UserRole[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1120] text-sm text-slate-500">
        Verifying authenticated session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify" element={<PublicVerifyPage />} />
      <Route path="/verify/:receiptId" element={<PublicVerifyPage />} />

      {/* Staff & Admin Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute
            roles={[UserRole.SUPER_ADMIN, UserRole.EXAMINER, UserRole.CONTROLLER]}
          >
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute
            roles={[UserRole.SUPER_ADMIN, UserRole.EXAMINER, UserRole.CONTROLLER]}
          >
            <StudentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/publish"
        element={
          <ProtectedRoute roles={[UserRole.SUPER_ADMIN]}>
            <PublishResultPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/results"
        element={
          <ProtectedRoute
            roles={[UserRole.SUPER_ADMIN, UserRole.EXAMINER, UserRole.CONTROLLER]}
          >
            <PublishedResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/corrections"
        element={
          <ProtectedRoute
            roles={[UserRole.SUPER_ADMIN, UserRole.EXAMINER, UserRole.CONTROLLER]}
          >
            <CorrectionRequestsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals/examiner"
        element={
          <ProtectedRoute roles={[UserRole.EXAMINER, UserRole.SUPER_ADMIN]}>
            <ApprovalDashboardPage deskRole="EXAMINER" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals/controller"
        element={
          <ProtectedRoute roles={[UserRole.CONTROLLER, UserRole.SUPER_ADMIN]}>
            <ApprovalDashboardPage deskRole="CONTROLLER" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ledger"
        element={
          <ProtectedRoute
            roles={[UserRole.SUPER_ADMIN, UserRole.EXAMINER, UserRole.CONTROLLER]}
          >
            <LedgerExplorerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute
            roles={[UserRole.SUPER_ADMIN, UserRole.EXAMINER, UserRole.CONTROLLER]}
          >
            <SecurityAuditPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tamper-lab"
        element={
          <ProtectedRoute roles={[UserRole.SUPER_ADMIN]}>
            <TamperLabPage />
          </ProtectedRoute>
        }
      />

      {/* Student & Shared Authenticated Document Routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute roles={[UserRole.STUDENT]}>
            <StudentDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/marksheet/:resultId"
        element={
          <ProtectedRoute
            roles={[
              UserRole.SUPER_ADMIN,
              UserRole.EXAMINER,
              UserRole.CONTROLLER,
              UserRole.STUDENT,
            ]}
          >
            <MarksheetPreviewPage />
          </ProtectedRoute>
        }
      />

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
