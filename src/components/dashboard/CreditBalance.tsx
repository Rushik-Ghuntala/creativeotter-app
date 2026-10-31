import type { CreditSummary } from "@/lib/credits/contracts"
import { formatCreditUnits } from "@/lib/credits/contracts"

type CreditBalanceProps = { summary: CreditSummary | null }
export const CreditBalance = ({ summary }: CreditBalanceProps) => (
  <section className="mt-8 rounded-3xl bg-[#102f28] p-7 text-white">
    <p className="text-xs uppercase tracking-[.18em] text-emerald-100/70">
      Available balance
    </p>
    <h2 className="mt-3 text-4xl font-semibold">
      {summary
        ? `${formatCreditUnits(summary.available_units)} credits`
        : "Balance unavailable"}
    </h2>
    <p className="mt-3 text-sm leading-6 text-emerald-100/80">
      {summary
        ? `${formatCreditUnits(summary.reserved_units)} reserved · ${formatCreditUnits(summary.spent_units)} used. `
        : "Refresh to retrieve your actual credit account. "}
      Native images use 0 CreativeOtter credits. API generation reserves credits
      before starting and charges after delivery. Credit purchases are not
      enabled.
    </p>
  </section>
)
