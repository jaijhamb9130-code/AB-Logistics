import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { CreateBiltyRequest, CreateBiltyResponse } from '@ablog/shared';

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
