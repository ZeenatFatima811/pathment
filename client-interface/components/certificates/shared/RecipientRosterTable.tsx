'use client';

import { reviewStage } from '@/lib/utils/certificate-review-stage';
import { NO_CERTIFICATE, reviewSelection, aiSelection, type CertificateDecision } from '@/lib/utils/certificate-decision';
import React from 'react';
import { Loader2, Users, Sparkles, Info, Edit3, ChevronDown, PauseCircle, CheckCircle2, Clock, Lock, MessageCircleQuestion } from 'lucide-react';
import { getTierBadgeColor } from '@/lib/utils/certificates';
import { TierCriteria } from '@/components/admin/certificates/certificate-constants';

/**
 * Where one recipient stands in an open review round.
 *
 * The roster and the review are the same list of people, so they are the same
 * table. Splitting them into two screens meant a mentor had to hold one in
 * their head while looking at the other.
 */
export interface RosterReviewState {
  status: 'pending' | 'verified';
  aiTier: string | null;
  decision?: CertificateDecision;
  aiDecision?: CertificateDecision;
  aiMatchScore?: number | null;
  finalTier: string | null;
  overridden: boolean;
  overrideReason: string | null;
  verifiedBy: string | null;
  verifiedAt?: string | null;
  /** How far the review got — a mentor's check or an admin's approval. */
  stage?: string | null;
  /** An admin has queried this grade and the mentor has not answered yet. */
  hasOpenQuestion?: boolean;
  /** A mentor has asked an admin to change this approved grade. */
  hasChangeRequest?: boolean;
}

export interface RecipientRosterTableProps {
  filtered: any[];
  criteria: TierCriteria[];
  aiEvalMap: Record<string, any>;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  allSelected: boolean;
  assignedTiers: Record<string, string>;
  handleTierChange: (menteeId: string, tierId: string) => void;
  /** Open the full record for this recipient — why they are getting what they are getting. */
  onInspectRecipient: (recipient: { mentee_id: string }) => void;
  loading: boolean;
  getTierName: (tierId: string) => string;
  recipientTypeLabel?: string;
  userRole?: 'admin' | 'mentor';
  emptyMessage?: string;
  /** Review state per recipient id, when a round is open. */
  reviewRows?: Record<string, RosterReviewState>;
  /**
   * Grades are read-only: a round is open but the reviewer has not opened it,
   * so a badge cannot be nudged by accident on the way past. Selection stays
   * live — these same checkboxes choose who to issue to.
   */
  locked?: boolean;
  isRecipientLocked?: (id: string) => boolean;
  /** True once rows were sent to mentors. Makes missing rows explicit. */
  reviewRoundOpen?: boolean;
}

export function RecipientRosterTable({
  filtered,
  criteria,
  aiEvalMap,
  selectedIds,
  toggleOne,
  toggleAll,
  allSelected,
  assignedTiers,
  handleTierChange,
  onInspectRecipient,
  loading,
  getTierName,
  recipientTypeLabel = 'Mentee',
  userRole = 'mentor',
  emptyMessage,
  reviewRows,
  locked = false,
  isRecipientLocked,
  reviewRoundOpen = false,
}: RecipientRosterTableProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="animate-spin w-6 h-6 text-brand-500" />
        <span className="text-xs text-muted-foreground font-semibold">Loading roster data...</span>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center border border-border/80 rounded-2xl bg-card">
        <Users className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-xs font-semibold text-muted-foreground">
          {emptyMessage || `No active ${recipientTypeLabel.toLowerCase()}s found.`}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-2xl overflow-hidden flex flex-col bg-card shadow-xs">
      {}
      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/50 dark:bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider items-center border-b border-border select-none">
        <div className="col-span-1 flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-3.5 h-3.5 rounded border-border text-brand-600 focus:ring-brand-500 accent-brand-600 cursor-pointer shadow-3xs"
          />
        </div>
        <div className="col-span-3">{recipientTypeLabel}</div>
        <div className="col-span-3 text-center">AI Recommendation</div>
        <div className="col-span-3 text-center">Final Assigned Badge</div>
        <div className="col-span-2 text-center">Issued Badges</div>
      </div>

      {}
      <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
        {filtered.map((m: any) => {
          const rowLocked = locked || Boolean(isRecipientLocked?.(m.id));
          const review = reviewRows?.[m.id];
          const selectedTier = assignedTiers[m.id] ?? (review ? reviewSelection(review) : m.assignedDecision === 'no_certificate' ? NO_CERTIFICATE : m.assignedTier ?? aiSelection(aiEvalMap[m.id]));
          const recommendation = review?.aiTier || review?.aiDecision === 'no_certificate'
            ? { certificate_tier: review.aiTier, decision: review.aiDecision, match_score: review.aiMatchScore }
            : aiEvalMap[m.id];
          const issuedTiersList: string[] = m.issuedTiers ?? [];
          const initials = `${m.firstName?.charAt(0) || ''}${m.lastName?.charAt(0) || ''}`.toUpperCase();

          return (
            <div
              key={m.id}
              className={`grid grid-cols-12 gap-2 px-4 py-3 items-center text-xs transition-all duration-150 ${
                m.isPaused
                  ? 'bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/10'
                  : 'hover:bg-muted/20 dark:hover:bg-muted/10'
              }`}
            >
              <div className="col-span-1 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleOne(m.id)}
                  className="w-3.5 h-3.5 rounded border-border text-brand-600 focus:ring-brand-500 accent-brand-600 cursor-pointer shadow-3xs"
                />
              </div>

              {}
              <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-brand-500/10 to-indigo-500/10 dark:from-brand-500/20 dark:to-indigo-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center text-[10px] font-bold border border-brand-500/20 shrink-0">
                  {initials || 'U'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-foreground truncate flex items-center gap-1.5">
                    <span className="truncate">{m.firstName} {m.lastName}</span>
                    {m.isPaused && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                        PAUSED
                      </span>
                    )}
                    {m.role && m.role !== 'mentee' && !m.isPaused && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                        {m.role}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {m.clanName && <span className="font-medium text-foreground/70">{m.clanName} · </span>}
                    {m.email}
                  </p>
                </div>
              </div>

              {}
              <div className="col-span-3 flex items-center justify-center gap-1.5 flex-wrap">
                {m.isPaused ? (
                  <span className="text-[10px] font-bold text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <PauseCircle className="w-3 h-3" /> Paused (No Auto Cert)
                  </span>
                ) : recommendation ? (
                  <div className="flex items-center gap-1.5 bg-violet-500/10 dark:bg-violet-500/20 border border-violet-500/20 px-2.5 py-1 rounded-xl">
                    <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-violet-500" /> {getTierName(aiSelection(recommendation))}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        (recommendation.match_score ?? 0) >= 75
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/20'
                          : 'text-amber-600 dark:text-amber-400 bg-amber-500/20'
                      }`}
                    >
                      {recommendation.match_score == null ? '—' : `${recommendation.match_score}%`}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 font-semibold select-none">—</span>
                )}
                {!m.isPaused && (
                  <button
                    type="button"
                    onClick={() => onInspectRecipient(aiEvalMap[m.id] ?? { mentee_id: m.id })}
                    className="p-1 rounded-lg text-muted-foreground hover:text-brand-600 hover:bg-brand-500/10 transition-colors"
                    title="Why this certificate?"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {}
              <div className="col-span-3 flex flex-col items-center justify-center">
                <div className="relative inline-flex items-center w-full max-w-[170px] shadow-2xs rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors">
                  <select
                    value={selectedTier}
                    onChange={e => handleTierChange(m.id, e.target.value)}
                    disabled={rowLocked}
                    className="w-full appearance-none pr-8 pl-3 py-1.5 bg-transparent text-[11px] font-semibold text-foreground cursor-pointer focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    <option value="">Select decision</option>
                    <option value={NO_CERTIFICATE}>No certificate</option>
                    {criteria.map((c: any) => (
                      <option key={c.id} value={c.id} className="text-foreground bg-card font-medium">
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {rowLocked
                    ? <Lock className="absolute right-2.5 w-3 h-3 pointer-events-none text-muted-foreground/60" />
                    : <ChevronDown className="absolute right-2.5 w-3 h-3 pointer-events-none text-muted-foreground/60" />}
                </div>
                {isRecipientLocked?.(m.id) && <span className="mt-1 text-[10px] text-brand-700">Admin approved · editing locked</span>}
                <ReviewNote
                  review={reviewRows?.[m.id]}
                  aiTier={aiSelection(recommendation) || null}
                  selectedTier={selectedTier}
                  getTierName={getTierName}
                  userRole={userRole}
                  reviewRoundOpen={reviewRoundOpen}
                />
                {review && (
                  <button
                    type="button"
                    onClick={() => onInspectRecipient({ mentee_id: m.id })}
                    className="mt-1 text-[10px] font-semibold text-brand-600 underline-offset-2 hover:underline"
                  >
                    View review details
                  </button>
                )}
              </div>

              {}
              <div className="col-span-2 flex flex-wrap justify-center gap-1">
                {issuedTiersList.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground/40 font-semibold select-none">—</span>
                ) : (
                  issuedTiersList.map((tier, idx) => (
                    <span
                      key={`${tier}-${idx}`}
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${getTierBadgeColor(tier)}`}
                    >
                      {getTierName(tier)}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/**
 * The one line under a recipient's badge that says where their grade stands.
 *
 * Three different facts compete for this space — a signed-off decision, a grade
 * still waiting, and an unsaved change to the AI's pick — and only the most
 * specific one is worth showing. A saved decision outranks an unsaved edit
 * because it is what will actually be issued.
 */
function ReviewNote({
  review, aiTier, selectedTier, getTierName, userRole, reviewRoundOpen,
}: {
  review?: RosterReviewState;
  aiTier: string | null;
  selectedTier: string;
  getTierName: (tierId: string) => string;
  userRole: 'admin' | 'mentor';
  reviewRoundOpen: boolean;
}) {
  const edited = Boolean(aiTier && aiTier !== selectedTier);

  if (review?.status === 'verified') {
    // An unsaved change on top of a saved decision is still a change, and the
    // mentor needs to know it has not been recorded yet.
    if (reviewSelection(review) !== selectedTier) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
          <Edit3 className="w-2.5 h-2.5" /> Changed — verify to save
        </span>
      );
    }
    if (review.hasChangeRequest) {
      // The grade stands; a mentor has asked an admin to move it.
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
          <MessageCircleQuestion className="w-2.5 h-2.5" />
          {reviewStage(review).label} · change requested
        </span>
      );
    }
    if (review.hasOpenQuestion) {
      // The grade stands; what is outstanding is the mentor's explanation. Said
      // on the row so an admin can see at a glance which ones they have queried.
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
          <MessageCircleQuestion className="w-2.5 h-2.5" />
          {reviewStage(review).label} · question sent
        </span>
      );
    }
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5"
        title={review.overrideReason || undefined}
      >
        <CheckCircle2 className="w-2.5 h-2.5" />
        {review.overridden
          ? `Changed by ${review.verifiedBy || 'mentor'} · ${getTierName(review.aiDecision === 'no_certificate' ? NO_CERTIFICATE : review.aiTier || '')} → ${getTierName(reviewSelection(review))}`
          // "Signed off by X" read the same whoever X was. Naming the stage is
          // what lets an admin scan the roster for their own approvals.
          : `${reviewStage(review).label}${review.verifiedBy ? ` · ${review.verifiedBy}` : ''}`}
      </span>
    );
  }

  if (review?.status === 'pending') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
        <Clock className="w-2.5 h-2.5" /> {edited ? 'Changed — awaiting verify' : 'Awaiting your review'}
      </span>
    );
  }

  if (edited) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
        <Edit3 className="w-2.5 h-2.5" /> Overridden by {userRole === 'admin' ? 'Admin' : 'Mentor'}
      </span>
    );
  }

  if (reviewRoundOpen) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground mt-0.5">
        <Clock className="w-2.5 h-2.5" /> Not sent for review
      </span>
    );
  }

  return null;
}
