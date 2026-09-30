'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Loader2, Award, RefreshCw, RotateCw, Trash2, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { ConfirmModal } from '@/components/shared';

type HistoryItem = {
  id:        string;
  tier:      string;
  createdAt: string;
  status:    'issued';
  recipient: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
  issuedBy:  { id: string; firstName: string; lastName: string; email: string; role: string } | null;
};

/**
 * How a person's role reads in this list.
 *
 * The server sends the role held IN THIS PROGRAMME — lead_mentor, co_mentor,
 * core_team, mentee or admin — rather than the account's signup role, so a
 * co-mentor promoted from a mentee account is no longer labelled MENTEE beside
 * certificates they issued. These labels have to cover all five: the old code
 * tested only for 'mentor' / 'admin', so anything else fell through to the
 * mentee styling with its raw key showing.
 */
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  lead_mentor: 'Lead mentor',
  co_mentor: 'Co-mentor',
  core_team: 'Core team',
  mentor: 'Mentor',
  mentee: 'Mentee',
};

// brand-* for anyone who mentors, amber for the org, slate for a learner.
// Hardcoded indigo-* is against the theming convention (all accent colour comes
// from the brand token scale so the app re-skins by swapping CSS vars) and the
// three that were here are gone with it.
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  lead_mentor: 'bg-brand-500/15 text-brand-700 border border-brand-500/30',
  co_mentor: 'bg-brand-500/10 text-brand-600 border border-brand-500/20',
  mentor: 'bg-brand-500/10 text-brand-600 border border-brand-500/20',
  core_team: 'bg-brand-500/5 text-brand-600 border border-brand-500/15',
  mentee: 'bg-slate-500/10 text-slate-600 border border-slate-500/20',
};

const roleLabel = (role?: string | null) => ROLE_LABEL[role || ''] || role || 'Admin';
const roleBadge = (role?: string | null) => ROLE_BADGE[role || ''] || ROLE_BADGE.mentee;

interface CertificateHistoryLogProps {
  templateId: string;
  userRole:   'admin' | 'mentor';
}

export default function CertificateHistoryLog({ templateId, userRole }: CertificateHistoryLogProps) {
  const [history,    setHistory]    = useState<HistoryItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [criteria,   setCriteria]   = useState<Array<{ id: string; name: string }>>([]);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen:        boolean;
    title:         string;
    message:       string;
    confirmLabel?: string;
    cancelLabel?:  string;
    type?:         'warning' | 'danger' | 'info';
    onConfirm:     () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchHistory = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await certificatesApi.getTemplateHistory(templateId);
      if (res.success && res.data) setHistory(res.data as unknown as HistoryItem[]);
    } catch (err) {
      console.error('Failed to load certificate history:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchTemplateCriteria = async () => {
    try {
      const res = await certificatesApi.getTemplate(templateId);
      if (res.success && res.data?.criteria) setCriteria(res.data.criteria);
    } catch (err) {
      console.error('Failed to load criteria:', err);
    }
  };

  useEffect(() => {
    fetchHistory(true);
    fetchTemplateCriteria();
  }, [templateId]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return history;
    return history.filter(item => {
      const recipientName  = item.recipient ? `${item.recipient.firstName} ${item.recipient.lastName}`.toLowerCase() : '';
      const recipientEmail = item.recipient?.email?.toLowerCase() ?? '';
      const issuerName     = item.issuedBy ? `${item.issuedBy.firstName} ${item.issuedBy.lastName}`.toLowerCase() : '';
      const issuerEmail    = item.issuedBy?.email?.toLowerCase() ?? '';
      return recipientName.includes(q) || recipientEmail.includes(q) || issuerName.includes(q) || issuerEmail.includes(q);
    });
  }, [history, search]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleResend = (id: string) => {
    setConfirmConfig({
      isOpen:       true,
      title:        'Resend Certificate Notification?',
      message:      'This will resend the certificate email and in-app notification to the recipient. Their certificate is already available in their dashboard.',
      confirmLabel: 'Resend Notification',
      cancelLabel:  'Cancel',
      type:         'info',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setActioningId(id);
          await certificatesApi.resendCertificateInstance(id);
          toast.success('Notification resent successfully!');
        } catch (err: any) {
          toast.error(err.message || 'Failed to resend notification');
        } finally {
          setActioningId(null);
        }
      }
    });
  };

  const handleRevoke = (id: string) => {
    setConfirmConfig({
      isOpen:       true,
      title:        'Revoke Certificate?',
      message:      'Are you sure you want to revoke and delete this certificate? This action is permanent and cannot be undone.',
      confirmLabel: 'Revoke',
      cancelLabel:  'Keep Certificate',
      type:         'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setActioningId(id);
          const res = await certificatesApi.deleteCertificateInstance(id);
          if (res.success) {
            toast.success('Certificate revoked successfully!');
            setHistory(prev => prev.filter(item => item.id !== id));
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke certificate');
        } finally {
          setActioningId(null);
        }
      }
    });
  };

  const handleRevokeAll = () => {
    setConfirmConfig({
      isOpen:       true,
      title:        'REVOKE ALL CERTIFICATES?',
      message:      'This will permanently delete ALL certificates issued under this template. This cannot be undone.',
      confirmLabel: 'Revoke All',
      cancelLabel:  'Cancel',
      type:         'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          const res = await certificatesApi.revokeAllTemplateCertificates(templateId);
          if (res.success) {
            toast.success('All certificates revoked successfully!');
            setHistory([]);
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke certificates');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  /**
   * Revoke only the certificates nobody signed off.
   *
   * Deliberately previews first. "Revoke All" can be confirmed blind because its
   * scope is obvious; this one's scope is a query result, and an admin should
   * see how many people and which clans before destroying anything. The count
   * comes from the same predicate the send gate uses, so what is listed is
   * exactly what will go.
   */
  const handleRevokeUnreviewed = async () => {
    let preview;
    try {
      setLoading(true);
      preview = (await certificatesApi.unreviewedIssued(templateId)).data;
    } catch (err: any) {
      toast.error(err.message || 'Could not check which certificates were unreviewed');
      return;
    } finally {
      setLoading(false);
    }

    if (!preview.count) {
      toast.success('Nothing to revoke — every issued certificate has a signed-off grade.');
      return;
    }

    const clans = [...new Set(preview.certificates.map(c => c.clanName || 'No clan'))].sort();
    const noRow = preview.certificates.filter(c => c.reviewStatus === null).length;

    setConfirmConfig({
      isOpen:       true,
      title:        `Revoke ${preview.count} unreviewed certificate${preview.count === 1 ? '' : 's'}?`,
      message:
        `${preview.count} certificate(s) went out without a mentor or admin signing off the grade`
        + `${noRow ? `, ${noRow} of them for someone with no review record at all` : ''}.`
        + `\n\nAffected clans: ${clans.join(', ')}.`
        + '\n\nThis permanently deletes those certificates. A re-issued certificate gets a NEW'
        + ' number, so the old links stop working, and the recipients are NOT told. Everything'
        + ' removed is written to the audit log first.'
        + '\n\nCertificates that WERE signed off are left untouched.',
      confirmLabel: `Revoke ${preview.count}`,
      cancelLabel:  'Cancel',
      type:         'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          const res = await certificatesApi.revokeUnreviewed(templateId);
          toast.success(res.message || `Revoked ${res.data?.revoked ?? preview.count} certificate(s)`);
          await fetchHistory(false);
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke the unreviewed certificates');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleResendAll = () => {
    setConfirmConfig({
      isOpen:       true,
      title:        'Resend Notifications to All Recipients?',
      message:      'This will resend the certificate email and in-app notification to every recipient under this template.',
      confirmLabel: 'Resend All Notifications',
      cancelLabel:  'Cancel',
      type:         'info',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          await certificatesApi.resendAllTemplateCertificates(templateId, false);
          toast.success('Notifications queued for all recipients!');
        } catch (err: any) {
          toast.error(err.message || 'Failed to resend notifications');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold':   return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'silver': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
      case 'bronze': return 'text-amber-700 bg-amber-700/10 border-amber-700/20';
      default:       return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getTierName = (tierId: string) => {
    const match = criteria.find(c => c.id === tierId);
    return match ? match.name : tierId.charAt(0).toUpperCase() + tierId.slice(1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipients or issuers by name or email..."
            className="w-full pl-8 pr-3.5 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchHistory(false)}
            className="p-2.5 bg-background border border-border hover:bg-muted text-foreground rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleResendAll}
              className="px-3.5 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 border border-indigo-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Resend notification to all recipients"
            >
              <RotateCw className="w-4 h-4" />
              Resend All
            </button>
          )}

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeUnreviewed}
              className="px-3.5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Revoke only the certificates that no mentor or admin signed off"
            >
              <ShieldAlert className="w-4 h-4" />
              Revoke Unreviewed
            </button>
          )}

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              className="px-3.5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Revoke all certificates"
            >
              <Trash2 className="w-4 h-4" />
              Revoke All
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-xs text-muted-foreground font-semibold">
          {search ? 'No recipients match your search.' : 'No certificates issued under this template yet.'}
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider items-center">
            <div className="col-span-3">Recipient</div>
            <div className="col-span-2 text-center">Badge Tier</div>
            <div className="col-span-3">Issued By</div>
            <div className="col-span-2 text-center">Issued Date</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
            {filtered.map(item => {
              const dateStr = new Date(item.createdAt).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              });

              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center text-xs hover:bg-muted/10 transition-colors">
                  {/* Recipient */}
                  <div className="col-span-3 min-w-0">
                    <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">
                        {item.recipient
                          ? `${item.recipient.firstName} ${item.recipient.lastName}`
                          : 'Deleted User'}
                      </span>
                      {userRole === 'admin' && item.recipient && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleBadge(item.recipient.role)}`}>
                          {roleLabel(item.recipient.role)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {item.recipient?.email || 'N/A'}
                    </div>
                  </div>

                  {/* Tier */}
                  <div className="col-span-2 flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-[10px] font-semibold uppercase tracking-wider ${getTierColor(item.tier)}`}>
                      <Award className="w-3.5 h-3.5" /> {getTierName(item.tier)}
                    </span>
                  </div>

                  {/* Issued By */}
                  <div className="col-span-3 min-w-0">
                    {item.issuedBy ? (
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">
                            {item.issuedBy.firstName} {item.issuedBy.lastName}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleBadge(item.issuedBy.role)}`}>
                            {roleLabel(item.issuedBy.role)}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {item.issuedBy.email}
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground font-semibold text-[11px]">
                        System Admin
                      </div>
                    )}
                  </div>

                  {/* Date */}
                  <div className="col-span-2 text-center text-muted-foreground font-semibold text-[11px]">
                    {dateStr}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleResend(item.id)}
                      disabled={actioningId !== null}
                      className="p-1.5 bg-background border border-border hover:border-brand-500/30 hover:bg-brand-500/5 text-muted-foreground hover:text-brand-600 rounded-xl transition-all disabled:opacity-50"
                      title="Resend Notification"
                    >
                      {actioningId === item.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCw className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRevoke(item.id)}
                      disabled={actioningId !== null}
                      className="p-1.5 bg-background border border-border hover:border-red-500/30 hover:bg-red-500/5 text-muted-foreground hover:text-red-500 rounded-xl transition-all disabled:opacity-50"
                      title="Revoke Certificate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmConfig}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
