import store from "@/store"
import { GlobalState } from "@/store/global/global.types"
import { Action, ThunkAction } from "@reduxjs/toolkit"

export interface RootReduxState {
  globalSlice: GlobalState
}

export type RootState = ReturnType<typeof store.getState>

export type AppDispatch = typeof store.dispatch

export type AppThunk<T = Promise<void> | void> = ThunkAction<
  T,
  RootReduxState,
  unknown,
  Action<string>
>

export const RESET_STORE = "RESET_STORE"
