import { unzipSync, zipSync, strToU8 } from "fflate"
import { createHash } from "node:crypto"
import { z } from "zod"

export const MOTION_SOURCE_BUCKET = "creativeotter-motion-sources"
export const MAX_PROJECT_BYTES = 25 * 1024 * 1024
export const motionSettingsSchema = z
  .object({
    width: z
      .number()
      .int()
      .min(128)
      .max(1920)
      .refine((n) => n % 2 === 0),
    height: z
      .number()
      .int()
      .min(128)
      .max(1920)
      .refine((n) => n % 2 === 0),
    duration_seconds: z.number().int().min(1).max(30),
    fps: z
      .union([z.literal(12), z.literal(24), z.literal(25), z.literal(30)])
      .default(30),
  })
  .strict()
export type MotionSettings = z.infer<typeof motionSettingsSchema>
export type MotionRevision = {
  id: string
  project_id: string
  parent_id: string | null
  version: number
  workspace_id: string
  user_id: string
  client_id: string | null
  request_key: string
  title: string
  change_summary: string
  settings: MotionSettings
  source_path: string
  source_sha256: string
  source_bytes: number
  created_at: string
}
export const projectFilesSchema = z
  .array(
    z
      .object({
        path: z.string().min(1).max(180),
        content: z.string().max(700000),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      })
      .strict(),
  )
  .min(1)
  .max(128)
export const motionAssetsSchema = z
  .array(
    z.object({ asset_id: z.uuid(), path: z.string().min(1).max(180) }).strict(),
  )
  .max(12)
  .default([])
export type MotionAsset = z.infer<typeof motionAssetsSchema>[number]

const extension =
  /\.(html|css|js|json|svg|png|jpe?g|webp|woff2?|ttf|otf|wav|mp3|m4a|ogg|mp4|webm|md|txt)$/i
export const validProjectPath = (name: string) => {
  if (
    name.length > 180 ||
    !/^[a-zA-Z0-9_][a-zA-Z0-9_. /-]*$/.test(name) ||
    name.includes("\\") ||
    name
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p.startsWith(".") ||
          p === "node_modules",
      ) ||
    (!extension.test(name) && !/^(LICENSE|NOTICE)$/.test(name))
  )
    throw new Error("This project contains an unsupported file or path.")
  return name
}
export const projectDigest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")

// Check central-directory sizes BEFORE inflation. Never execute package scripts.
export const readProjectZip = (bytes: Uint8Array) => {
  if (bytes.length < 22 || bytes.length > MAX_PROJECT_BYTES)
    throw new Error("Choose a project ZIP smaller than 25 MB.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  for (; end >= Math.max(0, bytes.length - 65557); end--)
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
      break
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50)
    throw new Error("This ZIP could not be opened.")
  const count = view.getUint16(end + 10, true)
  if (
    !count ||
    count !== view.getUint16(end + 8, true) ||
    count > 256 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true)
  )
    throw new Error(
      "This ZIP has too many files or uses an unsupported archive format.",
    )
  let cursor = view.getUint32(end + 16, true),
    total = 0
  const names = new Set<string>()
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("This ZIP is incomplete.")
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true)
    const size = view.getUint32(cursor + 24, true),
      length = view.getUint16(cursor + 28, true)
    const extra = view.getUint16(cursor + 30, true),
      comment = view.getUint16(cursor + 32, true)
    const mode = view.getUint32(cursor + 38, true) >>> 16
    if (
      cursor + 46 + length + extra + comment > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      (mode & 0xf000) === 0xa000 ||
      size > MAX_PROJECT_BYTES
    )
      throw new Error("This archive contains unsupported entries.")
    const name = new TextDecoder("utf8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + length),
    )
    const path = name.endsWith("/") ? name.slice(0, -1) : name
    if (!name.endsWith("/")) validProjectPath(path)
    else if (
      !/^[a-zA-Z0-9_][a-zA-Z0-9_ /-]*$/.test(path) ||
      path.split("/").some((p) => p === ".." || p === "node_modules")
    )
      throw new Error("Unsupported archive folder.")
    if (names.has(name.toLowerCase()))
      throw new Error("This ZIP contains duplicate file names.")
    names.add(name.toLowerCase())
    total += size
    if (total > 64 * 1024 * 1024)
      throw new Error("This project expands to more than 64 MB.")
    cursor += 46 + length + extra + comment
  }
  if (cursor !== end) throw new Error("Unsupported ZIP directory.")
  const files = unzipSync(bytes, {
    filter: (file) =>
      !file.name.endsWith("/") &&
      names.has(file.name.toLowerCase()) &&
      file.originalSize <= MAX_PROJECT_BYTES,
  })
  if (!files["index.html"])
    throw new Error("Add index.html at the top level of your project ZIP.")
  let textSize = 0
  for (const [name, file] of Object.entries(files)) {
    validProjectPath(name)
    if (/\.(html|css|js|json|svg)$/i.test(name)) {
      textSize += file.length
      if (file.length > 512000 || textSize > 2000000)
        throw new Error("This project's source code is too large.")
      new TextDecoder("utf8", { fatal: true }).decode(file)
    }
  }
  return files
}
export const archiveProjectFiles = (files: Record<string, Uint8Array>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
    ),
    { level: 6, mtime: new Date("2020-01-01T00:00:00Z") },
  )
export const packProject = (value: unknown) => {
  const files: Record<string, Uint8Array> = {}
  for (const file of projectFilesSchema.parse(value)) {
    validProjectPath(file.path)
    if (files[file.path])
      throw new Error("Each project file must have a unique name.")
    if (
      file.encoding === "base64" &&
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        file.content,
      )
    )
      throw new Error("A project attachment could not be read.")
    files[file.path] =
      file.encoding === "base64"
        ? Buffer.from(file.content, "base64")
        : strToU8(file.content)
  }
  const zip = archiveProjectFiles(files)
  readProjectZip(zip)
  return zip
}
