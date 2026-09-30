'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Loader2, Award, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';
import { certificatesApi, CertificateTemplate } from '@/lib/services/certificates-api';
import { ConfirmModal } from '@/components/shared';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { programsApi } from '@/lib/services/program-api';
import { CertificateTemplateCover } from '@/components/certificates/shared/CertificateTemplateCover';

export default function AdminCertificatesPage() {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProgramFilter, setSelectedProgramFilter] = useState<string>('all');
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const fetchTemplates = async (progId?: string) => {
    try {
      setLoading(true);
      const filterId = progId !== undefined ? progId : selectedProgramFilter;
      const res = await certificatesApi.listTemplates(filterId !== 'all' ? filterId : undefined);
      if (res.success && res.data) {
        setTemplates(res.data);
      }
    } catch (err: any) {
      toast.error('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoadingPrograms(true);
        const res = await programsApi.getAll({ limit: 100 });
        if (res.success && res.data) {
          setPrograms(res.data);
        }
      } catch (err) {
        console.error('Failed to load programs:', err);
      } finally {
        setLoadingPrograms(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [selectedProgramFilter]);

  const requestDelete = (id: string) => {
    setTemplateToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      const res = await certificatesApi.deleteTemplate(templateToDelete);
      if (res.success) {
        toast.success('Template deleted successfully');
        fetchTemplates();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    } finally {
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="admin-page-heading flex flex-col md:flex-row md:items-center justify-between border-b border-border/60 pb-5 gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Certificates</h1>
          <p className="text-slate-600">Design templates, grade a cohort, and issue credentials clan by clan.</p>
        </div>

        <div className="flex items-center gap-3.5 flex-wrap">
          {/* The shared menu, like every other in-page filter in the app. */}
          <SelectMenu
            value={selectedProgramFilter}
            onChange={setSelectedProgramFilter}
            options={[
              { value: 'all', label: 'All programs' },
              ...programs.map(p => ({ value: p.id, label: p.name })),
            ]}
            ariaLabel="Filter by program"
            className="min-w-[200px]"
          />

          <Link
            href="/admin/certificates/new"
            className="flex items-center gap-1.5 px-4.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium text-sm transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </Link>
        </div>
      </div>

      {/* Templates Grid / Empty State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
          <span className="text-sm text-muted-foreground font-medium">Loading templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-8 bg-card text-center">
          <Award className="w-12 h-12 text-brand-500 mb-3 opacity-80" />
          <h3 className="text-sm font-bold text-foreground mb-1">No Templates Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            Create certificate templates using background images, logos, and dynamic placeholders to issue to mentees.
          </p>
          <Link
            href="/admin/certificates/new"
            className="px-4 py-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
          >
            Create Your First Template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => {
            const dateStr = new Date(template.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            return (
              <div 
                key={template.id} 
                className="group bg-card border border-border hover:border-brand-500/20 hover:shadow-md rounded-2xl overflow-hidden shadow-3xs transition-all duration-300 flex flex-col hover:-translate-y-0.5"
              >
                {/* Card Image Preview */}
                <CertificateTemplateCover template={template} />

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <span className="inline-block text-[10px] bg-brand-500/10 text-brand-600 dark:text-brand-400 px-2.5 py-0.5 rounded-md font-semibold uppercase tracking-wider">
                      {template.program?.name || 'No Program'}
                    </span>
                    
                    <h3 className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                      {template.name}
                    </h3>
                    
                    <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground/80 font-semibold border-t border-border/40 pt-2.5 mt-1">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-brand-500/80" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-brand-500/80" />
                        {template.creator ? `${template.creator.firstName} ${template.creator.lastName.slice(0, 1)}.` : 'Admin'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <Link
                      href={`/admin/certificates/${template.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
                    >
                      <Award className="w-4 h-4" />
                      Issue & Manage
                    </Link>
                    <button
                      type="button"
                      onClick={() => requestDelete(template.id)}
                      className="p-2 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl transition-all border border-red-500/10 hover:border-red-500/20"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete Certificate Template"
        message="Are you sure you want to delete this template? Issued certificates using this template will not be affected."
        confirmLabel="Delete"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setTemplateToDelete(null);
        }}
      />
    </div>
  );
}
