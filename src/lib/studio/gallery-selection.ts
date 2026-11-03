import type { GalleryRequest } from "@/lib/media/gallery-contracts"
export type GallerySelection = GalleryRequest["generations"][number] & {
  asset_id: string
}
export const toggleGallerySelection = (
  selected: GallerySelection[],
  item: GallerySelection,
) => {
  if (selected.some((x) => x.asset_id === item.asset_id))
    return selected.filter((x) => x.asset_id !== item.asset_id)
  if (selected.length >= 20) throw new Error("Select up to 20 saved images.")
  if (
    selected.some(
      (x) =>
        x.generation_id === item.generation_id &&
        x.execution_source === item.execution_source,
    )
  )
    throw new Error("This saved image is already selected.")
  return [...selected, item]
}
