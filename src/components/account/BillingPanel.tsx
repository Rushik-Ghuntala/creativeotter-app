"use client"
import { useState } from "react"
import Link from "next/link"
import {
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  ReceiptText,
} from "lucide-react"
import { unitsToCredits } from "@/lib/studio/contracts"
type LedgerRow = {
  id: string
  kind: string
  amount_units: number
  note: string
  created_at: string
  job_id: string | null
  native_generation_id: string | null
}
type BillingPanelProps = { rows: LedgerRow[]; balance: string | null }
export const BillingPanel = ({ rows, balance }: BillingPanelProps) => {
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0)
  const filtered = rows.filter((x) => filter === "all" || x.kind === filter),
    visible = filtered.slice(page * 15, (page + 1) * 15)
  return (
    <div>
      <div className="section-subheading billing-heading">
        <div>
          <h2>Billing</h2>
          <p>
            Balance: <strong>{balance ?? "—"} credits</strong>
          </p>
        </div>
        <Link
          href="/account"
          className="button-secondary"
        >
          Add credits
        </Link>
      </div>
      <section className="panel billing-portal">
        <ReceiptText size={24} />
        <div>
          <h3>Billing portal</h3>
          <p>
            Receipts and payment details will appear when paid checkout is
            enabled.
          </p>
        </div>
        <span className="status-badge">Purchases disabled</span>
      </section>
      <div className="section-subheading billing-heading">
        <div>
          <h2>Billing activity</h2>
          <p>
            Grants, reservations, final charges and releases from your workspace
            ledger.
          </p>
        </div>
        <a
          href="/api/account/ledger"
          className="button-secondary"
        >
          <Download size={14} />
          Export ledger CSV
        </a>
      </div>
      <div className="billing-toolbar">
        <label htmlFor="ledger-filter">Show</label>
        <select
          id="ledger-filter"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="all">All activity</option>
          <option value="charge">Charges</option>
          <option value="grant">Credits added</option>
          <option value="reserve">Reservations</option>
          <option value="release">Releases</option>
        </select>
        <span>{filtered.length} entries loaded</span>
      </div>
      <div className="ledger-list">
        {visible.map((row) => (
          <div
            key={row.id}
            className="ledger-row"
          >
            <div className={`ledger-icon ${row.kind}`}>
              {row.kind === "grant" || row.kind === "release" ? (
                <ArrowDownLeft size={18} />
              ) : (
                <ArrowUpRight size={18} />
              )}
            </div>
            <div>
              <strong>
                {row.kind === "charge"
                  ? "Image generation"
                  : row.kind === "grant"
                    ? "Credits added"
                    : row.kind === "reserve"
                      ? "Credits reserved"
                      : "Reservation released"}
              </strong>
              <p>{row.note}</p>
              <small>
                {new Date(row.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </small>
            </div>
            <strong className="ledger-amount">
              {row.kind === "charge" ? "−" : row.kind === "grant" ? "+" : ""}
              {unitsToCredits(row.amount_units)}
              <small> cr</small>
            </strong>
            {row.native_generation_id && (
              <Link
                className="ledger-open"
                href={`/studio/native/${row.native_generation_id}`}
              >
                View ↗
              </Link>
            )}
          </div>
        ))}
        {!visible.length && (
          <p className="empty-inline">No matching activity yet.</p>
        )}
      </div>
      {filtered.length > 15 && (
        <div className="pagination">
          <button
            className="button-secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.ceil(filtered.length / 15)}
          </span>
          <button
            className="button-secondary"
            disabled={(page + 1) * 15 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      <p className="small-muted">
        The latest {rows.length} ledger entries are shown here. CSV export
        includes the full ledger. Viewing or downloading existing media does not
        spend credits.
      </p>
    </div>
  )
}
