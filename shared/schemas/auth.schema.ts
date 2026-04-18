import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1, { message: 'username is required' }).max(64),
  password: z.string().min(1, { message: 'password is required' }),
});

export type LoginInput = z.infer<typeof LoginSchema>;
