import { z } from "zod"
import { AppShell } from "@/components/app/AppShell"
import { ActionForm } from "@/components/common/ActionForm"
import { SectionHeading } from "@/components/common/SectionHeading"
import { requireWebSession } from "@/lib/auth/session"
import { acceptInviteAction } from "@/lib/studio/actions"
type InvitePageProps = { searchParams: Promise<{ token?: string }> }
const InvitePage = async ({ searchParams }: InvitePageProps) => {
  const token = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .safeParse((await searchParams).token)
  const { user } = await requireWebSession(
    token.success ? `/invite?token=${token.data}` : "/invite",
  )
  return (
    <AppShell>
      <SectionHeading
        title="Create together."
        description="Join your teammate’s private CreativeOtter workspace."
      />
      <section className="panel invite-accept">
        {token.success ? (
          <>
            <h2>Accept workspace invitation</h2>
            <p>
              Signed in as {user.email}. This must be the verified email the
              invitation was created for. Joining gives you the role on the
              invitation and access to the workspace’s shared library.
            </p>
            <ActionForm
              action={acceptInviteAction}
              submitLabel="Join workspace"
            >
              <input
                type="hidden"
                name="token"
                value={token.data}
              />
            </ActionForm>
          </>
        ) : (
          <p>
            This invitation link is invalid. Ask your workspace administrator
            for a new link.
          </p>
        )}
      </section>
    </AppShell>
  )
}
export default InvitePage
