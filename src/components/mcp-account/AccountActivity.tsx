import { formatCreditUnits } from "@/lib/credits/contracts"
import { Clock3 } from "lucide-react"
import type { AccountSnapshot } from "@/lib/mcp/account"

export const AccountActivity = ({ account }: { account: AccountSnapshot }) => (
  <section
    id="panel-activity"
    role="tabpanel"
    aria-labelledby="tab-activity"
    className="panel activity-panel"
  >
    <div className="section-heading">
      <div>
        <p className="eyebrow">YOUR CREATIVE HISTORY</p>
        <h2>Made along the way.</h2>
      </div>
      <Clock3
        size={24}
        aria-hidden="true"
      />
    </div>
    {account.activity.length ? (
      <div className="account-rows">
        {account.activity.map((item) => (
          <div
            className="account-row"
            key={item.id}
          >
            <div>
              <p className="eyebrow">
                {item.source === "native" ? "NATIVE TOOL" : "PROVIDER"}
              </p>
              <strong>{item.title}</strong>
              <p>
                {item.state.replaceAll("_", " ")} ·{" "}
                {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty-state">
        <h3>Your next chapter starts here.</h3>
        <p>
          {account.permissions.includes("media:read")
            ? "No saved image requests yet. Your creations will appear here."
            : "Enable media access from your account to see your private image history."}
        </p>
      </div>
    )}
    {Boolean(account.balance?.history.length) && (
      <div
        className="account-rows"
        aria-label="Credit activity"
      >
        {account.balance?.history.map((item) => (
          <div
            className="account-row"
            key={item.id}
          >
            <div>
              <p className="eyebrow">{item.kind}</p>
              <strong>{formatCreditUnits(item.amount_units)} credits</strong>
              <p>{item.note}</p>
            </div>
          </div>
        ))}
      </div>
    )}
    <p className="empty-caption">
      Native host usage and provider estimates are separate. Credits are
      reserved when generation starts; confirmed failures release them.
      Purchases are not enabled.
    </p>
  </section>
)
