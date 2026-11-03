"use client"
import { useActionState, type ReactNode } from "react"
import { CopyButton } from "@/components/common/CopyButton"
import type { ActionState } from "@/lib/studio/contracts"
type ActionFormProps = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>
  children?: ReactNode
  submitLabel?: string
  className?: string
  danger?: boolean
}
export const ActionForm = ({
  action,
  children,
  submitLabel = "Save changes",
  className = "",
  danger = false,
}: ActionFormProps) => {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form
      action={formAction}
      className={`otter-form ${className}`}
    >
      {children}
      <button
        type="submit"
        className={danger ? "button-danger" : "button-primary"}
        disabled={pending}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {state.error && (
        <p
          className="form-error"
          role="alert"
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          className="form-success"
          role="status"
        >
          {state.message}
        </p>
      )}
      {state.invitation_url && (
        <div className="invitation-result">
          <input
            aria-label="Private invitation link"
            readOnly
            value={state.invitation_url}
          />
          <CopyButton
            text={state.invitation_url}
            label="Copy invitation"
          />
        </div>
      )}
    </form>
  )
}
