import AssetPage from "@/sections/AssetPage/AssetPage"
import type { ComponentProps } from "react"
const Page = (props: ComponentProps<typeof AssetPage>) => (
  <AssetPage {...props} />
)
export default Page
