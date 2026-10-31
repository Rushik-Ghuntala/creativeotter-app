/* eslint-disable @next/next/no-img-element -- Signed media preview runs inside an isolated iframe without Next image optimization. */
import { useState } from "react"
import { Check, ImageIcon, LoaderCircle, AlertCircle } from "lucide-react"
import type { GenerationSnapshot } from "@/lib/media/contracts"

type GenerationOutputProps = {
  snapshot: GenerationSnapshot
  onRefresh: () => void
}
export const GenerationOutput = ({
  snapshot,
  onRefresh,
}: GenerationOutputProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const output = snapshot.outputs[0]
  const ready = snapshot.state === "succeeded" && Boolean(output)
  const review = snapshot.state === "awaiting_approval"
  const saving = snapshot.state === "saving" || snapshot.state === "save_failed"
  const problem = [
    "failed",
    "needs_reconciliation",
    "expired",
    "cancelled",
  ].includes(snapshot.state)
  return (
    <section
      id="generation-output"
      role="tabpanel"
      aria-labelledby="tab-output"
    >
      {ready && output && failedUrl !== output.url ? (
        <div className="gen-image-frame">
          <img
            className="gen-result-image"
            src={output.url}
            alt={snapshot.input.prompt}
            onError={() => setFailedUrl(output.url)}
          />
          <span className="gen-saved-badge">
            <Check
              size={12}
              aria-hidden="true"
            />
            Saved privately
          </span>
        </div>
      ) : (
        <div className="gen-pending-frame">
          <span
            className={`gen-state-icon ${problem ? "gen-state-error" : ""}`}
          >
            {problem ? (
              <AlertCircle size={27} />
            ) : review || snapshot.state === "awaiting_upload" || ready ? (
              <ImageIcon size={27} />
            ) : (
              <LoaderCircle
                className="gen-spin"
                size={27}
              />
            )}
          </span>
          <h2>
            {ready
              ? "Refresh your image link"
              : review
                ? "Your image quote is ready"
                : snapshot.state === "awaiting_generation"
                  ? "Ready for your assistant"
                  : snapshot.state === "cancelled"
                    ? "Request cancelled"
                    : snapshot.state === "awaiting_upload"
                      ? "Save your native image"
                      : problem
                        ? "This request needs attention"
                        : saving
                          ? "Saving your image"
                          : "Creating your image"}
          </h2>
          <p>
            {ready
              ? "The stored image link needs refreshing. This opens the saved result without generating again."
              : snapshot.error || snapshot.message}
          </p>
          <button
            className="gen-secondary"
            onClick={onRefresh}
          >
            Refresh existing result
          </button>
          {review && (
            <span className="gen-fine-print">
              Your assistant can start this requested image directly. A quote
              alone spends no credits.
            </span>
          )}
        </div>
      )}
    </section>
  )
}
