import { ActionForm } from "@/components/common/ActionForm"
import { saveRecordAction } from "@/lib/studio/actions"
import { studioSections } from "@/lib/studio/config"
import type { StudioSection, StudioRecord } from "@/lib/studio/contracts"
type RecordEditorProps = {
  section: StudioSection
  record?: StudioRecord
  assets: { id: string; label: string }[]
  initialName?: string
  initialBrief?: string
}
export const RecordEditor = ({
  section,
  record,
  assets,
  initialName = "",
  initialBrief = "",
}: RecordEditorProps) => {
  const config = studioSections[section],
    values: Record<string, unknown> = record
      ? Object.fromEntries(Object.entries(record))
      : {}
  const value = (name: string) =>
    name === "budget"
      ? typeof values.budget_target_units === "number"
        ? String(values.budget_target_units / 1000)
        : ""
      : name === "colors"
        ? ((values.colors as string[]) || []).join(", ")
        : String(
            values[name] ??
              (name === "language"
                ? "en-US"
                : name === "status"
                  ? "draft"
                  : name === "identity_type"
                    ? "fictional"
                    : name === "aspect_ratio"
                      ? "9:16"
                      : ""),
          )
  return (
    <section className="panel record-editor">
      <ActionForm
        action={saveRecordAction}
        submitLabel={record ? "Save changes" : `Save ${config.singular}`}
      >
        <input
          type="hidden"
          name="section"
          value={section}
        />
        {record && (
          <input
            type="hidden"
            name="id"
            value={record.id}
          />
        )}
        <label>
          Name
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={record?.name || initialName}
            placeholder={`Name your ${config.singular}`}
          />
        </label>
        <label>
          {section === "films" ? "Story / brief" : "Description"}
          <textarea
            name="description"
            maxLength={
              section === "films" ||
              section === "music" ||
              section === "projects"
                ? 8000
                : 4000
            }
            defaultValue={record?.description || initialBrief}
            placeholder="What should your assistant know?"
            rows={4}
          />
        </label>
        {config.fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                name={f.name}
                defaultValue={value(f.name)}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                rows={4}
              />
            ) : f.type === "select" ? (
              <select
                name={f.name}
                defaultValue={value(f.name)}
              >
                {f.options?.map((o) => (
                  <option
                    key={o.value}
                    value={o.value}
                  >
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "asset" ? (
              <select
                name={f.name}
                defaultValue={value(f.name)}
              >
                <option value="">No image selected</option>
                {assets.map((a) => (
                  <option
                    key={a.id}
                    value={a.id}
                  >
                    {a.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type === "number" ? "number" : "text"}
                defaultValue={value(f.name)}
                min={f.type === "number" ? 0 : undefined}
                max={f.type === "number" ? 1000000000 : undefined}
                step={f.type === "number" ? "0.001" : undefined}
                maxLength={f.maxLength}
                required={f.required}
                placeholder={f.placeholder}
              />
            )}
          </label>
        ))}
        {section === "characters" && (
          <p className="small-muted">
            Save only your own likeness, fictional characters, or people who
            have given you permission. Saving a reference does not clone a voice
            or train a model.
          </p>
        )}
        {(section === "films" ||
          section === "music" ||
          section === "projects") && (
          <p className="small-muted">
            Saving a brief costs no credits. Budget targets are for planning and
            do not enforce a generation spending cap.
          </p>
        )}
      </ActionForm>
    </section>
  )
}
