import { useCallback, useEffect, useRef, useState } from "react"
import {
  useApp,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps/react"
import { GenerationPanel } from "@/components/generation/GenerationPanel"
import {
  generationSnapshotSchema,
  displayAssetSchema,
  type GenerationSnapshot,
} from "@/lib/media/contracts"

export const GenerationApp = () => {
  const [snapshot, setSnapshot] = useState<GenerationSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const active = useRef(false)
  const deadline = useRef(0)
  const accept = (value: unknown) => {
    const parsed = generationSnapshotSchema.safeParse(value)
    if (!parsed.success) {
      setNotice(
        "This image response could not be opened. Refresh or reconnect CreativeOtter.",
      )
      return
    }
    setSnapshot(parsed.data)
    setNotice("")
  }
  const { app, isConnected, error } = useApp({
    appInfo: { name: "CreativeOtter image", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (bridge) => {
      bridge.ontoolresult = (result) => accept(result.structuredContent)
      bridge.onhostcontextchanged = (context) => {
        if (context.theme) applyDocumentTheme(context.theme)
      }
      bridge.ontoolcancelled = () =>
        setNotice(
          "The image request was cancelled. Reopen the existing request to check its state.",
        )
    },
  })
  useEffect(() => {
    const theme = app?.getHostContext()?.theme
    if (theme) applyDocumentTheme(theme)
  }, [app, isConnected])
  const refresh = useCallback(async () => {
    if (!app || !isConnected || !snapshot || active.current) return
    active.current = true
    setBusy(true)
    try {
      const result = await app.callServerTool(
        snapshot.execution_source === "native"
          ? {
              name: "get_native_generation",
              arguments: { generation_id: snapshot.generation_id },
            }
          : { name: "check_job", arguments: { quote_id: snapshot.quote_id } },
      )
      if (result.isError)
        setNotice(
          "Your connection needs attention. Reconnect or reopen this existing image; do not regenerate it.",
        )
      else accept(result.structuredContent)
    } catch {
      setNotice(
        "Couldn’t refresh this image. Reconnect CreativeOtter or try again.",
      )
    } finally {
      active.current = false
      setBusy(false)
    }
  }, [app, isConnected, snapshot])
  useEffect(() => {
    if (
      !snapshot ||
      [
        "succeeded",
        "failed",
        "needs_reconciliation",
        "expired",
        "cancelled",
      ].includes(snapshot.state)
    )
      return
    if (!deadline.current) deadline.current = Date.now() + 20 * 60 * 1000
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        Date.now() < deadline.current
      )
        void refresh()
    }, 5000)
    return () => clearInterval(timer)
  }, [snapshot, refresh])
  const open = async (url: string | null) => {
    if (!url || !app || !isConnected) return
    try {
      const result = await app.openLink({ url })
      if (result.isError)
        setNotice(
          "This link couldn’t open. Use the CreativeOtter link in the conversation.",
        )
    } catch {
      setNotice(
        "This link couldn’t open. Use the CreativeOtter link in the conversation.",
      )
    }
  }
  const favorite = async () => {
    if (!app || !snapshot?.outputs[0] || active.current) return
    active.current = true
    setBusy(true)
    try {
      const asset = snapshot.outputs[0]
      const result = await app.callServerTool({
        name: "manage_assets",
        arguments: {
          action: "favorite",
          asset_id: asset.id,
          favorite: !asset.favorite,
        },
      })
      const updated = displayAssetSchema.safeParse(
        result.structuredContent?.asset,
      )
      if (result.isError || !updated.success)
        setNotice(
          "Couldn’t update this favorite. Check your media permissions.",
        )
      else
        setSnapshot({
          ...snapshot,
          outputs: snapshot.outputs.map((value) =>
            value.id === updated.data.id ? updated.data : value,
          ),
        })
    } catch {
      setNotice("Couldn’t update this favorite.")
    } finally {
      active.current = false
      setBusy(false)
    }
  }
  if (!snapshot)
    return (
      <main className="generation-shell gen-loading">
        <p className="gen-brand">CreativeOtter ✳</p>
        <h1>Opening your image.</h1>
        <p role="status">
          {notice ||
            (error
              ? "Reconnect CreativeOtter to reopen this result."
              : "Loading your private image preview…")}
        </p>
      </main>
    )
  return (
    <GenerationPanel
      snapshot={snapshot}
      busy={busy}
      notice={
        notice ||
        (error
          ? "Connection interrupted. Reconnect to refresh this result."
          : "")
      }
      canExpand={app
        ?.getHostContext()
        ?.availableDisplayModes?.includes("fullscreen")}
      onRefresh={() => void refresh()}
      onReview={() => void open(snapshot.job_url || snapshot.review_url)}
      onDownload={() => void open(snapshot.outputs[0]?.download_url || null)}
      onFavorite={() => void favorite()}
      onExpand={() => {
        void app
          ?.requestDisplayMode({ mode: "fullscreen" })
          .catch(() => setNotice("Fullscreen is unavailable in this host."))
      }}
      onOpenAsset={(asset) => void open(asset.url)}
    />
  )
}
