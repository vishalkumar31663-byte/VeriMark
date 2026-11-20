import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Blocks,
  CalendarClock,
  Clock,
  FileCheck2,
  FilePlus2,
  FlaskConical,
  GitCompareArrows,
  GitPullRequest,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Presentation,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { UserRole } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { VeriMarkLogo } from './Logo';
import { NotificationBell } from './v2/NotificationBell';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  devOnly?: boolean;
}

function getNavItemsForRole(role: UserRole): NavItem[] {
  switch (role) {
    case UserRole.STUDENT:
      return [
        { label: 'Dashboard', to: '/student', icon: LayoutDashboard, exact: true },
        { label: 'Exam Schedule', to: '/exam-schedule', icon: CalendarClock },
        { label: 'Exam Countdown', to: '/exam-countdown', icon: Clock },
        { label: 'My Admit Cards', to: '/admit-cards', icon: IdCard },
        { label: 'My Results', to: '/student/results', icon: GraduationCap },
        { label: 'Proof of Result', to: '/proof-of-result', icon: ShieldCheck },
        { label: 'Result Comparison', to: '/result-comparison', icon: GitCompareArrows },
        { label: 'Result Analytics', to: '/analytics', icon: BarChart3 },
        { label: 'Revaluation', to: '/revaluations', icon: RefreshCcw },
        { label: 'Support Tickets', to: '/tickets', icon: LifeBuoy },
        { label: 'Notifications', to: '/notifications', icon: Bell },
        { label: 'Public QR Verify', to: '/verify', icon: QrCode },
      ];

    case UserRole.EXAMINER:
      return [
        { label: 'Examiner Dashboard', to: '/examiner', icon: LayoutDashboard, exact: true },
        { label: 'Assigned Exams', to: '/assigned-exams', icon: CalendarClock },
        { label: 'Exam Countdown', to: '/exam-countdown', icon: Clock },
        { label: 'Correction Approvals', to: '/approvals/examiner', icon: UserCheck },
        { label: 'Assigned Tickets', to: '/tickets', icon: LifeBuoy },
        { label: 'Revaluation Reviews', to: '/revaluations', icon: RefreshCcw },
        { label: 'Result Comparison', to: '/result-comparison', icon: GitCompareArrows },
        { label: 'Result Analytics', to: '/analytics', icon: BarChart3 },
        { label: 'Admit Card Check', to: '/admit-cards', icon: IdCard },
        { label: 'Published Results', to: '/results', icon: FileCheck2 },
        { label: 'Notifications', to: '/notifications', icon: Bell },
        { label: 'Public QR Verify', to: '/verify', icon: QrCode },
      ];

    case UserRole.CONTROLLER:
      return [
        { label: 'Controller Dashboard', to: '/controller', icon: LayoutDashboard, exact: true },
        { label: 'Exam Management', to: '/exam-management', icon: CalendarClock },
        { label: 'Admit Cards & Seats', to: '/admit-cards', icon: IdCard },
        { label: 'Controller Approvals', to: '/approvals/controller', icon: UserCheck },
        { label: 'Ticket Management', to: '/tickets', icon: LifeBuoy },
        { label: 'Revaluation Decisions', to: '/revaluations', icon: RefreshCcw },
        { label: 'Result Comparison', to: '/result-comparison', icon: GitCompareArrows },
        { label: 'Result Analytics', to: '/analytics', icon: BarChart3 },
        { label: 'Ledger Explorer', to: '/ledger', icon: Blocks },
        { label: 'Security Audit', to: '/audit', icon: ShieldCheck },
        { label: 'Notifications', to: '/notifications', icon: Bell },
        { label: 'Public QR Verify', to: '/verify', icon: QrCode },
      ];

    case UserRole.SUPER_ADMIN:
    default:
      return [
        { label: 'Admin Dashboard', to: '/dashboard', icon: LayoutDashboard, exact: true },
        { label: 'Students', to: '/students', icon: Users },
        { label: 'Publish Results', to: '/publish', icon: FilePlus2 },
        { label: 'Published Results', to: '/results', icon: FileCheck2 },
        { label: 'Exam Management', to: '/exam-management', icon: CalendarClock },
        { label: 'Admit Cards', to: '/admit-cards', icon: IdCard },
        { label: 'Correction Requests', to: '/corrections', icon: GitPullRequest },
        { label: 'Examiner Approvals', to: '/approvals/examiner', icon: UserCheck },
        { label: 'Controller Approvals', to: '/approvals/controller', icon: UserCheck },
        { label: 'Tickets', to: '/tickets', icon: LifeBuoy },
        { label: 'Revaluations', to: '/revaluations', icon: RefreshCcw },
        { label: 'Result Analytics', to: '/analytics', icon: BarChart3 },
        { label: 'Ledger Explorer', to: '/ledger', icon: Blocks },
        { label: 'Security Audit', to: '/audit', icon: ShieldCheck },
        { label: 'Notifications', to: '/notifications', icon: Bell },
        { label: 'Public QR Verify', to: '/verify', icon: QrCode },
        { label: 'Judge Pitch Deck', to: '/pitch-deck', icon: Presentation },
        { label: 'Tamper Lab (Dev)', to: '/tamper-lab', icon: FlaskConical, devOnly: true },
      ];
  }
}

function formatRoleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'Super Admin';
    case UserRole.EXAMINER:
      return 'Examiner';
    case UserRole.CONTROLLER:
      return 'Exam Controller';
    case UserRole.STUDENT:
      return 'Student';
    default:
      return role;
  }
}

export function AppShell({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, logout, tamperLabEnabled } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = user
    ? getNavItemsForRole(user.role).filter((item) => !(item.devOnly && !tamperLabEnabled))
    : [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const renderSidebarLinks = () => (
    <nav aria-label="Workspace navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {visibleItems.map((item) => {
        const active = item.exact
          ? location.pathname === item.to
          : location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to + '/'));
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              active
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800 z-30">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="text-lg">
            <VeriMarkLogo size={26} />
          </Link>
        </div>

        {renderSidebarLinks()}

        {user && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.fullName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {formatRoleLabel(user.role)} · {user.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Dark</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] flex flex-col bg-white dark:bg-[#0F172A] border-r border-slate-200 dark:border-slate-800 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <Link to="/" onClick={() => setMobileOpen(false)} className="text-lg">
                <VeriMarkLogo size={26} />
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarLinks()}
            {user && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <p className="text-sm font-semibold truncate">{user.fullName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {formatRoleLabel(user.role)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex-1 py-2 px-3 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700"
                  >
                    {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-2 px-3 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              {breadcrumb && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {breadcrumb}
                </p>
              )}
              <h1 className="text-base sm:text-lg font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {actions}
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
