import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateBiltyRequest } from '@ablog/shared';
import { biltyService } from '../services/biltyService';

export function useBiltyCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    // Route through the shared http client (auth bearer + baseURL + refresh
    // interceptor are all wired there). The previous raw axios call was hitting
    // the dev origin instead of API_URL and skipping auth.
    mutationFn: (payload: CreateBiltyRequest) => biltyService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bilty', 'list'] });
    },
  });
}

export function useBiltyUpdate(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBiltyRequest) => biltyService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bilty', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['bilty', 'detail', id] });
    },
  });
}
