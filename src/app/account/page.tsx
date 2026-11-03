import AccountPage from "@/sections/AccountPage/AccountPage"
import type { ComponentProps } from "react"
const Page = (props: ComponentProps<typeof AccountPage>) => (
  <AccountPage {...props} />
)
export default Page
