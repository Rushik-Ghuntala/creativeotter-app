import { z } from "zod"
import type { ImageInput } from "@/lib/media/contracts"

export class ProviderSubmissionError extends Error {
  readonly rejected: boolean
  constructor(rejected: boolean) {
    super(
      rejected
        ? "The provider rejected this request. Check provider configuration and the reviewed inputs."
        : "The provider did not confirm submission. Operator reconciliation is required before any new attempt.",
    )
    this.rejected = rejected
  }
}
export type ProviderReceipt = {
  requestId: string
  statusUrl: string
  resultUrl: string
}
const responseSchema = z.object({
  request_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  status_url: z.url(),
  response_url: z.url(),
})
const outputSchema = z.object({
  images: z
    .array(
      z.object({
        url: z.url(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(1),
})

export const isAllowedProviderImage = (value: string) => {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return false
  return (
    url.hostname === "fal.media" ||
    url.hostname.endsWith(".fal.media") ||
    url.hostname === "falcdn.com" ||
    url.hostname.endsWith(".falcdn.com") ||
    (url.hostname === "storage.googleapis.com" &&
      url.pathname.startsWith("/falserverless/"))
  )
}

export const createFalImageProvider = (
  key: string,
  fetcher: typeof fetch = fetch,
  origin = "https://queue.fal.run",
) => {
  const validateUrl = (value: string, requestId: string) => {
    const url = new URL(value)
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      ![
        `/fal-ai/nano-banana-2/requests/${requestId}`,
        `/fal-ai/nano-banana-2/requests/${requestId}/status`,
      ].includes(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new ProviderSubmissionError(false)
    return url.href
  }
  const headers = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  }
  return {
    submit: async (
      input: ImageInput,
      references: string[],
    ): Promise<ProviderReceipt> => {
      try {
        const response = await fetcher(
          `${origin}/fal-ai/nano-banana-2${references.length ? "/edit" : ""}`,
          {
            method: "POST",
            headers,
            signal: AbortSignal.timeout(20000),
            redirect: "error",
            body: JSON.stringify({
              prompt: input.prompt,
              aspect_ratio: input.aspect_ratio,
              resolution: input.resolution,
              num_images: 1,
              output_format: "png",
              limit_generations: true,
              enable_web_search: false,
              enable_google_search: false,
              ...(references.length ? { image_urls: references } : {}),
            }),
          },
        )
        if (!response.ok)
          throw new ProviderSubmissionError(
            [400, 401, 403, 404, 413, 415, 422, 429].includes(response.status),
          )
        const data = responseSchema.parse(await response.json())
        return {
          requestId: data.request_id,
          statusUrl: validateUrl(data.status_url, data.request_id),
          resultUrl: validateUrl(data.response_url, data.request_id),
        }
      } catch (error) {
        if (error instanceof ProviderSubmissionError) throw error
        throw new ProviderSubmissionError(false)
      }
    },
    status: async (receipt: ProviderReceipt) => {
      const response = await fetcher(
        validateUrl(receipt.statusUrl, receipt.requestId),
        { headers, signal: AbortSignal.timeout(15000), redirect: "error" },
      )
      if (!response.ok)
        throw new Error("Provider status is temporarily unavailable")
      return z
        .object({ status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]) })
        .parse(await response.json()).status
    },
    result: async (receipt: ProviderReceipt) => {
      const response = await fetcher(
        validateUrl(receipt.resultUrl, receipt.requestId),
        { headers, signal: AbortSignal.timeout(15000), redirect: "error" },
      )
      if (!response.ok)
        throw new Error("The provider result needs operator review")
      const data = outputSchema.parse(await response.json())
      if (!isAllowedProviderImage(data.images[0].url))
        throw new Error("Unexpected provider image origin")
      return data.images[0]
    },
  }
}
