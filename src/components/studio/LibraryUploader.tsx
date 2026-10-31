"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"
import {
  startReferenceUpload,
  completeReferenceUpload,
} from "@/lib/media/actions"

export const LibraryUploader = () => {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const router = useRouter()
  const upload = async (files: FileList | null) => {
    if (!files?.length || busy) return
    setBusy(true)
    setMessage("")
    try {
      for (const file of Array.from(files)) {
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 12582912
        )
          throw new Error("Use PNG, JPEG or WebP images smaller than 12 MB.")
        const form = new FormData()
        form.set("filename", file.name)
        form.set("mime_type", file.type)
        const prepared = await startReferenceUpload(form)
        const response = await fetch(prepared.signed_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        })
        if (!response.ok)
          throw new Error(
            "Upload did not finish. Please try uploading this file again.",
          )
        await completeReferenceUpload(prepared.asset_id)
      }
      setMessage("References saved privately. Their asset IDs are shown below.")
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to upload references.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-3xl border border-dashed border-emerald-900/25 bg-white/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="font-semibold">Bring your references.</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            PNG, JPEG or WebP · up to 12 MB each · private to your workspace.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-emerald-950 px-5 py-3 text-sm font-medium text-white">
          <Upload size={16} />
          {busy ? "Uploading…" : "Upload references"}
          <input
            className="sr-only"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => void upload(event.target.files)}
          />
        </label>
      </div>
      {message && (
        <p
          className="mt-4 text-sm text-stone-600"
          role="status"
        >
          {message}
        </p>
      )}
    </section>
  )
}
