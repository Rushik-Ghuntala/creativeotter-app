"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Star, Download, Check, Images, ArrowUpRight } from "lucide-react"
import type { LibraryItem } from "@/lib/studio/service"
import { favoriteAsset } from "@/lib/media/actions"
import { unitsToCredits } from "@/lib/studio/contracts"
import {
  toggleGallerySelection,
  type GallerySelection,
} from "@/lib/studio/gallery-selection"
type LibraryBrowserProps = {
  items: LibraryItem[]
  total: number
  page: number
  size: number
  q: string
  kind: string
  favorite: boolean
  basePath?: string
}
export const LibraryBrowser = ({
  items,
  total,
  page,
  size,
  q,
  kind,
  favorite,
  basePath = "/studio/library",
}: LibraryBrowserProps) => {
  const router = useRouter(),
    [selected, setSelected] = useState<GallerySelection[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("")
  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (q) p.set("q", q)
    if (kind) p.set("kind", kind)
    if (favorite) p.set("favorites", "true")
    if (basePath === "/account") p.set("tab", "library")
    Object.entries(extra).forEach(([key, v]) =>
      v ? p.set(key, v) : p.delete(key),
    )
    return `${basePath}?${p}`
  }
  const selectedIndex = (id: string) =>
    selected.findIndex((x) => x.asset_id === id)
  const gallery = selected.map(
    (x) => `${x.execution_source}:${x.generation_id}`,
  )
  const toggle = (item: LibraryItem) => {
    if (!item.generation_id) return
    try {
      setSelected(
        toggleGallerySelection(selected, {
          asset_id: item.asset.id,
          generation_id: item.generation_id,
          execution_source: item.execution_source,
        }),
      )
      setError("")
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to select this image",
      )
    }
  }

  return (
    <div className="library-browser">
      <div className="library-toolbar">
        <div className="segmented-links">
          <Link
            href={query({ kind: "output", page: "" })}
            className={kind === "output" ? "active" : ""}
          >
            Generations
          </Link>
          <Link
            href={query({ kind: "reference", page: "" })}
            className={kind === "reference" ? "active" : ""}
          >
            Uploads
          </Link>
          <Link
            href={query({ kind: "all", page: "" })}
            className={!kind || kind === "all" ? "active" : ""}
          >
            All
          </Link>
        </div>
        <Link
          href={query({ favorites: favorite ? "" : "true", page: "" })}
          className={`button-secondary ${favorite ? "is-favorite" : ""}`}
        >
          <Star
            size={15}
            fill={favorite ? "currentColor" : "none"}
          />
          Favorites
        </Link>
        <form
          action={basePath}
          className="library-search"
        >
          {basePath === "/account" && (
            <input
              name="tab"
              type="hidden"
              value="library"
            />
          )}
          {kind && (
            <input
              name="kind"
              type="hidden"
              value={kind}
            />
          )}
          {favorite && (
            <input
              type="hidden"
              name="favorites"
              value="true"
            />
          )}
          <input
            aria-label="Search library"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search your library…"
          />
          <button className="button-secondary">Search</button>
        </form>
      </div>
      <p className="small-muted">
        {total} saved {total === 1 ? "asset" : "assets"}, newest first. Select
        generated images to open them together.
      </p>
      {selected.length > 0 && (
        <div className="gallery-selection">
          <span>{selected.length} selected</span>
          <a
            href={`/studio/gallery?items=${encodeURIComponent(gallery.join(","))}&title=${encodeURIComponent("Your CreativeOtter gallery")}`}
            className="button-primary"
          >
            <Images size={16} />
            Open CreativeOtter gallery
          </a>
          <button
            className="button-secondary"
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="form-error"
        >
          {error}
        </p>
      )}
      <div className="library-grid">
        {items.map((item) => (
          <article
            key={item.asset.id}
            className={`library-tile ${selectedIndex(item.asset.id) >= 0 ? "selected" : ""}`}
          >
            <div className="library-image">
              <a
                href={item.href || item.asset.url}
                aria-label={`View ${item.asset.label}`}
              >
                <Image
                  src={item.asset.url}
                  width={500}
                  height={500}
                  alt={item.asset.label}
                  unoptimized
                />
              </a>
              {item.generation_id && (
                <button
                  aria-label={`Select ${item.asset.label}`}
                  aria-pressed={selectedIndex(item.asset.id) >= 0}
                  className="image-selector"
                  onClick={() => toggle(item)}
                >
                  {selectedIndex(item.asset.id) >= 0 && (
                    <>
                      <Check size={14} />
                      <small>{selectedIndex(item.asset.id) + 1}</small>
                    </>
                  )}
                </button>
              )}
              <span className="image-origin">
                CreativeOtter ·{" "}
                {item.kind === "reference"
                  ? "Reference"
                  : item.execution_source === "native"
                    ? "Native"
                    : "API"}
              </span>
            </div>
            <div className="library-tile-info">
              <h3 title={item.asset.label}>{item.asset.label}</h3>
              <p>
                {item.charged_units
                  ? `${unitsToCredits(item.charged_units)} credits · `
                  : ""}
                {new Date(item.created_at).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <div className="library-tile-actions">
                <button
                  className={`icon-button ${item.asset.favorite ? "is-favorite" : ""}`}
                  aria-label={
                    item.asset.favorite
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                  disabled={busy === item.asset.id}
                  onClick={async () => {
                    setBusy(item.asset.id)
                    setError("")
                    try {
                      await favoriteAsset(item.asset.id, !item.asset.favorite)
                      router.refresh()
                    } catch {
                      setError("Could not update favorite. Please try again.")
                    } finally {
                      setBusy("")
                    }
                  }}
                >
                  <Star
                    size={17}
                    fill={item.asset.favorite ? "currentColor" : "none"}
                  />
                </button>
                {item.href && (
                  <Link
                    href={item.href}
                    className="button-text"
                  >
                    View <ArrowUpRight size={14} />
                  </Link>
                )}
                <a
                  href={item.asset.download_url}
                  download
                  className="button-text"
                >
                  <Download size={14} />
                  Download
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <div className="empty-state">
          <Images size={30} />
          <h2>
            {q || favorite ? "No matching images" : "Your library is ready"}
          </h2>
          <p>
            {q || favorite
              ? "Try another search or clear the filters."
              : "Upload references or create an image through your connected assistant."}
          </p>
        </div>
      )}
      {total > size && (
        <div className="pagination">
          {page > 1 ? (
            <Link
              className="button-secondary"
              href={query({ page: String(page - 1) })}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {Math.ceil(total / size)}
          </span>
          {page * size < total && (
            <Link
              className="button-secondary"
              href={query({ page: String(page + 1) })}
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
