import ConsentPage from "@/sections/ConsentPage/ConsentPage"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const Page = ({ searchParams }: PageProps) => (
  <ConsentPage searchParams={searchParams} />
)
export default Page
