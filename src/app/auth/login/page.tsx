import AuthPage from "@/sections/AuthPage/AuthPage"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const Page = ({ searchParams }: PageProps) => (
  <AuthPage
    mode="login"
    searchParams={searchParams}
  />
)
export default Page
