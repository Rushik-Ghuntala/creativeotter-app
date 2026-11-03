import { UsersRound } from "lucide-react"
import { z } from "zod"
import { ActionForm } from "@/components/common/ActionForm"
import { createInviteAction, revokeInviteAction } from "@/lib/studio/actions"
import type { Json } from "@/lib/database.types"
const memberSchema = z.array(
  z.object({
    user_id: z.string(),
    role: z.string(),
    display_name: z.string(),
    email: z.string().nullable(),
    created_at: z.string(),
  }),
)
type TeamPanelProps = {
  members: Json
  invites: {
    id: string
    email: string
    role: string
    expires_at: string
    accepted_at: string | null
    revoked_at: string | null
  }[]
  admin: boolean
  workspaceName: string
}
export const TeamPanel = ({
  members,
  invites,
  admin,
  workspaceName,
}: TeamPanelProps) => {
  const parsed = memberSchema.safeParse(members),
    rows = parsed.success ? parsed.data : []
  return (
    <div>
      <div className="section-subheading">
        <h2>Create together.</h2>
        <p>
          Share {workspaceName} with your team. Credits and saved assets belong
          to the workspace.
        </p>
      </div>
      <div className="team-layout">
        <section className="panel">
          <h3>
            <UsersRound size={20} />
            Workspace members
          </h3>
          <div className="team-members">
            {rows.map((member) => (
              <div
                key={member.user_id}
                className="team-member"
              >
                <span className="user-initial">
                  {(member.display_name ||
                    member.email ||
                    "?")[0].toUpperCase()}
                </span>
                <div>
                  <strong>{member.display_name || member.email}</strong>
                  <small>{member.email}</small>
                </div>
                <span className="status-badge">{member.role}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>Invite a teammate</h3>
          <p>
            Only the verified email on this invitation can accept it.
            Invitations expire in seven days.
          </p>
          {admin ? (
            <ActionForm
              action={createInviteAction}
              submitLabel="Create private invite"
            >
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  placeholder="teammate@company.com"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="creator">
                    Creator — manage creative work
                  </option>
                  <option value="viewer">
                    Viewer — read workspace content
                  </option>
                </select>
              </label>
            </ActionForm>
          ) : (
            <p className="notice-inline">
              Ask a workspace administrator to invite teammates.
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <h3>Invitations</h3>
        {invites.length ? (
          invites.map((invite) => (
            <div
              className="invite-row"
              key={invite.id}
            >
              <div>
                <strong>{invite.email}</strong>
                <small>
                  {invite.role} · Expires{" "}
                  {new Date(invite.expires_at).toLocaleDateString()}
                </small>
              </div>
              <span className="status-badge">
                {invite.accepted_at
                  ? "Accepted"
                  : invite.revoked_at
                    ? "Revoked"
                    : new Date(invite.expires_at) < new Date()
                      ? "Expired"
                      : "Pending"}
              </span>
              {!invite.accepted_at && !invite.revoked_at && admin && (
                <ActionForm
                  action={revokeInviteAction}
                  submitLabel="Revoke"
                  danger
                >
                  <input
                    type="hidden"
                    name="id"
                    value={invite.id}
                  />
                </ActionForm>
              )}
            </div>
          ))
        ) : (
          <p className="empty-inline">No invitations yet.</p>
        )}
      </section>
    </div>
  )
}
