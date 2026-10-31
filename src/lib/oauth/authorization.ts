import { z } from "zod"

// Supabase issues opaque request identifiers, not necessarily UUIDs.
export const authorizationIdSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/)
