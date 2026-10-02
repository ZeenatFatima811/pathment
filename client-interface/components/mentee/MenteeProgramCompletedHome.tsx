'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  completionApi,
  type FinalResults,
  type FinalSnapshot,
} from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { LearningStat } from '@/components/mentee/LearningStat';

function outcomeLabel(outcome: string) {
  return outcome.replaceAll('_', ' ');
}

function outcomeTone(outcome: string): 'good' | 'ok' | 'muted' {
  if (outcome === 'certified') return 'good';
  if (outcome === 'completed_uncertified') return 'ok';
  return 'muted';
}

const OUTCOME_BADGE: Record<'good' | 'ok' | 'muted', string> = {
  good: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  ok: 'bg-sky-50 text-sky-800 border-sky-100',
  muted: 'bg-slate-100 text-slate-700 border-slate-200',
};

function pickMine(results: FinalResults, userId?: string, firstName?: string, lastName?: string): FinalSnapshot | null {
  const current = results.snapshots;
  if (!current.length) return null;
  if (userId) {
    const byId = current.find((s) => s.menteeId === userId);
    if (byId) return byId;
    const byName = current.find(
      (s) =>
        s.mentee.firstName?.toLowerCase() === firstName?.toLowerCase() &&
        s.mentee.lastName?.toLowerCase() === lastName?.toLowerCase(),
    );
    if (byName) return byName;
  }
  return current[0] || null;
}

const DESTINATIONS = [
  {
    href: '/mentee/tasks',
    title: 'Past work and feedback',
    description: 'Review submitted tasks and mentor comments.',
    icon: BookOpen,
  },
  {
    href: '/mentee/certificates',
    title: 'Certificates',
    description: 'Download and share any awards you earned.',
    icon: Award,
  },
  {
    href: '/mentee/community',
    title: 'Program community',
    description: 'The program space stays open for the cohort.',
    icon: MessageSquare,
  },
  {
    href: '/mentee/progress',
    title: 'Final results',
    description: 'See your final outcome and progress for this program.',
    icon: Trophy,
  },
] as const;

export function MenteeProgramCompletedHome({
  programId,
  clanName,
}: {
  programId: string;
  clanName?: string;
}) {
  const { user } = useAuth();
  const [results, setResults] = useState<FinalResults | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const data = await completionApi.results(programId);
        if (!cancelled) setResults(data);
      } catch (e) {
        if (!cancelled) setError(extractApiErrorMessage(e, 'Could not load your final results'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const mine = results
    ? pickMine(results, user?.id, user?.firstName, user?.lastName)
    : null;
  const firstName = user?.firstName || '';
  const closedAt = results?.closedAt || results?.history[0]?.closedAt;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-label="Loading completion" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 p-6 text-sm">
        <p role="alert" className="text-slate-700">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError('');
            completionApi
              .results(programId)
              .then(setResults)
              .catch((e) => setError(extractApiErrorMessage(e, 'Could not load your final results')))
              .finally(() => setLoading(false));
          }}
          className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const tone = mine ? outcomeTone(mine.outcome) : 'muted';

  return (
    <div className="space-y-6">
      <div className="mentee-welcome">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Archive className="h-3.5 w-3.5" />
          Program completed
          {clanName ? <span className="font-normal normal-case tracking-normal text-slate-400">· {clanName}</span> : null}
        </p>
        <h1 className="mb-2 font-bold text-slate-900">
          {mine?.outcome === 'certified'
            ? `Well done${firstName ? `, ${firstName}` : ''}`
            : `This chapter is closed${firstName ? `, ${firstName}` : ''}`}
        </h1>
        <p className="max-w-2xl text-slate-600">
          Your cohort work is read-only now. Certificates, community, and past feedback are still available below.
        </p>
        {closedAt ? (
          <p className="mt-2 text-sm font-medium text-slate-700">
            Results saved {new Date(closedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </p>
        ) : null}
      </div>

      {mine ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-card">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your outcome</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-semibold capitalize ${OUTCOME_BADGE[tone]}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {outcomeLabel(mine.outcome)}
                </span>
                {mine.tier ? (
                  <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium capitalize text-slate-700">
                    {mine.tier} tier
                  </span>
                ) : null}
              </div>
            </div>
            <Link
              href="/mentee/certificates"
              className="inline-flex items-center gap-1.5 self-start rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 sm:self-auto"
            >
              Open certificates
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:gap-4 sm:p-5" aria-label="Your saved results">
            <LearningStat
              label="Score"
              value={mine.performance.score ?? '—'}
              icon={Trophy}
              tone={0}
              hint="Saved at close"
              compact
            />
            <LearningStat
              label="Completion"
              value={`${mine.performance.evidence.absoluteProgress}%`}
              icon={CheckCircle2}
              tone={1}
              hint="Program progress"
              compact
            />
            <LearningStat
              label="On time"
              value={mine.performance.evidence.onTimeRate != null ? `${mine.performance.evidence.onTimeRate}%` : '—'}
              icon={BookOpen}
              tone={2}
              hint="Task timing"
              compact
            />
            <LearningStat
              label="Tasks done"
              value={mine.performance.evidence.tasksCompleted}
              icon={Archive}
              tone={3}
              hint={mine.cohortRank ? `Cohort rank #${mine.cohortRank}` : 'Completed tasks'}
              compact
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-card px-5 py-8 text-center">
          <Archive className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm font-medium text-slate-900">Final results are saved</p>
          <p className="mt-1 text-sm text-slate-500">This clan is historical and read-only.</p>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Continue from here</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DESTINATIONS.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-card p-5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
            >
              <span className="rounded-xl bg-muted p-2.5 text-brand-600">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{title}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-500">{description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
