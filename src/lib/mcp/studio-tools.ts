import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { Database, McpContext } from "@/lib/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  brandKitSchema,
  characterSchema,
  projectSchema,
  voicePresetSchema,
  shotSchema,
  type StudioSection,
} from "@/lib/studio/contracts"
import {
  listStudioRecords,
  getStudioRecord,
  saveStudioRecord,
  archiveStudioRecord,
  getProjectDetails,
  saveStoryboardShot,
  assignProjectAsset,
} from "@/lib/studio/service"

export const STUDIO_TOOLS = [
  "manage_themes",
  "manage_characters",
  "manage_projects",
  "manage_voice_presets",
  "manage_storyboards",
  "assign_project_asset",
]
const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
const meta = { securitySchemes: [{ type: "oauth2", scopes: ["email"] }] }
const safe = async (callback: () => Promise<Record<string, unknown>>) => {
  try {
    const data = await callback()
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data,
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text:
            error instanceof z.ZodError
              ? error.issues
                  .map((x) => `${x.path.join(".")}: ${x.message}`)
                  .slice(0, 3)
                  .join("; ")
              : error instanceof Error
                ? error.message
                : "Unable to complete this workspace operation",
        },
      ],
    }
  }
}
export const registerStudioTools = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
  appUrl: string,
) => {
  const definitions: {
    name: string
    title: string
    section: StudioSection
    schema: z.ZodType
    description: string
  }[] = [
    {
      name: "manage_themes",
      title: "CreativeOtter brand kits",
      section: "brands",
      schema: brandKitSchema,
      description:
        "List, inspect, save, archive or restore a workspace brand kit. Reuse saved colors, typography, tone, guidelines and the owned logo asset ID. Never fetch an arbitrary logo URL. Saving brand direction does not generate media or spend credits.",
    },
    {
      name: "manage_characters",
      title: "CreativeOtter characters",
      section: "characters",
      schema: characterSchema,
      description:
        "List, inspect, save, archive or restore a reusable character and its owned canonical reference asset ID. Record only fictional identities, the user's own likeness or a likeness they are authorized to use. Does not train a model, clone a voice or generate media.",
    },
    {
      name: "manage_voice_presets",
      title: "CreativeOtter voice direction",
      section: "voices",
      schema: voicePresetSchema,
      description:
        "Save or inspect voice direction, language and the exact narration script. These are reusable presets, not provider voices or cloned speakers. No speech generation or charges.",
    },
  ]
  for (const definition of definitions) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: {
          action: z
            .enum(["list", "get", "save", "archive", "restore"])
            .default("list"),
          id: z.uuid().optional(),
          data: definition.schema.optional(),
          include_archived: z.boolean().default(false),
        },
        annotations,
        _meta: meta,
      },
      async (args) =>
        safe(async () => {
          if (args.action === "list")
            return {
              records: await listStudioRecords(
                client,
                context.workspace.id,
                definition.section,
                args.include_archived,
              ),
              studio_url: `${appUrl}/studio/${definition.section}`,
            }
          if (args.action === "save") {
            if (args.data === undefined) throw new Error("data is required")
            const result = await saveStudioRecord(
              client,
              context.workspace.id,
              definition.section,
              args.data,
              args.id,
            )
            return {
              ...result,
              url: `${appUrl}${result.url}`,
              message: "Saved without generating media or spending credits.",
            }
          }
          if (!args.id) throw new Error("id is required")
          if (args.action === "get")
            return {
              record: await getStudioRecord(
                client,
                context.workspace.id,
                definition.section,
                args.id,
              ),
              url: `${appUrl}/studio/${definition.section}/${args.id}`,
            }
          await archiveStudioRecord(
            client,
            context.workspace.id,
            definition.section,
            args.id,
            args.action === "archive",
          )
          return {
            id: args.id,
            archived: args.action === "archive",
            message:
              "Updated. Saved media and historical charges are unchanged.",
          }
        }),
    )
  }
  server.registerTool(
    "manage_projects",
    {
      title: "CreativeOtter projects",
      description:
        "Manage campaign, film and music briefs. Saved project assets are counted using original historical image charges; attribution never charges again. A budget_target_units value is a planning target in 1/1000-credit units, not an enforced spending cap. Does not generate or render media.",
      inputSchema: {
        action: z
          .enum(["list", "get", "save", "archive", "restore"])
          .default("list"),
        section: z.enum(["projects", "films", "music"]).default("projects"),
        id: z.uuid().optional(),
        data: projectSchema.optional(),
        include_archived: z.boolean().default(false),
      },
      annotations,
      _meta: meta,
    },
    async (args) =>
      safe(async () => {
        if (args.action === "list")
          return {
            records: await listStudioRecords(
              client,
              context.workspace.id,
              args.section,
              args.include_archived,
            ),
          }
        if (args.action === "save") {
          if (!args.data) throw new Error("data is required")
          const result = await saveStudioRecord(
            client,
            context.workspace.id,
            args.section,
            args.data,
            args.id,
          )
          return {
            ...result,
            url: `${appUrl}${result.url}`,
            budget_target_is_enforced: false,
          }
        }
        if (!args.id) throw new Error("id is required")
        if (args.action === "get")
          return {
            record: await getStudioRecord(
              client,
              context.workspace.id,
              args.section,
              args.id,
            ),
            details: await getProjectDetails(
              client,
              context.workspace.id,
              args.id,
            ),
            budget_target_is_enforced: false,
          }
        await archiveStudioRecord(
          client,
          context.workspace.id,
          args.section,
          args.id,
          args.action === "archive",
        )
        return { id: args.id, archived: args.action === "archive" }
      }),
  )
  server.registerTool(
    "manage_storyboards",
    {
      title: "CreativeOtter storyboards",
      description:
        "Read a saved film's planned shots or save one shot with its explicit ordinal, visual prompt, narration and optional owned reference asset. A duplicate shot number fails; inspect and update its existing ID instead. This is planning only and never creates footage or spends credits.",
      inputSchema: {
        action: z.enum(["list", "save"]).default("list"),
        project_id: z.uuid(),
        id: z.uuid().optional(),
        shot: shotSchema.omit({ project_id: true }).optional(),
      },
      annotations,
      _meta: meta,
    },
    async (args) =>
      safe(async () => {
        await getStudioRecord(
          client,
          context.workspace.id,
          "films",
          args.project_id,
        )
        if (args.action === "list")
          return {
            project_id: args.project_id,
            shots: (
              await getProjectDetails(
                client,
                context.workspace.id,
                args.project_id,
              )
            ).shots,
          }
        if (!args.shot) throw new Error("shot is required")
        return {
          shot: await saveStoryboardShot(
            client,
            context.workspace.id,
            { ...args.shot, project_id: args.project_id },
            args.id,
          ),
        }
      }),
  )
  server.registerTool(
    "assign_project_asset",
    {
      title: "Assign a saved asset to a project",
      description:
        "Attach exactly the requested saved asset to the specified workspace project. An asset has at most one project assignment; existing assignments are never silently moved. Historical charges are counted once and no new credits are spent.",
      inputSchema: { project_id: z.uuid(), asset_id: z.uuid() },
      annotations,
      _meta: meta,
    },
    async (args) =>
      safe(async () => {
        await assignProjectAsset(
          client,
          context.workspace.id,
          args.project_id,
          args.asset_id,
        )
        return {
          project_id: args.project_id,
          asset_id: args.asset_id,
          message:
            "Assigned without generating media, changing the ledger or spending credits.",
        }
      }),
  )
}
