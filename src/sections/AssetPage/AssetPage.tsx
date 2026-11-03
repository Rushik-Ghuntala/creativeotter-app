import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { StudioShell } from "@/components/studio/StudioShell"
import { CopyButton } from "@/components/common/CopyButton"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { signAsset } from "@/lib/media/assets"
type AssetPageProps = { params: Promise<{ id: string }> }
const AssetPage = async ({ params }: AssetPageProps) => {
  const parsed = z.uuid().safeParse((await params).id)
  if (!parsed.success) notFound()
  const { supabase, workspace } = await getPersonalWorkspace(
    `/studio/assets/${parsed.data}`,
  )
  const result = await supabase
    .from("media_assets")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data)
    .eq("status", "ready")
    .single()
  if (!result.data) notFound()
  const row = result.data,
    asset = await signAsset(supabase, row)
  return (
    <StudioShell>
      <Link
        href="/studio/library"
        className="back-link"
      >
        ← Your library
      </Link>
      <div className="section-heading">
        <div>
          <p className="eyebrow">CreativeOtter · Saved privately</p>
          <h1>{asset.label}</h1>
          <p>
            {row.kind === "reference" ? "Reference image" : "Saved image"} ·{" "}
            {asset.width} × {asset.height}
          </p>
        </div>
        <a
          href={asset.download_url}
          className="button-primary"
          download
        >
          Download original
        </a>
      </div>
      <div className="asset-detail-layout">
        <div className="asset-preview">
          <Image
            src={asset.url}
            width={asset.width || 1000}
            height={asset.height || 1000}
            alt={asset.label}
            unoptimized
          />
        </div>
        <aside className="panel">
          <h2>Ready for your next idea.</h2>
          <p>
            This image is private to your workspace. Use its asset ID when
            referencing it in a CreativeOtter generation.
          </p>
          <div className="record-id">
            <small>Asset ID</small>
            <code>{asset.id}</code>
          </div>
          <div className="button-row">
            <CopyButton
              text={asset.id}
              label="Copy asset ID"
            />
          </div>
          <p className="small-muted">
            {asset.mime_type} · {Math.ceil((row.size_bytes || 0) / 1024)} KB ·
            Saved {new Date(row.created_at).toLocaleDateString()}
          </p>
          <Link
            href="/studio/create"
            className="button-text"
          >
            Use in your next brief ↗
          </Link>
        </aside>
      </div>
    </StudioShell>
  )
}
export default AssetPage
