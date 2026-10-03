'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Drawer } from './Drawer';
import { completionApi, type StandingRequest } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { qk } from '@/lib/query';
import { useProgramCloseoutEnabled } from '@/lib/hooks/useProgramCloseoutEnabled';

const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const field = 'mt-2 w-full rounded-lg border border-slate-300 bg-card p-3 text-sm';
export const STANDING_CLAN_UPGRADE_COPY = 'Standing clan requests are available on Growth and Scale plans.';

export type StandingClanReview = {
  row: StandingRequest;
  decision: 'approved' | 'rejected';
};

/** Approve / Reject confirm drawer — shared by the requests list and admin notification drawer. */
export function StandingClanDecisionDrawer({
  review,
  onClose,
  onDecided,
  zClass,
}: {
  review: StandingClanReview | null;
  onClose: () => void;
  onDecided?: () => void;
  /** Stack above the notification drawer when deciding from the bell. */
  zClass?: string;
}) {
  const closeoutEnabled = useProgramCloseoutEnabled();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (review) setNote('');
  }, [review?.row.id, review?.decision]);

  const decide = async () => {
    if (!review) return;
    if (review.decision === 'approved' && !closeoutEnabled) {
      toast.error(STANDING_CLAN_UPGRADE_COPY);
      return;
    }
    setBusy(true);
    try {
      await completionApi.decide(review.row.id, review.decision, note);
      toast.success(
        review.decision === 'approved'
          ? 'Fresh standing clan created with an empty mentee roster'
          : 'Request rejected',
      );
      setNote('');
      await queryClient.invalidateQueries({ queryKey: qk.clan.all });
      onClose();
      onDecided?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not record decision'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!review}
      onClose={() => {
        if (!busy) {
          setNote('');
          onClose();
        }
      }}
      zClass={zClass}
      title={review?.decision === 'approved' ? 'Approve standing clan' : 'Reject request'}
      subtitle={review?.row.name}
      footer={
        <button
          className={button}
          disabled={
            busy
            || (review?.decision === 'rejected' && !note.trim())
            || (review?.decision === 'approved' && !closeoutEnabled)
          }
          onClick={decide}
        >
          {busy ? 'Saving…' : review?.decision === 'approved' ? 'Approve and create clan' : 'Reject request'}
        </button>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {review?.decision === 'approved'
          ? 'This creates a fresh clan and assigns the requesting mentor as its lead. They can then add their chosen mentees.'
          : 'Let the mentor know why this request cannot be approved.'}
      </p>
      <label className="text-sm font-medium">
        Decision note {review?.decision === 'approved' ? '(optional)' : '(required)'}
        <textarea
          value={note}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
          className={`${field} min-h-24`}
        />
      </label>
    </Drawer>
  );
}

export function StandingClanDecisionButtons({
  row,
  disabled,
  title,
  onReview,
}: {
  row: StandingRequest;
  disabled?: boolean;
  title?: string;
  onReview: (review: StandingClanReview) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={button}
        disabled={disabled}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          onReview({ row, decision: 'approved' });
        }}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          onReview({ row, decision: 'rejected' });
        }}
      >
        Reject
      </button>
    </div>
  );
}
