import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  MapPin,
  QrCode,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AdmitCardRecord,
  ExamMode,
  RevaluationRecord,
  RevaluationStatus,
  TicketEventRecord,
} from '../../../shared/v2Types';
import { ExamModeBadge } from './ExamModeAndCountdown';
import { formatEnumLabel } from './UiPrimitives';

export function TicketStatusTimeline({ events }: { events: TicketEventRecord[] }) {
  return (
    <ol className="space-y-3">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="relative pl-5 pb-3 border-l border-slate-200 dark:border-slate-700 last:pb-0"
        >
          <span
            className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400"
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatEnumLabel(ev.eventType)} · {ev.actorName}
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {new Date(ev.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{ev.detail}</p>
        </li>
      ))}
    </ol>
  );
}

const REVAL_STEPS: Array<{ key: RevaluationStatus; label: string }> = [
  { key: RevaluationStatus.SUBMITTED, label: 'Submitted' },
  { key: RevaluationStatus.UNDER_REVIEW, label: 'Examiner Review' },
  { key: RevaluationStatus.RECOMMENDED, label: 'Recommended' },
  { key: RevaluationStatus.CORRECTION_IN_PROGRESS, label: '2-Sig Ledger' },
  { key: RevaluationStatus.COMPLETED, label: 'Completed' },
];

export function RevaluationTracker({ record }: { record: RevaluationRecord }) {
  const statusOrder: Record<RevaluationStatus, number> = {
    [RevaluationStatus.SUBMITTED]: 0,
    [RevaluationStatus.UNDER_REVIEW]: 1,
    [RevaluationStatus.EVIDENCE_REQUIRED]: 1,
    [RevaluationStatus.RECOMMENDED]: 2,
    [RevaluationStatus.APPROVED_FOR_CORRECTION]: 3,
    [RevaluationStatus.CORRECTION_IN_PROGRESS]: 3,
    [RevaluationStatus.COMPLETED]: 4,
    [RevaluationStatus.REJECTED]: -1,
  };
  const currentStep = statusOrder[record.status] ?? 0;

  if (record.status === RevaluationStatus.REJECTED) {
    return (
      <div className="p-3 rounded-lg bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
        <strong>Rejected:</strong> {record.controllerNotes || record.examinerNotes || 'Request declined after review.'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {REVAL_STEPS.map((step, idx) => {
        const done = idx < currentStep || record.status === RevaluationStatus.COMPLETED;
        const active = idx === currentStep && record.status !== RevaluationStatus.COMPLETED;
        return (
          <div key={step.key} className="space-y-1">
            <div
              className={`h-1.5 rounded-full ${
                done
                  ? 'bg-emerald-500'
                  : active
                  ? 'bg-indigo-600 dark:bg-indigo-400'
                  : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
            <p
              className={`text-[10px] font-medium truncate ${
                done
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : active
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-400'
              }`}
            >
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function AdmitCardPreview({
  card,
}: {
  card: AdmitCardRecord & { qrDataUrl?: string; verifyUrl?: string };
}) {
  return (
    <article className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-indigo-300">
            DEMO UNIVERSITY · DIGITAL ADMIT CARD · v{card.version}
          </p>
          <h3 className="font-display font-bold text-base sm:text-lg">
            {card.subjectCode} — {card.subjectTitle}
          </h3>
        </div>
        <span className="font-mono text-xs text-slate-300">{card.cardNumber}</span>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Candidate</dt>
              <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {card.studentName}
              </dd>
              <dd className="font-mono text-xs text-slate-500">
                {card.registrationNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Date & Time</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                {card.examDate}
              </dd>
              <dd className="font-mono text-xs text-slate-500">
                {card.startTime}–{card.endTime} ({card.timezone})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Mode & Reporting</dt>
              <dd className="mt-0.5">
                <ExamModeBadge mode={card.mode} />
              </dd>
              <dd className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span>Report: {card.reportingTime || '15m prior'}</span>
              </dd>
            </div>
          </dl>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            {card.mode === ExamMode.OFFLINE ? (
              <p className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Venue:</strong> {card.campus || 'Main Campus'},{' '}
                  {card.building || 'Block A'}, Room{' '}
                  <strong>{card.room || 'TBA'}</strong>
                  {card.seatNumber ? ` · Seat ${card.seatNumber}` : ''}
                </span>
              </p>
            ) : (
              <p className="text-slate-800 dark:text-slate-200">
                <strong>Authorized Online Exam Portal:</strong>{' '}
                {card.onlineUrl || 'Demo University Portal'}
              </p>
            )}
            <p className="text-slate-600 dark:text-slate-400">
              <strong>Required Documents:</strong>{' '}
              {card.requiredDocuments || 'University Photo ID & Admit Card'}
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              <strong>Instructions:</strong> {card.instructions}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/80 flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Eligibility Notice:</strong> This admit card verifies examination scheduling &
              seating eligibility only. It is NOT proof of attendance or published marks.
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <a
              href={`/api/admit-cards/${card.id}/pdf`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PDF Admit Card</span>
            </a>
            <Link
              to={`/admit-card/verify/${encodeURIComponent(card.verificationToken)}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Public Admit Card Verification</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 text-center space-y-2.5">
          {card.qrDataUrl ? (
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <img
                src={card.qrDataUrl}
                alt={`Admit card QR code ${card.cardNumber}`}
                className="w-36 h-36"
              />
            </div>
          ) : (
            <QrCode className="w-20 h-20 text-slate-400" />
          )}
          <p className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
            {card.verificationToken}
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            <span>Status: {card.status}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

export function SimpleBarMetricChart({
  title,
  subtitle,
  data,
  xKey,
  yKey,
  yLabel,
  color = '#4F46E5',
}: {
  title: string;
  subtitle?: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748B' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#F8FAFC',
              }}
            />
            <Bar dataKey={yKey} name={yLabel ?? yKey} fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SimpleLineTrendChart({
  title,
  subtitle,
  data,
  xKey,
  yKey,
  yLabel,
  color = '#10B981',
}: {
  title: string;
  subtitle?: string;
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748B' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#F8FAFC',
              }}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              name={yLabel ?? yKey}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 4, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
