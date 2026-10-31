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
