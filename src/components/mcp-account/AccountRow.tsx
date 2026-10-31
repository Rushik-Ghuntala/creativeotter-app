import { ArrowUpRight } from "lucide-react"

type AccountRowProps = {
  label: string
  value: string
  detail?: string
  action?: string
  onAction?: () => void
}

export const AccountRow = ({
  label,
  value,
  detail,
  action,
  onAction,
}: AccountRowProps) => (
  <div className="account-row">
    <div className="row-copy">
      <p className="eyebrow">{label}</p>
      <p className="row-value">{value}</p>
      {detail && <p className="muted row-detail">{detail}</p>}
    </div>
    {action && (
      <button
        className="text-button"
        onClick={onAction}
      >
        {action}
        <ArrowUpRight
          size={15}
          aria-hidden="true"
        />
      </button>
    )}
  </div>
)
