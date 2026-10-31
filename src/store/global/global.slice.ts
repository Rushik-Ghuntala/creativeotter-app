import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import { GlobalState } from "@/store/global/global.types"

const initialState: GlobalState = {
  errors: [],
  errorMessage: null,
  success: false,
  successMessage: "",
  maintenance: false,
  drawer: false,
}

const globalSlice = createSlice({
  name: "global",
  initialState,
  reducers: {
    toggleMaintenanceMode: (
      state: GlobalState,
      { payload }: PayloadAction<boolean>,
    ) => {
      state.maintenance = payload
    },
    setErrors: (state: GlobalState, { payload }: PayloadAction<unknown[]>) => {
      state.errors = payload
      state.errorMessage = ""
    },
    clearErrors: (state: GlobalState) => {
      state.errors = []
      state.errorMessage = null
    },

    setSuccess: (state: GlobalState, { payload }: PayloadAction<string>) => {
      state.success = true
      state.successMessage = payload
    },
    clearSuccess: (state: GlobalState) => {
      state.success = false
      state.successMessage = ""
    },
    openDrawer: (state: GlobalState) => {
      state.drawer = true
    },
    closeDrawer: (state: GlobalState) => {
      state.drawer = false
    },
    setErrorMessage: (
      state: GlobalState,
      { payload }: PayloadAction<string>,
    ) => {
      state.errorMessage = payload
    },
  },
})

export const {
  setErrors,
  clearErrors,
  setSuccess,
  clearSuccess,
  toggleMaintenanceMode,
  openDrawer,
  closeDrawer,
  setErrorMessage,
} = globalSlice.actions

export default globalSlice.reducer
