import { z } from 'zod';

export const BiltyItemSchema = z.object({
  id: z.number().int().positive().optional(),
  bilty_id: z.number().int().positive().optional(),
  challan_no: z.string().max(64).nullable().optional(),
  lr_no: z.string().max(64).nullable().optional(),
  from_loc: z.string().max(128).nullable().optional(),
  to_loc: z.string().max(128).nullable().optional(),
  consignee: z.string().max(255).nullable().optional(),
  qty: z.coerce.number().positive({ message: 'qty must be > 0' }),
  rate: z.coerce.number().positive({ message: 'rate must be > 0' }),
  inc_rate: z.coerce.number().min(0).optional(),
  l_rate: z.coerce.number().min(0).optional(),
  e_rate: z.coerce.number().min(0).optional(),
  shipment_no: z.string().max(64).nullable().optional(),
});

export const BiltyHeaderSchema = z.object({
  // Numeric-digit-only bilty numbers — entered manually by the user.
  bilty_no: z
    .string()
    .min(1, { message: 'bilty_no is required' })
    .max(32)
    .regex(/^\d+$/, { message: 'bilty_no must be digits only' }),
  bilty_date: z.string().nullable().optional(),
  consignor: z.string().min(1, { message: 'consignor is required' }).max(255),
  bill_to: z.string().max(255).nullable().optional(),
  owner_name: z.string().max(255).nullable().optional(),
  agent_name: z.string().max(255).nullable().optional(),
  branch: z.string().max(128).nullable().optional(),
  zone: z.string().max(128).nullable().optional(),
  zone_name: z.string().max(128).nullable().optional(),
  truck_no: z.string().min(1, { message: 'truck_no is required' }).max(64),
  goods_type: z.string().max(128).nullable().optional(),
  truck_type: z.string().max(64).nullable().optional(),
  gst_mode: z.enum(['forward', 'reverse', 'exempt']).optional(),
  gst_rate: z.coerce.number().min(0).max(28).optional(),
});

export const CreateBiltySchema = z.object({
  header: BiltyHeaderSchema,
  items: z.array(BiltyItemSchema).min(1, { message: 'at least one item required' }),
});

export type CreateBiltyInput = z.infer<typeof CreateBiltySchema>;
