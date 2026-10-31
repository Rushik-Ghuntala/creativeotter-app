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
