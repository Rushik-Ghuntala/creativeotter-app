import { nextPreviewRefreshAt } from "@/lib/mcp/preview-schedule"
import {
  previewAccessFromResult,
  type PreviewAccess,
} from "@/lib/mcp/preview-access-contracts"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  useApp,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps/react"
import {
  refreshGenerationStatus,
  isPreviewAccessRemoved,
  toolResultData,
} from "@/lib/mcp/preview-refresh"
import { ImageGalleryNavigation } from "@/components/generation/ImageGalleryNavigation"
import {
  gallerySnapshotSchema,
  type GallerySnapshot,
} from "@/lib/media/gallery-contracts"
import { GenerationPanel } from "@/components/generation/GenerationPanel"
import {
  generationSnapshotSchema,
  displayAssetSchema,
  type GenerationSnapshot,
} from "@/lib/media/contracts"

export const GenerationApp = () => {
  const [singleSnapshot, setSnapshot] = useState<GenerationSnapshot | null>(
    null,
  )
  const [gallery, setGallery] = useState<GallerySnapshot | null>(null)
  const [selected, setSelected] = useState(0)
  const snapshot = gallery?.items[selected] || singleSnapshot
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [refreshed, setRefreshed] = useState(false)
  const opened = useRef("")
  const [previewAccess, setPreviewAccess] = useState<PreviewAccess | null>(null)
  const active = useRef(false)
  const deadline = useRef(0)
  const lastSuccess = useRef(0)
  const retryAfter = useRef(0)
  const accept = (value: unknown) => {
    const collection = gallerySnapshotSchema.safeParse(value)
    if (collection.success) {
      setGallery(collection.data)
      setSelected((index) => Math.min(index, collection.data.items.length - 1))
      setNotice("")
      return
    }
    const parsed = generationSnapshotSchema.safeParse(value)
    if (!parsed.success) {
      setNotice(
        "This image response could not be opened. Refresh or reconnect CreativeOtter.",
      )
      return
    }
    setGallery(null)
    setSnapshot(parsed.data)
    setNotice("")
  }
  const { app, isConnected, error } = useApp({
    appInfo: { name: "CreativeOtter image", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (bridge) => {
      bridge.ontoolresult = (result) => {
        opened.current = ""
        retryAfter.current = 0
        deadline.current = 0
        setPreviewAccess(previewAccessFromResult(result))
        accept(toolResultData(result))
      }
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
  const refresh = useCallback(
    async (all = false) => {
      if (!app || !isConnected || !snapshot || active.current) return null
      active.current = true
      setBusy(true)
      try {
        const updates = await Promise.all(
          (all && gallery ? gallery.items : [snapshot]).map((item) =>
            refreshGenerationStatus(
              app,
              item,
              previewAccess,
              fetch,
              setPreviewAccess,
            ),
          ),
        )
        const updated = updates.find(
          (item) =>
            item.generation_id === snapshot.generation_id &&
            item.execution_source === snapshot.execution_source,
        )!

        if (gallery)
          setGallery((previous) =>
            previous
              ? {
                  ...previous,
                  items: previous.items.map(
                    (item) =>
                      updates.find(
                        (value) =>
                          value.generation_id === item.generation_id &&
                          value.execution_source === item.execution_source,
                      ) || item,
                  ),
                }
              : previous,
          )
        else setSnapshot(updated)
        setNotice("")
        setRefreshed(true)
        lastSuccess.current = Date.now()
        retryAfter.current = 0
        return updated
      } catch (error) {
        const removed = isPreviewAccessRemoved(error)
        retryAfter.current = removed ? Infinity : Date.now() + 60_000
        setNotice(
          removed
            ? "This gallery’s access was removed or changed. Reconnect CreativeOtter to restore access."
            : "Couldn’t refresh this saved image yet. We’ll retry automatically when the connection is available.",
        )
        return null
      } finally {
        active.current = false
        setBusy(false)
      }
    },
    [app, isConnected, snapshot, gallery, previewAccess],
  )
  useEffect(() => {
    if (!app || !isConnected || !snapshot || busy) return
    const key = `${snapshot.execution_source}:${snapshot.generation_id}`
    if (opened.current === key) return
    opened.current = key
    setRefreshed(false)
    void refresh()
  }, [app, isConnected, snapshot, busy, previewAccess, refresh])
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
  useEffect(() => {
    if (!snapshot || snapshot.state !== "succeeded") return
    const check = () => {
      const now = Date.now()
      if (
        document.visibilityState === "visible" &&
        now >= retryAfter.current &&
        now >=
          Math.min(
            ...(gallery?.items || [snapshot]).map((item) =>
              nextPreviewRefreshAt(item, previewAccess, lastSuccess.current),
            ),
          )
      )
        void refresh(true)
    }
    const timer = setInterval(check, 30_000)
    document.addEventListener("visibilitychange", check)
    window.addEventListener("online", check)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", check)
      window.removeEventListener("online", check)
    }
  }, [snapshot, gallery, previewAccess, refresh])
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
        (toolResultData(result) as { asset?: unknown } | undefined)?.asset,
      )
      if (result.isError || !updated.success)
        setNotice(
          "Couldn’t update this favorite. Check your media permissions.",
        )
      else {
        const update = (item: GenerationSnapshot) => ({
          ...item,
          outputs: item.outputs.map((value) =>
            value.id === updated.data.id ? updated.data : value,
          ),
        })
        if (gallery)
          setGallery((previous) =>
            previous
              ? { ...previous, items: previous.items.map(update) }
              : previous,
          )
        else setSnapshot(update(snapshot))
      }
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
    <>
      {gallery && (
        <ImageGalleryNavigation
          gallery={gallery}
          selected={selected}
          busy={busy}
          onSelect={setSelected}
          onRefresh={() => void refresh(true)}
          onOpenGallery={() => void open(gallery.gallery_url || null)}
        />
      )}
      {refreshed && !notice && (
        <p
          className="gen-refresh-status"
          role="status"
        >
          Preview up to date
        </p>
      )}
      <GenerationPanel
        key={snapshot.generation_id}
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
        onDownload={() => {
          void refresh().then((updated) => {
            if (updated) return open(updated.outputs[0]?.download_url || null)
          })
        }}
        onFavorite={() => void favorite()}
        onExpand={() => {
          void app
            ?.requestDisplayMode({ mode: "fullscreen" })
            .catch(() => setNotice("Fullscreen is unavailable in this host."))
        }}
        onOpenAsset={(asset) => void open(asset.url)}
      />
    </>
  )
}
