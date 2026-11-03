import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { signAssets } from "@/lib/media/assets"
import {
  sectionTable,
  parseRecordInput,
  shotSchema,
  type StudioSection,
  type StudioRecord,
} from "@/lib/studio/contracts"

export type StudioClient = SupabaseClient<Database>
export const projectKind = (section: StudioSection) =>
  section === "films" ? "film" : section === "music" ? "music" : "campaign"
export const listStudioRecords = async (
  client: StudioClient,
  workspaceId: string,
  section: StudioSection,
  archived = false,
) => {
  let query = client
    .from(sectionTable[section])
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100)
  query = archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null)
  if (section === "projects" || section === "films" || section === "music")
    query = query.filter("kind", "eq", projectKind(section))
  const { data, error } = await query
  if (error) throw new Error("Unable to load this Studio section")
  return data as StudioRecord[]
}
export const getStudioRecord = async (
  client: StudioClient,
  workspaceId: string,
  section: StudioSection,
  id: string,
) => {
  const { data, error } = await client
    .from(sectionTable[section])
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", z.uuid().parse(id))
    .single()
  if (error || !data)
    throw new Error("This record is unavailable in your workspace")
  if ("kind" in data && data.kind !== projectKind(section))
    throw new Error("Project type does not match this section")
  return data as StudioRecord
}
export const saveStudioRecord = async (
  client: StudioClient,
  workspaceId: string,
  section: StudioSection,
  value: unknown,
  id?: string,
) => {
  const parsed = parseRecordInput(section, value)
  const reference =
    "reference_asset_id" in parsed
      ? parsed.reference_asset_id
      : "logo_asset_id" in parsed
        ? parsed.logo_asset_id
        : null
  if (reference) {
    const owned = await client
      .from("media_assets")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", reference)
      .eq("status", "ready")
      .single()
    if (!owned.data) throw new Error("Choose a saved image from this workspace")
  }
  if (id) await getStudioRecord(client, workspaceId, section, id)
  const query = id
    ? client
        .from(sectionTable[section])
        .update({ ...parsed, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("id", id)
    : client
        .from(sectionTable[section])
        .insert({ ...parsed, workspace_id: workspaceId, id: randomUUID() })
  const { data, error } = await query.select("id").single()
  if (error || !data)
    throw new Error(
      "Unable to save. Check your workspace role and any linked reference image.",
    )
  return { id: data.id, url: `/studio/${section}/${data.id}` }
}
export const archiveStudioRecord = async (
  client: StudioClient,
  workspaceId: string,
  section: StudioSection,
  id: string,
  archive: boolean,
) => {
  await getStudioRecord(client, workspaceId, section, id)
  const { error } = await client
    .from(sectionTable[section])
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", id)
  if (error) throw new Error("Unable to update this record")
}
export const getProjectDetails = async (
  client: StudioClient,
  workspaceId: string,
  projectId: string,
) => {
  const [shots, links] = await Promise.all([
    client
      .from("studio_shots")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId)
      .order("position"),
    client
      .from("studio_project_assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("project_id", projectId),
  ])
  if (shots.error || links.error)
    throw new Error("Unable to load this project's storyboard and saved assets")
  const ids = links.data.map((x) => x.asset_id)
  if (!ids.length) return { shots: shots.data, assets: [], charged_units: "0" }
  const [rows, native, jobs] = await Promise.all([
    client
      .from("media_assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "ready")
      .in("id", ids),
    client
      .from("native_generations")
      .select("asset_id,credit_units,credit_status")
      .eq("workspace_id", workspaceId)
      .in("asset_id", ids),
    client
      .from("generation_jobs")
      .select("output_asset_id,credit_units,credit_status")
      .eq("workspace_id", workspaceId)
      .in("output_asset_id", ids),
  ])
  if (rows.error || native.error || jobs.error)
    throw new Error("Unable to read project costs")
  const charged = [...native.data, ...jobs.data]
    .filter((x) => x.credit_status === "charged")
    .reduce((sum, x) => sum + BigInt(x.credit_units || 0), BigInt(0))
  return {
    shots: shots.data,
    assets: await signAssets(client, rows.data),
    charged_units: charged.toString(),
  }
}
export const saveStoryboardShot = async (
  client: StudioClient,
  workspaceId: string,
  value: unknown,
  id?: string,
) => {
  const parsed = shotSchema.parse(value)
  const parent = await client
    .from("studio_projects")
    .select("id,kind")
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.project_id)
    .single()
  if (!parent.data || parent.data.kind !== "film")
    throw new Error("Choose a film in this workspace")
  if (parsed.reference_asset_id) {
    const asset = await client
      .from("media_assets")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", parsed.reference_asset_id)
      .eq("status", "ready")
      .single()
    if (!asset.data)
      throw new Error("Choose a saved reference image from this workspace")
  }
  const query = id
    ? client
        .from("studio_shots")
        .update(parsed)
        .eq("workspace_id", workspaceId)
        .eq("project_id", parsed.project_id)
        .eq("id", z.uuid().parse(id))
    : client
        .from("studio_shots")
        .insert({ ...parsed, workspace_id: workspaceId })
  const { data, error } = await query.select("id").single()
  if (error || !data)
    throw new Error(
      error?.code === "23505"
        ? "That shot number already exists. Choose another number."
        : "Unable to save this shot",
    )
  return data
}
export const assignProjectAsset = async (
  client: StudioClient,
  workspaceId: string,
  projectId: string,
  assetId: string,
) => {
  const asset = await client
    .from("media_assets")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", z.uuid().parse(assetId))
    .eq("status", "ready")
    .single()
  if (!asset.data) throw new Error("Choose a saved asset in this workspace")
  const { error } = await client.from("studio_project_assets").insert({
    workspace_id: workspaceId,
    project_id: z.uuid().parse(projectId),
    asset_id: assetId,
  })
  if (error)
    throw new Error(
      error.code === "23505"
        ? "This asset is already assigned to a project. Remove its existing assignment before moving it."
        : "Unable to attach this asset",
    )
}
export const listLibraryAssets = async (
  client: StudioClient,
  workspaceId: string,
  options: {
    q?: string
    kind?: string
    favorite?: boolean
    page?: number
    size?: number
  } = {},
) => {
  const page = Math.max(1, Math.min(options.page || 1, 1000)),
    size = Math.max(1, Math.min(Math.trunc(options.size || 24), 24))
  let query = client
    .from("media_assets")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
  if (options.q)
    query = query.ilike(
      "label",
      `%${options.q.slice(0, 120).replace(/[\\%_]/g, "\\$&")}%`,
    )
  if (options.kind === "reference" || options.kind === "output")
    query = query.eq("kind", options.kind)
  if (options.favorite) query = query.eq("favorite", true)
  const result = await query.range((page - 1) * size, page * size - 1)
  if (result.error) throw new Error("Unable to open your library")
  const rows = result.data || [],
    ids = rows.map((x) => x.id)
  const [assets, [native, jobs]] = await Promise.all([
    signAssets(client, rows),
    ids.length
      ? Promise.all([
          client
            .from("native_generations")
            .select("id,asset_id,state,credit_units,credit_status")
            .eq("workspace_id", workspaceId)
            .in("asset_id", ids),
          client
            .from("generation_jobs")
            .select(
              "id,quote_id,output_asset_id,state,credit_units,credit_status",
            )
            .eq("workspace_id", workspaceId)
            .in("output_asset_id", ids),
        ])
      : ([
          { data: [], error: null },
          { data: [], error: null },
        ] as const),
  ])
  if (native.error || jobs.error)
    throw new Error("Unable to load saved generation details")
  const items = rows.map((row, index) => {
    const n = native.data?.find((x) => x.asset_id === row.id),
      j = jobs.data?.find((x) => x.output_asset_id === row.id)
    return {
      asset: assets[index],
      kind: row.kind,
      created_at: row.created_at,
      generation_id:
        n?.state === "succeeded"
          ? n.id
          : j?.state === "succeeded"
            ? j.quote_id
            : null,
      execution_source: n ? ("native" as const) : ("provider" as const),
      href: n
        ? `/studio/native/${n.id}`
        : j
          ? `/studio/jobs/${j.id}`
          : `/studio/assets/${row.id}`,
      charged_units:
        n?.credit_status === "charged"
          ? String(n.credit_units)
          : j?.credit_status === "charged"
            ? String(j.credit_units)
            : null,
    }
  })
  return { items, total: result.count || 0, page, size }
}
export type LibraryItem = Awaited<
  ReturnType<typeof listLibraryAssets>
>["items"][number]

export const getRecentCreditUsage = async (
  client: StudioClient,
  workspaceId: string,
) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  let total = BigInt(0),
    offset = 0
  while (true) {
    const result = await client
      .from("credit_ledger")
      .select("amount_units")
      .eq("workspace_id", workspaceId)
      .eq("kind", "charge")
      .gte("created_at", since)
      .order("id")
      .range(offset, offset + 999)
    if (result.error) throw new Error("Unable to read recent credit usage")
    total += result.data.reduce(
      (sum, x) => sum + BigInt(x.amount_units),
      BigInt(0),
    )
    if (result.data.length < 1000) break
    offset += 1000
  }
  return total.toString()
}
export const getRecordImages = async (
  client: StudioClient,
  workspaceId: string,
  records: StudioRecord[],
) => {
  const assetFor = (record: StudioRecord) =>
    "reference_asset_id" in record
      ? record.reference_asset_id
      : "logo_asset_id" in record
        ? record.logo_asset_id
        : null
  const ids = [
    ...new Set(records.map(assetFor).filter((id): id is string => Boolean(id))),
  ]
  const images: Record<string, string> = {}
  if (!ids.length) return images
  const rows = await client
    .from("media_assets")
    .select("id,storage_path")
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .in("id", ids)
  if (rows.error) throw new Error("Unable to load saved reference thumbnails")
  const signed = await client.storage
    .from("creativeotter-media")
    .createSignedUrls(
      rows.data.map((x) => x.storage_path),
      3600,
    )
  if (signed.error) throw new Error("Unable to open reference thumbnails")
  for (const record of records) {
    const asset = rows.data.find((x) => x.id === assetFor(record)),
      url = signed.data.find((x) => x.path === asset?.storage_path)?.signedUrl
    if (url) images[record.id] = url
  }
  return images
}
export const getProjectChargeTotals = async (
  client: StudioClient,
  workspaceId: string,
  projectIds: string[],
) => {
  const totals: Record<string, string> = {}
  if (!projectIds.length) return totals
  const links: { project_id: string; asset_id: string }[] = []
  let offset = 0
  while (true) {
    const result = await client
      .from("studio_project_assets")
      .select("project_id,asset_id")
      .eq("workspace_id", workspaceId)
      .in("project_id", projectIds)
      .order("asset_id")
      .range(offset, offset + 999)
    if (result.error) throw new Error("Unable to read project assignments")
    links.push(...result.data)
    if (result.data.length < 1000) break
    offset += 1000
  }
  const assetTotals: Record<string, bigint> = {}
  for (let i = 0; i < links.length; i += 100) {
    const ids = links.slice(i, i + 100).map((x) => x.asset_id)
    const [native, jobs] = await Promise.all([
      client
        .from("native_generations")
        .select("asset_id,credit_units")
        .eq("workspace_id", workspaceId)
        .eq("credit_status", "charged")
        .in("asset_id", ids),
      client
        .from("generation_jobs")
        .select("output_asset_id,credit_units")
        .eq("workspace_id", workspaceId)
        .eq("credit_status", "charged")
        .in("output_asset_id", ids),
    ])
    if (native.error || jobs.error)
      throw new Error("Unable to read original project charges")
    for (const row of native.data)
      assetTotals[row.asset_id] =
        (assetTotals[row.asset_id] || BigInt(0)) + BigInt(row.credit_units || 0)
    for (const row of jobs.data)
      if (row.output_asset_id)
        assetTotals[row.output_asset_id] =
          (assetTotals[row.output_asset_id] || BigInt(0)) +
          BigInt(row.credit_units || 0)
  }
  for (const link of links)
    totals[link.project_id] = (
      BigInt(totals[link.project_id] || 0) +
      (assetTotals[link.asset_id] || BigInt(0))
    ).toString()
  return totals
}
