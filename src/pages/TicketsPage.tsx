import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  KeyRound,
  LifeBuoy,
  Lock,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
} from 'lucide-react';
import { ResultRecord, UserRole } from '../../shared/types';
import {
  TicketCategory,
  TicketDetailRecord,
  TicketRecord,
  TicketStatus,
} from '../../shared/v2Types';
import { AppShell } from '../components/AppShell';
import {
  EmptyState,
  FileAttachmentInput,
  LoadingSkeleton,
  SelectedAttachment,
  formatBytes,
  formatEnumLabel,
} from '../components/v2/UiPrimitives';
import { TicketStatusTimeline } from '../components/v2/WorkflowComponents';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../lib/api';

export function TicketsPage({ startCreate = false }: { startCreate?: boolean }) {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const isStudent = user?.role === UserRole.STUDENT;
  const isExaminer = user?.role === UserRole.EXAMINER;
  const isController =
    user?.role === UserRole.CONTROLLER || user?.role === UserRole.SUPER_ADMIN;

  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>(searchParams.get('id') ?? '');
  const [detail, setDetail] = useState<TicketDetailRecord | null>(null);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showCreate, setShowCreate] = useState<boolean>(startCreate);
  const [loading, setLoading] = useState(true);

  // Create Ticket Form
  const [createForm, setCreateForm] = useState({
    category: isExaminer ? TicketCategory.OTHER_ACADEMIC : TicketCategory.INCORRECT_MARKS,
    subject: '',
    description: '',
    relatedResultId: '',
    priority: 'HIGH' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  });
  const [createAttachment, setCreateAttachment] = useState<SelectedAttachment | null>(null);
  const [creating, setCreating] = useState(false);

  // Message reply form
  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [replyAttachment, setReplyAttachment] = useState<SelectedAttachment | null>(null);

  // Examiner escalate / recommend form
  const [escalateReason, setEscalateReason] = useState('');
  const [recMarks, setRecMarks] = useState('');

  // Controller resolve / reject / initiate correction form
  const [resolutionReason, setResolutionReason] = useState('');
  const [proposedMarks, setProposedMarks] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // Student reopen form
  const [reopenReason, setReopenReason] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (categoryFilter !== 'ALL') qs.set('category', categoryFilter);
      const [tRes, rRes] = await Promise.all([
        apiRequest<{ tickets: TicketRecord[] }>(`/api/tickets?${qs.toString()}`),
        apiRequest<{ results: ResultRecord[] }>('/api/results'),
      ]);
      setTickets(tRes.tickets);
      setResults(rRes.results);
      if (!selectedId && tRes.tickets.length > 0 && !startCreate) {
        setSelectedId(tRes.tickets[0].id);
      }
    } catch (err) {
      pushToast(
        'error',
        'Could not load tickets',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, pushToast, selectedId, startCreate]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id) {
        setDetail(null);
        return;
      }
      try {
        const res = await apiRequest<{ ticket: TicketDetailRecord }>(
          `/api/tickets/${encodeURIComponent(id)}`
        );
        setDetail(res.ticket);
        if (res.ticket.recommendedMarks != null) {
          setProposedMarks(String(res.ticket.recommendedMarks));
        } else if (res.ticket.linkedResult) {
          setProposedMarks(String(res.ticket.linkedResult.obtainedMarks));
        }
      } catch (err) {
        pushToast(
          'error',
          'Could not load ticket details',
          err instanceof Error ? err.message : undefined
        );
      }
    },
    [pushToast]
  );

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    }
  }, [selectedId, loadDetail]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiRequest<{ ticket: TicketDetailRecord }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          relatedResultId: createForm.relatedResultId || null,
          attachment: createAttachment
            ? {
                originalName: createAttachment.originalName,
                mimeType: createAttachment.mimeType,
                contentBase64: createAttachment.contentBase64,
              }
            : null,
        }),
      });
      pushToast('success', `Ticket ${res.ticket.ticketNumber} created`);
      setCreateForm({
        category: isExaminer
          ? TicketCategory.OTHER_ACADEMIC
          : TicketCategory.INCORRECT_MARKS,
        subject: '',
        description: '',
        relatedResultId: '',
        priority: 'HIGH',
      });
      setCreateAttachment(null);
      setShowCreate(false);
      setSelectedId(res.ticket.id);
      setSearchParams({ id: res.ticket.id });
      await loadTickets();
      await loadDetail(res.ticket.id);
    } catch (err) {
      pushToast(
        'error',
        'Could not create ticket',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !replyBody.trim()) return;
    try {
      const res = await apiRequest<{ ticket: TicketDetailRecord }>(
        `/api/tickets/${detail.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            body: replyBody,
            isInternalNote: isStudent ? false : isInternalNote,
            attachment: replyAttachment
              ? {
                  originalName: replyAttachment.originalName,
                  mimeType: replyAttachment.mimeType,
                  contentBase64: replyAttachment.contentBase64,
                }
              : null,
          }),
        }
      );
      setDetail(res.ticket);
      setReplyBody('');
      setIsInternalNote(false);
      setReplyAttachment(null);
      pushToast('success', isInternalNote ? 'Internal staff note saved' : 'Reply posted');
      await loadTickets();
    } catch (err) {
      pushToast(
        'error',
        'Could not post message',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleEscalate = async () => {
    if (!detail) return;
    try {
      const res = await apiRequest<{ ticket: TicketDetailRecord }>(
        `/api/tickets/${detail.id}/escalate`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: escalateReason,
            recommendedMarks: recMarks ? Number(recMarks) : null,
          }),
        }
      );
      setDetail(res.ticket);
      setEscalateReason('');
      setRecMarks('');
      pushToast(
        'success',
        'Ticket escalated to Examination Controller',
        'Controller has been notified for formal review.'
      );
      await loadTickets();
    } catch (err) {
      pushToast(
        'error',
        'Escalation failed',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleStatusDecision = async (nextStatus: TicketStatus) => {
    if (!detail) return;
    try {
      const res = await apiRequest<{ ticket: TicketDetailRecord }>(
        `/api/tickets/${detail.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
            resolutionReason: resolutionReason || undefined,
          }),
        }
      );
      setDetail(res.ticket);
      setResolutionReason('');
      pushToast('success', `Ticket moved to ${formatEnumLabel(nextStatus)}`);
      await loadTickets();
    } catch (err) {
      pushToast(
        'error',
        'Status update failed',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleInitiateCorrection = async () => {
    if (!detail) return;
    try {
      const res = await apiRequest<{ ticket: TicketDetailRecord; correctionId: string }>(
        `/api/tickets/${detail.id}/initiate-correction`,
        {
          method: 'POST',
          body: JSON.stringify({
            proposedMarks: Number(proposedMarks),
            reason:
              correctionReason.trim() ||
              `Authorized from support ticket ${detail.ticketNumber} after marks verification.`,
          }),
        }
      );
      setDetail(res.ticket);
      setCorrectionReason('');
      pushToast(
        'success',
        `Formal Correction ${res.correctionId} Initiated`,
        'Marks remain unchanged until both Examiner and Controller Ed25519 sign and finalize.'
      );
      await loadTickets();
    } catch (err) {
      pushToast(
        'error',
        'Could not initiate correction',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  const handleReopen = async () => {
    if (!detail) return;
    try {
      const res = await apiRequest<{ ticket: TicketDetailRecord }>(
        `/api/tickets/${detail.id}/reopen`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: reopenReason }),
        }
      );
      setDetail(res.ticket);
      setReopenReason('');
      pushToast('success', 'Ticket reopened and staff notified');
      await loadTickets();
    } catch (err) {
      pushToast(
        'error',
        'Could not reopen ticket',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <AppShell
      title={
        isStudent
          ? 'Raise & Track Support Tickets'
          : isExaminer
          ? 'Assigned Student Tickets'
          : 'Ticket Management & Escalations'
      }
      breadcrumb="VeriMark 2.0 / Support Tickets"
      actions={
        (isStudent || isExaminer) && (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isExaminer ? 'Raise Operational Ticket' : 'Raise New Ticket'}</span>
          </button>
        )
      }
    >
      <div className="space-y-6">
        {/* Create Ticket Form */}
        {showCreate && (isStudent || isExaminer) && (
          <form
            onSubmit={handleCreateTicket}
            className="bg-white dark:bg-[#0F172A] border border-indigo-200 dark:border-indigo-900 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base">
                {isExaminer ? 'Raise Operational Support Ticket' : 'Raise New Examination Ticket'}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <label className="space-y-1">
                <span className="font-semibold">Category</span>
                <select
                  value={createForm.category}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      category: e.target.value as TicketCategory,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  {Object.values(TicketCategory).map((c) => (
                    <option key={c} value={c}>
                      {formatEnumLabel(c)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">
                  Link Published Result (Required for Marks Dispute → Correction)
                </span>
                <select
                  value={createForm.relatedResultId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, relatedResultId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                >
                  <option value="">None / General Query</option>
                  {results.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.subjectCode} — {r.subjectName} ({r.obtainedMarks}/{r.maxMarks} · v
                      {r.version})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="font-semibold">Subject / Title</span>
                <input
                  required
                  minLength={5}
                  type="text"
                  value={createForm.subject}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, subject: e.target.value })
                  }
                  placeholder="Concise summary of the marks, admit card, or examination issue"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="font-semibold">Detailed Description</span>
                <textarea
                  required
                  minLength={12}
                  rows={3}
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  placeholder="Provide specific question numbers, receipt IDs, or examination details..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                />
              </label>

              <div className="md:col-span-2">
                <FileAttachmentInput
                  value={createAttachment}
                  onChange={setCreateAttachment}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
              >
                {creating ? 'Submitting…' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        )}

        {/* Filter Bar */}
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter tickets by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
          >
            <option value="ALL">All Statuses</option>
            {Object.values(TicketStatus).map((s) => (
              <option key={s} value={s}>
                {formatEnumLabel(s)}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter tickets by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700"
          >
            <option value="ALL">All Categories</option>
            {Object.values(TicketCategory).map((c) => (
              <option key={c} value={c}>
                {formatEnumLabel(c)}
              </option>
            ))}
          </select>
        </section>

        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No support tickets found"
            description="Raise a support ticket for incorrect marks, revaluation queries, admit card issues, or online/offline exam support."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Ticket List */}
            <aside className="lg:col-span-4 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {tickets.map((t) => {
                const active = selectedId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(t.id);
                      setSearchParams({ id: t.id });
                    }}
                    className={`w-full text-left p-4 space-y-1.5 transition-colors ${
                      active
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/35'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {t.ticketNumber}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          t.status === TicketStatus.ESCALATED || t.isOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : t.status === TicketStatus.RESOLVED
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatEnumLabel(t.status)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                      {t.subject}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatEnumLabel(t.category)}
                      {t.relatedSubjectCode ? ` · ${t.relatedSubjectCode}` : ''}
                      {t.isOverdue ? ' · OVERDUE' : ''}
                    </p>
                  </button>
                );
              })}
            </aside>

            {/* Selected Ticket Detail Workspace */}
            <section className="lg:col-span-8 space-y-5">
              {detail ? (
                <>
                  <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5 text-xs">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {detail.ticketNumber}
                          </span>
                          <span className="text-slate-500">
                            {formatEnumLabel(detail.category)}
                          </span>
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            {formatEnumLabel(detail.status)}
                          </span>
                        </div>
                        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                          {detail.subject}
                        </h2>
                        <p className="text-xs text-slate-500">
                          Raised by {detail.createdByName}
                          {detail.registrationNumber ? ` (${detail.registrationNumber})` : ''} ·
                          Assigned Examiner: {detail.assignedExaminerName ?? 'Unassigned'}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {detail.description}
                    </p>

                    {detail.linkedResult && (
                      <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            Linked Result:
                          </span>{' '}
                          <span className="font-mono">
                            {detail.linkedResult.subjectCode} ({detail.linkedResult.obtainedMarks}/
                            {detail.linkedResult.maxMarks}, v{detail.linkedResult.version})
                          </span>
                          {detail.recommendedMarks != null && (
                            <span className="ml-2 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                              · Recommended: {detail.recommendedMarks}
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/result-comparison?resultId=${encodeURIComponent(
                            detail.linkedResult.id
                          )}`}
                          className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Compare Versions →
                        </Link>
                      </div>
                    )}

                    {detail.linkedCorrection && (
                      <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <strong className="text-indigo-800 dark:text-indigo-300">
                            Linked Two-Signature Correction {detail.linkedCorrection.id}:
                          </strong>{' '}
                          {detail.linkedCorrection.oldMarks} →{' '}
                          {detail.linkedCorrection.proposedMarks} ({detail.linkedCorrection.status},{' '}
                          {detail.linkedCorrection.approvals.length}/2 Ed25519 signatures)
                        </div>
                        {!isStudent && (
                          <Link
                            to={
                              isExaminer ? '/approvals/examiner' : '/approvals/controller'
                            }
                            className="inline-flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300 hover:underline"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Open Signing Desk</span>
                          </Link>
                        )}
                      </div>
                    )}

                    {detail.attachments.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          Evidence Attachments ({detail.attachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {detail.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`/api/attachments/${att.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium hover:text-indigo-600"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>
                                {att.originalName} ({formatBytes(att.sizeBytes)})
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Feature 11: Controller Ticket-to-Correction Initiation */}
                    {isController &&
                      detail.linkedResult &&
                      !detail.linkedCorrectionId &&
                      detail.status !== TicketStatus.CLOSED && (
                        <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/80 space-y-3">
                          <div className="flex items-start gap-2">
                            <KeyRound
                              className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0"
                              aria-hidden="true"
                            />
                            <div className="text-xs">
                              <p className="font-bold text-slate-900 dark:text-white">
                                Initiate Two-Signature Ledger Correction
                              </p>
                              <p className="text-slate-600 dark:text-slate-400">
                                Marks will NOT change immediately. This opens a formal correction
                                request requiring independent Examiner & Controller Ed25519
                                signatures and finalization.
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                            <input
                              type="number"
                              min={0}
                              max={detail.linkedResult.maxMarks}
                              value={proposedMarks}
                              onChange={(e) => setProposedMarks(e.target.value)}
                              placeholder="Proposed Marks"
                              className="px-3 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 font-mono"
                            />
                            <input
                              type="text"
                              value={correctionReason}
                              onChange={(e) => setCorrectionReason(e.target.value)}
                              placeholder="Audit reason (min 10 chars)…"
                              className="sm:col-span-2 px-3 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleInitiateCorrection()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Create Dual-Signature Correction Request</span>
                          </button>
                        </div>
                      )}

                    {/* Examiner Escalation & Recommendation Controls */}
                    {isExaminer &&
                      detail.status !== TicketStatus.RESOLVED &&
                      detail.status !== TicketStatus.CLOSED && (
                        <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/80 space-y-3">
                          <p className="text-xs font-bold text-amber-900 dark:text-amber-300 inline-flex items-center gap-1.5">
                            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Examiner Recommendation & Controller Escalation</span>
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                            <input
                              type="number"
                              value={recMarks}
                              onChange={(e) => setRecMarks(e.target.value)}
                              placeholder="Recommended Marks (opt)"
                              className="px-3 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700 font-mono"
                            />
                            <input
                              type="text"
                              value={escalateReason}
                              onChange={(e) => setEscalateReason(e.target.value)}
                              placeholder="Investigation findings / escalation reason..."
                              className="sm:col-span-2 px-3 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleEscalate()}
                              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
                            >
                              Escalate to Examination Controller
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleStatusDecision(TicketStatus.WAITING_FOR_STUDENT)
                              }
                              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
                            >
                              Request Student Info
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Controller Resolve / Reject Controls */}
                    {isController &&
                      detail.status !== TicketStatus.RESOLVED &&
                      detail.status !== TicketStatus.REJECTED &&
                      detail.status !== TicketStatus.CLOSED && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                          <p className="font-bold text-slate-800 dark:text-slate-200">
                            Controller Ticket Resolution
                          </p>
                          <input
                            type="text"
                            value={resolutionReason}
                            onChange={(e) => setResolutionReason(e.target.value)}
                            placeholder="Written resolution or rejection reason..."
                            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleStatusDecision(TicketStatus.RESOLVED)}
                              className="px-3.5 py-2 font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              Resolve Ticket
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStatusDecision(TicketStatus.REJECTED)}
                              className="px-3.5 py-2 font-semibold rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400"
                            >
                              Reject Ticket
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Student Reopen Control */}
                    {isStudent &&
                      (detail.status === TicketStatus.RESOLVED ||
                        detail.status === TicketStatus.REJECTED ||
                        detail.status === TicketStatus.CLOSED) && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                          <p className="font-semibold">Need further clarification? Reopen ticket:</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              placeholder="Reason for reopening..."
                              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700"
                            />
                            <button
                              type="button"
                              onClick={() => void handleReopen()}
                              className="inline-flex items-center gap-1 px-3.5 py-2 font-semibold rounded-lg bg-indigo-600 text-white"
                            >
                              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Reopen</span>
                            </button>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Conversation Thread + Reply Form */}
                  <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <h3 className="font-display font-bold text-sm inline-flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                      <span>Conversation & Investigation Log ({detail.messages.length})</span>
                    </h3>

                    {detail.messages.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No messages posted yet. Add a reply below.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {detail.messages.map((m) => (
                          <div
                            key={m.id}
                            className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                              m.isInternalNote
                                ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800'
                                : 'bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                                {m.isInternalNote && (
                                  <Lock className="w-3 h-3 text-amber-600" aria-hidden="true" />
                                )}
                                <span>
                                  {m.senderName} ({formatEnumLabel(m.senderRole)})
                                  {m.isInternalNote ? ' · Staff Internal Note' : ''}
                                </span>
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">
                                {new Date(m.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                              {m.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleSendReply} className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <textarea
                        rows={2}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={
                          isInternalNote
                            ? 'Add staff-only internal investigation note (hidden from student)...'
                            : 'Write a response...'
                        }
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-300 dark:border-slate-700"
                      />
                      <FileAttachmentInput
                        value={replyAttachment}
                        onChange={setReplyAttachment}
                        label="Attach Evidence to Reply (Optional)"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {!isStudent ? (
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isInternalNote}
                              onChange={(e) => setIsInternalNote(e.target.checked)}
                              className="rounded border-slate-300 text-amber-600"
                            />
                            <span>Mark as Staff-Only Internal Note (hidden from student)</span>
                          </label>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Visible to assigned Examiner & Examination Controller
                          </span>
                        )}
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <Send className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isInternalNote ? 'Save Internal Note' : 'Send Reply'}</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Auditable Status Timeline */}
                  <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                    <h3 className="font-display font-bold text-sm inline-flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                      <span>Auditable Ticket Lifecycle Timeline</span>
                    </h3>
                    <TicketStatusTimeline events={detail.events} />
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={LifeBuoy}
                  title="Select a ticket"
                  description="Choose a ticket on the left to inspect its messages, attachments, timeline, and workflow controls."
                />
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
