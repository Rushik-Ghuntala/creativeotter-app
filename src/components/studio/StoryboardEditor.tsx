import { ActionForm } from "@/components/common/ActionForm"
import { saveShotAction, removeShotAction } from "@/lib/studio/actions"
import type { StudioShot } from "@/lib/studio/contracts"
type StoryboardEditorProps = {
  projectId: string
  shots: StudioShot[]
  assets: { id: string; label: string }[]
}
export const StoryboardEditor = ({
  projectId,
  shots,
  assets,
}: StoryboardEditorProps) => (
  <section className="storyboard-section">
    <div className="section-subheading">
      <h2>Storyboard</h2>
      <p>
        {shots.length} shots ·{" "}
        {shots.reduce((sum, s) => sum + s.duration_seconds, 0)} seconds planned.
        Saving shots does not generate video.
      </p>
    </div>
    <div className="shot-grid">
      {shots.map((shot) => (
        <section
          className="panel shot-card"
          key={shot.id}
        >
          <p className="eyebrow">
            Shot {String(shot.position).padStart(2, "0")}
          </p>
          <ActionForm
            action={saveShotAction}
            submitLabel="Update shot"
          >
            <input
              type="hidden"
              name="id"
              value={shot.id}
            />
            <input
              type="hidden"
              name="project_id"
              value={projectId}
            />
            <div className="form-row">
              <label>
                Shot number
                <input
                  name="position"
                  type="number"
                  min={1}
                  max={1000}
                  required
                  defaultValue={shot.position}
                />
              </label>
              <label>
                Seconds
                <input
                  name="duration_seconds"
                  type="number"
                  min={1}
                  max={120}
                  required
                  defaultValue={shot.duration_seconds}
                />
              </label>
            </div>
            <label>
              Visual direction
              <textarea
                name="prompt"
                required
                maxLength={4000}
                defaultValue={shot.prompt}
              />
            </label>
            <label>
              Narration
              <textarea
                name="narration"
                maxLength={4000}
                defaultValue={shot.narration}
              />
            </label>
            <label>
              Reference
              <select
                name="reference_asset_id"
                defaultValue={shot.reference_asset_id || ""}
              >
                <option value="">None</option>
                {assets.map((a) => (
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
          <ActionForm
            action={removeShotAction}
            submitLabel="Remove shot"
            danger
          >
            <input
              type="hidden"
              name="id"
              value={shot.id}
            />
          </ActionForm>
        </section>
      ))}
    </div>
    <details
      className="panel add-shot"
      open={shots.length === 0}
    >
      <summary>Add a shot</summary>
      <ActionForm
        action={saveShotAction}
        submitLabel="Save shot"
      >
        <input
          type="hidden"
          name="project_id"
          value={projectId}
        />
        <div className="form-row">
          <label>
            Shot number
            <input
              name="position"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={Math.max(0, ...shots.map((s) => s.position)) + 1}
            />
          </label>
          <label>
            Seconds
            <input
              name="duration_seconds"
              type="number"
              min={1}
              max={120}
              required
              defaultValue={5}
            />
          </label>
        </div>
        <label>
          Visual direction
          <textarea
            name="prompt"
            required
            maxLength={4000}
            placeholder="What happens in this shot?"
          />
        </label>
        <label>
          Narration
          <textarea
            name="narration"
            maxLength={4000}
            placeholder="Exact spoken words, if any"
          />
        </label>
        <label>
          Reference
          <select name="reference_asset_id">
            <option value="">None</option>
            {assets.map((a) => (
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
    </details>
  </section>
)
