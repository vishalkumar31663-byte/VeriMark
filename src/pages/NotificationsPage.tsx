import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink, Filter } from 'lucide-react';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecord,
} from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import {
  EmptyState,
  LoadingSkeleton,
  formatEnumLabel,
  formatRelativeTime,
} from '../components/v2/UiPrimitives';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function NotificationsPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [category, setCategory] = useState<string>('ALL');
  const [priority, setPriority] = useState<string>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== 'ALL') params.set('category', category);
      if (priority !== 'ALL') params.set('priority', priority);
      if (unreadOnly) params.set('unreadOnly', '1');
      const data = await apiRequest<{
        notifications: NotificationRecord[];
        unreadCount: number;
      }>(`/api/notifications?${params.toString()}`);
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      pushToast(
        'error',
        'Could not load notifications',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [category, priority, unreadOnly, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkRead = async (item: NotificationRecord, openLink = false) => {
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
        // ignore
      }
    }
    if (openLink && item.linkPath) {
      navigate(item.linkPath);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/notifications/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      pushToast('success', 'All notifications marked as read');
    } catch (err) {
      pushToast(
        'error',
        'Could not update notifications',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <AppShell
      title="Smart Notifications"
      breadcrumb="VeriMark 2.0 / Notifications"
      actions={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mark All Read ({unreadCount})</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Filter Bar */}
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Filter:</span>
          </div>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
          >
            <option value="ALL">All Categories</option>
            {Object.values(NotificationCategory).map((c) => (
              <option key={c} value={c}>
                {formatEnumLabel(c)}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
          >
            <option value="ALL">All Priorities</option>
            {Object.values(NotificationPriority).map((p) => (
              <option key={p} value={p}>
                {formatEnumLabel(p)}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Unread only</span>
          </label>
        </section>

        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No matching notifications"
            description="Notifications generated by exam scheduling, admit card publication, tickets, revaluations, dual-signed corrections, and security audits appear here."
          />
        ) : (
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <div
                key={item.id}
                className={`p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                  !item.isRead ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {formatEnumLabel(item.category)}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-semibold ${
                        item.priority === NotificationPriority.CRITICAL
                          ? 'text-red-600 dark:text-red-400'
                          : item.priority === NotificationPriority.HIGH
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {item.priority}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatRelativeTime(item.createdAt)} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3
                    className={`text-sm ${
                      !item.isRead
                        ? 'font-bold text-slate-900 dark:text-white'
                        : 'font-semibold text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.message}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(item, false)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Mark Read
                    </button>
                  )}
                  {item.linkPath && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(item, true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
