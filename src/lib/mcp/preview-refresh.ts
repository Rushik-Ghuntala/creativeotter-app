import type { App } from "@modelcontextprotocol/ext-apps"
import {
  generationSnapshotSchema,
  type GenerationSnapshot,
} from "@/lib/media/contracts"

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
  try {
    const name =
      snapshot.execution_source === "native"
        ? "get_native_generation"
        : "check_job"
    const result = await app.callServerTool({
      name: resolvePreviewToolName(
        name,
        app.getHostContext()?.toolInfo?.tool.name,
      ),
      arguments:
        snapshot.execution_source === "native"
          ? { generation_id: snapshot.generation_id }
          : { quote_id: snapshot.quote_id },
    })
    if (result.isError) throw new Error("Image status tool was unavailable")
    return validate(toolResultData(result))
  } catch (toolError) {
    try {
      // Some Claude Code builds cannot proxy app tools/call. Resources use
      // the same authenticated MCP connection and workspace authorization.
      const result = await app.readServerResource({
        uri: generationStatusUri(snapshot),
      })
      const block = result.contents.find(
        (item) => item.mimeType === "application/json" && "text" in item,
      )
      if (!block || !("text" in block))
        throw new Error("Image status resource was missing")
      return validate(JSON.parse(block.text))
    } catch (resourceError) {
      throw new AggregateError(
        [toolError, resourceError],
        "The host could not refresh this saved image. Reopen the existing image from your assistant; do not generate it again.",
      )
    }
  }
}
