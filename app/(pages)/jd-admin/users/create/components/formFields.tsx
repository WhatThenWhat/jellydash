import type { GroupDto } from '@/lib/shared/types';
import { Badge } from '@/components/ui/badge';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type Props = {
  control: any;
  isPending: boolean;
};

export default function FormFields(props: Readonly<Props>) {
  const { control, isPending } = props;

  const { data: groups } = useQueryHandler<GroupDto[]>({
    queryKey: 'groups',
    endpoint: 'groups'
  });

  return (
    <>
      <FormField
        control={control}
        name="Username"
        disabled={isPending}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormControl>
              <Label htmlFor="Username">
                Username <span className="text-red-500">*</span>
                <Input {...field} placeholder="Username" className="py-5" id="Username" />
              </Label>
            </FormControl>
            {fieldState.error && (
              <Badge variant="destructive">
                <FormMessage className="text-white text-xs">{fieldState.error.message}</FormMessage>
              </Badge>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="Pw"
        disabled={isPending}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormControl>
              <Label htmlFor="Pw">
                Password
                <Input {...field} type="password" id="Pw" placeholder="********" className="py-5" />
              </Label>
            </FormControl>
            {fieldState.error && (
              <Badge variant="destructive">
                <FormMessage className="text-white text-xs">{fieldState.error.message}</FormMessage>
              </Badge>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="Package"
        disabled={isPending}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormControl>
              <div>
                Access Group <span className="text-red-500">*</span>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ''}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an access group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Access Groups</SelectLabel>
                      {(groups ?? []).map((group) => (
                        <SelectItem key={group.id} value={group.id} className="cursor-pointer">
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </FormControl>
            {fieldState.error && (
              <Badge variant="destructive">
                <FormMessage className="text-white text-xs">{fieldState.error.message}</FormMessage>
              </Badge>
            )}
          </FormItem>
        )}
      />
    </>
  );
}
