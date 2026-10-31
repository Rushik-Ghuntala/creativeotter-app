import { enableMediaAccess } from "@/lib/media/actions"
import { Button } from "@/components/ui/button"
import { revokeClientAccess } from "@/lib/oauth/actions"
import type { ClientGrant } from "@/lib/database.types"

type ConnectedClientProps = { grant: ClientGrant }

export const ConnectedClient = ({ grant }: ConnectedClientProps) => (
  <li className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 py-5">
    <div className="min-w-0">
      <p className="font-medium">{grant.client_name}</p>
      <p className="mt-1 break-all text-xs text-stone-500">
        Client ID: {grant.client_id}
      </p>
      <p className="mt-1 text-sm text-stone-600">
        {grant.permissions.includes("media:prepare")
          ? "Media library and generation preparation"
          : "Read-only workspace access"}
      </p>
    </div>
    {!grant.permissions.includes("media:prepare") && (
      <form action={enableMediaAccess}>
        <input
          type="hidden"
          name="client_id"
          value={grant.client_id}
        />
        <p className="mb-3 max-w-xs text-xs leading-5 text-stone-500">
          Enable private media uploads and generation proposals. This
          application still cannot approve native or API credit charges.
        </p>
        <Button
          type="submit"
          variant="outline"
        >
          Enable media preparation
        </Button>
      </form>
    )}
    <form action={revokeClientAccess}>
      <input
        type="hidden"
        name="client_id"
        value={grant.client_id}
      />
      <Button
        type="submit"
        variant="outline"
      >
        Disconnect
      </Button>
    </form>
  </li>
)
