'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, Download, Loader2, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from './Drawer';
import { SelectMenu } from './SelectMenu';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { completionApi, type ClosurePreview, type FinalResults, type FinalSnapshot } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const button = 'inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';

function decisionText(snapshot: FinalSnapshot) {
  const d = snapshot.decision || {};
  const parts = [
    d.decision ? String(d.decision).replaceAll('_', ' ') : null,
    d.overrideReason || null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

export function ProgramCompletionPanel({
  programId,
  admin = false,
  showResults = true,
  onChange,
}: {
  programId: string;
  admin?: boolean;
  /** When false, only close/reopen controls (and unresolved-cert notice) render — no results table. */
  showResults?: boolean;
  onChange?: () => void;
}) {
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [results, setResults] = useState<FinalResults | null>(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<FinalSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const confirm = useConfirm();
  const load = useCallback(async () => {
    try {
      setError('');
      const [p, r] = await Promise.all([admin ? completionApi.preview(programId) : null, completionApi.results(programId)]);
      setPreview(p); setResults(r); setSelected(r.currentClosureId || '');
    } catch (e) { setError(extractApiErrorMessage(e, 'Could not load program completion')); }
  }, [programId, admin]);
  useEffect(() => { void load(); }, [load]);
  const featureAvailable = preview?.featureAvailable !== false;
  const close = async () => {
    if (!featureAvailable) return;
    if (!await confirm({ title: 'Close this program?', description: 'Save final outcomes and performance, complete all cohorts, and make cohort clans and their communities read-only. The program community stays open.' })) return;
    setBusy(true);
    try { await completionApi.close(programId); toast.success('Program closed and final results saved'); await load(); onChange?.(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not close the program')); await load(); }
    finally { setBusy(false); }
  };
  const reopen = async () => {
    if (!featureAvailable) return;
    setBusy(true);
    try { await completionApi.reopen(programId, reason); toast.success('Program reopened for corrections'); setReopening(false); setReason(''); await load(); onChange?.(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not reopen the program')); }
    finally { setBusy(false); }
  };
  const snapshots = results?.snapshots.filter(s => s.closureId === selected) || [];
  const exportResults = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""')}"`;
    const partKeys = [...new Set(snapshots.flatMap(s => (s.performance.parts || []).map(p => p.key)))];
    const rows = [[
      'Mentee', 'Outcome', 'Certificate tier', 'Progress score',
      ...partKeys.flatMap(k => [`${k} score`, `${k} weight`]),
      'Completion %', 'On-time %', 'Tasks completed', 'Cohort rank',
      'Present', 'Absent', 'Excused', 'Decision', 'Decision reason',
    ], ...snapshots.map(s => {
      const byKey = Object.fromEntries((s.performance.parts || []).map(p => [p.key, p]));
      return [
        `${s.mentee.firstName} ${s.mentee.lastName}`, s.outcome, s.tier, s.performance.score,
        ...partKeys.flatMap(k => [byKey[k]?.score ?? '', byKey[k]?.weight ?? '']),
        s.performance.evidence.absoluteProgress, s.performance.evidence.onTimeRate,
        s.performance.evidence.tasksCompleted, s.cohortRank,
        s.performance.evidence.attendance?.present, s.performance.evidence.attendance?.absent,
        s.performance.evidence.attendance?.excused, s.decision?.decision, s.decision?.overrideReason,
      ];
    })];
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `program-results-${selected}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  if (error) return <div className="rounded-xl border border-slate-200 bg-card p-4 text-sm"><p role="alert">{error}</p><button onClick={load} className="mt-2 text-brand-600">Try again</button></div>;
  if (!results || (admin && !preview)) return <div className="p-4"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading completion" /></div>;
  if (!admin && !results.history.length) return null;
  return <section className="my-6 space-y-4 rounded-2xl border border-slate-200 bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Archive className="h-5 w-5" /> Program completion</h2>
        <p className="mt-1 text-sm text-slate-500">{results.closed ? 'Final results are saved. Cohort clans are historical and read-only.' : preview?.ended ? 'The scheduled period has ended. Review final certificate decisions before closing.' : 'The scheduled period is still open. Formal closure becomes available on the end date.'}</p></div>
      {admin && featureAvailable && (results.closed ? <button className={button} onClick={() => setReopening(true)}>Reopen for correction</button> : <button className={button} disabled={busy || !preview?.canClose} onClick={close}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Close program</button>)}
    </div>
    {preview && !preview.closed && preview.unresolved.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <p>Certificate decisions need attention for {preview.unresolved.length} mentee(s).</p>
      <p className="mt-1">{preview.unresolved.slice(0, 8).map(u => `${u.firstName} ${u.lastName}`).join(', ')}{preview.unresolved.length > 8 ? '…' : ''}</p>
      <Link href="/admin/certificates" className="mt-2 inline-block font-medium underline">Review certificate decisions</Link>
    </div>}
    {showResults && results.history.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><SelectMenu ariaLabel="Result version" value={selected} onChange={setSelected} options={results.history.map(h => ({ value: h.id, label: `${new Date(h.closedAt).toLocaleString()}${h.id === results.currentClosureId ? results.closed ? ' · Current result' : ' · Previous close' : ' · Earlier close'}` }))} /><button onClick={exportResults} className="inline-flex items-center gap-2 text-sm text-brand-600"><Download className="h-4 w-4" /> Export results</button></div>
      {results.history.find(h => h.id === selected)?.reopenReason && <p className="text-sm text-slate-500">Reopened: {results.history.find(h => h.id === selected)?.reopenReason}</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr>{['Mentee', 'Outcome', 'Tier', 'Score', 'Completion', 'On time', 'Tasks', 'Attendance', 'Rank', ''].map(t => <th key={t || 'actions'} className="whitespace-nowrap p-2">{t}</th>)}</tr></thead><tbody>{snapshots.map(s => <tr key={s.id} className="border-b border-slate-100"><td className="p-2">{s.mentee.firstName} {s.mentee.lastName}</td><td className="p-2">{s.outcome.replaceAll('_', ' ')}</td><td className="p-2">{s.tier || '—'}</td><td className="p-2">{s.performance.score ?? '—'}</td><td className="p-2">{s.performance.evidence.absoluteProgress}%</td><td className="p-2">{s.performance.evidence.onTimeRate ?? '—'}%</td><td className="p-2">{s.performance.evidence.tasksCompleted}</td><td className="p-2">{s.performance.evidence.attendance ? `${s.performance.evidence.attendance.present} present / ${s.performance.evidence.attendance.absent} absent` : '—'}</td><td className="p-2">{s.cohortRank ?? '—'}</td><td className="p-2"><button type="button" onClick={() => setDetail(s)} className="text-brand-600 hover:underline">Details</button></td></tr>)}</tbody></table>{!snapshots.length && <p className="p-4 text-sm text-slate-500">No final results in your roster for this close.</p>}</div>
      <p className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> These values are saved at close and stay unchanged when other clan memberships change.</p>
    </>}
    <Drawer open={reopening && featureAvailable} onClose={() => !busy && setReopening(false)} title="Reopen program" subtitle="Previous results remain in the history. Save revised results by closing again." footer={<button className={button} disabled={busy || !reason.trim()} onClick={reopen}>{busy ? 'Reopening…' : 'Reopen program'}</button>}><label className="block text-sm font-medium" htmlFor="reopen-reason">Reason for correction or appeal</label><textarea id="reopen-reason" value={reason} maxLength={4000} onChange={e => setReason(e.target.value)} className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 bg-card p-3 text-sm" /></Drawer>
    <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.mentee.firstName} ${detail.mentee.lastName}` : 'Result detail'} subtitle={detail ? `${detail.outcome.replaceAll('_', ' ')}${detail.tier ? ` · ${detail.tier}` : ''}` : undefined}>
      {detail && <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-xs text-slate-500">Score</p><p className="font-medium">{detail.performance.score ?? '—'}</p></div>
          <div><p className="text-xs text-slate-500">Cohort rank</p><p className="font-medium">{detail.cohortRank ?? '—'}</p></div>
          <div><p className="text-xs text-slate-500">Completion</p><p className="font-medium">{detail.performance.evidence.absoluteProgress}%</p></div>
          <div><p className="text-xs text-slate-500">On-time</p><p className="font-medium">{detail.performance.evidence.onTimeRate ?? '—'}%</p></div>
          <div><p className="text-xs text-slate-500">Tasks completed</p><p className="font-medium">{detail.performance.evidence.tasksCompleted}</p></div>
          <div><p className="text-xs text-slate-500">Attendance</p><p className="font-medium">{detail.performance.evidence.attendance ? `${detail.performance.evidence.attendance.present}P / ${detail.performance.evidence.attendance.absent}A / ${detail.performance.evidence.attendance.excused}E` : '—'}</p></div>
        </div>
        {(detail.performance.parts || []).length > 0 && <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Score components</p>
          <ul className="space-y-1">{detail.performance.parts.map(p => <li key={p.key} className="flex justify-between gap-3 border-b border-slate-100 py-1.5"><span className="capitalize">{p.key.replaceAll('_', ' ')}</span><span>{p.score} · weight {p.weight}</span></li>)}</ul>
        </div>}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Certificate decision</p>
          <p>{decisionText(detail)}</p>
        </div>
      </div>}
    </Drawer>
  </section>;
}
