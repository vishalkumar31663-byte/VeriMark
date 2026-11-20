import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { UserRole } from '../../shared/types';
import { ExamScheduleRecord, ExamScheduleStatus } from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { ExamCountdownCard } from '../components/v2/ExamModeAndCountdown';
import { EmptyState, LoadingSkeleton } from '../components/v2/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function ExamCountdownPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [schedules, setSchedules] = useState<ExamScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs =
      user?.role === UserRole.EXAMINER
        ? '?assignedOnly=1&status=PUBLISHED'
        : '?status=PUBLISHED';
    apiRequest<{ schedules: ExamScheduleRecord[] }>(`/api/exam-schedules${qs}`)
      .then((res) =>
        setSchedules(
          res.schedules.filter((s) => s.status === ExamScheduleStatus.PUBLISHED)
        )
      )
      .catch((err) =>
        pushToast(
          'error',
          'Could not load exam countdowns',
          err instanceof Error ? err.message : undefined
        )
      )
      .finally(() => setLoading(false));
  }, [user, pushToast]);

  return (
    <AppShell
      title="Live Exam Countdown"
      breadcrumb="VeriMark 2.0 / Exam Countdown"
    >
      <div className="space-y-6">
        {loading ? (
          <LoadingSkeleton rows={3} />
        ) : schedules.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No upcoming examinations scheduled"
            description="Live countdown timers compute automatically from official published examination timetables."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {schedules.map((sch) => (
              <ExamCountdownCard key={sch.id} schedule={sch} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
