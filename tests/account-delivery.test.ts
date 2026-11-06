import test from "node:test"
import assert from "node:assert/strict"
import { accountSnapshotSchema, createAccountSnapshot } from "@/lib/mcp/account"
import {
  resolvePreviewToolName,
  toolResultData,
} from "@/lib/mcp/preview-refresh"

const snapshot = createAccountSnapshot(
  {
    user_id: "fixture-user",
    client_id: "fixture-client",
    workspace: { id: "fixture-workspace", name: "My workspace" },
    role: "owner",
    permissions: ["account:read"],
  },
  "https://creativeotter-app.vercel.app",
  "overview",
  "owner@example.invalid",
)

test("Claude's restored text-only account result renders the same validated account as structured delivery", () => {
  const restored = {
    content: [{ type: "text", text: JSON.stringify(snapshot) }],
  }
  assert.deepEqual(
    accountSnapshotSchema.parse(toolResultData(restored)),
    snapshot,
  )
  assert.deepEqual(
    accountSnapshotSchema.parse(
      toolResultData({ structuredContent: snapshot }),
    ),
    snapshot,
  )
  assert.equal(
    accountSnapshotSchema.safeParse(
      toolResultData({
        content: [{ type: "text", text: "<html>Sign in</html>" }],
      }),
    ).success,
    false,
  )
})

test("account refresh preserves the host's connector namespace", () => {
  for (const prefix of [
    "",
    "mcp__creativeotter__",
    "creativeotter:creativeotter:",
    "creativeotter-",
  ]) {
    assert.equal(
      resolvePreviewToolName("manage_account", `${prefix}manage_account`),
      `${prefix}manage_account`,
    )
  }
})
