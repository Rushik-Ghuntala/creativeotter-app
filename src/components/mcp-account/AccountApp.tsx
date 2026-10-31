/* eslint-disable @next/next/no-img-element -- MCP iframe embeds an optimized image and does not run inside Next.js. */
import { useEffect, useState, type KeyboardEvent } from "react"
import {
  useApp,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps/react"
import { ArrowUpRight, RefreshCw } from "lucide-react"
import { AccountOverview } from "@/components/mcp-account/AccountOverview"
import { AccountActivity } from "@/components/mcp-account/AccountActivity"
import { AccountSettings } from "@/components/mcp-account/AccountSettings"
import {
  accountSnapshotSchema,
  type AccountSnapshot,
  type AccountSection,
} from "@/lib/mcp/account"

type AccountAppProps = { icon: string }
const tabs: AccountSection[] = ["overview", "activity", "settings"]

export const AccountApp = ({ icon }: AccountAppProps) => {
  const [account, setAccount] = useState<AccountSnapshot | null>(null)
  const [section, setSection] = useState<AccountSection>("overview")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [connectionIssue, setConnectionIssue] = useState(false)
  const acceptResult = (structured: unknown, updateSection = true) => {
    const parsed = accountSnapshotSchema.safeParse(structured)
    if (!parsed.success) {
      setNotice(
        "We couldn’t load this account. Refresh or reopen it from your assistant.",
      )
      return
    }
    setConnectionIssue(false)
    setAccount(parsed.data)
    if (updateSection) setSection(parsed.data.section)
    setNotice("")
  }
  const { app, isConnected, error } = useApp({
    appInfo: { name: "CreativeOtter Account", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (bridge) => {
      bridge.ontoolresult = (result) => acceptResult(result.structuredContent)
      bridge.ontoolcancelled = () =>
        setNotice(
          "Account loading was cancelled. Reopen it from your assistant.",
        )
      bridge.onhostcontextchanged = (context) => {
        if (context.theme) applyDocumentTheme(context.theme)
      }
    },
  })

  useEffect(() => {
    const theme = app?.getHostContext()?.theme
    if (theme) applyDocumentTheme(theme)
  }, [app, isConnected])

  const openAccount = async () => {
    if (!account || !app || !isConnected) return
    try {
      const result = await app.openLink({ url: account.account_url })
      if (result.isError)
        setNotice(
          "Your account couldn’t open. Please use the dashboard link in the conversation.",
        )
    } catch {
      setNotice(
        "Your account couldn’t open. Please use the dashboard link in the conversation.",
      )
    }
  }
  const refresh = async () => {
    if (!app || !isConnected || busy) return
    setBusy(true)
    try {
      const result = await app.callServerTool({
        name: "manage_account",
        arguments: { section },
      })
      if (result.isError) {
        setConnectionIssue(true)
        setNotice(
          "Your connection needs attention. Reconnect CreativeOtter from your assistant.",
        )
      } else acceptResult(result.structuredContent, false)
    } catch {
      setConnectionIssue(true)
      setNotice(
        "Couldn’t refresh your account. Try again or reconnect CreativeOtter.",
      )
    } finally {
      setBusy(false)
    }
  }
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    else return
    event.preventDefault()
    setSection(tabs[next])
    document.getElementById(`tab-${tabs[next]}`)?.focus()
  }
  if (!account)
    return (
      <main
        className="account-shell loading-shell"
        aria-busy={!error && !notice}
      >
        <img
          src={icon}
          alt=""
          width="58"
          height="58"
        />
        <h1>Making room for your ideas.</h1>
        <p role="status">
          {error || notice
            ? notice ||
              "This connection couldn’t be opened. Reconnect CreativeOtter from your assistant."
            : "Loading your CreativeOtter account…"}
        </p>
      </main>
    )

  return (
    <main className="account-shell">
      <header className="account-header">
        <div className="identity">
          <img
            className="account-logo"
            src={icon}
            alt="CreativeOtter"
          />
          <div className="identity-copy">
            <p className="eyebrow">CONNECTED ACCOUNT</p>
            <p className="account-email">
              {account.email || account.workspace.name}
            </p>
            <p className="workspace-name">
              {account.workspace.name}
              <span className="identity-dot">·</span>CreativeOtter
            </p>
          </div>
        </div>
        <button
          className="primary-button"
          onClick={() => void openAccount()}
        >
          View your account
          <ArrowUpRight
            size={15}
            aria-hidden="true"
          />
        </button>
      </header>
      <div className="navigation-row">
        <div
          className="tabs"
          role="tablist"
          aria-label="Account sections"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              role="tab"
              aria-selected={section === tab}
              aria-controls={`panel-${tab}`}
              tabIndex={section === tab ? 0 : -1}
              onKeyDown={(event) => onTabKey(event, index)}
              onClick={() => setSection(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="refresh-button"
          onClick={() => void refresh()}
          disabled={busy || !isConnected}
          aria-label="Refresh account"
        >
          <RefreshCw
            className={busy ? "spinning" : ""}
            size={16}
            aria-hidden="true"
          />
        </button>
      </div>
      {(notice || error) && (
        <p
          className="notice"
          role="alert"
        >
          {notice ||
            "Connection interrupted. Reopen CreativeOtter from your assistant."}
        </p>
      )}
      <div aria-busy={busy}>
        {section === "overview" && (
          <AccountOverview
            account={account}
            connectionIssue={connectionIssue || Boolean(error)}
            icon={icon}
            onActivity={() => setSection("activity")}
            onSettings={() => setSection("settings")}
          />
        )}
        {section === "activity" && <AccountActivity account={account} />}
        {section === "settings" && (
          <AccountSettings
            account={account}
            onOpenAccount={() => void openAccount()}
          />
        )}
      </div>
      <footer className="account-footer">
        <span className="mini-brand">
          CreativeOtter<span className="brand-spark">✳</span>
        </span>
        <span>A home for your next idea.</span>
      </footer>
    </main>
  )
}
