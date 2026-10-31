import Image from "next/image"
import Link from "next/link"

export const Brand = () => (
  <Link
    href="/"
    className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight"
  >
    <Image
      src="/creativeotter.png"
      width={46}
      height={46}
      alt=""
    />
    CreativeOtter
  </Link>
)
