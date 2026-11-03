import Link from "next/link"
import { Sparkles } from "lucide-react"
type EmptyStateProps = {
  title: string
  description: string
  href?: string
  label?: string
}
export const EmptyState = ({
  title,
  description,
  href,
  label = "Get started",
}: EmptyStateProps) => (
  <section className="empty-state">
    <div className="empty-state-icon">
      <Sparkles size={24} />
    </div>
    <h2>{title}</h2>
    <p>{description}</p>
    {href && (
      <Link
        href={href}
        className="button-primary"
      >
        {label}
      </Link>
    )}
  </section>
)
