import { useMutation, UseMutationResult, useQueryClient } from '@tanstack/react-query';

type UseMutationHandlerProps = {
  mutationKey: string;
  endpoint: string;
  invalidateQueryKeys?: string[];
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
};

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (body?.message) return new Error(body.message);
  } catch {}
  return new Error(fallback);
}

export function useMutationHandler<TPayload, TResponse>(
  props: UseMutationHandlerProps & { requiresAuth?: boolean }
): UseMutationResult<TResponse, Error, TPayload> {
  const { mutationKey, endpoint, invalidateQueryKeys = [], method = 'POST' } = props;
  const queryClient = useQueryClient();

  return useMutation<TResponse, Error, TPayload>({
    mutationKey: [mutationKey],
    mutationFn: async (payload: TPayload) => {
      const res = await fetch(`/api/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw await errorFrom(res, `Failed to ${method} ${endpoint}`);
      return res.json();
    },
    onSuccess: () => {
      invalidateQueryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    }
  });
}
