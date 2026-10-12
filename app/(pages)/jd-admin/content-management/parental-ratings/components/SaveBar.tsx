'use client';

import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

/** Warn before the tab is closed or the app navigates away while edits are unsaved. */
export function useUnsavedWarning(count: number) {
  useEffect(() => {
    if (count === 0) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.defaultPrevented) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm(`You have ${count} unsaved edit(s). Leave this page without saving?`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [count]);
}

type Props = {
  count: number;
  saving: boolean;
  progress?: string;
  onSave: () => void;
  onDiscard: () => void;
};

/** Sticky bar: one Save for every edit made on any page, with the number of unsaved edits. */
export function SaveBar({ count, saving, progress, onSave, onDiscard }: Readonly<Props>) {
  return (
    <div className="sticky bottom-0 z-10 -mx-10 -mb-10 flex items-center justify-end gap-3 border-t bg-background px-10 py-3">
      <span className={count > 0 ? 'text-sm font-medium text-amber-700' : 'text-sm text-muted-foreground'}>
        {saving && progress ? progress : count > 0 ? `${count} unsaved edit(s), across all pages` : 'No unsaved edits'}
      </span>
      <Button variant="ghost" onClick={onDiscard} disabled={saving || count === 0}>
        Discard all
      </Button>
      <Button className="px-10" onClick={onSave} disabled={saving || count === 0}>
        {saving ? 'Saving...' : count > 0 ? `Save (${count})` : 'Save'}
      </Button>
    </div>
  );
}
