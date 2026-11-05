import Link from "next/link"
import { AppShell } from "@/components/app/AppShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import { CopyButton } from "@/components/common/CopyButton"
import { getMcpResource } from "@/lib/env"
const ConnectPage = () => {
  const configured = getMcpResource()
  const local = new URL(configured).hostname === "localhost"
  const url = local
    ? "https://creativeotter-app.vercel.app/api/mcp"
    : configured
  const codexSetup = `codex mcp add creativeotter --url ${url}\ncodex mcp login creativeotter --scopes openid,email,offline_access`
  const codexReconnect =
    "codex mcp login creativeotter --scopes openid,email,offline_access"
  const claudeSetup = `claude mcp add --transport http creativeotter ${url}`
  return (
    <AppShell>
      <SectionHeading
        title="Your assistant. Your studio."
        description="Use the same CreativeOtter account for your assistants, library and credits."
      />
      <div className="panel connection-endpoint">
        <p className="eyebrow">MCP server URL</p>
        <code>{url}</code>
        <CopyButton
          text={url}
          label="Copy MCP URL"
        />
        {local && (
          <div className="notice-inline">
            This is the hosted connection URL. The local development server is
            separate and cannot be reached by cloud-hosted assistants.
          </div>
        )}
      </div>
      <div className="connection-grid">
        <section className="panel">
          <span className="assistant-badge">⌘</span>
          <h2>Codex</h2>
          <p>
            Install the CreativeOtter skills plugin, or add the deployed MCP
            endpoint in Codex settings and sign in with your CreativeOtter
            account.
          </p>
          <p>
            If the plugin already provides CreativeOtter, use its existing
            connection. For manual setup:
          </p>
          <pre>{codexSetup}</pre>
          <CopyButton
            text={codexSetup}
            label="Copy commands"
          />
          <p className="mt-4">
            Already added? Sign in again from its connection settings, or use:
          </p>
          <pre>{codexReconnect}</pre>
          <CopyButton
            text={codexReconnect}
            label="Copy sign-in command"
          />
        </section>
        <section className="panel">
          <span className="assistant-badge claude">✳</span>
          <h2>Claude</h2>
          <p>
            In Claude, add a custom connector with the deployed endpoint. In
            Claude Code, add the HTTP server and complete its sign-in flow.
          </p>
          <pre>{claudeSetup}</pre>
          <CopyButton
            text={claudeSetup}
            label="Copy command"
          />
          <p className="mt-4">
            In Claude Code, open /mcp, select CreativeOtter and choose
            Authenticate. In Claude’s connector settings, use Connect or
            Reconnect.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Other assistants</h2>
        <p>
          Add the MCP server URL above in an assistant that supports remote HTTP
          MCP and OAuth. Follow the assistant’s sign-in link and use the same
          CreativeOtter account.
        </p>
      </section>
      <section className="panel">
        <h2>One account, wherever you create.</h2>
        <ol className="numbered-steps">
          <li>
            Sign in to your CreativeOtter account in the assistant’s connection
            flow.
          </li>
          <li>
            Enable media library and requested generation if you want to create
            or view saved images. Account-only access shows account details.
          </li>
          <li>
            Check the connection by asking “Show my CreativeOtter account.” Your
            workspace and available credits should appear. This check is free.
          </li>
          <li>
            Then request an image. CreativeOtter checks and reserves credits
            before generating and saving it. Viewing saved work costs no new
            credits.
          </li>
        </ol>
        <p>
          Compatible assistants refresh sign-in automatically. If access was
          revoked or credentials were cleared, reconnect in that assistant.
          Signing in to this website alone does not connect an assistant.
        </p>
        <p>
          If skills appear but media tools are missing, first check sign-in and
          media access. After a plugin update, reload its connection; start a
          new chat only if the host still keeps the older tool list. Avoid
          repeated restarts for an authorization error.
        </p>
        <Link
          className="button-secondary"
          href="/account?tab=settings#connected-applications"
        >
          Manage connected assistants
        </Link>
      </section>
    </AppShell>
  )
}
export default ConnectPage
