'use client';

import { Award, Layers3 } from 'lucide-react';
import type { CertificateTemplate } from '@/lib/services/certificates-api';

type Design = { id: string; name: string; artworkUrl?: string };

function templateDesigns(template: CertificateTemplate): Design[] {
  const tiers = template.criteria ?? [];
  if (tiers.length > 0) return tiers.map(tier => ({ id: tier.id, name: tier.name, artworkUrl: tier.artworkUrl ?? template.bgImageUrl }));
  return [{ id: 'default', name: 'Certificate', artworkUrl: template.bgImageUrl }];
}

/** A genuine overview of the set: separate documents, never artwork wallpaper. */
export function CertificateTemplateCover({ template }: { template: CertificateTemplate }) {
  const designs = templateDesigns(template);
  const visible = designs.slice(0, 3);
  const remaining = Math.max(0, designs.length - visible.length);
  const layout = visible.length === 1
    ? 'grid-cols-1'
    : visible.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-[1.35fr_1fr] grid-rows-2';

  return (
    <div className="relative aspect-[1.414] overflow-hidden border-b border-border bg-slate-100 p-3 dark:bg-slate-950">
      <div className="mb-2 flex h-5 items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          <Layers3 className="h-3 w-3 text-brand-600" /> Certificate collection
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold text-slate-600 shadow-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
          {designs.length} design{designs.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className={`grid h-[calc(100%-1.75rem)] gap-2 ${layout}`}>
        {visible.map((design, index) => <DesignThumbnail key={design.id} design={design} featured={visible.length === 3 && index === 0} />)}
      </div>
      {remaining > 0 ? <span className="absolute bottom-5 right-5 rounded-full bg-slate-950 px-2 py-1 text-[9px] font-bold text-white shadow-lg">+{remaining} more</span> : null}
    </div>
  );
}

/** Full set used after a mentor opens a template. */
export function CertificateTemplateGallery({ template }: { template: CertificateTemplate }) {
  const designs = templateDesigns(template);
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Certificate designs</p>
          <h3 className="mt-0.5 text-sm font-bold text-foreground">What your mentees can receive</h3>
        </div>
        <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold text-brand-600 dark:text-brand-400">{designs.length} active</span>
      </div>
      <div className={`grid gap-3 ${designs.length === 1 ? 'grid-cols-1' : designs.length === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
        {designs.map(design => (
          <figure key={design.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted/20 shadow-2xs">
            <div className="aspect-[1.414] bg-slate-100 p-1.5 dark:bg-slate-950">
              {design.artworkUrl ? (
                // Certificate art is user-configured and may use any uploaded host.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={design.artworkUrl} className="h-full w-full rounded-md bg-white object-contain" alt={`${design.name} certificate design`} />
              ) : <EmptyDesign />}
            </div>
            <figcaption className="truncate border-t border-border bg-card px-2.5 py-2 text-[10px] font-bold text-foreground">{design.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function DesignThumbnail({ design, featured }: { design: Design; featured: boolean }) {
  return (
    <figure className={`relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-300 group-hover:shadow-md dark:border-white/10 dark:bg-slate-900 ${featured ? 'row-span-2' : ''}`}>
      <div className="absolute inset-0 bottom-5 bg-slate-50 p-1 dark:bg-slate-950">
        {design.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={design.artworkUrl} className="h-full w-full rounded-sm bg-white object-contain transition-transform duration-300 group-hover:scale-[1.015]" alt={`${design.name} certificate design`} />
        ) : <EmptyDesign />}
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 h-5 truncate border-t border-slate-100 bg-white px-2 py-1 text-[8px] font-bold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">{design.name}</figcaption>
    </figure>
  );
}

function EmptyDesign() {
  return <div className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-brand-500/10 to-violet-500/10 text-brand-600"><Award className="h-6 w-6" /></div>;
}
