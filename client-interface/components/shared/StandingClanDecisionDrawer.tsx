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
  decision: 'rejected';
};

async function decideStandingRequest(
  row: StandingRequest,
  decision: 'approved' | 'rejected',
  note: string,
) {
  await completionApi.decide(row.id, decision, note);
}

/** Reject confirm drawer — optional note is shown to the mentor. Approve is one-click (no drawer). */
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
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (review) setNote('');
  }, [review?.row.id]);

  const reject = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await decideStandingRequest(review.row, 'rejected', note.trim());
      toast.success('Request rejected');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: qk.clan.all });
      onClose();
      onDecided?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not reject request'));
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
      title="Reject request"
      subtitle={review?.row.name}
      footer={
        <button className={button} disabled={busy} onClick={reject}>
          {busy ? 'Saving…' : 'Reject request'}
        </button>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Optionally tell the mentor why this request was rejected. They will see the note in their notification.
      </p>
      <label className="text-sm font-medium">
        Rejection reason <span className="font-normal text-slate-400">(optional)</span>
        <textarea
          value={note}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Please clarify the proposed mentoring work"
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
  onDecided,
}: {
  row: StandingRequest;
  disabled?: boolean;
  title?: string;
  /** Opens the reject drawer (approve is handled in-place). */
  onReview: (review: StandingClanReview) => void;
  onDecided?: () => void;
}) {
  const closeoutEnabled = useProgramCloseoutEnabled();
  const queryClient = useQueryClient();
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    if (!closeoutEnabled) {
      toast.error(STANDING_CLAN_UPGRADE_COPY);
      return;
    }
    setApproving(true);
    try {
      await decideStandingRequest(row, 'approved', '');
      toast.success('Fresh standing clan created with an empty mentee roster');
      await queryClient.invalidateQueries({ queryKey: qk.clan.all });
      onDecided?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not approve request'));
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={button}
        disabled={disabled || approving}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          void approve();
        }}
      >
        {approving ? 'Approving…' : 'Approve'}
      </button>
      <button
        type="button"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        disabled={approving}
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
