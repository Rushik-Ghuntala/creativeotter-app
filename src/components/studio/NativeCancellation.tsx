import { cancelNativeGeneration } from "@/lib/media/actions"

type NativeCancellationProps = { generationId: string }
export const NativeCancellation = ({
  generationId,
}: NativeCancellationProps) => (
  <form
    action={cancelNativeGeneration}
    className="mt-5 text-center"
  >
    <input
      type="hidden"
      name="generation_id"
      value={generationId}
    />
    <button
      type="submit"
      className="rounded-full border border-stone-300 px-5 py-2 text-sm text-stone-600"
    >
      Cancel before execution starts
    </button>
    <p className="mt-2 text-xs text-stone-500">
      An unclaimed reservation is released. Claimed work requires
      reconciliation.
    </p>
  </form>
)
