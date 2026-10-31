/* eslint-disable @next/next/no-img-element -- Signed private storage URLs are already optimized by their source and expire. */
import Link from "next/link"
import type { DisplayAsset } from "@/lib/media/contracts"

type LibraryAssetProps = {
  asset: DisplayAsset
  href: string | null
  kind: string
}
export const LibraryAsset = ({ asset, href, kind }: LibraryAssetProps) => (
  <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
    <a
      href={href || asset.url}
      target={href ? undefined : "_blank"}
      rel="noreferrer"
      className="block bg-[#edf0e8]"
    >
      <img
        className="aspect-[4/3] w-full object-contain"
        src={asset.url}
        alt={asset.label}
        loading="lazy"
      />
    </a>
    <div className="p-5">
      <p className="text-xs uppercase tracking-widest text-emerald-800">
        {kind === "reference" ? "Reference" : "Saved image"}
      </p>
      <h2 className="mt-2 truncate font-medium">{asset.label}</h2>
      <p className="mt-3 break-all font-mono text-[10px] leading-5 text-stone-400">
        Asset: {asset.id}
      </p>
      <div className="mt-4 flex items-center justify-between text-xs font-medium text-emerald-900">
        {href ? (
          <Link href={href}>Open image</Link>
        ) : (
          <span>Ready to reference</span>
        )}
        <a
          href={asset.download_url}
          target="_blank"
          rel="noreferrer"
        >
          Download
        </a>
      </div>
    </div>
  </article>
)
