import {
  previewAccessFromResult,
  type PreviewAccess,
} from "@/lib/mcp/preview-access-contracts"
import type { App } from "@modelcontextprotocol/ext-apps"
import {
  generationSnapshotSchema,
  type GenerationSnapshot,
} from "@/lib/media/contracts"

export const isPreviewAccessRemoved = (error: unknown): boolean =>
  (error instanceof Error &&
    "accessRemoved" in error &&
    error.accessRemoved === true) ||
  (error instanceof AggregateError && error.errors.some(isPreviewAccessRemoved))

const entryTools = [
  "show_image_gallery",
  "get_native_generation",
  "generate_image",
  "complete_native_output",
  "create_native_output",
  "prepare_native_generation",
]

export const resolvePreviewToolName = (name: string, invokedName?: string) => {
  const entry = entryTools.find(
    (value) =>
      invokedName === value ||
      invokedName?.endsWith(`__${value}`) ||
      invokedName?.endsWith(`-${value}`) ||
      invokedName?.endsWith(`:${value}`),
  )
  return entry && invokedName
    ? invokedName.slice(0, -entry.length) + name
    : name
}

export const toolResultData = (result: {
  structuredContent?: unknown
  content?: unknown
}) => {
  if (result.structuredContent !== undefined) return result.structuredContent
  if (!Array.isArray(result.content)) return undefined
  for (const block of result.content) {
    if (block?.type !== "text" || typeof block.text !== "string") continue
    try {
      return JSON.parse(block.text) as unknown
    } catch {
      /* Non-JSON text is not a snapshot. */
    }
  }
  return undefined
}

export const generationStatusUri = (
  snapshot: Pick<GenerationSnapshot, "generation_id" | "execution_source">,
) =>
  `creativeotter://generation/${snapshot.execution_source}/${snapshot.generation_id}`

type PreviewBridge = Pick<
  App,
  "callServerTool" | "readServerResource" | "getHostContext"
>

export const refreshGenerationStatus = async (
  app: PreviewBridge,
  snapshot: GenerationSnapshot,
  access?: PreviewAccess | null,
  fetcher: typeof fetch = fetch,
  onAccess?: (access: PreviewAccess) => void,
): Promise<GenerationSnapshot> => {
  const validate = (value: unknown) => {
    const parsed = generationSnapshotSchema.parse(value)
    if (
      parsed.generation_id !== snapshot.generation_id ||
      parsed.execution_source !== snapshot.execution_source
    )
      throw new Error("The refresh returned a different image")
    return parsed
  }
  const readHttp = async () => {
    if (!access) throw new Error("Missing scoped preview access")
    const url = new URL(access.url)
    const imageOrigin = new URL(snapshot.job_url || snapshot.review_url || "")
      .origin
    if (
      url.origin !== imageOrigin ||
      url.pathname !== "/api/preview/status" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (access.expires_at !== null &&
        Date.parse(access.expires_at) <= Date.now())
    )
      throw new Error("Preview access needs reopening")
    const response = await fetcher(url.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generation_id: snapshot.generation_id,
        execution_source: snapshot.execution_source,
      }),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok)
      throw Object.assign(new Error("Existing image status is unavailable"), {
        accessRemoved: [401, 403].includes(response.status),
      })
    const result = await response.json()
    const updated = validate(result)
    const renewed = previewAccessFromResult(result)
    if (renewed) onAccess?.(renewed)
    return updated
  }
  // Saved results have their own revocable read capability. Use it directly so
  // broken host IPC cannot delay downloads or prevent idle/expiry recovery.
  if (access?.expires_at === null) return readHttp()
  try {
    const name =
      snapshot.execution_source === "native"
        ? "get_native_generation"
        : "check_job"
    const result = await app.callServerTool(
      {
        name: resolvePreviewToolName(
          name,
          app.getHostContext()?.toolInfo?.tool.name,
        ),
        arguments:
          snapshot.execution_source === "native"
            ? { generation_id: snapshot.generation_id }
            : { quote_id: snapshot.quote_id },
      },
      { timeout: 5000, maxTotalTimeout: 5000 },
    )
    if (result.isError) throw new Error("Image status tool was unavailable")
    const updated = validate(toolResultData(result))
    const renewed = previewAccessFromResult(result)
    if (renewed) onAccess?.(renewed)
    return updated
  } catch (toolError) {
    try {
      // Some Claude Code builds cannot proxy app tools/call. Resources use
      // the same authenticated MCP connection and workspace authorization.
      const result = await app.readServerResource(
        {
          uri: generationStatusUri(snapshot),
        },
        { timeout: 5000, maxTotalTimeout: 5000 },
      )
      const block = result.contents.find(
        (item) => item.mimeType === "application/json" && "text" in item,
      )
      if (!block || !("text" in block))
        throw new Error("Image status resource was missing")
      return validate(JSON.parse(block.text))
    } catch (resourceError) {
      if (access) {
        try {
          return await readHttp()
        } catch (httpError) {
          throw new AggregateError(
            [toolError, resourceError, httpError],
            "Reopen this existing image from your assistant to refresh its preview access.",
          )
        }
      }
      throw new AggregateError(
        [toolError, resourceError],
        "The host could not refresh this saved image. Reopen the existing image from your assistant; do not generate it again.",
      )
    }
  }
}
