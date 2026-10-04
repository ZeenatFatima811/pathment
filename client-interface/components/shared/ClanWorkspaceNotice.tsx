'use client';

import { Archive } from 'lucide-react';
import {
  useClan,
  resolveActiveMentorClan,
} from '@/lib/context/ClanContext';
import { StandingClanRequestCta } from '@/components/shared/StandingClanRequestCta';

/**
 * Banner on mentor/mentee screens when the active cohort clan is frozen
 * (program closed). Standing clans use the same screens with no extra banner.
 */
export function ClanWorkspaceNotice({ role }: { role: 'mentor' | 'mentee' }) {
  const { clans, activeClanId, menteeClans, menteeActiveClanId } = useClan();
  const clan =
    role === 'mentor'
      ? resolveActiveMentorClan(clans, activeClanId)
      : menteeClans.find((c) => c.id === menteeActiveClanId);

  // Standing clans stay fully open — no notice. Only frozen cohort history.
  if (!clan?.frozenAt || clan.kind === 'standing') return null;

  const showStandingRequest =
    role === 'mentor' && Boolean(clan.programId);

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-card px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-muted p-2 text-slate-600">
          <Archive className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {clan.name}
            <span className="font-normal text-slate-500"> · Program closed</span>
          </p>
          <p className="mt-1 text-slate-600">
            This clan is frozen the same screens as before, with actions disabled.
            Past work and feedback stay available to view.
          </p>
        </div>
      </div>

      {showStandingRequest && clan.programId ? (
        <StandingClanRequestCta programId={clan.programId} programName={clan.name} />
      ) : null}
    </div>
  );
}
