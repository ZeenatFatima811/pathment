'use client';

import { Award, Layers3 } from 'lucide-react';
import type { CertificateTemplate } from '@/lib/services/certificates-api';

/**
 * A card-sized representation of a certificate cycle.
 *
 * A template can contain several complete certificate designs. Shrinking every
 * design into columns made each one unreadable, so the cover uses one artwork
 * as the hero and describes the rest as a collection.
 */
export function CertificateTemplateCover({ template }: { template: CertificateTemplate }) {
  const tiers = template.criteria ?? [];
  const illustratedTiers = tiers.filter(tier => Boolean(tier.artworkUrl));
  const featuredTier = illustratedTiers[0] ?? tiers[0];
  const featuredArtwork = featuredTier?.artworkUrl ?? template.bgImageUrl;
  const visibleNames = tiers.slice(0, 3).map(tier => tier.name);
  const remaining = Math.max(0, tiers.length - visibleNames.length);

  return (
    <div className="relative isolate aspect-[1.414] overflow-hidden border-b border-border bg-gradient-to-br from-slate-100 via-white to-brand-50 dark:from-slate-900 dark:via-slate-950 dark:to-brand-950/40">
      <div className="absolute -left-10 -top-14 h-36 w-36 rounded-full bg-brand-500/10 blur-2xl" />
      <div className="absolute -bottom-14 -right-8 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl" />

      {/* Offset sheets make it read as a collection without crushing several
          full certificates into unreadable slivers. */}
      {tiers.length > 1 ? <div aria-hidden="true" className="absolute inset-[13%_7%_8%_16%] rotate-[3deg] rounded-lg border border-white/80 bg-white/75 shadow-sm dark:border-white/10 dark:bg-slate-800/80" /> : null}
      {tiers.length > 2 ? <div aria-hidden="true" className="absolute inset-[10%_10%_11%_12%] -rotate-[2deg] rounded-lg border border-white/80 bg-white/85 shadow-sm dark:border-white/10 dark:bg-slate-800/90" /> : null}

      <div className="absolute inset-[8%_13%_12%_8%] overflow-hidden rounded-lg border border-white/90 bg-white shadow-[0_14px_35px_-16px_rgba(15,23,42,0.55)] dark:border-white/15 dark:bg-slate-900">
        {featuredArtwork ? (
          // Artwork is user-configured (often Cloudinary or an uploaded URL),
          // so it cannot use a fixed Next Image host allow-list.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featuredArtwork} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" alt={`${template.name}${featuredTier?.name ? ` — ${featuredTier.name}` : ''} preview`} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand-500/10 to-violet-500/10 text-brand-600">
            <Award className="h-9 w-9" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Certificate</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
      </div>

      <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-white/50 bg-white/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-200">
        <Layers3 className="h-3 w-3 text-brand-600" />
        {tiers.length > 1 ? `${tiers.length} certificate designs` : 'Certificate design'}
      </div>

      <div className="absolute inset-x-[11%] bottom-[15%] flex items-end justify-between gap-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-white/70">Featured preview</p>
          <p className="truncate text-xs font-bold drop-shadow-sm">{featuredTier?.name ?? template.name}</p>
        </div>
        {template.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={template.logoUrl} className="h-8 w-8 shrink-0 rounded-lg border border-white/50 bg-white object-contain p-0.5 shadow-md" alt="" />
        ) : null}
      </div>

      {visibleNames.length > 1 ? (
        <div className="absolute bottom-2.5 left-1/2 flex max-w-[88%] -translate-x-1/2 items-center gap-1 rounded-full border border-white/60 bg-white/90 px-2 py-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/85">
          {visibleNames.map((name, index) => (
            <span key={`${name}-${index}`} className="flex min-w-0 items-center gap-1 text-[8px] font-semibold text-slate-600 dark:text-slate-300">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${index === 0 ? 'bg-brand-500' : index === 1 ? 'bg-amber-500' : 'bg-violet-500'}`} />
              <span className="max-w-20 truncate">{name}</span>
            </span>
          ))}
          {remaining > 0 ? <span className="shrink-0 text-[8px] font-bold text-slate-500">+{remaining}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
