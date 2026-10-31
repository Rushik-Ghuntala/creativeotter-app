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
        value={
          account.permissions.includes("media:prepare")
            ? "Account and media generation"
            : "Read-only account access"
        }
        detail={
          account.permissions.includes("media:prepare")
            ? "Can save private images and start requested generations using CreativeOtter credits."
            : "Enable media access from your account to save images and prepare quotes."
        }
      />
      <AccountRow
        label="GENERATION PREFERENCE"
        value="Native first"
        detail={
          account.media_generation
            ? "API image fallback is configured. Requested images start directly and spend credits."
            : "Native generation requires pricing and sufficient credits. API fallback also needs provider configuration and a budget."
        }
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
