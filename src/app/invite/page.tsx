import InvitePage from "@/sections/InvitePage/InvitePage"
import type { ComponentProps } from "react"
const Page = (props: ComponentProps<typeof InvitePage>) => (
  <InvitePage {...props} />
)
export default Page
