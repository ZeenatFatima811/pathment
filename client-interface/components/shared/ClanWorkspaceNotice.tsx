'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, Layers } from 'lucide-react';
import {
  useClan,
  resolveActiveMentorClan,
} from '@/lib/context/ClanContext';
import { StandingClanRequestCta } from '@/components/shared/StandingClanRequestCta';

export function ClanWorkspaceNotice({ role }: { role: 'mentor' | 'mentee' }) {
  const pathname = usePathname();
  const { clans, activeClanId, menteeClans, menteeActiveClanId } = useClan();
  const clan =
    role === 'mentor'
      ? resolveActiveMentorClan(clans, activeClanId)
      : menteeClans.find((c) => c.id === menteeActiveClanId);

  if (!clan?.frozenAt && clan?.kind !== 'standing') return null;

  // Dedicated completed homes already cover these routes when present.
  if (
    role === 'mentee' &&
    clan.frozenAt &&
    (pathname === '/mentee/dashboard' || pathname === '/mentee')
  ) {
    return null;
  }

  // Insights final-results views already tell the completed story (and host
  // the standing-clan request) — skip the duplicate Archive banner there.
  if (
    role === 'mentor' &&
    clan.frozenAt &&
    (pathname === '/mentor/reports' ||
      pathname === '/mentor/scores' ||
      pathname === '/mentor/leaderboard')
  ) {
    return null;
  }

  const standing = clan.kind === 'standing';
  const Icon = standing ? Layers : Archive;
  const resultsHref = role === 'mentor' ? '/mentor/reports' : '/mentee/progress';
  const showStandingRequest =
    role === 'mentor' && !standing && Boolean(clan.frozenAt && clan.programId);

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-card px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-muted p-2 text-slate-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {clan.name}
            <span className="font-normal text-slate-500">
              {' '}
              · {standing ? 'Standing clan' : 'Completed program history'}
            </span>
          </p>
          <p className="mt-1 text-slate-600">
            {standing ? (
              <>
                Ongoing mentoring with its own tasks and activity.{' '}
                <Link className="font-medium text-brand-600 hover:text-brand-700" href={resultsHref}>
                  View activity
                </Link>
              </>
            ) : (
              <>
                Past work and feedback are read-only.{' '}
                <Link className="font-medium text-brand-600 hover:text-brand-700" href={resultsHref}>
                  View final results
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {showStandingRequest && clan.programId ? (
        <StandingClanRequestCta programId={clan.programId} programName={clan.name} />
      ) : null}
    </div>
  );
}
