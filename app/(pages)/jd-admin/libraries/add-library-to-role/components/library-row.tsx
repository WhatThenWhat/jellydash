'use client';

import type { LibraryWithGroups } from '@/lib/shared/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Props = {
  library: LibraryWithGroups;
  hasAccess: boolean;
  isPending: boolean;
  onToggle: () => void;
};

export default function LibraryRow({ library, hasAccess, isPending, onToggle }: Readonly<Props>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 bg-card transition-colors',
        isPending && 'opacity-60'
      )}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Checkbox
          id={`library-${library.id}`}
          checked={hasAccess}
          onCheckedChange={onToggle}
          disabled={isPending}
        />
      )}

      <Label
        htmlFor={`library-${library.id}`}
        className="flex-1 text-sm font-medium cursor-pointer truncate"
      >
        {library.name}
      </Label>

    </div>
  );
}
