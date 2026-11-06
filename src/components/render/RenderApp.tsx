import { useRef, useState } from "react"
import {
  useApp,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps/react"
import { RenderPanel } from "@/components/render/RenderPanel"
import {
  renderSnapshotSchema,
  type RenderSnapshot,
  type RenderAccess,
} from "@/lib/render/contracts"
import { toolResultData } from "@/lib/mcp/preview-refresh"
import {
  refreshRenderFromHost,
  validateRefreshedRender,
} from "@/lib/render/refresh"
export const RenderApp = () => {
  const [snapshot, setSnapshot] = useState<RenderSnapshot | null>(null)
  const access = useRef<RenderAccess | null>(null)
  const { app } = useApp({
    appInfo: { name: "CreativeOtter design", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (bridge) => {
      bridge.ontoolresult = (result) => {
        const parsed = renderSnapshotSchema.safeParse(toolResultData(result))
        if (!parsed.success) return
        setSnapshot(parsed.data)
        const credential = result._meta?.["creativeotter/render-access"] as
          RenderAccess | undefined
        if (credential?.url && credential?.token) {
          access.current = credential
          try {
            localStorage.setItem(
              `creativeotter:render:${parsed.data.render_id}`,
              JSON.stringify(credential),
            )
          } catch {}
        } else {
          try {
            access.current = JSON.parse(
              localStorage.getItem(
                `creativeotter:render:${parsed.data.render_id}`,
              ) || "null",
            )
          } catch {}
        }
      }
      bridge.onhostcontextchanged = (context) => {
        if (context.theme) applyDocumentTheme(context.theme)
      }
    },
  })
  const refresh = async () => {
    if (!snapshot) throw new Error("No design")
    try {
      const cached = JSON.parse(
        localStorage.getItem(`creativeotter:render:${snapshot.render_id}`) ||
          "null",
      ) as RenderAccess | null
      if (
        cached?.url &&
        /^rp1\.[A-Za-z0-9_-]{43}$/.test(cached.token) &&
        (!access.current ||
          (access.current.url.startsWith("http://localhost:") &&
            cached.url.startsWith("https://")))
      )
        access.current = cached
    } catch {}
    if (access.current) {
      try {
        const response = await fetch(access.current.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access.current.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ render_id: snapshot.render_id }),
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        })
        if (response.ok)
          return validateRefreshedRender(
            await response.json(),
            snapshot.render_id,
          )
        if (response.status === 403) {
          try {
            localStorage.removeItem(
              `creativeotter:render:${snapshot.render_id}`,
            )
          } catch {}
          access.current = null
        }
      } catch {
        // A host may block HTTP in its sandbox; retain the signed-in callback.
      }
    }
    if (!app) throw new Error("No connection")
    return refreshRenderFromHost(app, snapshot.render_id)
  }
  return snapshot ? (
    <RenderPanel
      key={`${snapshot.render_id}:${snapshot.state}`}
      initial={snapshot}
      refresh={refresh}
      bridge={app}
    />
  ) : (
    <div className="otter-render-panel">
      <p>Opening your CreativeOtter design…</p>
    </div>
  )
}
