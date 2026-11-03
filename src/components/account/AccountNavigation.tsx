import Link from "next/link"
import {
  Coins,
  ReceiptText,
  FolderOpen,
  UsersRound,
  Settings2,
} from "lucide-react"
const tabs = [
  { id: "credits", label: "Credits & plan", icon: Coins },
  { id: "billing", label: "Billing", icon: ReceiptText },
  { id: "library", label: "Library", icon: FolderOpen },
  { id: "team", label: "Team", icon: UsersRound },
  { id: "settings", label: "Settings", icon: Settings2 },
]
type AccountNavigationProps = { active: string }
export const AccountNavigation = ({ active }: AccountNavigationProps) => (
  <nav
    className="account-tabs"
    aria-label="Account sections"
  >
    {tabs.map(({ id, label, icon: Icon }) => (
      <Link
        key={id}
        href={`/account?tab=${id}`}
        aria-current={active === id ? "page" : undefined}
        className={active === id ? "active" : ""}
      >
        <Icon size={17} />
        {label}
      </Link>
    ))}
  </nav>
)
