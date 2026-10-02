'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  BookOpen, Users, Users2, Crown, ChevronLeft, ArrowUpRight, Loader2,
  ClipboardCheck, Route, CalendarClock, Mail, GraduationCap, Lock, Globe,
} from 'lucide-react';
import { useMentorProgramDetail, type ProgramClanDetail, type ProgramPerson } from '@/lib/hooks/mentor';

const STATUS_CLASS: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
  completed: 'bg-brand-50 text-brand-700 border-brand-200',
};

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-brand-600" />
      </div>
      <div>
        <div className="text-xl font-semibold text-slate-900 tabular-nums">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function PersonRow({ person }: { person: ProgramPerson }) {
  return (
    <Link
      href={`/mentor/mentees/${person.id}`}
      className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
        <span className="text-brand-700 text-xs font-medium">{person.avatar}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{person.name}</p>
        {person.email && <p className="text-xs text-slate-500 truncate flex items-center gap-1"><Mail className="w-3 h-3" />{person.email}</p>}
      </div>
      <ArrowUpRight className="w-4 h-4 text-slate-300 shrink-0" />
    </Link>
  );
}

function ClanCard({ clan }: { clan: ProgramClanDetail }) {
  return (
    <section className="bg-card rounded-2xl border border-slate-200 overflow-hidden" aria-label={`Clan ${clan.name}`}>
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0"><Users2 className="w-4.5 h-4.5 text-brand-600" /></div>
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 truncate">{clan.name}</h2>
          <p className="text-xs text-slate-500 inline-flex items-center gap-1">
            {clan.myRole === 'lead_mentor' ? <><Crown className="w-3 h-3 text-amber-500" />Lead mentor</> : 'Co-mentor'}
          </p>
        </div>
        <span className="ml-auto text-xs text-slate-500">{clan.mentees.length} mentee{clan.mentees.length === 1 ? '' : 's'}</span>
      </div>

      <div className="p-5 space-y-4">
        {clan.coMentors.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Mentor team</p>
            <div className="flex flex-wrap gap-2">
              {clan.coMentors.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">
                  {c.role === 'lead_mentor' && <Crown className="w-3 h-3 text-amber-500" />}{c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Mentees</p>
          {clan.mentees.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No mentees in this clan yet. They appear here once they are enrolled.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {clan.mentees.map((m) => <PersonRow key={m.id} person={m} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const QUICK_ACTIONS = [
  { href: '/mentor/review', icon: ClipboardCheck, label: 'Clan review', hint: 'Review submissions & attendance' },
  { href: '/mentor/roadmaps', icon: Route, label: 'Roadmaps', hint: 'Assign learning paths' },
  { href: '/mentor/schedules', icon: CalendarClock, label: 'Schedules', hint: 'Set recurring rituals' },
];

export default function MentorProgramDetail() {
  const params = useParams();
  const id = params?.id as string;
  const { program, clans, menteeCount, coMentorCount, loading, notFound } = useMentorProgramDetail(id);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }

  if (notFound || !program) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center max-w-xl mx-auto">
        <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-medium">This program isn&apos;t one you mentor in</p>
        <p className="text-slate-500 text-sm mt-1">You only see programs where you lead or co-mentor a clan.</p>
        <Link href="/mentor/programs" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-sm font-medium mt-3">
          <ChevronLeft className="w-4 h-4" />Back to My Programs
        </Link>
      </div>
    );
  }

  const statusCls = STATUS_CLASS[program.status || ''] || STATUS_CLASS.draft;

  return (
    <div className="space-y-6">
      <Link href="/mentor/programs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="w-4 h-4" />Back to My Programs
      </Link>

      {/* Hero */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center shrink-0"><BookOpen className="w-6 h-6 text-brand-600" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-slate-900">{program.name}</h1>
              {program.status && <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${statusCls}`}>{program.status}</span>}
              {program.visibility && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 text-xs">
                  {program.visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}{program.visibility}
                </span>
              )}
            </div>
            {program.description
              ? (/<[a-z][\s\S]*>/i.test(program.description)
                  ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300 mt-2" dangerouslySetInnerHTML={{ __html: program.description }} />
                  : <p className="text-slate-600 mt-2 text-sm whitespace-pre-wrap">{program.description}</p>)
              : <p className="text-slate-600 mt-2 text-sm">No description provided for this program.</p>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Users2} label="My clans" value={clans.length} />
        <StatCard icon={GraduationCap} label="Mentees" value={menteeCount} />
        <StatCard icon={Users} label="Co-mentors" value={coMentorCount} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.href} href={a.href}
            className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-3 hover:border-brand-300 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><a.icon className="w-5 h-5 text-brand-600" /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{a.label}</p>
              <p className="text-xs text-slate-500 truncate">{a.hint}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Clans + rosters */}
      <div>
        <h2 className="text-slate-900 mb-3">Your clans in this program</h2>
        {clans.length === 0 ? (
          <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
            <Users2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">You don&apos;t run any clans in this program yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {clans.map((c) => <ClanCard key={c.id} clan={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}
