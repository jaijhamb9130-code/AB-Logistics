import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { CreateBiltyRequest, CreateBiltyResponse } from '@ablog/shared';
import { biltyService } from '../services/biltyService';

async function createBilty(payload: CreateBiltyRequest): Promise<CreateBiltyResponse> {
  const res = await axios.post('/api/bilty', payload);
  return res.data;
}

export function useBiltyCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBilty,
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
