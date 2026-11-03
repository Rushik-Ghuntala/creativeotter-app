import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { AccountMenu } from "@/components/app/AccountMenu"
type AppHeaderProps = {
  email: string
  displayName: string
  workspaceName: string
}
export const AppHeader = ({
  email,
  displayName,
  workspaceName,
}: AppHeaderProps) => (
  <header className="app-header account-header">
    <Link
      href="/studio"
      className="app-wordmark"
    >
      <Image
        src="/creativeotter.png"
        width={40}
        height={40}
        alt=""
      />
      <span>CreativeOtter</span>
    </Link>
    <div className="header-actions">
      <Link
        className="header-studio-link"
        href="/studio"
      >
        Open Studio <ArrowUpRight size={15} />
      </Link>
      <AccountMenu
        email={email}
        displayName={displayName}
        workspaceName={workspaceName}
      />
    </div>
  </header>
)
