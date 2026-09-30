'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Crown,
  Download,
  FileText,
  Gauge,
  Loader2,
  LockKeyhole,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { StandingClanRequestCta } from '@/components/shared/StandingClanRequestCta';
import { MetricTile } from '@/components/shared/MetricTile';
import {
  completionApi,
  type FinalResults,
  type FinalSnapshot,
} from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export type FinalResultsVariant = 'reports' | 'scores' | 'leaderboard';

function menteeName(s: FinalSnapshot) {
  return `${s.mentee.firstName} ${s.mentee.lastName}`.trim();
}

function initials(s: FinalSnapshot) {
  return `${s.mentee.firstName?.[0] || ''}${s.mentee.lastName?.[0] || ''}`.toUpperCase() || '?';
}

function scoreBand(score: number | null): string {
  if (score == null) return 'Unscored';
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 60) return 'Developing';
  return 'Needs attention';
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 70) return 'bg-brand-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function rankStyle(i: number): { ring: string; bar: string } {
  if (i === 0) return { ring: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' };
  if (i === 1) return { ring: 'bg-slate-200 text-slate-700', bar: 'bg-slate-400' };
  if (i === 2) return { ring: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' };
  return { ring: 'bg-slate-100 text-slate-500', bar: 'bg-brand-500' };
}

function outcomeBadge(outcome: string) {
  if (outcome === 'certified') return 'bg-emerald-50 text-emerald-800 border-emerald-100';
  if (outcome === 'completed_uncertified') return 'bg-sky-50 text-sky-800 border-sky-100';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function decisionText(snapshot: FinalSnapshot) {
  const d = snapshot.decision || {};
  const parts = [
    d.decision ? String(d.decision).replaceAll('_', ' ') : null,
    d.overrideReason || null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

function Avatar({
  snapshot,
  size = 'md',
}: {
  snapshot: FinalSnapshot;
  size?: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  return (
    <div className={`${dim} bg-brand-100 rounded-full flex items-center justify-center shrink-0`}>
      <span className="text-brand-700 font-semibold">{initials(snapshot)}</span>
    </div>
  );
}

const BAND_OPTS = [
  { value: 'all', label: 'All scores' },
  { value: 'Exceptional', label: 'Exceptional (90+)' },
  { value: 'Excellent', label: 'Excellent (80–89)' },
  { value: 'Strong', label: 'Strong (70–79)' },
  { value: 'Developing', label: 'Developing (60–69)' },
  { value: 'Needs attention', label: 'Needs attention (<60)' },
];

function DetailDrawer({
  detail,
  onClose,
}: {
  detail: FinalSnapshot | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={Boolean(detail)}
      onClose={onClose}
      title={detail ? menteeName(detail) : 'Result detail'}
      subtitle={
        detail
          ? `${detail.outcome.replaceAll('_', ' ')}${detail.tier ? ` · ${detail.tier}` : ''}`
          : undefined
      }
    >
      {detail && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">Score</p>
              <p className="font-medium">{detail.performance.score ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Cohort rank</p>
              <p className="font-medium">{detail.cohortRank ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Completion</p>
              <p className="font-medium">{detail.performance.evidence.absoluteProgress}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">On-time</p>
              <p className="font-medium">{detail.performance.evidence.onTimeRate ?? '—'}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tasks completed</p>
              <p className="font-medium">{detail.performance.evidence.tasksCompleted}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Attendance</p>
              <p className="font-medium">
                {detail.performance.evidence.attendance
                  ? `${detail.performance.evidence.attendance.present}P / ${detail.performance.evidence.attendance.absent}A / ${detail.performance.evidence.attendance.excused}E`
                  : '—'}
              </p>
            </div>
          </div>
          {(detail.performance.parts || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Score components
              </p>
              <ul className="space-y-1">
                {detail.performance.parts.map((p) => (
                  <li
                    key={p.key}
                    className="flex justify-between gap-3 border-b border-slate-100 py-1.5"
                  >
                    <span className="capitalize">{p.key.replaceAll('_', ' ')}</span>
                    <span>
                      {p.score} · weight {p.weight}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Certificate decision
            </p>
            <p>{decisionText(detail)}</p>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/**
 * Post-close Insights presentation — same visual family as live Reports /
 * Progress scores / Leaderboard, fed by frozen closure snapshots.
 */
export function MentorFinalResults({
  programId,
  clanName,
  variant,
}: {
  programId: string;
  clanName?: string;
  variant: FinalResultsVariant;
}) {
  const [results, setResults] = useState<FinalResults | null>(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<FinalSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [band, setBand] = useState('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const r = await completionApi.results(programId);
      const data = (r as FinalResults & { data?: FinalResults })?.history
        ? (r as FinalResults)
        : ((r as { data?: FinalResults })?.data ?? null);
      if (!data) throw new Error('empty');
      setResults(data);
      setSelected(data.currentClosureId || data.history[0]?.id || '');
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Could not load final results'));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshots = useMemo(() => {
    if (!results) return [];
    const rows = results.snapshots.filter((s) => s.closureId === selected);
    return [...rows].sort((a, b) => {
      const ra = a.cohortRank ?? 9999;
      const rb = b.cohortRank ?? 9999;
      if (ra !== rb) return ra - rb;
      return (b.performance.score ?? -1) - (a.performance.score ?? -1);
    });
  }, [results, selected]);

  const closedAt = results?.history.find((h) => h.id === selected)?.closedAt;
  const closedLabel = closedAt
    ? new Date(closedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const scoredCount = snapshots.filter((s) => s.performance.score != null).length;
  const clanAverage = scoredCount
    ? Math.round(
        snapshots.reduce((n, s) => n + (s.performance.score ?? 0), 0) / scoredCount,
      )
    : 0;
  const certified = snapshots.filter((s) => s.outcome === 'certified').length;
  const avgCompletion = snapshots.length
    ? Math.round(
        snapshots.reduce((n, s) => n + (s.performance.evidence.absoluteProgress || 0), 0) /
          snapshots.length,
      )
    : 0;

  const filteredScores = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshots.filter((s) => {
      const name = menteeName(s).toLowerCase();
      const b = scoreBand(s.performance.score);
      if (q && !name.includes(q)) return false;
      if (band !== 'all' && b !== band) return false;
      return true;
    });
  }, [snapshots, search, band]);

  const exportResults = () => {
    const cell = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""')}"`;
    const partKeys = [
      ...new Set(snapshots.flatMap((s) => (s.performance.parts || []).map((p) => p.key))),
    ];
    const rows = [
      [
        'Mentee',
        'Outcome',
        'Certificate tier',
        'Progress score',
        ...partKeys.flatMap((k) => [`${k} score`, `${k} weight`]),
        'Completion %',
        'On-time %',
        'Tasks completed',
        'Cohort rank',
        'Present',
        'Absent',
        'Excused',
        'Decision',
        'Decision reason',
      ],
      ...snapshots.map((s) => {
        const byKey = Object.fromEntries((s.performance.parts || []).map((p) => [p.key, p]));
        return [
          menteeName(s),
          s.outcome,
          s.tier,
          s.performance.score,
          ...partKeys.flatMap((k) => [byKey[k]?.score ?? '', byKey[k]?.weight ?? '']),
          s.performance.evidence.absoluteProgress,
          s.performance.evidence.onTimeRate,
          s.performance.evidence.tasksCompleted,
          s.cohortRank,
          s.performance.evidence.attendance?.present,
          s.performance.evidence.attendance?.absent,
          s.performance.evidence.attendance?.excused,
          s.decision?.decision,
          s.decision?.overrideReason,
        ];
      }),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `program-results-${selected || 'final'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" aria-label="Loading final results" />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
        <p className="text-slate-600 mb-3">{error || 'Could not load final results'}</p>
        <button onClick={load} className="text-brand-600 hover:text-brand-700 text-sm font-medium">
          Try again
        </button>
      </div>
    );
  }

  if (!results.history.length) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">No final results yet</p>
        <p className="text-slate-400 text-sm mt-1">
          Results appear here after the program is formally closed.
        </p>
      </div>
    );
  }

  const versionSelect =
    results.history.length > 1 ? (
      <SelectMenu
        ariaLabel="Result version"
        value={selected}
        onChange={setSelected}
        options={results.history.map((h) => ({
          value: h.id,
          label: `${new Date(h.closedAt).toLocaleDateString()}${
            h.id === results.currentClosureId
              ? results.closed
                ? ' · Current'
                : ' · Previous'
              : ' · Earlier'
          }`,
        }))}
        className="sm:w-56"
      />
    ) : null;

  const standingCta = (
    <StandingClanRequestCta programId={programId} programName={clanName} />
  );

  const lockNote = (
    <p className="flex items-center gap-2 text-xs text-slate-500">
      <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
      Saved at close — unchanged if clan memberships change later.
    </p>
  );

  // ── Reports: narrative summary + outcome list ────────────────────────────
  if (variant === 'reports') {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-6">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Program completed
              {closedLabel ? ` · ${closedLabel}` : ''}
            </p>
            <h1 className="text-slate-900 mb-1">Final cohort report</h1>
            <p className="text-slate-600">
              {clanName ? `${clanName} · ` : ''}
              Snapshot saved at close. Read-only history for this cohort.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {versionSelect}
            <button
              type="button"
              onClick={exportResults}
              disabled={!snapshots.length}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {standingCta}
          </div>
        </div>

        {snapshots.length === 0 ? (
          <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No mentee results in your roster for this close.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Mentees"
                value={snapshots.length}
                icon={Users}
                tone={0}
                hint="In this final roster"
                compact
              />
              <MetricTile
                label="Avg score"
                value={scoredCount ? clanAverage : '—'}
                icon={Gauge}
                tone={1}
                hint="Progress score at close"
                compact
              />
              <MetricTile
                label="Certified"
                value={certified}
                icon={Award}
                tone={2}
                hint={`${snapshots.length - certified} other outcomes`}
                compact
              />
              <MetricTile
                label="Completion"
                value={`${avgCompletion}%`}
                icon={Trophy}
                tone={3}
                hint="Average absolute progress"
                compact
              />
            </div>

            <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {snapshots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDetail(s)}
                  className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <span className="w-6 text-center text-sm font-semibold text-slate-400 tabular-nums">
                    {s.cohortRank ?? '—'}
                  </span>
                  <Avatar snapshot={s} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{menteeName(s)}</p>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${outcomeBadge(s.outcome)}`}
                      >
                        {s.outcome.replaceAll('_', ' ')}
                      </span>
                      {s.tier && (
                        <span className="text-[11px] text-slate-400 capitalize">{s.tier}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {s.performance.evidence.absoluteProgress}% complete ·{' '}
                      {s.performance.evidence.onTimeRate ?? '—'}% on-time ·{' '}
                      {s.performance.evidence.tasksCompleted} tasks
                    </p>
                  </div>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums shrink-0">
                    {s.performance.score ?? '—'}
                  </span>
                </button>
              ))}
            </div>
            {lockNote}
          </>
        )}

        <DetailDrawer detail={detail} onClose={() => setDetail(null)} />
      </div>
    );
  }

  // ── Progress scores: searchable bars ─────────────────────────────────────
  if (variant === 'scores') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Final scores
              {closedLabel ? ` · ${closedLabel}` : ''}
            </p>
            <h1 className="text-slate-900 mb-2">Progress scores</h1>
            <p className="text-slate-600">
              Frozen scores from program close — same numbers as the final standings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {versionSelect}
            {standingCta}
          </div>
        </div>

        {clanName && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">{clanName}</span>
            <span className="text-xs text-slate-400">· completed history</span>
          </div>
        )}

        {snapshots.length === 0 ? (
          <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
            <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">No scores saved for this close.</p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
              <Gauge className="w-5 h-5 text-brand-500" />
              <span className="text-sm text-slate-600">Clan average at close</span>
              <span className="ml-auto text-lg font-semibold text-slate-900 tabular-nums">
                {scoredCount ? clanAverage : '—'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search mentees by name…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <SelectMenu
                value={band}
                onChange={setBand}
                options={BAND_OPTS}
                ariaLabel="Filter by score"
                className="sm:w-56"
              />
              <button
                type="button"
                onClick={exportResults}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>

            {filteredScores.length === 0 ? (
              <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
                <Gauge className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 mb-3">No mentees match these filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setBand('all');
                  }}
                  className="text-brand-600 hover:text-brand-700 text-sm font-medium"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {filteredScores.map((s) => {
                  const score = s.performance.score ?? 0;
                  const bandLabel = scoreBand(s.performance.score);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setDetail(s)}
                      className="w-full text-left flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                    >
                      <span className="w-6 text-center text-sm font-semibold text-slate-400 tabular-nums">
                        {s.cohortRank ?? '—'}
                      </span>
                      <Avatar snapshot={s} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {menteeName(s)}
                          </p>
                          <span className="text-[11px] text-slate-400">{bandLabel}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${scoreBarColor(score)}`}
                            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                          />
                        </div>
                        {(s.performance.parts || []).length > 0 && (
                          <div className="flex flex-wrap gap-x-2.5 mt-1 text-[11px] text-slate-400">
                            {s.performance.parts.map((p) => (
                              <span key={p.key}>
                                <span className="text-slate-600 font-medium">{p.score}</span>{' '}
                                {p.key.replaceAll('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-lg font-semibold text-slate-900 tabular-nums shrink-0">
                        {s.performance.score ?? '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {lockNote}
          </>
        )}

        <DetailDrawer detail={detail} onClose={() => setDetail(null)} />
      </div>
    );
  }

  // ── Leaderboard: podium from frozen ranks ────────────────────────────────
  const leader = snapshots[0] ?? null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Trophy className="h-3.5 w-3.5" />
            Final standings
            {closedLabel ? ` · ${closedLabel}` : ''}
          </p>
          <h1 className="text-slate-900 mb-1">Cohort standings</h1>
          <p className="text-slate-600">
            Rankings locked at program close — the same score Insights used while the cohort was live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {versionSelect}
          {standingCta}
        </div>
      </div>

      {clanName && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700">{clanName}</span>
          <span className="text-xs text-slate-400">· final standings</span>
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees ranked for this close.</p>
        </div>
      ) : (
        <>
          {leader && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 dark:from-amber-500/10 to-card p-5 flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar snapshot={leader} size="lg" />
                <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center ring-2 ring-white">
                  <Crown className="w-3.5 h-3.5 text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                  Top of the cohort
                </p>
                <p className="text-lg font-semibold text-slate-900 truncate">{menteeName(leader)}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-slate-500">
                  <span>
                    <strong className="text-slate-700">{leader.performance.score ?? '—'}</strong> score
                  </span>
                  {leader.tier && <span className="capitalize text-slate-400">{leader.tier}</span>}
                  <span>
                    <strong className="text-slate-700">
                      {leader.performance.evidence.tasksCompleted}
                    </strong>{' '}
                    tasks
                  </span>
                  <span>
                    <strong className="text-slate-700">
                      {leader.performance.evidence.onTimeRate ?? '—'}%
                    </strong>{' '}
                    on-time
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {snapshots.map((s, i) => {
              const rs = rankStyle(i);
              const score = s.performance.score ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDetail(s)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${i < 3 ? 'bg-slate-50/40' : ''}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${rs.ring}`}
                  >
                    {s.cohortRank ?? i + 1}
                  </span>
                  <Avatar snapshot={s} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{menteeName(s)}</p>
                      <span className="text-[11px] text-slate-400">{scoreBand(s.performance.score)}</span>
                      {s.outcome === 'certified' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]">
                          <Award className="w-2.5 h-2.5" />
                          Certified
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${rs.bar}`}
                          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums w-9 text-right">
                        {s.performance.score ?? '—'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {lockNote}
        </>
      )}

      <DetailDrawer detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
