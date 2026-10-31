import ReviewPage from "@/sections/ReviewPage/ReviewPage"
type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const Page = ({ params, searchParams }: PageProps) => (
  <ReviewPage
    source="native"
    params={params}
    searchParams={searchParams}
  />
)
export default Page
