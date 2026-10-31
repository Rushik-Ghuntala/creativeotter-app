import { createSelector } from "@reduxjs/toolkit"
import { RootReduxState } from "@/store/redux.types"

const selectGlobalState = (state: RootReduxState) => state.globalSlice

export const selectGlobalErrors = createSelector(
  [selectGlobalState],
  ({ errors, errorMessage }) => ({ errors, errorMessage }),
)

export const selectGlobalErrorMessage = createSelector(
  [selectGlobalState],
  ({ errorMessage }) => errorMessage,
)

export const selectGlobalSuccess = createSelector(
  [selectGlobalState],
  ({ success, successMessage }) => ({ success, successMessage }),
)

export const getMaintenanceMode = createSelector(
  [selectGlobalState],
  (globalState) => globalState?.maintenance,
)
