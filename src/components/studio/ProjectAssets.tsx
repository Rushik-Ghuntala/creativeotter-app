import Image from "next/image"
import { ActionForm } from "@/components/common/ActionForm"
import { attachAssetAction, detachAssetAction } from "@/lib/studio/actions"
import { unitsToCredits } from "@/lib/studio/contracts"
import type { DisplayAsset } from "@/lib/media/contracts"
type ProjectAssetsProps = {
  projectId: string
  assets: DisplayAsset[]
  available: { id: string; label: string }[]
  chargedUnits: string
  budget: number | null
}
export const ProjectAssets = ({
  projectId,
  assets,
  available,
  chargedUnits,
  budget,
}: ProjectAssetsProps) => (
  <section className="project-assets">
    <div className="section-subheading">
      <h2>Project assets & costs</h2>
      <p>
        <strong>{unitsToCredits(chargedUnits)} credits</strong> in original
        charges assigned to this project
        {budget !== null
          ? ` · ${unitsToCredits(budget)} credit planning target`
          : ""}
        . Attaching an existing image is free.
      </p>
    </div>
    <ActionForm
      action={attachAssetAction}
      submitLabel="Attach saved asset"
      className="panel"
    >
      <input
        type="hidden"
        name="project_id"
        value={projectId}
      />
      <label>
        Saved asset
        <select
          name="asset_id"
          required
        >
          <option value="">Choose from your private library</option>
          {available
            .filter((a) => !assets.some((x) => x.id === a.id))
            .map((a) => (
              <option
                key={a.id}
                value={a.id}
              >
                {a.label}
              </option>
            ))}
        </select>
      </label>
    </ActionForm>
    <div className="project-asset-grid">
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="panel"
        >
          <Image
            src={asset.url}
            width={400}
            height={400}
            alt={asset.label}
            unoptimized
          />
          <h3>{asset.label}</h3>
          <div className="button-row">
            <a
              href={asset.download_url}
              className="button-secondary"
              download
            >
              Download
            </a>
            <ActionForm
              action={detachAssetAction}
              submitLabel="Remove assignment"
              danger
            >
              <input
                type="hidden"
                name="project_id"
                value={projectId}
              />
              <input
                type="hidden"
                name="asset_id"
                value={asset.id}
              />
            </ActionForm>
          </div>
        </div>
      ))}
    </div>
  </section>
)
