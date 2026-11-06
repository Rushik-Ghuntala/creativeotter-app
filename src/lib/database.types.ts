import type { MotionRevision, MotionSettings } from "@/lib/render/project"
import type { RenderJob, RenderInput } from "@/lib/render/contracts"
import type {
  BrandKit,
  StudioCharacter,
  StudioProject,
  VoicePreset,
  StudioShot,
  ProjectAsset,
  WorkspacePreferences,
  WorkspaceInvite,
  SupportRequest,
} from "@/lib/studio/contracts"
import type {
  MediaAsset,
  ImageQuote,
  ImageJob,
  GenerationAccess,
  ImageInput,
  NativeGeneration,
} from "@/lib/media/contracts"
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Workspace = {
  id: string
  name: string
  personal_owner_id: string
  created_at: string
}

export type ClientGrant = {
  id: string
  user_id: string
  client_id: string
  client_name: string
  redirect_uri: string
  workspace_id: string
  permissions: string[]
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type McpContext = {
  user_id: string
  client_id: string
  workspace: { id: string; name: string }
  role: "owner" | "admin" | "creator" | "viewer"
  permissions: string[]
}

type Table<Row, Insert> = {
  Row: Row
  Insert: Insert
  Update: Partial<Insert>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      motion_revisions: Table<MotionRevision, Partial<MotionRevision>>
      render_jobs: Table<RenderJob, Partial<RenderJob>>
      workspace_preferences: Table<
        WorkspacePreferences,
        Partial<WorkspacePreferences>
      >
      brand_kits: Table<BrandKit, Partial<BrandKit>>
      studio_characters: Table<StudioCharacter, Partial<StudioCharacter>>
      studio_projects: Table<StudioProject, Partial<StudioProject>>
      studio_voice_presets: Table<VoicePreset, Partial<VoicePreset>>
      studio_shots: Table<StudioShot, Partial<StudioShot>>
      studio_project_assets: Table<ProjectAsset, Partial<ProjectAsset>>
      workspace_invites: Table<WorkspaceInvite, Partial<WorkspaceInvite>>
      support_requests: Table<SupportRequest, Partial<SupportRequest>>
      credit_accounts: Table<
        {
          workspace_id: string
          available_units: number
          reserved_units: number
          updated_at: string
        },
        { workspace_id: string }
      >
      credit_ledger: Table<
        {
          id: string
          workspace_id: string
          job_id: string | null
          render_job_id: string | null
          native_generation_id: string | null
          kind: "grant" | "reserve" | "charge" | "release"
          amount_units: number
          delta_available: number
          delta_reserved: number
          entry_key: string
          note: string
          created_at: string
        },
        Record<string, never>
      >
      native_generations: Table<NativeGeneration, Partial<NativeGeneration>>
      media_assets: Table<MediaAsset, Partial<MediaAsset>>
      generation_quotes: Table<ImageQuote, Partial<ImageQuote>>
      generation_jobs: Table<ImageJob, Partial<ImageJob>>
      profiles: Table<
        { id: string; display_name: string; created_at: string },
        { id: string; display_name?: string }
      >
      workspaces: Table<Workspace, { personal_owner_id: string; name: string }>
      workspace_members: Table<
        {
          workspace_id: string
          user_id: string
          role: string
          created_at: string
        },
        { workspace_id: string; user_id: string; role?: string }
      >
      client_grants: Table<
        ClientGrant,
        Pick<
          ClientGrant,
          | "user_id"
          | "client_id"
          | "client_name"
          | "redirect_uri"
          | "workspace_id"
        > &
          Partial<
            Omit<
              ClientGrant,
              | "user_id"
              | "client_id"
              | "client_name"
              | "redirect_uri"
              | "workspace_id"
            >
          >
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      save_motion_revision: {
        Args: {
          target_workspace: string
          title: string
          settings: MotionSettings
          source_sha256: string
          source_bytes: number
          request_key: string
          parent_revision?: string | null
          change_summary?: string
        }
        Returns: MotionRevision
      }
      get_render_access: {
        Args: { target_workspace: string }
        Returns: {
          available: boolean
          png_credit_units: string | null
          mp4_credit_units: string | null
        }
      }
      prepare_render: {
        Args: {
          target_workspace: string
          render_input: RenderInput
          request_key: string
        }
        Returns: RenderJob
      }
      start_render: { Args: { target_render: string }; Returns: RenderJob }
      claim_render: { Args: Record<string, never>; Returns: RenderJob | null }
      complete_render: {
        Args: {
          target_render: string
          lease: string
          bytes: number
          digest: string
        }
        Returns: RenderJob
      }
      fail_render: {
        Args: { target_render: string; lease: string }
        Returns: RenderJob
      }
      render_worker_heartbeat: {
        Args: Record<string, never>
        Returns: undefined
      }
      create_render_preview: {
        Args: { target_render: string; secret_hash: string }
        Returns: undefined
      }
      read_render_preview: {
        Args: { preview_secret: string; target_render: string }
        Returns: RenderJob
      }

      create_saved_preview: {
        Args: {
          target_workspace: string
          secret_hash: string
          generations: Json
        }
        Returns: string
      }
      read_saved_preview: {
        Args: {
          preview_secret: string
          execution_source: string
          generation_id: string
        }
        Returns: Json
      }
      can_read_saved_preview_object: {
        Args: { object_path: string }
        Returns: boolean
      }

      list_workspace_members: {
        Args: { target_workspace: string }
        Returns: Json
      }
      create_workspace_invite: {
        Args: {
          target_workspace: string
          invite_email: string
          invite_role: string
          secret_hash: string
        }
        Returns: string
      }
      revoke_workspace_invite: {
        Args: { target_invite: string }
        Returns: undefined
      }
      accept_workspace_invite: {
        Args: { secret_hash: string }
        Returns: string
      }
      can_edit_studio: { Args: { target_workspace: string }; Returns: boolean }
      can_admin_workspace: {
        Args: { target_workspace: string }
        Returns: boolean
      }
      get_credit_summary: { Args: { target_workspace: string }; Returns: Json }
      record_credit_grant: {
        Args: {
          target_workspace: string
          units: string
          external_event_id: string
          reason: string
        }
        Returns: Json
      }
      prepare_native_output: {
        Args: {
          target_workspace: string
          request_key: string
          native_input: Json
          host_name: string
          reported_model: string | null
          output_mime: string
        }
        Returns: NativeGeneration & { storage_path: string; mime_type: string }
      }
      complete_native_output: {
        Args: { target_generation: string; asset_metadata: Json }
        Returns: NativeGeneration
      }
      prepare_native_generation: {
        Args: Database["public"]["Functions"]["prepare_native_output"]["Args"]
        Returns: NativeGeneration
      }
      approve_native_generation: {
        Args: { target_generation: string }
        Returns: NativeGeneration
      }
      claim_native_generation: {
        Args: { target_generation: string }
        Returns: {
          generation_id: string
          execution_token: string
          input: Json
          host: string
          reported_model: string | null
          credit_units: string
          credit_status: string
          claimed: boolean
        }
      }
      authorize_native_upload: {
        Args: { target_generation: string; expected_execution_token: string }
        Returns: {
          generation_id: string
          asset_id: string
          state: string
          storage_path?: string
          mime_type?: string
        }
      }
      complete_paid_native_output: {
        Args: {
          target_generation: string
          expected_execution_token: string
          asset_metadata: Json
        }
        Returns: NativeGeneration
      }
      report_native_outcome: {
        Args: {
          target_generation: string
          expected_execution_token: string
          detail: string
        }
        Returns: undefined
      }
      cancel_native_generation: {
        Args: { target_generation: string }
        Returns: undefined
      }
      confirm_native_failure: {
        Args: { target_generation: string; reason: string }
        Returns: undefined
      }
      get_generation_access: {
        Args: { target_workspace: string }
        Returns: GenerationAccess
      }
      prepare_media_upload: {
        Args: {
          target_workspace: string
          asset_label: string
          asset_mime: string
        }
        Returns: MediaAsset
      }
      prepare_image_quote: {
        Args: {
          target_workspace: string
          quote_input: Json
          request_key: string
        }
        Returns: ImageQuote
      }
      start_image_generation: {
        Args: { target_quote: string }
        Returns: ImageJob
      }
      approve_image_quote: { Args: { target_quote: string }; Returns: ImageJob }
      set_media_favorite: {
        Args: { target_asset: string; is_favorite: boolean }
        Returns: MediaAsset
      }
      claim_image_job: {
        Args: { target_job: string }
        Returns: (ImageJob & { input: ImageInput; model_key: string }) | null
      }
      complete_image_job: {
        Args: { target_job: string; asset_metadata: Json }
        Returns: ImageJob
      }
      mark_image_job_failure: {
        Args: { target_job: string; next_state: string; safe_message: string }
        Returns: undefined
      }
      ensure_personal_workspace: {
        Args: Record<string, never>
        Returns: Workspace
      }
      get_mcp_context: { Args: Record<string, never>; Returns: McpContext }
      has_workspace_access: {
        Args: { target_workspace: string }
        Returns: boolean
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
