import Link from "next/link"
import { AppShell } from "@/components/app/AppShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import { CopyButton } from "@/components/common/CopyButton"
import { getMcpResource } from "@/lib/env"
const ConnectPage = () => {
  const url = getMcpResource(),
    production = "https://creativeotter-app.vercel.app/api/mcp"
  return (
    <AppShell>
      <SectionHeading
        title="Your assistant. Your studio."
        description="Connect CreativeOtter once. Keep your work, credits and references together."
      />
      <div className="panel connection-endpoint">
        <p className="eyebrow">MCP server URL</p>
        <code>{url}</code>
        <CopyButton
          text={url}
          label="Copy MCP URL"
        />
        {url.includes("localhost") && (
          <div className="notice-inline">
            This local endpoint is for development. Cloud-hosted assistants need
            the deployed HTTPS endpoint: <code>{production}</code>. The existing
            Supabase OAuth audience remains configured for that deployment.
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
          <pre>{`codex mcp add creativeotter --url ${production}\ncodex mcp login creativeotter`}</pre>
          <CopyButton
            text={`codex mcp add creativeotter --url ${production}\ncodex mcp login creativeotter`}
            label="Copy commands"
          />
        </section>
        <section className="panel">
          <span className="assistant-badge claude">✳</span>
          <h2>Claude</h2>
          <p>
            In Claude, add a custom connector with the deployed endpoint. In
            Claude Code, add the HTTP server and complete its sign-in flow.
          </p>
          <pre>{`claude mcp add --transport http creativeotter ${production}`}</pre>
          <CopyButton
            text={`claude mcp add --transport http creativeotter ${production}`}
            label="Copy command"
          />
        </section>
      </div>
      <section className="panel">
        <h2>One account, wherever you create.</h2>
        <ol className="numbered-steps">
          <li>
            Sign in to your CreativeOtter account in the assistant’s connection
            flow.
          </li>
          <li>
            Choose account access and, when you want to create, enable media
            access.
          </li>
          <li>
            Ask for an image. CreativeOtter quotes and reserves credits before
            execution, saves the result and opens a branded preview.
          </li>
          <li>
            After plugin updates, reload the connection. Fully restart the host
            if it keeps an older tool list.
          </li>
        </ol>
        <p>
          Native capabilities depend on your assistant. API generation and
          purchases are disabled in this development build.
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
