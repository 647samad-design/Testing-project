import { Globe } from 'lucide-react';
import { t, useLanguage } from '@/i18n';

/**
 * Legal pages are kept in English on purpose: a machine or informal translation
 * of a legal text could say something different from the binding version.
 * Readers who chose another language get this notice in their language.
 */
export function LegalLanguageNotice() {
  const lang = useLanguage();
  if (lang === 'en') return null;
  return (
    <div role="note" className="mb-6 flex items-start gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
      <Globe className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{t('This page is available in English only. The English version is the binding version.')}</p>
    </div>
  );
}
