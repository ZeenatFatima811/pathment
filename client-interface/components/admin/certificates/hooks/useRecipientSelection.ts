'use client';

import { reviewStage } from '@/lib/utils/certificate-review-stage';
import { AWARDED_CERTIFICATES, NO_CERTIFICATE, aiSelection } from '@/lib/utils/certificate-decision';
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { TierCriteria } from '../certificate-constants';
import type { CertificateVerification, ReviewerClanState } from '@/lib/services/certificates-api';
import type { ReviewFilter } from '@/components/certificates/shared';

export interface UseRecipientSelectionOptions {
  criteria: TierCriteria[];
  qualifiedData: Record<string, any[]>;
  aiResults?: Record<string, any>;
  /** The open review round, keyed by recipient, when there is one. */
  reviewRows?: Record<string, CertificateVerification>;
  /** Per-clan release state, so "approved to send" can be filtered on. */
  clanStates?: ReviewerClanState[];
}

export function useRecipientSelection({
  criteria, qualifiedData, aiResults, reviewRows, clanStates,
}: UseRecipientSelectionOptions) {
  const [recipientSearch, setRecipientSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState('all');
  const [clanFilter, setClanFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [sortBy, setSortBy] = useState<'none' | 'score_desc' | 'score_asc'>('none');
  const [recipientType, setRecipientType] = useState<'all' | 'mentees' | 'mentors' | 'paused'>('mentees');
  const [selectedMenteeIds, setSelectedMenteeIds] = useState<Set<string>>(new Set());
  const [assignedTiers, setAssignedTiers] = useState<Record<string, string>>({});

  const recipientMenteesList = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    criteria.forEach(c => {
      (qualifiedData[c.id] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee', isPaused: false }); }
      });
    });
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seen.has(m.id)) { seen.add(m.id); list.push({ ...m, role: 'mentee', isPaused: false }); }
      });
    });
    return list;
  }, [criteria, qualifiedData]);

  const recipientPausedList = useMemo(() => {
    return (qualifiedData.paused ?? []).map((m: any) => ({ ...m, role: 'mentee', isPaused: true }));
  }, [qualifiedData]);

  const recipientMentorsList = useMemo(
    () => (qualifiedData.mentors ?? []).map((m: any) => ({ ...m, role: 'mentor', isPaused: false })),
    [qualifiedData]
  );

  const activeList = useMemo(() => {
    if (recipientType === 'all') return [...recipientMenteesList, ...recipientMentorsList];
    if (recipientType === 'mentees') return recipientMenteesList;
    if (recipientType === 'mentors') return recipientMentorsList;
    return recipientPausedList;
  }, [recipientType, recipientMenteesList, recipientMentorsList, recipientPausedList]);

  const getEffectiveTier = useCallback((mOrId: any): string => {
    const defaultTier = '';
    const id = typeof mOrId === 'string' ? mOrId : mOrId?.id;
    if (!id) return defaultTier;

    if (assignedTiers[id] !== undefined) return assignedTiers[id];
    if (aiSelection(aiResults?.[id])) return aiSelection(aiResults?.[id]);

    const m = typeof mOrId === 'object' ? mOrId : activeList.find((x: any) => x.id === id);
    if (m?.assignedDecision === 'no_certificate') return NO_CERTIFICATE;
    if (m?.assignedTier) return m.assignedTier;

    return defaultTier;
  }, [assignedTiers, aiResults, activeList, criteria]);

  /** The clans actually represented in this roster, for the clan filter. */
  const rosterClans = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const m of activeList as any[]) {
      if (m.clanId && !byId.has(m.clanId)) {
        byId.set(m.clanId, { id: m.clanId, name: m.clanName || 'Unnamed clan' });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeList]);

  /**
   * A review is an audit record and must remain visible independently of the
   * current qualification calculation. Rebuilding changed/pending views from
   * the roster was the bug: valid overrides disappeared whenever that second
   * dataset omitted or reshaped the recipient.
   */
  const reviewBackedList = useMemo(() => Object.values(reviewRows ?? {}).map((row) => {
    const rosterRecipient = activeList.find((recipient: any) => recipient.id === row.menteeId);
    if (rosterRecipient) return rosterRecipient;
    return {
      id: row.menteeId,
      firstName: row.mentee?.firstName ?? '',
      lastName: row.mentee?.lastName ?? '',
      email: row.mentee?.email ?? '',
      clanId: row.clanId,
      clanName: row.clanName,
      role: 'mentee',
      isPaused: false,
      assignedDecision: row.decision,
      assignedTier: row.finalTier,
      issuedTiers: [],
    };
  }), [activeList, reviewRows]);

  const filtered = useMemo(() => {
    const usesReviewRecords = reviewFilter === 'pending' || reviewFilter === 'verified' || reviewFilter === 'changed';
    let result = [...(usesReviewRecords ? reviewBackedList : activeList)];

    const q = recipientSearch.toLowerCase().trim();
    if (q) {
      result = result.filter((m: any) =>
        `${m.firstName || ''} ${m.lastName || ''} ${m.email || ''}`.toLowerCase().includes(q)
      );
    }

    // Certificates go out a clan at a time, so this is the primary narrowing:
    // with a clan selected, the table's select-all becomes "select this clan".
    if (clanFilter !== 'all') {
      result = result.filter((m: any) => m.clanId === clanFilter);
    }

    if (reviewFilter !== 'all') {
      result = result.filter((m: any) => {
        const row = reviewRows?.[m.id];
        switch (reviewFilter) {
          case 'pending':  return row?.status === 'pending';
          case 'verified': return row?.status === 'verified';
          // Stage, not status: 'verified' cannot tell these two apart.
          case 'mentor_verified': return reviewStage(row ?? {}).stage === 'mentor_verified';
          case 'admin_approved':  return reviewStage(row ?? {}).stage === 'admin_approved';
          case 'questioned':      return Boolean(row?.hasOpenQuestion);
          case 'change_requested': return Boolean(row?.hasChangeRequest);
          case 'changed':  return Boolean(row?.overridden);
          // Sendable needs BOTH: the admin has released the clan, and this
          // person's own grade is signed off. It used to check only the clan,
          // which read as "cleared to send" for people nobody had reviewed —
          // and the server now refuses exactly those.
          case 'sendable': return row?.status === 'verified'
            && (clanStates ?? []).some(c => c.clanId === m.clanId && c.canSend);
          default: return true;
        }
      });
    }

    if (badgeFilter !== 'all') {
      result = result.filter((m: any) => {
        const tier = getEffectiveTier(m);
        return badgeFilter === AWARDED_CERTIFICATES ? Boolean(tier && tier !== NO_CERTIFICATE) : tier === badgeFilter;
      });
    }

    const getScore = (m: any): number => {
      const aiRes = aiResults?.[m.id];
      if (aiRes) {
        if (aiRes.overall_percentage != null) return Number(aiRes.overall_percentage);
        if (aiRes.match_score != null) return Number(aiRes.match_score);
      }
      if (m.overall_percentage != null) return Number(m.overall_percentage);
      if (m.normalized_score != null) return Number(m.normalized_score);
      if (m.normalizedScore != null) return Number(m.normalizedScore);
      if (m.match_score != null) return Number(m.match_score);
      if (m.score != null) return Number(m.score);
      return 0;
    };

    if (sortBy === 'score_desc') {
      result.sort((a: any, b: any) => getScore(b) - getScore(a));
    } else if (sortBy === 'score_asc') {
      result.sort((a: any, b: any) => getScore(a) - getScore(b));
    }

    return result;
  }, [activeList, reviewBackedList, recipientSearch, badgeFilter, clanFilter, reviewFilter, sortBy,
      getEffectiveTier, aiResults, reviewRows, clanStates]);

  const allFilteredIds = useMemo(() => filtered.map((m: any) => m.id), [filtered]);

  const allSelected = useMemo(
    () => allFilteredIds.length > 0 && allFilteredIds.every(id => selectedMenteeIds.has(id)),
    [allFilteredIds, selectedMenteeIds]
  );

  /**
   * WHO WOULD ACTUALLY RECEIVE A CERTIFICATE: the selection intersected with what
   * the filters are currently showing.
   *
   * `selectedMenteeIds` survives a filter change, which is what you want for the
   * checkboxes — narrow to a clan, tick some people, widen again, they are still
   * ticked. It is NOT what you want for issuing. Select-all with no filter put
   * 621 people in the set; applying "Approved by an admin" then showed ~70 rows
   * while the footer still read "621 mentees selected", and Issue sent
   * `Array.from(selectedMenteeIds)` — all 621, including everyone the filter was
   * deliberately hiding.
   *
   * Everything a person can act on is derived from this instead, so the count
   * they read is the count that goes out.
   */
  const issuableMenteeIds = useMemo(() => {
    const visible = new Set(allFilteredIds);
    return new Set([...selectedMenteeIds].filter(id => visible.has(id)));
  }, [selectedMenteeIds, allFilteredIds]);

  /** Selected, but hidden by the current filters — surfaced so it is never silent. */
  const hiddenSelectedCount = selectedMenteeIds.size - issuableMenteeIds.size;

  const selectedSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    criteria.forEach(c => { summary[c.id] = 0; });
    issuableMenteeIds.forEach(id => {
      const tier = getEffectiveTier(id);
      if (summary[tier] !== undefined) {
        summary[tier] = (summary[tier] ?? 0) + 1;
      } else {
        summary[tier] = 1;
      }
    });
    return summary;
  }, [criteria, issuableMenteeIds, getEffectiveTier]);

  const toggleAll = useCallback(() => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      const selectableIds = filtered.filter((m: any) => !m.isPaused).map((m: any) => m.id);
      const allSelectableSelected = selectableIds.length > 0 && selectableIds.every(id => next.has(id));
      if (allSelectableSelected) {
        selectableIds.forEach(id => next.delete(id));
      } else {
        selectableIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [filtered]);

  const toggleOne = useCallback((id: string) => {
    setSelectedMenteeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTierChange = useCallback((menteeId: string, value: string) => {
    setAssignedTiers(prev => ({ ...prev, [menteeId]: value }));
  }, []);

  const bulkSetBadge = useCallback((badge: string, getTierNameFn?: (b: string) => string) => {
    const updatedTiers = { ...assignedTiers };
    const nextSelected = new Set(selectedMenteeIds);
    filtered.forEach((m: any) => {
      updatedTiers[m.id] = badge;
      if (m.isPaused) {
        nextSelected.delete(m.id);
        return;
      }
      const match = m.tierMatches?.[badge] ?? 0;
      if (match >= 90) nextSelected.add(m.id);
      else nextSelected.delete(m.id);
    });
    setAssignedTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    const tierName = getTierNameFn ? getTierNameFn(badge) : badge;
    toast.info(`Set all filtered recipients to ${tierName}`);
  }, [assignedTiers, selectedMenteeIds, filtered]);

  const resetToAIRecommendations = useCallback((aiResults: any[]) => {
    if (!aiResults || aiResults.length === 0) return;
    const updatedTiers = { ...assignedTiers };
    const nextSelected = new Set(selectedMenteeIds);
    const aiMap: Record<string, string> = {};

    aiResults.forEach(r => {
      if (r.mentee_id && aiSelection(r)) {
        aiMap[r.mentee_id] = aiSelection(r);
      }
    });

    filtered.forEach((m: any) => {
      if (m.isPaused) {
        nextSelected.delete(m.id);
        return;
      }
      const aiTier = aiMap[m.id];
      if (aiTier) {
        updatedTiers[m.id] = aiTier;
        const match = m.tierMatches?.[aiTier] ?? 0;
        if (match >= 90) nextSelected.add(m.id);
        else nextSelected.delete(m.id);
      }
    });

    setAssignedTiers(updatedTiers);
    setSelectedMenteeIds(nextSelected);
    toast.success('Reset all filtered recipients to AI recommendations.');
  }, [assignedTiers, selectedMenteeIds, filtered]);

  return {
    recipientSearch,
    setRecipientSearch,
    badgeFilter,
    setBadgeFilter,
    clanFilter,
    setClanFilter,
    reviewFilter,
    setReviewFilter,
    rosterClans,
    sortBy,
    setSortBy,
    recipientType,
    setRecipientType,
    selectedMenteeIds,
    setSelectedMenteeIds,
    issuableMenteeIds,
    hiddenSelectedCount,
    assignedTiers,
    setAssignedTiers,
    recipientMenteesList,
    recipientMentorsList,
    recipientPausedList,
    filtered,
    filteredRecipients: filtered,
    allSelected,
    selectedSummary,
    getEffectiveTier,
    toggleAll,
    toggleOne,
    handleTierChange,
    bulkSetBadge,
    resetToAIRecommendations,
  };
}
