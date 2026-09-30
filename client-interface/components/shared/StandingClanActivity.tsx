'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/services/api-client';
import { SelectMenu } from './SelectMenu';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
interface ActivityRow {
  id: string; name: string; tasksAssigned: number; tasksCompleted: number; blockersRaised: number; blockersResolved: number;
  dailyLogs: number; streak: number; kudos: number; attendance: { present: number; absent: number; excused: number };
}
export function StandingClanActivity({ clanId }: { clanId: string }) {
  const [period, setPeriod] = useState('30d');
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    apiClient.get<{ data: { mentees: ActivityRow[] } }>(`/clans/${clanId}/activity`, { params: { period } })
      .then(r => { if (!cancelled) setRows(r.data.mentees); })
      .catch(e => { if (!cancelled) setError(extractApiErrorMessage(e, 'Could not load activity')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clanId, period, reload]);
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-semibold text-slate-900">Standing clan activity</h1><p className="mt-1 text-sm text-slate-500">Work and participation in this clan during the selected period.</p></div><SelectMenu value={period} onChange={setPeriod} ariaLabel="Activity period" options={[{ value: '30d', label: 'Last 30 days' }, { value: 'quarter', label: 'This quarter' }, { value: 'joined', label: 'Since joining' }]} /></div>
    {loading ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="Loading activity" /> : error ? <p role="alert" className="text-sm text-red-600">{error} <button onClick={() => setReload(x => x + 1)} className="underline">Try again</button></p> : !rows.length ? <p className="py-8 text-center text-sm text-slate-500">Add mentees from Clan Team to begin mentoring. Activity will appear here as they participate.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500">{['Mentee', 'Assigned', 'Completed', 'Reviews attended', 'Blockers raised / resolved', 'Daily logs', 'Current streak', 'Kudos'].map(h => <th key={h} className="whitespace-nowrap p-3">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr className="border-b border-slate-100" key={r.id}><td className="p-3 font-medium">{r.name}</td><td className="p-3">{r.tasksAssigned}</td><td className="p-3">{r.tasksCompleted}</td><td className="p-3">{r.attendance.present} / {r.attendance.present + r.attendance.absent}<span className="block text-xs text-slate-400">{r.attendance.excused} excused</span></td><td className="p-3">{r.blockersRaised} / {r.blockersResolved}</td><td className="p-3">{r.dailyLogs}</td><td className="p-3">{r.streak} days</td><td className="p-3">{r.kudos}</td></tr>)}</tbody></table></div>}
  </section>;
}
