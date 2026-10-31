import "server-only"
import { getAppUrl } from "@/lib/env"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { getNativeSnapshot } from "@/lib/media/native"
import { getGenerationSnapshot } from "@/lib/media/service"
import {
  galleryRequestSchema,
  buildGalleryUrl,
  type GalleryRequest,
  type GallerySnapshot,
} from "@/lib/media/gallery-contracts"

export const getImageGallery = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  request: GalleryRequest,
): Promise<GallerySnapshot> => {
  const input = galleryRequestSchema.parse(request)
  // User-scoped RLS and existing media permissions apply to every requested item.
  // Provider reads deliberately skip reconciliation: opening a gallery never executes work.
  const items = await Promise.all(
    input.generations.map((item) =>
      item.execution_source === "native"
        ? getNativeSnapshot(client, workspaceId, item.generation_id)
        : getGenerationSnapshot(client, workspaceId, item.generation_id, false),
    ),
  )
  if (items.some((item) => item.state !== "succeeded" || !item.outputs.length))
    throw new Error(
      "This gallery needs saved image results. Check the existing unfinished requests; do not regenerate them.",
    )
  const total = items.reduce(
    (sum, item) =>
      sum +
      (item.credit_status === "charged"
        ? BigInt(item.credit_units || "0")
        : BigInt(0)),
    BigInt(0),
  )
  return {
    view: "gallery",
    gallery_url: buildGalleryUrl(getAppUrl(), input),
    title: input.title,
    items,
    total_charged_units: total.toString(),
    message:
      "Saved CreativeOtter images. Viewing this gallery does not generate images or spend credits.",
  }
}
