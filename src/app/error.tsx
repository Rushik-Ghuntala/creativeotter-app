"use client"

import { Button } from "@/components/ui/button"

type ErrorProps = { reset: () => void }
const ErrorPage = ({ reset }: ErrorProps) => (
  <main className="mx-auto max-w-lg px-6 py-24">
    <h1 className="text-2xl font-semibold">We could not load this page.</h1>
    <p className="mt-4 mb-6 text-stone-600">
      Please try again. If the problem continues, return to your assistant and
      start a new connection.
    </p>
    <Button onClick={reset}>Try again</Button>
  </main>
)
export default ErrorPage
