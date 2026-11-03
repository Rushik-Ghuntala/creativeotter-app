import Link from "next/link"
import { ActionForm } from "@/components/common/ActionForm"
import {
  saveProfileAction,
  saveWorkspaceAction,
  savePreferencesAction,
  supportRequestAction,
} from "@/lib/studio/actions"
import { ConnectedClient } from "@/components/dashboard/ConnectedClient"
import { signOut } from "@/lib/auth/actions"
import type { ClientGrant } from "@/lib/database.types"
import type {
  WorkspacePreferences,
  SupportRequest,
} from "@/lib/studio/contracts"
type SettingsPanelProps = {
  name: string
  email: string
  workspaceName: string
  preferences: WorkspacePreferences | null
  grants: ClientGrant[]
  requests: SupportRequest[]
  admin: boolean
}
export const SettingsPanel = ({
  name,
  email,
  workspaceName,
  preferences,
  grants,
  requests,
  admin,
}: SettingsPanelProps) => (
  <div className="settings-grid">
    <section className="panel">
      <h2>Profile</h2>
      <p>Your identity in CreativeOtter.</p>
      <ActionForm action={saveProfileAction}>
        <label>
          Display name
          <input
            name="display_name"
            defaultValue={name}
            required
            maxLength={80}
          />
        </label>
        <label>
          Email
          <input
            value={email}
            readOnly
          />
        </label>
      </ActionForm>
    </section>
    <section className="panel">
      <h2>Workspace</h2>
      <p>Your private creative home.</p>
      <ActionForm action={saveWorkspaceAction}>
        <label>
          Workspace name
          <input
            name="workspace_name"
            defaultValue={workspaceName}
            required
            maxLength={80}
            disabled={!admin}
          />
        </label>
        {!admin && (
          <p className="small-muted">
            Only administrators can change workspace settings.
          </p>
        )}
      </ActionForm>
    </section>
    <section className="panel full-width">
      <h2>Generation preferences</h2>
      <p>
        Native first. Images you request start directly and spend CreativeOtter
        credits using the configured price.
      </p>
      <div className="notice-inline">
        Paid API generation is disabled. Your connected assistant can use
        suitable native image tools through the existing billed workflow.
      </div>
      <ActionForm action={savePreferencesAction}>
        <fieldset disabled={!admin}>
          <legend>Video generation preference</legend>
          <label className="radio-option">
            <input
              type="radio"
              name="video_mode"
              value="review"
              defaultChecked={preferences?.video_mode !== "auto"}
            />
            <span>
              <strong>Review</strong>
              <small>Review a video plan before starting.</small>
            </span>
          </label>
          <label className="radio-option">
            <input
              type="radio"
              name="video_mode"
              value="auto"
              defaultChecked={preferences?.video_mode === "auto"}
            />
            <span>
              <strong>Auto</strong>
              <small>
                Start when explicitly requested. Saved for when video is
                enabled.
              </small>
            </span>
          </label>
        </fieldset>
      </ActionForm>
    </section>
    <section
      className="panel full-width"
      id="connected-applications"
    >
      <h2>Connected assistants</h2>
      <p>Manage which assistants can use your workspace.</p>
      {grants.length ? (
        <ul>
          {grants.map((grant) => (
            <ConnectedClient
              key={grant.id}
              grant={grant}
            />
          ))}
        </ul>
      ) : (
        <p className="empty-inline">
          No connected assistants yet.{" "}
          <Link href="/connect">Connect Codex or Claude ↗</Link>
        </p>
      )}
    </section>
    <section className="panel">
      <h2>Current session</h2>
      <p>Signed in as {email}.</p>
      <form action={signOut}>
        <button
          type="submit"
          className="button-secondary"
        >
          Sign out of this device
        </button>
      </form>
    </section>
    <section className="panel">
      <h2>Your data</h2>
      <p>
        Request help or ask the operator to delete your data. Requests are saved
        privately for manual review.
      </p>
      <ActionForm
        action={supportRequestAction}
        submitLabel="Save request"
      >
        <label>
          Request type
          <select name="category">
            <option value="support">Support</option>
            <option value="deletion">Data deletion request</option>
          </select>
        </label>
        <label>
          Details
          <textarea
            name="message"
            required
            maxLength={4000}
            placeholder="How can we help?"
          />
        </label>
      </ActionForm>
      {requests.length > 0 && (
        <ul className="request-list">
          {requests.map((r) => (
            <li key={r.id}>
              <strong>
                {r.category === "deletion"
                  ? "Deletion request"
                  : "Support request"}
              </strong>
              <span>{r.status.replaceAll("_", " ")}</span>
              <small>{new Date(r.created_at).toLocaleDateString()}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  </div>
)
