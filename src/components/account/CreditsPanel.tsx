"use client"
import { useState } from "react"
import Link from "next/link"
import { Check, ShieldCheck, Sparkles } from "lucide-react"
import type { CreditSummary } from "@/lib/credits/contracts"
import { unitsToCredits } from "@/lib/studio/contracts"
const packs = [
  { usd: 10, credits: 1000, bonus: 0, badge: "Most popular" },
  { usd: 50, credits: 5250, bonus: 5 },
  { usd: 100, credits: 11000, bonus: 10 },
  { usd: 250, credits: 28750, bonus: 15 },
  { usd: 500, credits: 62500, bonus: 25, badge: "Best value" },
]
type CreditsPanelProps = { summary: CreditSummary | null; recentUsed: string }
export const CreditsPanel = ({ summary, recentUsed }: CreditsPanelProps) => {
  const [selected, setSelected] = useState(0),
    pack = packs[selected]
  return (
    <div className="credits-panel">
      <div className="account-stats">
        <section className="stat-card">
          <p>Available balance</p>
          <strong>
            {summary ? unitsToCredits(summary.available_units) : "—"}
            <small>credits</small>
          </strong>
          <span>
            {summary
              ? `${unitsToCredits(summary.reserved_units)} reserved · ${unitsToCredits(summary.spent_units)} used in total`
              : "Unable to read your balance"}
          </span>
        </section>
        <section className="stat-card">
          <p>Used in the last 30 days</p>
          <strong>
            {unitsToCredits(recentUsed)}
            <small>credits</small>
          </strong>
          <span>Your native and API image activity, together.</span>
        </section>
        <section className="stat-card">
          <p>Plan</p>
          <strong className="plan-name">Pay as you go</strong>
          <span>No active subscription.</span>
          <Link href="/account?tab=billing">See billing activity ↗</Link>
        </section>
      </div>
      <div className="section-subheading">
        <h2>Add credits</h2>
        <p>
          Choose a pack to preview. Purchases are disabled during this
          development phase.
        </p>
      </div>
      <div className="credit-purchase-layout">
        <div
          className="credit-packs"
          role="radiogroup"
          aria-label="Preview credit packs"
        >
          {packs.map((p, i) => (
            <button
              key={p.usd}
              type="button"
              role="radio"
              aria-checked={i === selected}
              className={`credit-pack ${selected === i ? "selected" : ""}`}
              onClick={() => setSelected(i)}
            >
              {p.badge && (
                <span className={`pack-badge ${p.usd === 500 ? "best" : ""}`}>
                  {p.badge}
                </span>
              )}
              <span className="pack-radio">
                {selected === i && <Check size={13} />}
              </span>
              <strong>${p.usd}</strong>
              <b>
                {p.credits.toLocaleString()} credits{" "}
                {p.bonus > 0 && <small>+{p.bonus}% bonus</small>}
              </b>
              <span>Draft pack · pricing subject to confirmation</span>
            </button>
          ))}
        </div>
        <aside className="order-summary">
          <p>Order preview</p>
          <h3>{pack.credits.toLocaleString()} credits</h3>
          <span>Credit pack preview only</span>
          <div>
            <span>Pack bonus</span>
            <b>+{(pack.credits - pack.usd * 100).toLocaleString()} credits</b>
          </div>
          <div>
            <span>Total</span>
            <strong>${pack.usd}</strong>
          </div>
          <button
            className="button-primary"
            disabled
          >
            Purchases disabled
          </button>
          <p className="small-muted">
            <ShieldCheck size={14} />
            No payment will be collected.
          </p>
        </aside>
      </div>
      <div className="membership-card">
        <div>
          <p className="eyebrow">More room to create</p>
          <h2>A studio that grows with you.</h2>
          <p>
            Shared workspaces, reusable characters, brand kits and one private
            library.
          </p>
          <Link
            className="button-secondary"
            href="/studio"
          >
            Explore your Studio <Sparkles size={15} />
          </Link>
        </div>
        <div>
          <h3>Memberships</h3>
          <p>
            Subscriptions and credit purchases are not enabled. You can keep
            creating with your existing credits through connected assistants.
          </p>
          <button
            disabled
            className="button-secondary"
          >
            Memberships disabled
          </button>
        </div>
      </div>
    </div>
  )
}
