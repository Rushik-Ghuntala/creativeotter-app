import { formatCreditUnits } from "@/lib/credits/contracts"
import { useState } from "react"
import {
  Maximize2,
  Star,
  Download,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react"
import { GenerationInputs } from "@/components/generation/GenerationInputs"
import { GenerationOutput } from "@/components/generation/GenerationOutput"
import type { GenerationSnapshot, DisplayAsset } from "@/lib/media/contracts"

type GenerationPanelProps = {
  snapshot: GenerationSnapshot
  busy: boolean
  notice: string
  canExpand?: boolean
  onRefresh: () => void
  onReview: () => void
  onDownload: () => void
  onFavorite: () => void
  onExpand: () => void
  onOpenAsset: (asset: DisplayAsset) => void
}
export const GenerationPanel = ({
  snapshot,
  busy,
  notice,
  canExpand,
  onRefresh,
  onReview,
  onDownload,
  onFavorite,
  onExpand,
  onOpenAsset,
}: GenerationPanelProps) => {
  const [tab, setTab] = useState<"output" | "inputs">("output")
  const output = snapshot.outputs[0]
  const ready = snapshot.state === "succeeded" && Boolean(output)
  const heading = ready
    ? "Image ready"
    : snapshot.state === "awaiting_approval"
      ? "Review your image"
      : snapshot.state === "awaiting_upload"
        ? "Save your image"
        : snapshot.state === "saving"
          ? "Saving your image"
          : ["failed", "needs_reconciliation", "expired"].includes(
                snapshot.state,
              )
            ? "Image needs attention"
            : "Generating your image"
  return (
    <main className="generation-shell">
      <header className="gen-header">
        <div>
          <p className="gen-brand">
            CreativeOtter <span>✳</span>
          </p>
          <h1>{heading}</h1>
          <p className="gen-subtitle">
            <span>{snapshot.model_name}</span>
            <span className="gen-separator">·</span>
            <strong>
              {snapshot.execution_source === "native"
                ? "Native tool · 0 credits"
                : snapshot.credit_units
                  ? `${formatCreditUnits(snapshot.credit_units)} credits${snapshot.credit_status === "reserved" ? " reserved" : snapshot.credit_status === "charged" ? " charged" : snapshot.credit_status === "released" ? " released" : " quoted"}`
                  : "Credit price unavailable"}
            </strong>
          </p>
        </div>
        <div className="gen-header-actions">
          <button
            className="gen-icon-button"
            aria-label="Refresh image"
            onClick={onRefresh}
            disabled={busy}
          >
            <RefreshCw
              className={busy ? "gen-spin" : ""}
              size={16}
            />
          </button>
          {canExpand && (
            <button
              className="gen-icon-button"
              aria-label="Expand image"
              onClick={onExpand}
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      </header>
      <div
        className="gen-tabs"
        role="tablist"
        aria-label="Image view"
      >
        {(["output", "inputs"] as const).map((name) => (
          <button
            key={name}
            id={`tab-${name}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls={`generation-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              if (
                ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault()
                const next =
                  event.key === "Home"
                    ? "output"
                    : event.key === "End"
                      ? "inputs"
                      : tab === "output"
                        ? "inputs"
                        : "output"
                setTab(next)
                document.getElementById(`tab-${next}`)?.focus()
              }
            }}
          >
            {name === "output" ? "Output" : "Inputs"}
          </button>
        ))}
      </div>
      {notice && (
        <p
          className="gen-notice"
          role="alert"
        >
          {notice}
        </p>
      )}
      <div aria-busy={busy}>
        {tab === "output" ? (
          <GenerationOutput
            snapshot={snapshot}
            onReview={onReview}
            onRefresh={onRefresh}
          />
        ) : (
          <GenerationInputs
            snapshot={snapshot}
            onOpenAsset={onOpenAsset}
          />
        )}
      </div>
      {ready && (
        <div className="gen-toolbar">
          <span className="gen-output-size">
            {output.width && output.height
              ? `${output.width} × ${output.height}`
              : "Saved image"}
          </span>
          <div>
            <button
              className={`gen-icon-button ${output.favorite ? "gen-favorited" : ""}`}
              aria-label={output.favorite ? "Remove favorite" : "Save favorite"}
              aria-pressed={output.favorite}
              onClick={onFavorite}
              disabled={busy}
            >
              <Star
                size={17}
                fill={output.favorite ? "currentColor" : "none"}
              />
            </button>
            <button
              className="gen-download"
              onClick={onDownload}
            >
              <Download
                size={16}
                aria-hidden="true"
              />
              Download
            </button>
          </div>
        </div>
      )}
      <footer className="gen-footer">
        <p>
          {snapshot.execution_source === "native"
            ? "0 CreativeOtter credits. Made with your assistant’s native tool; host usage limits may apply."
            : "Provider credits are reserved on approval and charged after a saved output. Confirmed failures release the reservation; uncertain outcomes stay reserved for review."}
        </p>
        {snapshot.job_url && (
          <button
            className="gen-text-button"
            onClick={onReview}
          >
            Open in CreativeOtter
            <ArrowUpRight
              size={13}
              aria-hidden="true"
            />
          </button>
        )}
      </footer>
    </main>
  )
}
