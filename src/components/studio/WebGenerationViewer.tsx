"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { GenerationPanel } from "@/components/generation/GenerationPanel"
import {
  generationSnapshotSchema,
  type GenerationSnapshot,
} from "@/lib/media/contracts"
import { favoriteAsset } from "@/lib/media/actions"
import "@/styles/generation.css"

type WebGenerationViewerProps = { initial: GenerationSnapshot }
export const WebGenerationViewer = ({ initial }: WebGenerationViewerProps) => {
  const [snapshot, setSnapshot] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const active = useRef(false)
  const deadline = useRef(0)
  const refresh = useCallback(async () => {
    if (active.current) return
    active.current = true
    setBusy(true)
    try {
      const response = await fetch(
        `/api/generations/${snapshot.generation_id}?source=${snapshot.execution_source}`,
        { cache: "no-store" },
      )
      if (!response.ok) throw new Error()
      const parsed = generationSnapshotSchema.parse(await response.json())
      setSnapshot(parsed)
      setNotice("")
    } catch {
      setNotice(
        "Couldn’t refresh this result. Sign in again or refresh the page; do not regenerate an existing image.",
      )
    } finally {
      active.current = false
      setBusy(false)
    }
  }, [snapshot.generation_id, snapshot.execution_source])
  useEffect(() => {
    if (
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
  }, [snapshot.execution_source, snapshot.state, refresh])
  const open = (url: string | null) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer")
  }
  const toggleFavorite = async () => {
    const output = snapshot.outputs[0]
    if (!output || active.current) return
    active.current = true
    setBusy(true)
    try {
      await favoriteAsset(output.id, !output.favorite)
      setSnapshot({
        ...snapshot,
        outputs: snapshot.outputs.map((asset) =>
          asset.id === output.id
            ? { ...asset, favorite: !asset.favorite }
            : asset,
        ),
      })
    } catch {
      setNotice("Unable to update this favorite.")
    } finally {
      active.current = false
      setBusy(false)
    }
  }
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-7">
      <GenerationPanel
        snapshot={snapshot}
        busy={busy}
        notice={notice}
        canExpand={Boolean(snapshot.outputs.length)}
        onRefresh={() => void refresh()}
        onReview={() =>
          open(
            snapshot.state === "awaiting_approval"
              ? snapshot.review_url
              : snapshot.job_url,
          )
        }
        onDownload={() => open(snapshot.outputs[0]?.download_url || null)}
        onFavorite={() => void toggleFavorite()}
        onExpand={() => open(snapshot.outputs[0]?.url || null)}
        onOpenAsset={(asset) => open(asset.url)}
      />
    </div>
  )
}
