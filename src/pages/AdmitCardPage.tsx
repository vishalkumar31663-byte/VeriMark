import React, { useCallback, useEffect, useState } from 'react';
import { IdCard, RefreshCw, Send, Users } from 'lucide-react';
import { UserRole } from '../../shared/types';
import {
  AdmitCardRecord,
  ExamScheduleRecord,
  ExamScheduleStatus,
} from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { EmptyState, LoadingSkeleton } from '../components/v2/UiPrimitives';
import { AdmitCardPreview } from '../components/v2/WorkflowComponents';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

type EnrichedAdmitCard = AdmitCardRecord & { qrDataUrl?: string; verifyUrl?: string };

interface StudentOption {
  id: string;
  registrationNumber: string;
  fullName: string;
}

export function AdmitCardPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const isController =
    user?.role === UserRole.CONTROLLER || user?.role === UserRole.SUPER_ADMIN;

  const [cards, setCards] = useState<EnrichedAdmitCard[]>([]);
  const [schedules, setSchedules] = useState<ExamScheduleRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [seatForm, setSeatForm] = useState({
    scheduleId: '',
    studentId: '',
    room: 'LH-304',
    seatNumber: 'R1-S09',
  });
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const cardRes = await apiRequest<{ admitCards: EnrichedAdmitCard[] }>(
        '/api/admit-cards'
      );
      setCards(cardRes.admitCards);

      if (isController) {
        const [schRes, catRes] = await Promise.all([
          apiRequest<{ schedules: ExamScheduleRecord[] }>(
            '/api/exam-schedules?status=PUBLISHED'
          ),
          apiRequest<{ students: StudentOption[] }>('/api/catalog'),
        ]);
        const pub = schRes.schedules.filter(
          (s) => s.status === ExamScheduleStatus.PUBLISHED
        );
        setSchedules(pub);
        setStudents(catRes.students);
        if (pub.length > 0 && !selectedScheduleId) {
          setSelectedScheduleId(pub[0].id);
          setSeatForm((f) => ({
            ...f,
            scheduleId: pub[0].id,
            room: pub[0].room || 'LH-304',
          }));
        }
        if (catRes.students.length > 0 && !seatForm.studentId) {
          setSeatForm((f) => ({ ...f, studentId: catRes.students[0].id }));
        }
      }
    } catch (err) {
      pushToast(
        'error',
        'Could not load digital admit cards',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [isController, pushToast, selectedScheduleId, seatForm.studentId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handlePublishCards = async (reissueExisting: boolean) => {
    if (!selectedScheduleId) return;
    setPublishing(true);
    try {
      const res = await apiRequest<{ issuedCount: number }>('/api/admit-cards/publish', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: selectedScheduleId,
          reissueExisting,
        }),
      });
      pushToast(
        'success',
        reissueExisting
          ? `Reissued ${res.issuedCount} admit card(s)`
          : `Published ${res.issuedCount} new admit card(s)`,
        'Affected students have been notified.'
      );
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Admit card issuance failed',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleAssignSeat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admit-cards/seats', {
        method: 'POST',
        body: JSON.stringify(seatForm),
      });
      pushToast(
        'success',
        `Seat ${seatForm.seatNumber} allocated in ${seatForm.room}`,
        'Reissue admit cards if you want existing PDFs updated to a new version.'
      );
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Seat allocation conflict',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <AppShell
      title={
        user?.role === UserRole.STUDENT
          ? 'My Digital Admit Cards'
          : isController
          ? 'Admit Card & Seat Management'
          : 'Assigned Exam Admit Cards'
      }
      breadcrumb="VeriMark 2.0 / Digital Admit Cards"
    >
      <div className="space-y-6">
        {/* Controller Issuance & Seat Allocation Panel */}
        {isController && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                <h2 className="font-display font-bold text-base">
                  Publish or Reissue Digital Admit Cards
                </h2>
              </div>
              <label className="block space-y-1 text-xs">
                <span className="font-semibold">Published Examination Schedule</span>
                <select
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.subjectCode} ({s.examDate}) · {s.course} Sem {s.semester} · {s.mode}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={publishing || !selectedScheduleId}
                  onClick={() => void handlePublishCards(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
                >
                  Publish Missing Cards
                </button>
                <button
                  type="button"
                  disabled={publishing || !selectedScheduleId}
                  onClick={() => void handlePublishCards(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reissue Updated Version</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={handleAssignSeat}
              className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                <h2 className="font-display font-bold text-base">
                  Seat & Room Allocation (Conflict-Checked)
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="font-semibold">Examination</span>
                  <select
                    value={seatForm.scheduleId}
                    onChange={(e) =>
                      setSeatForm({ ...seatForm, scheduleId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  >
                    {schedules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subjectCode} ({s.examDate})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-semibold">Student</span>
                  <select
                    value={seatForm.studentId}
                    onChange={(e) =>
                      setSeatForm({ ...seatForm, studentId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  >
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.registrationNumber} — {st.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="font-semibold">Room / Hall</span>
                  <input
                    required
                    type="text"
                    value={seatForm.room}
                    onChange={(e) => setSeatForm({ ...seatForm, room: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold">Seat Number</span>
                  <input
                    required
                    type="text"
                    value={seatForm.seatNumber}
                    onChange={(e) =>
                      setSeatForm({ ...seatForm, seatNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 font-mono"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-indigo-600 text-white hover:opacity-90"
              >
                Assign Seat
              </button>
            </form>
          </section>
        )}

        {loading ? (
          <LoadingSkeleton rows={3} />
        ) : cards.length === 0 ? (
          <EmptyState
            icon={IdCard}
            title="No digital admit cards available yet"
            description="Digital admit cards appear here once the Examination Controller publishes them for your scheduled examinations."
          />
        ) : (
          <div className="space-y-5">
            {cards.map((card) => (
              <AdmitCardPreview key={card.id} card={card} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
