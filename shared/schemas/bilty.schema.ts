import { z } from 'zod';

export const BiltyItemSchema = z.object({
  id: z.number().int().positive().optional(),
  bilty_id: z.number().int().positive().optional(),
  challan_no: z.string().max(64).nullable().optional(),
  lr_no: z.string().max(64).nullable().optional(),
  from_loc: z.string().max(128).nullable().optional(),
  to_loc: z.string().max(128).nullable().optional(),
  consignee: z.string().max(255).nullable().optional(),
  // Qty/Rate are skippable — 0 is allowed (a row can carry zero freight).
  qty: z.coerce.number().min(0, { message: 'qty cannot be negative' }),
  rate: z.coerce.number().min(0, { message: 'rate cannot be negative' }),
  inc_rate: z.coerce.number().min(0).optional(),
  l_rate: z.coerce.number().min(0).optional(),
  e_rate: z.coerce.number().min(0).optional(),
  shipment_no: z.string().max(64).nullable().optional(),
});

export const BiltyHeaderSchema = z.object({
  // Numeric-digit-only bilty numbers — entered manually by the user.
  // Optional "<prefix>-" lead (from the Bilty voucher type) + numeric tail.
  // e.g. '8400153862' or 'BLT-001'. Must end in digits.
  bilty_no: z
    .string()
    .min(1, { message: 'bilty_no is required' })
    .max(32)
    .regex(/^([A-Za-z0-9._/]+-)?\d+$/, { message: 'bilty_no must end in a number' }),
  bilty_date: z.string().nullable().optional(),
  consignor: z.string().min(1, { message: 'consignor is required' }).max(255),
  bill_to: z.string().max(255).nullable().optional(),
  owner_name: z.string().max(255).nullable().optional(),
  agent_name: z.string().max(255).nullable().optional(),
  branch: z.string().max(128).nullable().optional(),
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
