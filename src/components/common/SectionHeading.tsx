import type { ReactNode } from "react"
type SectionHeadingProps = {
  title: string
  description: string
  eyebrow?: string
  children?: ReactNode
}
export const SectionHeading = ({
  title,
  description,
  eyebrow,
  children,
}: SectionHeadingProps) => (
  <div className="section-heading">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {children && <div className="section-heading-actions">{children}</div>}
  </div>
)
