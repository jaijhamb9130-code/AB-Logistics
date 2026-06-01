'use strict';

const { z } = require('zod');

const BiltyItemSchema = z.object({
  id: z.number().int().positive().optional(),
  challan_no: z.string().max(64).nullable().optional(),
  lr_no: z.string().max(64).nullable().optional(),
  // Per-line override of the header from/to/consignee. Optional — typical
  // bilty omits these and the line inherits the header values.
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

const BiltyHeaderSchema = z.object({
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
  // Accept either `zone` or legacy `zone_name` — model normalises.
  zone: z.string().max(128).nullable().optional(),
  zone_name: z.string().max(128).nullable().optional(),
  truck_no: z.string().min(1, { message: 'truck_no is required' }).max(64),
  goods_type: z.string().max(128).nullable().optional(),
  // GST snapshot — drives ledger posting & invoice math.
  //   forward: you collect tax (Cr CGST/SGST or IGST)
  //   reverse: recipient pays GST under RCM (no tax row written)
  //   exempt:  no GST applies (no tax row written)
  gst_mode: z.enum(['forward', 'reverse', 'exempt']).optional(),
  gst_rate: z.coerce.number().min(0).max(28).optional(),
});

const CreateBiltySchema = z.object({
  header: BiltyHeaderSchema,
  items: z.array(BiltyItemSchema).min(1, { message: 'at least one item required' }),
});

module.exports = { CreateBiltySchema, BiltyHeaderSchema, BiltyItemSchema };
