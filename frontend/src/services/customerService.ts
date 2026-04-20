import { http } from './httpClient';
import type {
  CreateCustomerRequest,
  CreateCustomerResponse,
  CustomerDetail,
  CustomerListItem,
  CustomerSearchResult,
} from '../../../shared/types/customer';

export const customerService = {
  async list(): Promise<CustomerListItem[]> {
    const { data } = await http.get<CustomerListItem[]>('/api/customers');
    return data;
  },

  async search(q: string): Promise<CustomerSearchResult[]> {
    const { data } = await http.get<CustomerSearchResult[]>('/api/customers/search', { params: { q } });
    return data;
  },

  async get(id: number): Promise<CustomerDetail> {
    const { data } = await http.get<CustomerDetail>(`/api/customers/${id}`);
    return data;
  },

  async create(body: CreateCustomerRequest): Promise<CreateCustomerResponse> {
    const { data } = await http.post<CreateCustomerResponse>('/api/customers', body);
    return data;
  },
};
