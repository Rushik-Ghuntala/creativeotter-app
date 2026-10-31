import GenerationPage from "@/sections/GenerationPage/GenerationPage"
type PageProps = { params: Promise<{ id: string }> }
const Page = ({ params }: PageProps) => (
  <GenerationPage
    params={params}
    source="native"
  />
)
export default Page
