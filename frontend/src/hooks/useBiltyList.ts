import { useInfiniteQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { BiltyListItem } from '@ablog/shared';

const PAGE_SIZE = 20;

async function fetchBiltyPage({
  page,
  search,
}: {
  page: number;
  search?: string;
}): Promise<{ data: BiltyListItem[]; nextPage: number | null }> {
  const params: Record<string, string | number> = { page, limit: PAGE_SIZE };
  if (search) params.search = search;
  const res = await axios.get('/api/bilty', { params });
  const data: BiltyListItem[] = res.data;
  return { data, nextPage: data.length === PAGE_SIZE ? page + 1 : null };
}

export function useBiltyList(search?: string) {
  return useInfiniteQuery({
    queryKey: ['bilty', 'list', search ?? ''],
    queryFn: ({ pageParam }) => fetchBiltyPage({ page: pageParam as number, search }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 30_000,
  });
}
