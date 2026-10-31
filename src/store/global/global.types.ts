export interface GlobalState {
  errors: unknown[]
  errorMessage: string | null

  success: boolean
  successMessage: string
  maintenance: boolean
  drawer: boolean
}
