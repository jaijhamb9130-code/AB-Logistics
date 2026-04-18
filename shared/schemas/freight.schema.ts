import { z } from 'zod';

export const GenerateFreightSchema = z.object({
  bilty_id: z.number().int().positive({ message: 'bilty_id must be a positive integer' }),
});

export type GenerateFreightInput = z.infer<typeof GenerateFreightSchema>;
