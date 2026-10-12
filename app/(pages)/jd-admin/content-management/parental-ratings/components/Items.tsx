'use client';

import type { Rating } from '@/lib/shared/ratings';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import useQueryHandler from '@/hooks/useQueryHandler';
import ImageWithSkeleton from './ImageWithSkeleton';

/** Select value meaning "remove the rating" (a Radix item cannot have an empty value). */
export const NO_RATING = '__none__';

export type RatingItem = {
  Id: string;
  Name: string;
  Type: string;
  OfficialRating: string;
};

type Props = {
  items: RatingItem[];
  ratings: Record<string, string>;
  onRatingChange: (itemId: string, value: string) => void;
};

export default function Items({ items, ratings, onRatingChange }: Readonly<Props>) {
  const { data: availableRatings } = useQueryHandler<Rating[]>({
    queryKey: 'ratings',
    endpoint: 'ratings',
    serverScoped: false
  });

  return (
    <div
      className="grid gap-4 w-full mt-5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
    >
      {items.map((item) => {
        const selectedRating =
          ratings[item.Id] ??
          (availableRatings ?? []).find(
            (r) => r.value.trim().toUpperCase() === item.OfficialRating?.trim().toUpperCase()
          )?.value;

        return (
          <div className="flex flex-col" key={item.Id}>
            <div className="flex justify-center p-2 rounded-lg">
              <ImageWithSkeleton
                src={`/api/items/image?id=${item.Id}&w=220&h=330`}
                alt={item.Name}
              />
            </div>

            <p className="text-center mt-2">{item.Name}</p>

            <Select value={selectedRating} onValueChange={(value) => onRatingChange(item.Id, value)}>
              <SelectTrigger className={selectedRating ? '' : 'bg-red-200 border border-red-500'}>
                <SelectValue placeholder="Choose a Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Official Rating</SelectLabel>
                  <SelectItem value={NO_RATING}>No rating</SelectItem>
                  {(availableRatings ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
