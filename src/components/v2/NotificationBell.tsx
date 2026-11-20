import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  FileCheck2,
  GitPullRequest,
  IdCard,
  LifeBuoy,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { NotificationCategory, NotificationRecord } from '../../../shared/v2Types';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { formatRelativeTime } from './UiPrimitives';

function categoryIcon(cat: NotificationCategory) {
  switch (cat) {
    case NotificationCategory.RESULT:
      return FileCheck2;
    case NotificationCategory.EXAM_SCHEDULE:
      return CalendarClock;
    case NotificationCategory.ADMIT_CARD:
      return IdCard;
    case NotificationCategory.TICKET:
      return LifeBuoy;
    case NotificationCategory.REVALUATION:
      return RefreshCcw;
    case NotificationCategory.CORRECTION:
      return GitPullRequest;
    case NotificationCategory.SECURITY:
      return ShieldAlert;
    default:
      return AlertTriangle;
  }
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUnreadAndRecent = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{
        notifications: NotificationRecord[];
        unreadCount: number;
      }>('/api/notifications?limit=8');
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent background refresh failure
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchUnreadAndRecent();

    // Real-time SSE stream with polling fallback
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/notifications/stream', { withCredentials: true });
      es.addEventListener('notification', (ev) => {
        try {
          const incoming = JSON.parse((ev as MessageEvent).data) as NotificationRecord;
          setItems((prev) => [incoming, ...prev.filter((n) => n.id !== incoming.id)].slice(0, 8));
          setUnreadCount((c) => c + 1);
        } catch {
          // ignore malformed payload
        }
      });
    } catch {
      // EventSource fallback handled by interval
    }

    const poll = setInterval(() => {
      void fetchUnreadAndRecent();
    }, 30_000);

    return () => {
      clearInterval(poll);
      es?.close();
    };
  }, [user, fetchUnreadAndRecent]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      void fetchUnreadAndRecent().finally(() => setLoading(false));
    }
  };

  const handleItemClick = async (item: NotificationRecord) => {
    setOpen(false);
    if (!item.isRead) {
      try {
        const res = await apiRequest<{ unreadCount: number }>(
          `/api/notifications/${encodeURIComponent(item.id)}/read`,
          { method: 'PATCH' }
        );
        setUnreadCount(res.unreadCount);
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
      } catch {
        // continue navigation
      }
    }
    if (item.linkPath) {
      navigate(item.linkPath);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/notifications/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpenToggle}
        aria-label={`Notifications (${unreadCount} unread)`}
        className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xl z-40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-sm text-slate-900 dark:text-white">
                Notifications
              </h2>
              <p className="text-[11px] text-slate-500">
                {unreadCount} unread alert{unreadCount === 1 ? '' : 's'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading && items.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">Loading alerts…</p>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                You are all caught up. Real examination and ledger notifications will appear here.
              </p>
            ) : (
              items.map((item) => {
                const Icon = categoryIcon(item.category);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleItemClick(item)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                      !item.isRead ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        item.priority === 'CRITICAL'
                          ? 'text-red-500'
                          : item.priority === 'HIGH'
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            !item.isRead
                              ? 'font-bold text-slate-900 dark:text-white'
                              : 'font-medium text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {item.title}
                        </p>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {item.message}
                      </p>
                    </div>
                    {!item.isRead && (
                      <span
                        className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-1.5 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1120] text-center">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View Full Notification History →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
