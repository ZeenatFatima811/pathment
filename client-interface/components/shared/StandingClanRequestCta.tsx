'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { completionApi, type StandingRequest } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useClan } from '@/lib/context/ClanContext';
import { qk } from '@/lib/query';
import { useProgramCloseoutEnabled } from '@/lib/hooks/useProgramCloseoutEnabled';

const button =
  'inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const field = 'mt-2 w-full rounded-lg border border-slate-300 bg-card p-3 text-sm';

/**
 * Compact standing-clan request control for the completed-history banner.
 * Hidden once this program already has an approved standing clan for the mentor.
 * Hidden on Starter / free plans (paid standing-clan feature).
 */
export function StandingClanRequestCta({
  programId,
  programName,
}: {
  programId: string;
  programName?: string;
}) {
  const closeoutEnabled = useProgramCloseoutEnabled();
  const { clans } = useClan();
  const queryClient = useQueryClient();
  const [eligible, setEligible] = useState(false);
  const [requests, setRequests] = useState<StandingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!closeoutEnabled) {
      setEligible(false);
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      const [r, programs] = await Promise.all([
        completionApi.requests(),
        completionApi.eligiblePrograms(),
      ]);
      setRequests(Array.isArray(r) ? r : []);
      setEligible(Array.isArray(programs) && programs.some((p) => p.id === programId));
    } catch {
      setRequests([]);
      setEligible(false);
    } finally {
      setLoading(false);
    }
  }, [programId, closeoutEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!closeoutEnabled) return null;

  const forProgram = requests.filter((r) => r.program?.id === programId);
  const approved = forProgram.some((r) => r.status === 'approved');
  const pending = forProgram.find((r) => r.status === 'pending');
  const hasStandingClan = clans.some(
    (c) => c.kind === 'standing' && c.programId === programId,
  );

  // After admin approval (or an existing standing clan for this program), hide the CTA.
  if (approved || hasStandingClan) return null;
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading standing clan options" />
      </span>
    );
  }
  if (!eligible && !pending) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await completionApi.request({
        programId,
        name: name.trim(),
        description: description.trim(),
      });
      toast.success('Request sent to admins');
      setOpen(false);
      setName('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey: qk.clan.all });
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit request'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
          Standing clan request pending
        </span>
      ) : (
        <button
          type="button"
          className={`${button} shrink-0`}
          onClick={() => {
            setName(programName ? `${programName} · Standing` : '');
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Request standing clan
        </button>
      )}

      <Drawer
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Request a standing clan"
        subtitle="An admin will review your request. After approval, you can add mentees from your organization."
        footer={
          <button
            className={button}
            disabled={busy || !name.trim()}
            onClick={submit}
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
        }
      >
        <div className="space-y-4">
          {programName ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Completed program: <span className="font-medium text-slate-900">{programName}</span>
            </p>
          ) : null}
          <label className="block text-sm font-medium">
            New clan name
            <input
              value={name}
              maxLength={150}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            What would you like to work on?
            <textarea
              value={description}
              maxLength={4000}
              onChange={(e) => setDescription(e.target.value)}
              className={`${field} min-h-24`}
            />
          </label>
          <p className="text-sm text-slate-500">
            Your new clan starts empty. You choose its mentees separately; their current memberships and program work stay in place.
          </p>
        </div>
      </Drawer>
    </>
  );
}
