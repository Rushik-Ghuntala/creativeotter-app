import type { App } from "@modelcontextprotocol/ext-apps"
import { renderSnapshotSchema } from "@/lib/render/contracts"
import {
  resolvePreviewToolName,
  toolResultData,
} from "@/lib/mcp/preview-refresh"

type RenderBridge = Pick<App, "callServerTool" | "getHostContext">

export const validateRefreshedRender = (value: unknown, renderId: string) => {
  const snapshot = renderSnapshotSchema.parse(value)
  if (snapshot.render_id !== renderId)
    throw new Error("The refresh returned a different design")
  return snapshot
}

export const refreshRenderFromHost = async (
  app: RenderBridge,
  renderId: string,
) => {
  const result = await app.callServerTool(
    {
      name: resolvePreviewToolName(
        "get_render",
        app.getHostContext()?.toolInfo?.tool.name,
      ),
      arguments: { render_id: renderId },
    },
    { timeout: 5000, maxTotalTimeout: 5000 },
  )
  if (result.isError) throw new Error("Design refresh is unavailable")
  return validateRefreshedRender(toolResultData(result), renderId)
}
