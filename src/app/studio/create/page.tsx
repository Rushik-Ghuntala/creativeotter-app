import CreatePage from "@/sections/CreatePage/CreatePage"
import type { ComponentProps } from "react"
const Page = (props: ComponentProps<typeof CreatePage>) => (
  <CreatePage {...props} />
)
export default Page
