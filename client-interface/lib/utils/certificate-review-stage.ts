/**
 * What a certificate review's stage is called on screen.
 *
 * The server used to report one boolean-ish `status` — 'pending' or 'verified'
 * — and both a mentor's sign-off and an admin's wrote 'verified'. So an admin
 * who had just worked through four hundred people saw the identical "Signed
 * off" badge on their own decisions and on everybody else's, and could not tell
 * which ones they had approved. The stage is the fact that was missing.
 *
 * Kept as data in one module because the same four words have to appear
 * identically on the roster row, the review drawer badge and the filter — three
 * places that previously each wrote their own string.
 */
export type ReviewStage = 'ai_evaluated' | 'awaiting_mentor' | 'mentor_verified' | 'admin_approved';

export type StageTone = 'neutral' | 'waiting' | 'progress' | 'done';

export interface StageMeta {
  stage: ReviewStage;
  /** The badge text. */
  label: string;
  /** One line of plain English for a tooltip or an empty state. */
  description: string;
  tone: StageTone;
}

const STAGES: Record<ReviewStage, StageMeta> = {
  ai_evaluated: {
    stage: 'ai_evaluated',
    label: 'AI evaluated',
    description: 'The AI has graded this. No one has been asked to check it yet.',
    tone: 'neutral',
  },
  awaiting_mentor: {
    stage: 'awaiting_mentor',
    label: 'Awaiting mentor',
    description: 'Sent to the clan. The mentor has not verified this grade yet.',
    tone: 'waiting',
  },
  mentor_verified: {
    stage: 'mentor_verified',
    label: 'Mentor verified',
    description: 'A mentor has verified this grade. It still needs an admin to approve it.',
    tone: 'progress',
  },
  admin_approved: {
    stage: 'admin_approved',
    label: 'Approved by admin',
    description: 'An admin has approved this. It is cleared to send.',
    tone: 'done',
  },
};

const ORDER: ReviewStage[] = ['ai_evaluated', 'awaiting_mentor', 'mentor_verified', 'admin_approved'];

/**
 * Resolve a row to its stage, tolerating a server that has not been deployed
 * yet. The client and the API ship separately, so a roster loaded from an older
 * build has no `stage` at all — falling back on `status` keeps the old two
 * states readable instead of rendering an empty badge.
 */
export function reviewStage(row: { stage?: string | null; status?: string | null }): StageMeta {
  const named = row?.stage && (row.stage as ReviewStage) in STAGES
    ? STAGES[row.stage as ReviewStage]
    : null;
  if (named) return named;
  return row?.status === 'verified' ? STAGES.mentor_verified : STAGES.awaiting_mentor;
}

export function stageMeta(stage: ReviewStage): StageMeta {
  return STAGES[stage];
}

/** Ordered, for a filter dropdown — earliest stage first. */
export function stageOptions(): StageMeta[] {
  return ORDER.map((stage) => STAGES[stage]);
}

/** Has this row got far enough to be sent? Only an admin's approval clears it. */
export function isClearedToSend(row: { stage?: string | null; status?: string | null }): boolean {
  return reviewStage(row).stage === 'admin_approved';
}
