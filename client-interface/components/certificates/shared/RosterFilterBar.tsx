'use client';

import { AWARDED_CERTIFICATES, NO_CERTIFICATE } from '@/lib/utils/certificate-decision';
import { Search, X } from 'lucide-react';
import { SelectMenu } from '@/components/shared/SelectMenu';
import type { ReviewerClanState } from '@/lib/services/certificates-api';
import type { TierCriteria } from '@/components/admin/certificates/certificate-constants';

/** How far through the review round a recipient is. */
export type ReviewFilter =
  | 'all'
  | 'pending'
  // The two that 'verified' used to hide behind one word. An admin who has just
  // worked through a cohort needs to separate their own approvals from the
  // mentor sign-offs still waiting on them — that was impossible to filter for.
  | 'mentor_verified'
  | 'admin_approved'
  | 'verified'
  | 'changed'
  | 'sendable';
export type RosterSort = 'none' | 'score_desc' | 'score_asc';

interface RosterFilterBarProps {
  search: string;
  onSearch: (value: string) => void;

  clan: string;
  onClan: (value: string) => void;
  /** Clans present in the roster, in the order they should be offered. */
  clans: Array<{ id: string; name: string }>;
  /** Review progress per clan, to label each option with where it stands. */
  clanStates?: ReviewerClanState[];

  badge: string;
  onBadge: (value: string) => void;
  criteria: TierCriteria[];

  sort: RosterSort;
  onSort: (value: RosterSort) => void;

  /** Omitted when no review round is open — there is nothing to filter by. */
  review?: ReviewFilter;
  onReview?: (value: ReviewFilter) => void;
}

/**
 * The one filter bar above a certificate roster, in both portals.
 *
 * Certificates are issued a clan at a time — a cohort is several clans on
 * different schedules, each released by the admin separately — so the clan
 * filter is the primary one and carries each clan's review state in its own
 * label. Narrowing to a clan also turns the table's select-all into
 * "select this clan", which is the action an admin actually wants; a separate
 * button for it would be a second way to do the same thing.
 *
 * Uses the shared `SelectMenu` rather than native `<select>`, like every other
 * filter bar in the app.
 */
export function RosterFilterBar({
  search, onSearch,
  clan, onClan, clans, clanStates = [],
  badge, onBadge, criteria,
  sort, onSort,
  review, onReview,
}: RosterFilterBarProps) {
  const stateOf = (clanId: string) => clanStates.find((c) => c.clanId === clanId);

  const clanLabel = (c: { id: string; name: string }) => {
    const state = stateOf(c.id);
    if (!state) return c.name;
    const changes = state.overridden ? ` · ${state.overridden} changed` : '';
    if (state.canSend) return `${c.name} — approved${changes}`;
    if (state.pending === 0) return `${c.name} — verified${changes}`;
    return `${c.name} — ${state.pending} to review${changes}`;
  };

  const clanOptions = [
    { value: 'all', label: `All clans (${clans.length})` },
    ...clans.map((c) => ({ value: c.id, label: clanLabel(c) })),
  ];

  return (
    // Flex-wrap rather than a fixed grid: the clan and review controls appear
    // only when they have something to narrow, and a grid would leave holes
    // where they are absent.
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center mb-5">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-10 pr-9 py-2.5 text-sm bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-muted-foreground/60"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {clans.length > 1 && (
        <div className="w-full sm:w-52">
          <SelectMenu
            value={clan}
            onChange={onClan}
            options={clanOptions}
            ariaLabel="Filter by clan"
            className="w-full"
          />
        </div>
      )}

      {review && onReview && (
        <div className="w-full sm:w-48">
          <SelectMenu
            value={review}
            onChange={(v) => onReview(v as ReviewFilter)}
            options={[
              { value: 'all',             label: 'Any review state' },
              { value: 'pending',         label: 'Awaiting mentor' },
              { value: 'mentor_verified', label: 'Mentor verified — waiting on an admin' },
              { value: 'admin_approved',  label: 'Approved by an admin' },
              { value: 'verified',        label: 'Signed off — either' },
              { value: 'changed',         label: 'Changed by a mentor' },
              { value: 'sendable',        label: 'Approved by admin — cleared to send' },
            ]}
            ariaLabel="Filter by review state"
            className="w-full"
          />
        </div>
      )}

      <div className="w-full sm:w-44">
        <SelectMenu
          value={badge}
          onChange={onBadge}
          options={[
            { value: 'all', label: 'All decisions' },
            { value: AWARDED_CERTIFICATES, label: 'Certificate assigned' },
            { value: NO_CERTIFICATE, label: 'No certificate' },
            { value: '', label: 'Not evaluated / unassigned' },
            ...criteria.map((c) => ({ value: c.id, label: c.name })),
          ]}
          ariaLabel="Filter by badge"
          className="w-full"
        />
      </div>

      <div className="w-full sm:w-44">
        <SelectMenu
          value={sort}
          onChange={(v) => onSort(v as RosterSort)}
          options={[
            { value: 'none',       label: 'Sort: default' },
            { value: 'score_desc', label: 'Highest score first' },
            { value: 'score_asc',  label: 'Lowest score first' },
          ]}
          ariaLabel="Sort roster"
          className="w-full"
        />
      </div>
    </div>
  );
}
