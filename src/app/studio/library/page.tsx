import LibraryPage from "@/sections/LibraryPage/LibraryPage"
import type { ComponentProps } from "react"
const Page = (props: ComponentProps<typeof LibraryPage>) => (
  <LibraryPage {...props} />
)
export default Page
