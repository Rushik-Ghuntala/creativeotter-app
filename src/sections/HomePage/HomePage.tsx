import Link from "next/link"
import { Brand } from "@/components/common/Brand"
import { Button } from "@/components/ui/button"

const HomePage = () => (
  <main className="flex min-h-screen flex-col bg-[#102f28] px-6 py-8 text-[#f6f5ef] lg:px-16">
    <header className="flex items-center justify-between">
      <Brand />
      <Button
        asChild
        variant="outline"
        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
      >
        <Link href="/auth/login">Sign in</Link>
      </Button>
    </header>
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-20">
      <p className="text-sm text-orange-200">
        CreativeOtter · Your connected studio
      </p>
      <h1 className="mt-6 max-w-3xl text-5xl leading-[1.06] font-medium tracking-tight md:text-7xl">
        A little imagination.
        <br />A world of possibility.
      </h1>
      <p className="mt-7 max-w-lg text-lg leading-8 text-emerald-100/70">
        Start with one workspace. Connect it to the assistants you already use.
        Build your next idea with CreativeOtter.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Button
          asChild
          size="lg"
          className="rounded-xl bg-orange-200 text-emerald-950 hover:bg-orange-100"
        >
          <Link href="/auth/signup">Create your workspace</Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="link"
          className="text-white"
        >
          <Link href="/dashboard">Open your workspace →</Link>
        </Button>
      </div>
      <p className="mt-8 text-sm text-emerald-100/50">
        Account connections are ready for setup. Media generation is coming
        next.
      </p>
    </section>
    <footer className="text-xs text-emerald-100/50">
      CreativeOtter · Make something worth sharing.
    </footer>
  </main>
)

export default HomePage
