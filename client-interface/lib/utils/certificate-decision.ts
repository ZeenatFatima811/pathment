export type CertificateDecision = 'award' | 'no_certificate' | 'inactive' | 'undecided';

// Select-control values only. Never store these strings as certificate tiers.
export const NO_CERTIFICATE = '__no_certificate__';
export const INACTIVE = '__inactive__';
export const AWARDED_CERTIFICATES = '__awarded__';

export function reviewSelection(review?: { decision?: CertificateDecision; finalTier?: string | null; aiTier?: string | null } | null) {
  if (review?.decision === 'no_certificate') return NO_CERTIFICATE;
  if (review?.decision === 'inactive') return INACTIVE;
  return review?.finalTier ?? review?.aiTier ?? '';
}
export function aiSelection(result?: { decision?: CertificateDecision; certificate_tier?: string | null } | null) {
  return result?.decision === 'no_certificate' ? NO_CERTIFICATE : result?.certificate_tier ?? '';
}
export function decisionPayload(selection: string) {
  if (selection === NO_CERTIFICATE) return { decision: 'no_certificate' as const, finalTier: null };
  if (selection === INACTIVE) return { decision: 'inactive' as const, finalTier: null };
  return { decision: 'award' as const, finalTier: selection };
}
export function decisionLabel(selection: string, getTierName: (id: string) => string) {
  if (selection === NO_CERTIFICATE) return 'No certificate';
  if (selection === INACTIVE) return 'Inactive (drop)';
  return getTierName(selection);
}
