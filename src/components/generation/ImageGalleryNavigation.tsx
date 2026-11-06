/* eslint-disable @next/next/no-img-element -- Private signed thumbnails in the isolated MCP viewer. */
import { useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react"
import type { GallerySnapshot } from "@/lib/media/gallery-contracts"

type ImageGalleryNavigationProps = {
  gallery: GallerySnapshot
  selected: number
  busy: boolean
  onSelect: (index: number) => void
  onRefresh?: () => void
  onOpenGallery?: () => void
}
export const ImageGalleryNavigation = ({
  gallery,
  selected,
  busy,
  onSelect,
  onRefresh,
  onOpenGallery,
}: ImageGalleryNavigationProps) => {
  const recovered = useRef(new Set<string>())
  const thumbnails = useRef<HTMLDivElement>(null)
  useEffect(() => {
    thumbnails.current
      ?.querySelector<HTMLButtonElement>(`[data-image-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [selected])
  return (
    <section
      className="generation-shell gen-gallery"
      aria-label="CreativeOtter saved image gallery"
    >
      <header className="gen-gallery-heading">
        <div>
          <p className="gen-brand">CreativeOtter ✳ · Gallery</p>
          <h1>{gallery.title}</h1>
          <p className="gen-gallery-summary">
            {gallery.items.length} saved{" "}
            {gallery.items.length === 1 ? "image" : "images"} · Free to view and
            download
          </p>
        </div>
        <span
          className="gen-gallery-count"
          role="status"
          aria-live="polite"
        >
          Image {selected + 1} of {gallery.items.length}
        </span>
      </header>
      <div className="gen-gallery-controls">
        <button
          className="gen-icon-button"
          aria-label="Previous image"
          disabled={busy || selected === 0}
          onClick={() => onSelect(selected - 1)}
        >
          <ChevronLeft size={19} />
        </button>
        <div
          ref={thumbnails}
          className="gen-gallery-thumbnails"
          role="group"
          aria-label="Saved images"
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? Math.min(selected + 1, gallery.items.length - 1)
                : event.key === "ArrowLeft"
                  ? Math.max(selected - 1, 0)
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? gallery.items.length - 1
                      : null
            if (next !== null && !busy) {
              event.preventDefault()
              onSelect(next)
              event.currentTarget
                .querySelector<HTMLButtonElement>(
                  `[data-image-index="${next}"]`,
                )
                ?.focus()
            }
          }}
        >
          {gallery.items.map((item, index) => (
            <button
              key={`${item.execution_source}:${item.generation_id}`}
              className={`gen-gallery-thumbnail ${index === selected ? "gen-gallery-selected" : ""}`}
              aria-label={`View image ${index + 1}`}
              aria-pressed={index === selected}
              data-image-index={index}
              disabled={busy}
              onClick={() => onSelect(index)}
            >
              <img
                src={item.outputs[0].url}
                alt={`Saved image ${index + 1}`}
                onError={() => {
                  const key = `${item.execution_source}:${item.generation_id}`
                  if (!recovered.current.has(key)) {
                    recovered.current.add(key)
                    onRefresh?.()
                  }
                }}
              />
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <button
          className="gen-icon-button"
          aria-label="Next image"
          disabled={busy || selected === gallery.items.length - 1}
          onClick={() => onSelect(selected + 1)}
        >
          <ChevronRight size={19} />
        </button>
      </div>
      <p className="gen-gallery-note">{gallery.message}</p>
      {onOpenGallery && gallery.gallery_url && (
        <button
          className="gen-text-button"
          onClick={onOpenGallery}
        >
          Open gallery in CreativeOtter <ArrowUpRight size={13} />
        </button>
      )}
    </section>
  )
}
