/* eslint-disable @next/next/no-img-element -- Shared isolated MCP iframe and web preview uses signed private media URLs. */
import { useState } from "react"
import type { GenerationSnapshot, DisplayAsset } from "@/lib/media/contracts"

type GenerationInputsProps = {
  snapshot: GenerationSnapshot
  onOpenAsset: (asset: DisplayAsset) => void
}
export const GenerationInputs = ({
  snapshot,
  onOpenAsset,
}: GenerationInputsProps) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <section
      className="gen-inputs"
      id="generation-inputs"
      role="tabpanel"
      aria-labelledby="tab-inputs"
    >
      <div className="gen-input-heading">
        <strong>Prompt</strong>
        <span>Submitted</span>
      </div>
      <p
        className={
          expanded || snapshot.input.prompt.length <= 420
            ? "gen-prompt"
            : "gen-prompt gen-prompt-collapsed"
        }
      >
        {snapshot.input.prompt}
      </p>
      {snapshot.input.prompt.length > 420 && (
        <button
          className="gen-text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : "Read full prompt"}
        </button>
      )}
      <dl className="gen-input-meta">
        <div>
          <dt>Execution</dt>
          <dd>
            {snapshot.execution_source === "native"
              ? "Native assistant tool"
              : "Reviewed provider API"}
          </dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{snapshot.model_name}</dd>
        </div>
        {snapshot.input.aspect_ratio && (
          <div>
            <dt>Requested ratio</dt>
            <dd>{snapshot.input.aspect_ratio}</dd>
          </div>
        )}
        {snapshot.input.resolution && (
          <div>
            <dt>Requested resolution</dt>
            <dd>{snapshot.input.resolution}</dd>
          </div>
        )}
      </dl>
      <div className="gen-reference-heading">
        <strong>References</strong>
        <span>
          {snapshot.references.length}{" "}
          {snapshot.references.length === 1 ? "image" : "images"}
        </span>
      </div>
      {snapshot.references.length ? (
        <div className="gen-references">
          {snapshot.references.map((asset, index) => (
            <button
              className="gen-reference"
              key={asset.id}
              onClick={() => onOpenAsset(asset)}
            >
              <img
                src={asset.url}
                alt={`Reference ${index + 1}: ${asset.label}`}
                loading="lazy"
              />
              <strong>Reference {index + 1}</strong>
              <span>Tap to expand</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="gen-muted gen-no-references">
          No saved reference images were attached to this record.
        </p>
      )}
    </section>
  )
}
