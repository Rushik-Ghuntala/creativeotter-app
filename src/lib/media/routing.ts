import { z } from "zod"

export const routingRequestSchema = z.object({
  native_status: z
    .enum(["available", "unavailable", "unknown"])
    .default("unknown"),
  native_satisfies_request: z.boolean().default(false),
  requested_model: z.string().min(1).max(120).optional(),
  native_matches_requested_model: z.boolean().default(false),
  native_failure: z
    .enum(["none", "technical", "unsupported", "safety", "unknown_outcome"])
    .default("none"),
})
export type RoutingRequest = z.infer<typeof routingRequestSchema>

export const resolveExecutionRoute = (
  input: RoutingRequest,
  providerAvailable: boolean,
) => {
  if (input.native_failure === "safety")
    return {
      route: "blocked",
      reason:
        "A safety refusal must not be routed to another model to bypass it.",
    }
  if (input.native_failure === "unknown_outcome")
    return {
      route: "reconcile_native",
      reason:
        "Check whether the native operation completed before starting another generation.",
    }
  if (input.native_status === "unknown")
    return {
      route: "inspect_native_tools",
      reason:
        "Inspect the current host tool inventory before selecting a paid provider fallback.",
    }
  const fits =
    input.native_status === "available" &&
    input.native_satisfies_request &&
    (!input.requested_model || input.native_matches_requested_model) &&
    input.native_failure === "none"
  if (fits)
    return {
      route: "native",
      reason:
        "Prefer the matching native engine, then obtain a CreativeOtter native credit quote, direct approval and a successful execution claim before invoking it. Host usage may also apply.",
    }
  if (providerAvailable)
    return {
      route: "provider_review",
      reason:
        "A supported provider fallback is available. Obtain a bound quote and direct browser approval before submitting it.",
    }
  return {
    route: "unavailable",
    reason:
      "No matching native tool or configured provider fallback is currently available. Do not substitute a different requested model or claim generation succeeded.",
  }
}
