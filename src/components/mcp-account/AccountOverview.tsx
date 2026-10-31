/* eslint-disable @next/next/no-img-element -- MCP iframe embeds an optimized image and does not run inside Next.js. */
import { formatCreditUnits } from "@/lib/credits/contracts"
import { ArrowRight, Check, ShieldCheck } from "lucide-react"
import { AccountRow } from "@/components/mcp-account/AccountRow"
import type { AccountSnapshot } from "@/lib/mcp/account"

type AccountOverviewProps = {
  account: AccountSnapshot
  connectionIssue: boolean
  icon: string
  onActivity: () => void
  onSettings: () => void
}

export const AccountOverview = ({
  account,
  connectionIssue,
  icon,
  onActivity,
  onSettings,
}: AccountOverviewProps) => (
  <div
    id="panel-overview"
    role="tabpanel"
    aria-labelledby="tab-overview"
    className="panel"
  >
    <section
      className="connection-card"
      aria-label="Workspace connection"
    >
      <div className="hero-content">
        <p className="eyebrow hero-eyebrow">
          <span className="status-dot" />
          {connectionIssue
            ? "CONNECTION NEEDS ATTENTION"
            : "YOUR WORKSPACE IS READY"}
        </p>
        <h1>
          {connectionIssue ? "Let’s get you" : "Good ideas."}
          <br />
          {connectionIssue ? "reconnected." : "Great company."}
        </h1>
        <p className="hero-subtitle">
          Your assistants. Your studio. One connection.
        </p>
        <span className="connection-pill">
          <Check
            size={14}
            aria-hidden="true"
          />
          {connectionIssue
            ? "Reconnect CreativeOtter from your assistant"
            : `Connected to ${account.workspace.name}`}
        </span>
      </div>
      <img
        className="hero-otter"
        src={icon}
        alt=""
      />
      <span className="hero-orbit orbit-one" />
      <span className="hero-orbit orbit-two" />
    </section>
    <section
      className="account-rows"
      aria-label="Account overview"
    >
      <AccountRow
        label="CREDIT BALANCE"
        value={
          account.balance
            ? `${formatCreditUnits(account.balance.available_units)} credits available`
            : "Credit balance unavailable"
        }
        detail={
          account.balance
            ? `${formatCreditUnits(account.balance.reserved_units)} reserved · ${formatCreditUnits(account.balance.spent_units)} used. Native and API generations spend CreativeOtter credits. Purchases are not enabled.`
            : "Reconnect to retrieve your actual credit account."
        }
      />
      <AccountRow
        label="GENERATION PREFERENCE"
        value="Native first. Generate on request."
        detail={
          account.native_output_import
            ? "Requested images start directly after a balance check and credit reservation."
            : "Configure native credit pricing and media access before starting native work."
        }
        action="View settings"
        onAction={onSettings}
      />
      <AccountRow
        label="ACCOUNT ACTIVITY"
        value="Your creative history, all together"
        detail={
          account.activity.length
            ? `${account.activity.length} recent image requests in this workspace.`
            : "Save an image to start your creative history."
        }
        action="Open activity"
        onAction={onActivity}
      />
    </section>
    <div className="connection-note">
      <ShieldCheck
        size={16}
        aria-hidden="true"
      />
      <span>
        Requested native and API images spend CreativeOtter credits
        automatically.
      </span>
      <ArrowRight
        size={14}
        aria-hidden="true"
      />
    </div>
  </div>
)
