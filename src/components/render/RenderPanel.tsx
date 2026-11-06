"use client"
import { useEffect, useRef, useState } from "react"
import { savedImageDownloadUrl } from "@/lib/mcp/download"
import type { App } from "@modelcontextprotocol/ext-apps"
import {
  renderSnapshotSchema,
  type RenderSnapshot,
} from "@/lib/render/contracts"
import { formatCreditUnits } from "@/lib/credits/contracts"
type Props = {
  initial: RenderSnapshot
  refresh: () => Promise<unknown>
  bridge?: App | null
  onSnapshot?: (snapshot: RenderSnapshot) => void
}
export const RenderPanel = ({
  initial,
  refresh,
  bridge,
  onSnapshot,
}: Props) => {
  const [snapshot, setSnapshot] = useState(initial)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const active = useRef<Promise<RenderSnapshot | null> | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const playback = useRef<{ time: number; playing: boolean } | null>(null)
  const reader = useRef(refresh)
  useEffect(() => {
    reader.current = refresh
  }, [refresh])
  const update = () => {
    if (active.current) return active.current
    const request = async () => {
      try {
        const parsed = renderSnapshotSchema.parse(await reader.current())
        if (video.current && parsed.preview_url !== snapshot.preview_url) {
          playback.current = {
            time: video.current.currentTime,
            playing: !video.current.paused && !video.current.ended,
          }
        }
        setSnapshot(parsed)
        setNotice("")
        onSnapshot?.(parsed)
        return parsed
      } catch {
        setNotice("We’re reconnecting your preview. Your saved design is safe.")
        return null
      } finally {
        active.current = null
      }
    }
    active.current = request()
    return active.current
  }
  const updater = useRef(update)
  useEffect(() => {
    updater.current = update
  })
  useEffect(() => {
    const running = ["queued", "running", "saving"].includes(snapshot.state)
    const tick = () => {
      if (document.visibilityState !== "hidden") void updater.current()
    }
    const interval = setInterval(
      tick,
      running ? 2500 : snapshot.state === "succeeded" ? 25 * 60 * 1000 : 60000,
    )
    const visible = () => {
      if (document.visibilityState === "visible") void updater.current()
    }
    window.addEventListener("online", tick)
    document.addEventListener("visibilitychange", visible)
    return () => {
      clearInterval(interval)
      window.removeEventListener("online", tick)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [snapshot.state, snapshot.render_id])
  const download = async () => {
    setBusy(true)
    try {
      const current = await updater.current()
      if (!current?.download_url || !current.preview_url)
        throw new Error("Download unavailable")
      const downloadUrl = savedImageDownloadUrl({
        url: current.preview_url,
        download_url: current.download_url,
      })
      const filename =
        new URL(downloadUrl).searchParams.get("download") ||
        `creativeotter.${current.format}`
      if (bridge?.getHostCapabilities()?.downloadFile)
        await bridge.downloadFile({
          contents: [
            {
              type: "resource_link",
              uri: downloadUrl,
              name: filename,
              mimeType: current.format === "png" ? "image/png" : "video/mp4",
            },
          ],
        })
      else if (bridge) await bridge.openLink({ url: downloadUrl })
      else {
        const a = document.createElement("a")
        a.href = downloadUrl
        a.download = filename
        document.body.append(a)
        a.click()
        a.remove()
      }
    } catch {
      setNotice("The download couldn’t open. Please try Download again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="otter-render-panel"
      aria-label="CreativeOtter design preview"
    >
      <header>
        <span className="otter-render-brand">
          CreativeOtter <b>✳</b>
        </span>
        <button
          type="button"
          onClick={() => {
            void updater.current()
          }}
          aria-label="Refresh preview"
        >
          ↻
        </button>
      </header>
      <h2>
        {snapshot.state === "succeeded"
          ? "Your design is ready"
          : snapshot.state === "failed"
            ? "Let’s try again"
            : snapshot.state === "quoted"
              ? "Your design estimate"
              : "Bringing your idea to life"}
      </h2>
      <p className="otter-render-sub">
        {snapshot.title} ·{" "}
        <strong>
          {formatCreditUnits(snapshot.credit_units)} credits{" "}
          {snapshot.credit_status}
        </strong>
      </p>
      {notice && (
        <p
          role="status"
          className="otter-render-notice"
        >
          {notice}
        </p>
      )}
      <div
        className="otter-render-canvas"
        style={{ aspectRatio: `${snapshot.width}/${snapshot.height}` }}
      >
        {snapshot.preview_url ? (
          snapshot.format === "mp4" ? (
            <video
              ref={video}
              controls
              playsInline
              preload="metadata"
              src={snapshot.preview_url}
              onLoadedMetadata={() => {
                const current = video.current
                const previous = playback.current
                if (!current || !previous) return
                playback.current = null
                current.currentTime = Math.min(previous.time, current.duration)
                if (previous.playing) void current.play().catch(() => {})
              }}
              onError={() => {
                void updater.current()
              }}
            />
          ) : (
            // Private signed URLs are delivered directly; never proxy or cache them through Next Image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snapshot.preview_url}
              alt={snapshot.title}
              onError={() => {
                void updater.current()
              }}
            />
          )
        ) : (
          <p role="status">{snapshot.message}</p>
        )}
      </div>
      <footer>
        <span>
          {snapshot.saved
            ? "✓ Saved privately in CreativeOtter"
            : snapshot.state === "failed"
              ? "Credits returned"
              : snapshot.state === "quoted"
                ? "No credits spent"
                : "Credits reserved while we render"}
        </span>
        {snapshot.project_url && (
          <button
            type="button"
            onClick={() => {
              if (bridge) void bridge.openLink({ url: snapshot.project_url! })
              else
                window.open(
                  `/studio/designs${new URL(snapshot.project_url!).search}`,
                  "_blank",
                  "noopener,noreferrer",
                )
            }}
          >
            Edit project
          </button>
        )}
        {snapshot.saved && (
          <button
            type="button"
            onClick={() => {
              void download()
            }}
            disabled={busy}
          >
            {busy ? "Opening…" : "Download"}
          </button>
        )}
      </footer>
    </section>
  )
}
