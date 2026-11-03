"use client"
import { switchWorkspaceAction } from "@/lib/studio/actions"
type WorkspaceSwitcherProps = {
  workspaces: { id: string; name: string }[]
  current: string
}
export const WorkspaceSwitcher = ({
  workspaces,
  current,
}: WorkspaceSwitcherProps) => (
  <form
    className="workspace-switcher"
    action={switchWorkspaceAction}
  >
    <label htmlFor="active-workspace">Workspace</label>
    <select
      id="active-workspace"
      name="workspace_id"
      defaultValue={current}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {workspaces.map((w) => (
        <option
          key={w.id}
          value={w.id}
        >
          {w.name}
        </option>
      ))}
    </select>
  </form>
)
