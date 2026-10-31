"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ImageGalleryNavigation } from "@/components/generation/ImageGalleryNavigation"
import { WebGenerationViewer } from "@/components/studio/WebGenerationViewer"
import type { GallerySnapshot } from "@/lib/media/gallery-contracts"

type WebImageGalleryProps = { gallery: GallerySnapshot }
export const WebImageGallery = ({ gallery }: WebImageGalleryProps) => {
  const [selected, setSelected] = useState(0)
  const router = useRouter()
  const item = gallery.items[Math.min(selected, gallery.items.length - 1)]
  return (
    <div className="mx-auto max-w-4xl">
      <ImageGalleryNavigation
        gallery={gallery}
        selected={selected}
        busy={false}
        onSelect={setSelected}
      />
      <button
        className="mb-5 text-xs text-emerald-900 underline"
        onClick={() => router.refresh()}
      >
        Refresh saved gallery links
      </button>
      <WebGenerationViewer
        key={`${item.execution_source}:${item.generation_id}`}
        initial={item}
      />
    </div>
  )
}
