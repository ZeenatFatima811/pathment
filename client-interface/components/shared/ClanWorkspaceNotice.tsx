'use client';

import { Archive } from 'lucide-react';
import {
  useClan,
  resolveActiveMentorClan,
} from '@/lib/context/ClanContext';
import { StandingClanRequestCta } from '@/components/shared/StandingClanRequestCta';
import { cn } from '@/components/ui/utils';

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
    <div
      className={cn(
        'mb-5 flex flex-wrap items-start justify-between gap-4',
        'rounded-2xl border border-border bg-card px-4 py-4 sm:px-5',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Same icon-tile pattern as NotificationCard / stats. */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Archive className="h-4 w-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {clan.name}
            </p>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Program closed
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            This clan is frozen. The same screens as before, with actions disabled.
            Past work and feedback stay available to view.
          </p>
        </div>
      </div>

      {showStandingRequest && clan.programId ? (
        <div className="flex shrink-0 items-center self-center">
          <StandingClanRequestCta programId={clan.programId} programName={clan.name} />
        </div>
      ) : null}
    </div>
  );
}
