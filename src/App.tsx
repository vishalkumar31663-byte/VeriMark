import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UserRole } from '../shared/types';
import { AuthProvider, getDefaultRouteForRole, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdmitCardPage } from './pages/AdmitCardPage';
import { ApprovalDashboardPage } from './pages/ApprovalDashboardPage';
import { ControllerDashboardPage } from './pages/ControllerDashboardPage';
import { CorrectionRequestsPage } from './pages/CorrectionRequestsPage';
import { ExamCountdownPage } from './pages/ExamCountdownPage';
import { ExamSchedulePage } from './pages/ExamSchedulePage';
import { ExaminerDashboardPage } from './pages/ExaminerDashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LedgerExplorerPage } from './pages/LedgerExplorerPage';
import { LoginPage } from './pages/LoginPage';
import { MarksheetPreviewPage } from './pages/MarksheetPreviewPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PitchDeckPage } from './pages/PitchDeckPage';
import { ProofOfResultPage } from './pages/ProofOfResultPage';
import { PublicAdmitCardVerifyPage } from './pages/PublicAdmitCardVerifyPage';
import { PublicVerifyPage } from './pages/PublicVerifyPage';
import { PublishedResultsPage } from './pages/PublishedResultsPage';
import { PublishResultPage } from './pages/PublishResultPage';
import { ResultAnalyticsPage } from './pages/ResultAnalyticsPage';
import { ResultComparisonPage } from './pages/ResultComparisonPage';
import { RevaluationPage } from './pages/RevaluationPage';
import { SecurityAuditPage } from './pages/SecurityAuditPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { TamperLabPage } from './pages/TamperLabPage';
import { TicketsPage } from './pages/TicketsPage';

const ALL_AUTHENTICATED_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.EXAMINER,
  UserRole.CONTROLLER,
  UserRole.STUDENT,
];

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
      <Route path="/admit-card/verify" element={<PublicAdmitCardVerifyPage />} />
      <Route path="/admit-card/verify/:token" element={<PublicAdmitCardVerifyPage />} />
      <Route path="/pitch-deck" element={<PitchDeckPage />} />

      {/* Role Dashboards */}
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
        path="/examiner"
        element={
          <ProtectedRoute roles={[UserRole.EXAMINER, UserRole.SUPER_ADMIN]}>
            <ExaminerDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/controller"
        element={
          <ProtectedRoute roles={[UserRole.CONTROLLER, UserRole.SUPER_ADMIN]}>
            <ControllerDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute roles={[UserRole.STUDENT]}>
            <StudentDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/results"
        element={
          <ProtectedRoute roles={[UserRole.STUDENT]}>
            <StudentDashboardPage resultsOnly />
          </ProtectedRoute>
        }
      />

      {/* VeriMark 2.0 Smart Examination & Verification Workflows */}
      <Route
        path="/notifications"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/proof-of-result"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <ProofOfResultPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/result-comparison"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <ResultComparisonPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <ResultAnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exam-schedule"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <ExamSchedulePage scopeMode="DEFAULT" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assigned-exams"
        element={
          <ProtectedRoute roles={[UserRole.EXAMINER, UserRole.SUPER_ADMIN]}>
            <ExamSchedulePage scopeMode="ASSIGNED" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exam-management"
        element={
          <ProtectedRoute roles={[UserRole.CONTROLLER, UserRole.SUPER_ADMIN]}>
            <ExamSchedulePage scopeMode="MANAGE" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exam-countdown"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <ExamCountdownPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admit-cards"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <AdmitCardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <TicketsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <ProtectedRoute roles={[UserRole.STUDENT, UserRole.EXAMINER]}>
            <TicketsPage startCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/revaluations"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
            <RevaluationPage />
          </ProtectedRoute>
        }
      />

      {/* Preserved VeriMark 1.0 Cryptographic Core Routes */}
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
      <Route
        path="/marksheet/:resultId"
        element={
          <ProtectedRoute roles={ALL_AUTHENTICATED_ROLES}>
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
