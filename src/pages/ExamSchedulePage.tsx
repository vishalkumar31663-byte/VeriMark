import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  Download,
  Edit3,
  History,
  List,
  Plus,
  Send,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { UserRole } from '../../shared/types';
import {
  ExamMode,
  ExamScheduleHistoryRecord,
  ExamScheduleRecord,
  ExamScheduleStatus,
  ScheduleChangeRequestRecord,
} from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import { StatusLabel } from '../components/StatusLabel';
import { ExamModeBadge } from '../components/v2/ExamModeAndCountdown';
import { ExamScheduleCalendar } from '../components/v2/ExamScheduleCalendar';
import {
  ConfirmationDialog,
  EmptyState,
  LoadingSkeleton,
} from '../components/v2/UiPrimitives';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

interface SubjectOption {
  id: string;
  code: string;
  name: string;
  semester: number;
}

interface ExaminerOption {
  id: string;
  fullName: string;
  email: string;
}

export function ExamSchedulePage({
  scopeMode = 'DEFAULT',
}: {
  scopeMode?: 'DEFAULT' | 'ASSIGNED' | 'MANAGE';
}) {
  const { user } = useAuth();
  const { pushToast } = useToast();

  const isController =
    user?.role === UserRole.CONTROLLER || user?.role === UserRole.SUPER_ADMIN;
  const isExaminer = user?.role === UserRole.EXAMINER;

  const [schedules, setSchedules] = useState<ExamScheduleRecord[]>([]);
  const [changeRequests, setChangeRequests] = useState<ScheduleChangeRequestRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [examiners, setExaminers] = useState<ExaminerOption[]>([]);
  const [viewMode, setViewMode] = useState<'LIST' | 'CALENDAR'>('LIST');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Create/Edit Form State (Controller)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    subjectId: '',
    course: 'B.Tech Computer Science',
    semester: 6,
    academicSession: '2025-2026',
    category: 'End-Term Theory',
    examDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    startTime: '09:30',
    endTime: '12:30',
    timezone: 'Asia/Kolkata',
    mode: ExamMode.OFFLINE,
    onlineUrl: 'https://exam-portal.demouniversity.edu/session/live',
    accessInstructions: 'Login 15 minutes before start using institutional SSO.',
    campus: 'Main Academic Campus',
    building: 'Block 34 — School of Computing',
    room: 'LH-305',
    reportingTime: '09:00',
    requiredDocuments: 'University Photo ID & VeriMark Admit Card',
    instructions: 'Carry only permitted exam stationery and official ID.',
    examinerUserId: '',
    publishImmediately: true,
  });
  const [submitting, setSubmitting] = useState(false);

  // History modal / drawer state
  const [historyTarget, setHistoryTarget] = useState<ExamScheduleRecord | null>(null);
  const [historyItems, setHistoryItems] = useState<ExamScheduleHistoryRecord[]>([]);

  // Examiner schedule change request modal
  const [changeReqTarget, setChangeReqTarget] = useState<ExamScheduleRecord | null>(null);
  const [reqChangesText, setReqChangesText] = useState('');
  const [reqReasonText, setReqReasonText] = useState('');

  // Cancel confirmation dialog
  const [cancelTarget, setCancelTarget] = useState<ExamScheduleRecord | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (scopeMode === 'ASSIGNED') qs.set('assignedOnly', '1');
      if (modeFilter !== 'ALL') qs.set('mode', modeFilter);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);

      const [schRes, reqRes] = await Promise.all([
        apiRequest<{ schedules: ExamScheduleRecord[] }>(
          `/api/exam-schedules?${qs.toString()}`
        ),
        isController || isExaminer
          ? apiRequest<{ requests: ScheduleChangeRequestRecord[] }>(
              '/api/exam-schedules/change-requests'
            )
          : Promise.resolve({ requests: [] }),
      ]);
      setSchedules(schRes.schedules);
      setChangeRequests(reqRes.requests);

      if (isController) {
        const [catRes, exRes] = await Promise.all([
          apiRequest<{ subjects: SubjectOption[] }>('/api/catalog'),
          apiRequest<{ examiners: ExaminerOption[] }>('/api/exam-schedules/examiners'),
        ]);
        setSubjects(catRes.subjects);
        setExaminers(exRes.examiners);
        if (catRes.subjects.length > 0 && !formState.subjectId) {
          setFormState((f) => ({ ...f, subjectId: catRes.subjects[0].id }));
        }
      }
    } catch (err) {
      pushToast(
        'error',
        'Could not load examination schedules',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [scopeMode, modeFilter, statusFilter, isController, isExaminer, pushToast, formState.subjectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await apiRequest(`/api/exam-schedules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            examDate: formState.examDate,
            startTime: formState.startTime,
            endTime: formState.endTime,
            timezone: formState.timezone,
            mode: formState.mode,
            onlineUrl: formState.mode === ExamMode.ONLINE ? formState.onlineUrl : null,
            accessInstructions:
              formState.mode === ExamMode.ONLINE ? formState.accessInstructions : null,
            campus: formState.mode === ExamMode.OFFLINE ? formState.campus : null,
            building: formState.mode === ExamMode.OFFLINE ? formState.building : null,
            room: formState.mode === ExamMode.OFFLINE ? formState.room : null,
            reportingTime: formState.reportingTime,
            requiredDocuments: formState.requiredDocuments,
            instructions: formState.instructions,
          }),
        });
        pushToast(
          'success',
          'Examination schedule updated',
          'Affected students and assigned examiners have been notified.'
        );
      } else {
        await apiRequest('/api/exam-schedules', {
          method: 'POST',
          body: JSON.stringify({
            subjectId: formState.subjectId,
            course: formState.course,
            semester: Number(formState.semester),
            academicSession: formState.academicSession,
            category: formState.category,
            examDate: formState.examDate,
            startTime: formState.startTime,
            endTime: formState.endTime,
            timezone: formState.timezone,
            mode: formState.mode,
            onlineUrl: formState.mode === ExamMode.ONLINE ? formState.onlineUrl : null,
            accessInstructions:
              formState.mode === ExamMode.ONLINE ? formState.accessInstructions : null,
            campus: formState.mode === ExamMode.OFFLINE ? formState.campus : null,
            building: formState.mode === ExamMode.OFFLINE ? formState.building : null,
            room: formState.mode === ExamMode.OFFLINE ? formState.room : null,
            reportingTime: formState.reportingTime,
            requiredDocuments: formState.requiredDocuments,
            instructions: formState.instructions,
            examinerUserIds: formState.examinerUserId ? [formState.examinerUserId] : [],
            publishImmediately: formState.publishImmediately,
          }),
        });
        pushToast(
          'success',
          formState.publishImmediately
            ? 'Examination created & published'
            : 'Draft examination schedule created'
        );
      }
      setShowForm(false);
      setEditingId(null);
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Schedule validation failed',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (sch: ExamScheduleRecord) => {
    setEditingId(sch.id);
    setFormState({
      subjectId: sch.subjectId,
      course: sch.course,
      semester: sch.semester,
      academicSession: sch.academicSession,
      category: sch.category,
      examDate: sch.examDate,
      startTime: sch.startTime,
      endTime: sch.endTime,
      timezone: sch.timezone,
      mode: sch.mode,
      onlineUrl: sch.onlineUrl || 'https://exam-portal.demouniversity.edu/session/live',
      accessInstructions:
        sch.accessInstructions || 'Sign in 15 minutes prior to start via university portal.',
      campus: sch.campus || 'Main Academic Campus',
      building: sch.building || 'Block 34',
      room: sch.room || 'LH-304',
      reportingTime: sch.reportingTime || '09:00',
      requiredDocuments: sch.requiredDocuments || 'University Photo ID & Admit Card',
      instructions: sch.instructions,
      examinerUserId: sch.assignments[0]?.examinerUserId ?? '',
      publishImmediately: sch.status === ExamScheduleStatus.PUBLISHED,
    });
    setShowForm(true);
  };

  const handlePublish = async (sch: ExamScheduleRecord) => {
    try {
      await apiRequest(`/api/exam-schedules/${sch.id}/publish`, { method: 'POST' });
      pushToast(
        'success',
        `Published ${sch.subjectCode} timetable`,
        'Enrolled students and assigned examiners were notified.'
      );
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Could not publish schedule',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await apiRequest(`/api/exam-schedules/${cancelTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: ExamScheduleStatus.CANCELLED }),
      });
      pushToast('info', `Cancelled ${cancelTarget.subjectCode} examination`);
      setCancelTarget(null);
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Could not cancel schedule',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleAssignExaminer = async (scheduleId: string, examinerUserId: string) => {
    if (!examinerUserId) return;
    try {
      await apiRequest(`/api/exam-schedules/${scheduleId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ examinerUserId, roleLabel: 'Primary Examiner' }),
      });
      pushToast('success', 'Examiner assigned and notified');
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Assignment conflict',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const openHistory = async (sch: ExamScheduleRecord) => {
    setHistoryTarget(sch);
    try {
      const res = await apiRequest<{ history: ExamScheduleHistoryRecord[] }>(
        `/api/exam-schedules/${sch.id}/history`
      );
      setHistoryItems(res.history);
    } catch {
      setHistoryItems([]);
    }
  };

  const submitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeReqTarget) return;
    try {
      await apiRequest(`/api/exam-schedules/${changeReqTarget.id}/change-requests`, {
        method: 'POST',
        body: JSON.stringify({
          requestedChanges: reqChangesText,
          reason: reqReasonText,
        }),
      });
      pushToast(
        'success',
        'Schedule modification request submitted',
        'The Examination Controller has been notified.'
      );
      setChangeReqTarget(null);
      setReqChangesText('');
      setReqReasonText('');
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Could not submit request',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleReviewChangeReq = async (
    requestId: string,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    try {
      await apiRequest(`/api/exam-schedules/change-requests/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reviewNote:
            decision === 'APPROVED'
              ? 'Approved by Examination Controller; timetable adjustment authorized.'
              : 'Schedule slot cannot be modified due to cohort examination commitments.',
        }),
      });
      pushToast('success', `Modification request ${decision.toLowerCase()}`);
      await loadAll();
    } catch (err) {
      pushToast(
        'error',
        'Could not process request',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const pageTitle =
    scopeMode === 'MANAGE'
      ? 'Exam Schedule & Timetable Management'
      : scopeMode === 'ASSIGNED'
      ? 'Assigned Examinations'
      : 'Examination Schedule & Modes';

  return (
    <AppShell
      title={pageTitle}
      breadcrumb={`VeriMark 2.0 / ${pageTitle}`}
      actions={
        <div className="flex items-center gap-2">
          <a
            href={`/api/exam-schedules/pdf${scopeMode === 'ASSIGNED' ? '?assignedOnly=1' : ''}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Timetable PDF</span>
          </a>
          {isController && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setShowForm((s) => !s);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Create Exam</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Controller Create/Edit Exam Schedule Form */}
        {isController && showForm && (
          <form
            onSubmit={handleSaveSchedule}
            className="bg-white dark:bg-[#0F172A] border border-indigo-200 dark:border-indigo-900 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                {editingId ? 'Edit Examination Schedule' : 'Create Examination Schedule'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {!editingId && (
                <>
                  <label className="space-y-1">
                    <span className="font-semibold">Subject</span>
                    <select
                      required
                      value={formState.subjectId}
                      onChange={(e) =>
                        setFormState({ ...formState, subjectId: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.name} (Sem {s.semester})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">Course / Program</span>
                    <input
                      required
                      type="text"
                      value={formState.course}
                      onChange={(e) =>
                        setFormState({ ...formState, course: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">Semester</span>
                    <input
                      required
                      type="number"
                      min={1}
                      max={12}
                      value={formState.semester}
                      onChange={(e) =>
                        setFormState({ ...formState, semester: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    />
                  </label>
                </>
              )}

              <label className="space-y-1">
                <span className="font-semibold">Exam Date</span>
                <input
                  required
                  type="date"
                  value={formState.examDate}
                  onChange={(e) =>
                    setFormState({ ...formState, examDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Start Time (24h)</span>
                <input
                  required
                  type="time"
                  value={formState.startTime}
                  onChange={(e) =>
                    setFormState({ ...formState, startTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">End Time (24h)</span>
                <input
                  required
                  type="time"
                  value={formState.endTime}
                  onChange={(e) =>
                    setFormState({ ...formState, endTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Examination Mode</span>
                <select
                  value={formState.mode}
                  onChange={(e) =>
                    setFormState({ ...formState, mode: e.target.value as ExamMode })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  <option value={ExamMode.OFFLINE}>Offline In-Person</option>
                  <option value={ExamMode.ONLINE}>Online Portal</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Reporting Time</span>
                <input
                  type="time"
                  value={formState.reportingTime}
                  onChange={(e) =>
                    setFormState({ ...formState, reportingTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>

              {!editingId && (
                <label className="space-y-1">
                  <span className="font-semibold">Assign Examiner</span>
                  <select
                    value={formState.examinerUserId}
                    onChange={(e) =>
                      setFormState({ ...formState, examinerUserId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                  >
                    <option value="">Unassigned (assign later)</option>
                    {examiners.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {formState.mode === ExamMode.OFFLINE ? (
                <>
                  <label className="space-y-1">
                    <span className="font-semibold">Campus</span>
                    <input
                      type="text"
                      value={formState.campus}
                      onChange={(e) =>
                        setFormState({ ...formState, campus: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">Building</span>
                    <input
                      type="text"
                      value={formState.building}
                      onChange={(e) =>
                        setFormState({ ...formState, building: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">Room / Hall (Conflict-Checked)</span>
                    <input
                      required
                      type="text"
                      value={formState.room}
                      onChange={(e) =>
                        setFormState({ ...formState, room: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="space-y-1 md:col-span-2">
                    <span className="font-semibold">Authorized Online Exam URL (https://)</span>
                    <input
                      required
                      type="url"
                      value={formState.onlineUrl}
                      onChange={(e) =>
                        setFormState({ ...formState, onlineUrl: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">Online Access Instructions</span>
                    <input
                      type="text"
                      value={formState.accessInstructions}
                      onChange={(e) =>
                        setFormState({ ...formState, accessInstructions: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                    />
                  </label>
                </>
              )}

              <label className="space-y-1 md:col-span-3">
                <span className="font-semibold">Examination Conduct Instructions</span>
                <input
                  type="text"
                  value={formState.instructions}
                  onChange={(e) =>
                    setFormState({ ...formState, instructions: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>
            </div>

            {!editingId && (
              <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.publishImmediately}
                  onChange={(e) =>
                    setFormState({ ...formState, publishImmediately: e.target.checked })
                  }
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Publish immediately and notify enrolled students</span>
              </label>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
              >
                {submitting
                  ? 'Validating Conflicts…'
                  : editingId
                  ? 'Save Changes & Notify'
                  : 'Save Schedule'}
              </button>
            </div>
          </form>
        )}

        {/* View Toggle & Filters */}
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by mode"
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">All Modes</option>
              <option value={ExamMode.OFFLINE}>Offline In-Person</option>
              <option value={ExamMode.ONLINE}>Online Portal</option>
            </select>
            {isController && (
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value={ExamScheduleStatus.PUBLISHED}>Published</option>
                <option value={ExamScheduleStatus.DRAFT}>Draft</option>
                <option value={ExamScheduleStatus.CANCELLED}>Cancelled</option>
              </select>
            )}
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
                viewMode === 'LIST'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CALENDAR')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
                viewMode === 'CALENDAR'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Calendar</span>
            </button>
          </div>
        </section>

        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : schedules.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No examination schedules found"
            description="Adjust your filters or check back once the Examination Controller publishes timetables for your cohort."
          />
        ) : viewMode === 'CALENDAR' ? (
          <ExamScheduleCalendar schedules={schedules} />
        ) : (
          <section className="space-y-4">
            {schedules.map((sch) => (
              <article
                key={sch.id}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {sch.subjectCode}
                      </span>
                      <ExamModeBadge mode={sch.mode} />
                      <StatusLabel
                        tone={
                          sch.status === ExamScheduleStatus.PUBLISHED
                            ? 'verified'
                            : sch.status === ExamScheduleStatus.CANCELLED
                            ? 'danger'
                            : 'warning'
                        }
                        label={sch.status}
                      />
                      <span className="font-mono text-[11px] text-slate-500">
                        {sch.examinationId}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                      {sch.subjectTitle}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <strong>{sch.examDate}</strong> · {sch.startTime}–{sch.endTime} (
                      {sch.timezone}) · {sch.course} Sem {sch.semester} · {sch.category}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {sch.mode === ExamMode.ONLINE ? (
                        <>
                          <strong>Online Portal:</strong>{' '}
                          <span className="font-mono text-sky-600 dark:text-sky-400">
                            {sch.onlineUrl || 'Authorized University Portal'}
                          </span>
                          {sch.accessInstructions ? ` — ${sch.accessInstructions}` : ''}
                        </>
                      ) : (
                        <>
                          <strong>Venue:</strong> {sch.campus}, {sch.building}, Room{' '}
                          <strong>{sch.studentRoom || sch.room}</strong>
                          {sch.studentSeatNumber ? ` · Seat ${sch.studentSeatNumber}` : ''}
                          {sch.reportingTime ? ` · Report by ${sch.reportingTime}` : ''}
                        </>
                      )}
                    </p>
                    {sch.assignments.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Assigned Examiner(s):{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {sch.assignments.map((a) => a.examinerName).join(', ')}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Role-specific Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isController && (
                      <>
                        {sch.status === ExamScheduleStatus.DRAFT && (
                          <button
                            type="button"
                            onClick={() => void handlePublish(sch)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Publish</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(sch)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Edit / Mode</span>
                        </button>
                        {examiners.length > 0 && sch.assignments.length === 0 && (
                          <button
                            type="button"
                            onClick={() => void handleAssignExaminer(sch.id, examiners[0].id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Assign Examiner</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void openHistory(sch)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <History className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Audit</span>
                        </button>
                        {sch.status !== ExamScheduleStatus.CANCELLED && (
                          <button
                            type="button"
                            onClick={() => setCancelTarget(sch)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </>
                    )}

                    {isExaminer && (
                      <button
                        type="button"
                        onClick={() => setChangeReqTarget(sch)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Send className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                        <span>Request Modification</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {/* Schedule Change Requests Panel (Examiner & Controller) */}
        {(isController || isExaminer) && changeRequests.length > 0 && (
          <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
              Schedule Modification Requests ({changeRequests.length})
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {changeRequests.map((req) => (
                <div
                  key={req.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {req.subjectCode} ({req.examinationId}) · Requested by{' '}
                      {req.requestedByName}
                    </p>
                    <p className="text-slate-800 dark:text-slate-200 font-medium">
                      Change: {req.requestedChanges}
                    </p>
                    <p className="text-slate-500">Reason: {req.reason}</p>
                    {req.reviewNote && (
                      <p className="text-emerald-700 dark:text-emerald-400">
                        Controller Note: {req.reviewNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isController && req.status === 'PENDING' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleReviewChangeReq(req.id, 'APPROVED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReviewChangeReq(req.id, 'REJECTED')}
                          className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className="font-mono font-semibold text-slate-500">
                        {req.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Schedule Change History Panel */}
        {historyTarget && (
          <section className="bg-white dark:bg-[#0F172A] border border-indigo-200 dark:border-indigo-900 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm">
                Auditable Schedule History — {historyTarget.subjectCode} ({historyTarget.examinationId})
              </h3>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {historyItems.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 flex flex-wrap justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-2">
                      {h.action}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {h.changeSummary}
                    </span>
                    <span className="text-slate-500 ml-2">by {h.actorName}</span>
                  </div>
                  <span className="font-mono text-slate-400">
                    {new Date(h.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Examiner Change Request Modal */}
        {changeReqTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
            role="dialog"
            aria-modal="true"
          >
            <form
              onSubmit={submitChangeRequest}
              className="w-full max-w-md rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <h3 className="font-display font-bold text-base">
                Request Schedule Modification — {changeReqTarget.subjectCode}
              </h3>
              <label className="block space-y-1 text-xs">
                <span className="font-semibold">Requested Adjustment</span>
                <input
                  required
                  type="text"
                  value={reqChangesText}
                  onChange={(e) => setReqChangesText(e.target.value)}
                  placeholder="e.g., Shift start time by 30 minutes or assign larger lab room"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-semibold">Operational Reason</span>
                <textarea
                  required
                  rows={3}
                  value={reqReasonText}
                  onChange={(e) => setReqReasonText(e.target.value)}
                  placeholder="Explain the academic or venue reason for the Controller..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setChangeReqTarget(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Submit to Controller
                </button>
              </div>
            </form>
          </div>
        )}

        <ConfirmationDialog
          open={Boolean(cancelTarget)}
          tone="danger"
          title={`Cancel ${cancelTarget?.subjectCode ?? ''} Examination?`}
          message="Cancelling this examination will notify all affected students and assigned examiners and record an immutable schedule history entry."
          confirmLabel="Confirm Cancellation"
          onConfirm={() => void handleConfirmCancel()}
          onCancel={() => setCancelTarget(null)}
        />
      </div>
    </AppShell>
  );
}
