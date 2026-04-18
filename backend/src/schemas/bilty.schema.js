'use strict';

const { z } = require('zod');

const BiltyItemSchema = z.object({
  id: z.number().int().positive().optional(),
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
});

const AdvanceDetailSchema = z.object({
  adv_date: z.string().nullable().optional(),
  adv_from: z.string().max(128).nullable().optional(),
  amount: z.coerce.number().min(0),
  narration: z.string().max(255).nullable().optional(),
});

const FuelDetailSchema = z.object({
  from_loc: z.string().max(128).nullable().optional(),
  amount: z.coerce.number().min(0),
  doc_no: z.string().max(64).nullable().optional(),
  doc_date: z.string().nullable().optional(),
});

const BiltyHeaderSchema = z.object({
  bilty_date: z.string().nullable().optional(),
  consignor: z.string().min(1, { message: 'consignor is required' }).max(255),
  owner_name: z.string().max(255).nullable().optional(),
  agent_name: z.string().max(255).nullable().optional(),
  branch: z.string().max(128).nullable().optional(),
  zone_name: z.string().max(128).nullable().optional(),
  truck_no: z.string().min(1, { message: 'truck_no is required' }).max(64),
  goods_type: z.string().max(128).nullable().optional(),
  truck_type: z.string().max(64).nullable().optional(),
});

const CreateBiltySchema = z.object({
  header: BiltyHeaderSchema,
  items: z.array(BiltyItemSchema).min(1, { message: 'at least one item required' }),
  advances: z.array(AdvanceDetailSchema).default([]),
  fuels: z.array(FuelDetailSchema).default([]),
});

module.exports = { CreateBiltySchema, BiltyHeaderSchema, BiltyItemSchema };
