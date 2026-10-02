'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Drawer } from './Drawer';
import { SelectMenu } from './SelectMenu';
import { completionApi, type StandingRequest } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useProgramCloseoutEnabled } from '@/lib/hooks/useProgramCloseoutEnabled';
import Link from 'next/link';
import {
  StandingClanDecisionButtons,
  StandingClanDecisionDrawer,
  STANDING_CLAN_UPGRADE_COPY,
  type StandingClanReview,
} from './StandingClanDecisionDrawer';

const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const field = 'mt-2 w-full rounded-lg border border-slate-300 bg-card p-3 text-sm';

export function StandingClanRequests({
  admin = false,
  hideWhenEmpty = false,
  hideRequestButton = false,
}: {
  admin?: boolean;
  hideWhenEmpty?: boolean;
  /** When the request CTA lives on the completed-history banner instead. */
  hideRequestButton?: boolean;
}) {
  const closeoutEnabled = useProgramCloseoutEnabled();
  const [requests, setRequests] = useState<StandingRequest[]>([]);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [review, setReview] = useState<StandingClanReview | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      const [r, p] = await Promise.all([
        completionApi.requests(),
        admin || !closeoutEnabled ? Promise.resolve([]) : completionApi.eligiblePrograms(),
      ]);
      setRequests(Array.isArray(r) ? r : []);
      setPrograms(Array.isArray(p) ? p : []);
    } catch (e) { setError(extractApiErrorMessage(e, 'Could not load standing clan requests')); }
    finally { setLoading(false); }
  }, [admin, closeoutEnabled]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    if (!closeoutEnabled) return;
    setBusy(true);
    try { await completionApi.request({ programId, name: name.trim(), description: description.trim() }); toast.success('Request sent to admins'); setOpen(false); setName(''); setDescription(''); await load(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not submit request')); }
    finally { setBusy(false); }
  };
  // Mentors only need pending/rejected here. Approved clans move to the clan picker.
  const visible = admin ? requests : requests.filter((r) => r.status !== 'approved');
  // Cockpit: hide the whole card once there is nothing open to act on.
  if (!admin && hideWhenEmpty && !loading && !error && visible.length === 0) return null;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Standing clans</h2><p className="mt-1 text-sm text-slate-500">{admin ? 'Approve a new mentoring space from notifications (primary) or here. Its mentor chooses the mentees after approval.' : hideRequestButton ? 'Status of standing clan requests for programs you mentored.' : 'Continue mentoring in a fresh clan after a program is formally closed.'}</p></div>{!admin && !hideRequestButton && closeoutEnabled && <button className={`${button} inline-flex items-center gap-2`} disabled={!programs.length} onClick={() => { setProgramId(programs[0]?.id || ''); setOpen(true); }}><Plus className="h-4 w-4" /> Request a standing clan</button>}</div>
    {!closeoutEnabled && (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {STANDING_CLAN_UPGRADE_COPY}{' '}
        <Link href="/admin/settings?tab=plan" className="font-medium underline">View plans</Link>
      </p>
    )}
    {loading ? <Loader2 aria-label="Loading requests" className="h-5 w-5 animate-spin" /> : error ? <p role="alert" className="text-sm text-red-600">{error} <button onClick={load} className="underline">Try again</button></p> : <>
      {!admin && closeoutEnabled && !programs.length && <p className="text-sm text-slate-500">You can apply when an admin formally closes a program you mentor.</p>}
      {!visible.length && <p className="text-sm text-slate-500">{admin ? 'No standing clan requests yet.' : 'No open standing clan requests.'}</p>}
      {visible.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div className="min-w-0"><p className="font-medium text-slate-900">{r.name} <span className={`ml-2 rounded-full px-2 py-1 text-xs ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span></p><p className="mt-1 text-xs text-slate-500">{r.program.name}{admin ? ` · ${r.mentor.firstName} ${r.mentor.lastName}` : ''}</p>{r.description && <p className="mt-2 text-sm text-slate-600">{r.description}</p>}{r.decisionNote && <p className="mt-2 text-sm text-slate-600">Admin decision: {r.decisionNote}</p>}</div>
        {admin && r.status === 'pending' && (
          <StandingClanDecisionButtons
            row={r}
            disabled={!closeoutEnabled}
            title={!closeoutEnabled ? STANDING_CLAN_UPGRADE_COPY : undefined}
            onReview={setReview}
          />
        )}
      </div>)}
    </>}
    <Drawer open={open && closeoutEnabled} onClose={() => !busy && setOpen(false)} title="Request a standing clan" subtitle="An admin will review your request. After approval, you can add mentees from your organization." footer={<button className={button} disabled={busy || !programId || !name.trim()} onClick={submit}>{busy ? 'Sending…' : 'Send request'}</button>}><div className="space-y-4"><div><p className="mb-2 text-sm font-medium">Completed program</p><SelectMenu ariaLabel="Completed program" value={programId} onChange={setProgramId} options={programs.map(p => ({ value: p.id, label: p.name }))} /></div><label className="block text-sm font-medium">New clan name<input value={name} maxLength={150} onChange={e => setName(e.target.value)} className={field} /></label><label className="block text-sm font-medium">What would you like to work on?<textarea value={description} maxLength={4000} onChange={e => setDescription(e.target.value)} className={`${field} min-h-24`} /></label><p className="text-sm text-slate-500">Your new clan starts empty. You choose its mentees separately; their current memberships and program work stay in place.</p></div></Drawer>
    <StandingClanDecisionDrawer review={review} onClose={() => setReview(null)} onDecided={load} />
  </section>;
}
