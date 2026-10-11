import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';

type Props = {
  src?: string;
  alt?: string;
};

// Posters come through /api/items/image, so the browser never talks to Jellyfin directly.
export default function ImageWithSkeleton({ src, alt }: Readonly<Props>) {
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative w-[220px] h-[330px]">
      {isLoading && !failed && <Skeleton className="absolute inset-0 w-full h-full" />}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          No poster
        </div>
      )}

      {src && !failed && (
        <div className="relative w-full h-full overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt || 'Poster'}
            loading="lazy"
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 ease-in-out bg-black rounded-lg ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => setIsLoading(false)}
            onError={() => setFailed(true)}
          />
        </div>
      )}
    </div>
  );
}
