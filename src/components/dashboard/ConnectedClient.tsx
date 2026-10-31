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
      <p className="mt-1 text-sm text-stone-600">Read-only workspace access</p>
    </div>
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
