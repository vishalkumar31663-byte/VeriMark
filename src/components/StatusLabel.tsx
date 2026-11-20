import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

export type SemanticTone = 'verified' | 'warning' | 'danger' | 'neutral' | 'accent';

/**
 * Accessible semantic status indicator rendered as clean inline icon + text
 * (zero static pill capsules, zero decorative pulsing dots, never hue-only).
 */
export function StatusLabel({
  tone,
  label,
  icon = 'auto',
  className = '',
}: {
  tone: SemanticTone;
  label: string;
  icon?: 'auto' | 'shield' | 'none';
  className?: string;
}) {
  const colorClass =
    tone === 'verified'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'danger'
      ? 'text-red-700 dark:text-red-400'
      : tone === 'accent'
      ? 'text-indigo-700 dark:text-indigo-400'
      : 'text-slate-600 dark:text-slate-400';

  const Icon =
    icon === 'none'
      ? null
      : icon === 'shield'
      ? tone === 'verified'
        ? ShieldCheck
        : ShieldAlert
      : tone === 'verified'
      ? CheckCircle2
      : tone === 'warning'
      ? Clock
      : tone === 'danger'
      ? XCircle
      : tone === 'accent'
      ? FileWarning
      : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${colorClass} ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}
