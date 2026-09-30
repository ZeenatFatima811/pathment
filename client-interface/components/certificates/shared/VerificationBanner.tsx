'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { certificatesApi } from '@/lib/services/certificates-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';
import type { CertificateReviewMode } from './CertificateReviewDrawer';

/**
 * The admin's side of a certificate review round.
 *
 * The mentor's side used to live here too, as a queue of its own. It moved into
 * the issuance roster on /mentor/certificates: reviewing a grade and issuing it
 * are the same people in the same table, and keeping them apart made a mentor
 * read one list while acting on another.
 */

/**
 * The admin's view of the round: who has signed off, who has not, what changed.
 *
 * Deliberately never blocks issuing. The admin is told the state and decides —
 * a gate here would strand a cohort behind one mentor who is on leave, which is
 * a worse failure than issuing a grade nobody contested.
 */
export function VerificationBanner({
  templateId, refreshKey, onIssueAnyway, onViewClan,
}: {
  templateId: string;
  refreshKey?: number;
  onIssueAnyway?: () => void;
  onViewClan?: (clanId: string | null, clanName: string, mode: CertificateReviewMode) => void;
}) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof certificatesApi.getVerificationSummary>>['data'] | null>(null);
  const [reminding, setReminding] = useState(false);
  const [approvingClanId, setApprovingClanId] = useState<string | null>(null);
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [bucket, setBucket] = useState<'blocked' | 'ready' | 'approved' | 'all'>('blocked');

  const reload = useCallback(async () => {
    const res = await certificatesApi.getVerificationSummary(templateId);
    if (res.success) setSummary(res.data);
  }, [templateId]);

  /**
   * Release a clan. `verified` is false when the admin is approving before the
   * mentors have finished — permitted, but worth confirming so it is a choice
   * rather than a misread of the row.
   */
  const approve = async (clanId: string, verified: boolean) => {
    if (!verified) {
      const ok = await confirm({
        title: 'Approve before the review is finished?',
        description: 'This clan\'s mentors have not signed off every grade yet. Approving now locks mentor edits and lets them send certificates as they stand. Only admins can change approved decisions.',
        confirmLabel: 'Approve anyway',
      });
      if (!ok) return;
    }
    try {
      setApprovingClanId(clanId);
      const res = await certificatesApi.approveClan(templateId, clanId);
      toast.success(res.message || 'Clan approved');
      await reload();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not approve that clan'));
    } finally {
      setApprovingClanId(null);
    }
  };

  useEffect(() => {
    let alive = true;
    certificatesApi.getVerificationSummary(templateId)
      .then((res) => { if (alive && res.success) setSummary(res.data); })
      .catch(() => { /* the banner is advisory; its absence must not break the page */ });
    return () => { alive = false; };
  }, [templateId, refreshKey]);

  if (!summary || summary.total === 0) return null;

  const remind = async () => {
    try {
      setReminding(true);
      const res = await certificatesApi.remindReviewers(templateId);
      toast.success(res.message || 'Mentors reminded');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not send the reminder'));
    } finally {
      setReminding(false);
    }
  };

  const realClans = summary.clans.filter((c) => Boolean(c.clanId));
  const unassigned = summary.clans.find((c) => !c.clanId);
  const outstanding = realClans.filter((c) => !c.complete);
  // Everything checked AND everything released is the only truly finished
  // state. "All verified" on its own still needs the admin to act, so it must
  // not look like a green light — that is what hid the approve buttons at
  // exactly the moment they were wanted.
  const settled = summary.allVerified && summary.awaitingApproval === 0;

  /**
   * Which bucket a clan is in. These are three different jobs, not three
   * shades of one: chase the mentors, press approve, or nothing at all.
   */
  const bucketOf = (c: typeof summary.clans[number]) =>
    c.pending > 0 ? 'blocked' : c.approved ? 'approved' : 'ready';

  const counts = {
    blocked: summary.clans.filter(c => bucketOf(c) === 'blocked').length,
    ready: summary.clans.filter(c => bucketOf(c) === 'ready').length,
    approved: summary.clans.filter(c => bucketOf(c) === 'approved').length,
  };

  /**
   * The list was alphabetical and paged six at a time, so with 28 clans the
   * ones actually holding the cohort up were scattered across five pages among
   * clans that were already finished. Ordered by what is owed instead: the
   * clans blocking everything first, most outstanding at the top, then the ones
   * waiting on a press of Approve, then the settled ones.
   */
  const RANK = { blocked: 0, ready: 1, approved: 2 } as const;
  const matching = summary.clans
    .filter(c => c.clanName.toLowerCase().includes(search.toLowerCase()))
    .filter(c => bucket === 'all' || bucketOf(c) === bucket)
    .sort((a, b) => {
      const byBucket = RANK[bucketOf(a)] - RANK[bucketOf(b)];
      if (byBucket !== 0) return byBucket;
      if (a.pending !== b.pending) return b.pending - a.pending;
      return a.clanName.localeCompare(b.clanName);
    });
  const pages = Math.max(1, Math.ceil(matching.length / 6));
  const current = Math.min(page, pages);
  return (
    <div className={`space-y-2 rounded-2xl border px-4 py-3 ${
      settled ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        {settled
          ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          : <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />}
        <span className="text-xs font-bold text-foreground">
          {settled
            ? `All ${summary.total} decisions verified and approved`
            : summary.awaitingApproval > 0 && outstanding.length === 0
              ? `${summary.awaitingApproval} clan${summary.awaitingApproval === 1 ? '' : 's'} verified — approve to let mentors send`
              : `${outstanding.length} of ${realClans.length} clan${realClans.length === 1 ? '' : 's'} have not verified yet`}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {/* "signed off" counted mentor checks and admin approvals as one
              number on the ADMIN's own banner. Split, because the two are
              different steps and only the second releases anything. */}
          · {summary.verified} of {summary.total} reviewed
          {typeof summary.mentorVerified === 'number' && summary.mentorVerified > 0
            && ` · ${summary.mentorVerified} signed off by mentors`}
          {typeof summary.adminApproved === 'number' && summary.adminApproved > 0
            && ` · ${summary.adminApproved} approved by an admin`}
          {summary.overridden > 0 && ` · ${summary.overridden} changed`}
          {!!summary.noCertificate && ` · ${summary.noCertificate} no certificate`}
        </span>
        {summary.overdue && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-600">
            Overdue
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Approval locks mentor edits. Only admins can change approved decisions.</p>
      <details className="rounded-xl border border-border bg-card p-3" open={counts.blocked > 0 || counts.ready > 0}>
      <summary className="cursor-pointer text-sm font-medium">
        Review clan approvals · {realClans.length} clans
        {counts.blocked > 0 && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">{counts.blocked} waiting on mentors</span>}
        {counts.ready > 0 && <span className="ml-1.5 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-400">{counts.ready} to approve</span>}
      </summary>

      {/* Three different jobs, so they are three different lists. Defaults to
          the clans holding everything up, because that is what the admin opened
          this to find. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {([
          ['blocked', `Waiting on mentors (${counts.blocked})`],
          ['ready', `Ready to approve (${counts.ready})`],
          ['approved', `Approved (${counts.approved})`],
          ['all', `All (${summary.clans.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setBucket(key); setPage(1); }}
            className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
              bucket === key
                ? 'bg-brand-600 text-white'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {unassigned && unassigned.total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
          {/* Not a footnote: nobody mentors these, so no reminder will ever
              reach anyone about them and they will sit here until an admin acts. */}
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="text-[11px] font-semibold text-foreground">
            {unassigned.total} mentee{unassigned.total === 1 ? '' : 's'} in no clan
          </span>
          <span className="text-[11px] text-muted-foreground">
            — no mentor owns these, so only an admin can review them
          </span>
          {onViewClan && (
            <button
              type="button"
              onClick={() => onViewClan(null, 'No clan', unassigned.pending > 0 ? 'pending' : 'all')}
              className="ml-auto rounded-lg border border-border bg-card px-2.5 py-1 text-[10px] font-semibold text-foreground hover:border-brand-500/40"
            >
              {unassigned.pending > 0 ? `Review ${unassigned.pending} pending` : 'View decisions'}
            </button>
          )}
        </div>
      )}

      <input aria-label="Search certificate clan approvals" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Find a clan…" className="my-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      <ul className="space-y-3">
        {matching.slice((current - 1) * 6, current * 6).map((clan) => {
          const percent = clan.total ? Math.round((clan.verified / clan.total) * 100) : 0;
          return (
          <li key={clan.clanId || clan.clanName} className="rounded-xl border border-border bg-background p-3 text-[11px] shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{clan.clanName}</p>
                <p className="mt-0.5 text-muted-foreground">{clan.verified} of {clan.total} reviewed · {percent}%</p>
              </div>
              {clan.approved && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                </span>
              )}
            </div>

            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${percent}%` }} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {clan.pending > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400">{clan.pending} pending</span>}
              {clan.overridden > 0 && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-semibold text-violet-700 dark:text-violet-300">{clan.overridden} changed</span>}
              {!!clan.noCertificate && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">{clan.noCertificate} no certificate</span>}
              {!clan.clanId && <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-600">Admin review required</span>}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">

            {/* Approving is what lets that clan's mentors send. Offered the
                moment a clan is signed off, and still offered — labelled
                differently — while it is not, because an admin is never
                blocked, only informed. */}
            {clan.clanId && !clan.approved && (
              <button
                type="button"
                onClick={() => approve(clan.clanId!, clan.complete)}
                disabled={approvingClanId === clan.clanId}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                  clan.readyToApprove
                    ? 'border-brand-500/40 bg-brand-500/10 text-brand-700 hover:bg-brand-500/20'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {approvingClanId === clan.clanId
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <CheckCircle2 className="h-2.5 w-2.5" />}
                {clan.readyToApprove ? 'Approve & unlock sending' : 'Approve early'}
              </button>
            )}
            {onViewClan && clan.pending > 0 && (
              <button type="button" onClick={() => onViewClan(clan.clanId, clan.clanName, 'pending')} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold text-foreground hover:border-brand-500/40">
                Review {clan.pending} pending
              </button>
            )}
            {onViewClan && clan.overridden > 0 && (
              <button type="button" onClick={() => onViewClan(clan.clanId, clan.clanName, 'changed')} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold text-foreground hover:border-brand-500/40">
                View {clan.overridden} change{clan.overridden === 1 ? '' : 's'}
              </button>
            )}
            {onViewClan && clan.pending === 0 && clan.overridden === 0 && (
              <button type="button" onClick={() => onViewClan(clan.clanId, clan.clanName, 'all')} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[10px] font-semibold text-foreground hover:border-brand-500/40">
                View decisions
              </button>
            )}
            </div>
          </li>
        );})}
      </ul>
      {!matching.length && (
        <p className="py-3 text-sm text-muted-foreground">
          {search
            ? 'No clans match that search.'
            : bucket === 'blocked' ? 'Every clan has finished its review.'
              : bucket === 'ready' ? 'No clan is waiting on your approval.'
                : bucket === 'approved' ? 'No clan has been approved yet.'
                  : 'No clans.'}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs"><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>{current} / {pages}</span><button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
      </details>

      <div className="flex flex-wrap items-center gap-2 pl-6">
        <button
          type="button"
          onClick={remind}
          disabled={reminding || counts.blocked === 0}
          title={counts.blocked === 0
            ? 'Every clan has finished its review — there is nobody to remind'
            : 'Writes only to the mentors of clans that still owe reviews, with their own outstanding count'}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground hover:border-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reminding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          {/* Saying who it reaches: the button read "Remind mentors" and people
              reasonably assumed it mailed all of them. */}
          {counts.blocked === 0
            ? 'Nobody to remind'
            : `Remind mentors of ${counts.blocked} unfinished clan${counts.blocked === 1 ? '' : 's'}`}
        </button>
        {onIssueAnyway && (
          <button
            type="button"
            onClick={onIssueAnyway}
            className="rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Issue anyway
          </button>
        )}
      </div>
    </div>
  );
}
