"use client"
import { Provider as ReduxProvider } from "react-redux"
import { ReactNode } from "react"
import index from "@/store"

type Props = {
  children: ReactNode
}

const Provider = ({ children }: Props) => {
  return <ReduxProvider store={index}>{children}</ReduxProvider>
}

export default Provider
