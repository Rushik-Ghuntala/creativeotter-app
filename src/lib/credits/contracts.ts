import { z } from "zod"

export const creditUnitsSchema = z.string().regex(/^\d+$/)
export const creditSummarySchema = z.object({
  workspace_id: z.uuid(),
  available_units: creditUnitsSchema,
  reserved_units: creditUnitsSchema,
  spent_units: creditUnitsSchema,
  units_per_credit: z.literal(1000),
  purchases_enabled: z.literal(false),
  history: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(["grant", "reserve", "charge", "release"]),
      amount_units: creditUnitsSchema,
      job_id: z.uuid().nullable(),
      render_job_id: z.uuid().nullable().optional(),
      native_generation_id: z.uuid().nullable().optional(),
      note: z.string(),
      created_at: z.string(),
    }),
  ),
})
export type CreditSummary = z.infer<typeof creditSummarySchema>
export const formatCreditUnits = (units: string) => {
  if (!/^\d+$/.test(units)) throw new Error("Invalid credit units")
  const value = BigInt(units)
  const whole = (value / BigInt(1000)).toLocaleString("en-US")
  const fraction = (value % BigInt(1000))
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole
}
