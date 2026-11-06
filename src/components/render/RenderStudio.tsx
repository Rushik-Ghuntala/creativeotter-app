"use client"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { RenderPanel } from "@/components/render/RenderPanel"
import { MotionProjectEditor } from "@/components/render/MotionProjectEditor"
import {
  renderSnapshotSchema,
  type RenderSnapshot,
  type RenderInput,
} from "@/lib/render/contracts"
import { formatCreditUnits } from "@/lib/credits/contracts"
type Props = {
  available: boolean
  prices: { png: string | null; mp4: string | null }
  saved: { id: string; title: string; format: string }[]
}
export const RenderStudio = ({ available, prices, saved }: Props) => {
  const router = useRouter()
  const pendingRenders = useRef(new Set<string>())
  const [savedDesigns, setSavedDesigns] = useState(saved)
  const [snapshot, setSnapshot] = useState<RenderSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const request = useRef<string | null>(null)
  const lastInput = useRef("")
  const read = async (id: string) => {
    const response = await fetch(`/api/render?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return renderSnapshotSchema.parse(data)
  }
  const open = async (id: string) => {
    try {
      setSnapshot(await read(id))
      setError("")
    } catch {
      setError("We couldn’t open that saved design. Please try again.")
    }
  }
  const create = async (input: RenderInput) => {
    setBusy(true)
    setError("")
    const fingerprint = JSON.stringify(input)
    if (lastInput.current !== fingerprint || !request.current) {
      request.current = crypto.randomUUID()
      lastInput.current = fingerprint
    }
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, request_key: request.current }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.code === "quote_expired") request.current = null
        throw new Error(data.error)
      }
      const next = renderSnapshotSchema.parse(data)
      setSnapshot(next)
      if (["queued", "running", "saving"].includes(next.state))
        pendingRenders.current.add(next.render_id)
      router.refresh()
      request.current = null
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn’t start your design.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="render-studio">
      <div>
        <MotionProjectEditor
          disabled={
            !available ||
            busy ||
            Boolean(
              snapshot &&
              ["queued", "running", "saving"].includes(snapshot.state),
            )
          }
          price={prices.mp4 ? formatCreditUnits(prices.mp4) : null}
          onRender={create}
        />
        {!available && (
          <p>
            Video rendering is not available for this workspace yet. You can
            still save editable projects.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <aside style={{ marginTop: 20 }}>
          <h3>Your saved designs</h3>
          {savedDesigns.length ? (
            savedDesigns.map((item) => (
              <button
                key={item.id}
                className="saved-design"
                onClick={() => {
                  void open(item.id)
                }}
              >
                {item.title} ·{" "}
                {item.format === "mp4" ? "Motion graphic" : "Image"}
              </button>
            ))
          ) : (
            <p>Your finished designs will be kept here.</p>
          )}
        </aside>
      </div>
      <div>
        {snapshot ? (
          <RenderPanel
            key={snapshot.render_id}
            initial={snapshot}
            refresh={() => read(snapshot.render_id)}
            onSnapshot={(item) => {
              if (
                ["succeeded", "failed"].includes(item.state) &&
                pendingRenders.current.delete(item.render_id)
              )
                router.refresh()
              setSnapshot((current) =>
                current?.render_id === item.render_id &&
                current.state !== item.state
                  ? item
                  : current,
              )
              if (!item.saved) return
              setSavedDesigns((previous) =>
                previous.some((design) => design.id === item.render_id)
                  ? previous
                  : [
                      {
                        id: item.render_id,
                        title: item.title,
                        format: item.format,
                      },
                      ...previous,
                    ],
              )
            }}
          />
        ) : (
          <div className="render-empty">
            <span>✳</span>
            <h3>A little idea. A beautiful result.</h3>
            <p>
              Create a motion graphic or open a saved one to preview and
              download it here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
