import { LockKeyhole } from "lucide-react"
import { AccountRow } from "@/components/mcp-account/AccountRow"
import type { AccountSnapshot } from "@/lib/mcp/account"

type AccountSettingsProps = {
  account: AccountSnapshot
  onOpenAccount: () => void
}

export const AccountSettings = ({
  account,
  onOpenAccount,
}: AccountSettingsProps) => (
  <section
    id="panel-settings"
    role="tabpanel"
    aria-labelledby="tab-settings"
    className="panel"
  >
    <div className="section-heading">
      <div>
        <p className="eyebrow">MADE FOR YOUR WORKFLOW</p>
        <h2>Your workspace, your rules.</h2>
      </div>
      <LockKeyhole
        className="settings-lock"
        size={24}
        aria-hidden="true"
      />
    </div>
    <div className="account-rows">
      <AccountRow
        label="WORKSPACE"
        value={account.workspace.name}
        detail={`Your role: ${account.role}`}
      />
      <AccountRow
        label="ASSISTANT ACCESS"
        value="Read-only account access"
        detail="Can view your workspace and enabled capabilities."
      />
      <AccountRow
        label="GENERATION PREFERENCE"
        value="Review before generating"
        detail="Generation and preference changes are coming soon."
      />
      <AccountRow
        label="CONNECTED APPLICATIONS"
        value="You’re in control of this connection"
        detail="Manage or disconnect assistants from your account."
        action="Manage access"
        onAction={onOpenAccount}
      />
    </div>
  </section>
)
