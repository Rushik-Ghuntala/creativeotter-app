import { combineReducers } from "redux"
import { Action } from "@reduxjs/toolkit"
import { RESET_STORE, RootReduxState } from "@/store/redux.types"
import globalSlice from "@/store/global/global.slice"

const appReducer = combineReducers({
  globalSlice,
})

const rootReducer = (
  state: RootReduxState | undefined,
  action: Action<string>,
) => {
  if (action.type === RESET_STORE) {
    state = undefined
  }
  return appReducer(state, action)
}

export default rootReducer
