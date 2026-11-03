import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import type { creativeTemplates } from "@/lib/studio/config"
type TemplateCardProps = { template: (typeof creativeTemplates)[number] }
export const TemplateCard = ({ template }: TemplateCardProps) => (
  <Link
    className={`template-card ${template.color}`}
    href={`/studio/${template.section}?brief=${encodeURIComponent(template.description)}&name=${encodeURIComponent(template.title)}`}
  >
    <div>
      <span>{template.category}</span>
      <ArrowUpRight size={17} />
    </div>
    <Sparkles size={32} />
    <h3>{template.title}</h3>
    <p>{template.description}</p>
  </Link>
)
