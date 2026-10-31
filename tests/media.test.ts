import { formatCreditUnits, creditSummarySchema } from "@/lib/credits/contracts"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  routingRequestSchema,
  resolveExecutionRoute,
} from "@/lib/media/routing"
import {
  createFalImageProvider,
  isAllowedProviderImage,
  ProviderSubmissionError,
} from "@/lib/media/provider"
import { imageInputSchema } from "@/lib/media/contracts"
import { validateImageBytes } from "@/lib/media/image-validation"

const input = imageInputSchema.parse({ prompt: "Integration fixture" })
const route = (value: object, ready = true) =>
  resolveExecutionRoute(routingRequestSchema.parse(value), ready).route

test("native-first routing preserves model choice and uncertain results", () => {
  assert.equal(
    route({ native_status: "available", native_satisfies_request: true }),
    "native",
  )
  assert.equal(
    route(
      { native_status: "available", native_satisfies_request: true },
      false,
    ),
    "native",
  )
  assert.equal(route({ native_status: "unknown" }), "inspect_native_tools")
  assert.equal(route({ native_status: "unavailable" }), "provider_review")
  assert.equal(route({ native_status: "unavailable" }, false), "unavailable")
  assert.equal(
    route({
      native_status: "available",
      native_satisfies_request: true,
      requested_model: "specific-provider",
    }),
    "provider_review",
  )
  assert.equal(
    route({
      native_status: "available",
      native_satisfies_request: true,
      requested_model: "specific-native",
      native_matches_requested_model: true,
    }),
    "native",
  )
  assert.equal(
    route({ native_status: "available", native_failure: "technical" }),
    "provider_review",
  )
  assert.equal(
    route({ native_status: "available", native_failure: "unknown_outcome" }),
    "reconcile_native",
  )
  assert.equal(
    route({ native_status: "available", native_failure: "safety" }),
    "blocked",
  )
})

test("provider uncertain submission is attempted once and never silently retried", async () => {
  let calls = 0
  const provider = createFalImageProvider("fixture", async () => {
    calls++
    throw new Error("network interrupted")
  })
  await assert.rejects(
    () => provider.submit(input, []),
    (error: unknown) =>
      error instanceof ProviderSubmissionError && !error.rejected,
  )
  assert.equal(calls, 1)
  const rejected = createFalImageProvider(
    "fixture",
    async () => new Response(null, { status: 422 }),
  )
  await assert.rejects(
    () => rejected.submit(input, []),
    (error: unknown) =>
      error instanceof ProviderSubmissionError && error.rejected,
  )
})

test("provider receipt URLs cannot redirect authenticated fetches to another origin or request", async () => {
  for (const statusUrl of [
    "https://attacker.invalid/status",
    "https://queue.fal.run/fal-ai/nano-banana-2/requests/abc-other/status",
    "https://queue.fal.run/fal-ai/nano-banana-2/requests/abc/status?secret=x",
  ]) {
    const provider = createFalImageProvider("fixture", async () =>
      Response.json({
        request_id: "abc",
        status_url: statusUrl,
        response_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/abc",
      }),
    )
    await assert.rejects(
      () => provider.submit(input, []),
      ProviderSubmissionError,
    )
  }
  let submitted: Record<string, unknown> = {}
  const provider = createFalImageProvider("fixture", async (_url, options) => {
    submitted = JSON.parse(String(options?.body))
    return Response.json({
      request_id: "abc",
      status_url:
        "https://queue.fal.run/fal-ai/nano-banana-2/requests/abc/status",
      response_url: "https://queue.fal.run/fal-ai/nano-banana-2/requests/abc",
    })
  })
  assert.equal((await provider.submit(input, [])).requestId, "abc")
  assert.equal(submitted.num_images, 1)
  assert.equal(submitted.enable_web_search, false)
  assert.equal(submitted.output_format, "png")
  assert.equal(isAllowedProviderImage("https://v3.fal.media/file.png"), true)
  assert.equal(
    isAllowedProviderImage("https://fal.media.attacker.invalid/file.png"),
    false,
  )
  assert.equal(isAllowedProviderImage("http://fal.media/file.png"), false)
  assert.equal(
    isAllowedProviderImage("https://storage.googleapis.com/other/file.png"),
    false,
  )
})

test("saved image validation checks actual format, dimensions and bounded bytes", async () => {
  const bytes = await readFile("public/creativeotter-widget.webp")
  assert.ok(validateImageBytes(bytes, "image/webp").width > 0)
  assert.throws(() => validateImageBytes(bytes, "image/png"))
  assert.throws(() => validateImageBytes(bytes, "image/webp", 10))
  assert.throws(() =>
    validateImageBytes(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    ),
  )
})

test("credits preserve integer precision and reject ambiguous monetary data", () => {
  assert.equal(formatCreditUnits("0"), "0")
  assert.equal(formatCreditUnits("1"), "0.001")
  assert.equal(formatCreditUnits("16000"), "16")
  assert.equal(
    formatCreditUnits("900719925474099312345"),
    "900,719,925,474,099,312.345",
  )
  for (const value of ["-1", "1.5", "NaN"])
    assert.throws(() => formatCreditUnits(value))
  assert.equal(
    creditSummarySchema.safeParse({ available_units: 16000 }).success,
    false,
  )
})
