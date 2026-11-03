import { StudioShell } from "@/components/studio/StudioShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import { TemplateCard } from "@/components/studio/TemplateCard"
import { creativeTemplates } from "@/lib/studio/config"
const ExamplesPage = () => (
  <StudioShell>
    <SectionHeading
      title="Start with a spark."
      description="Original creative starting points. Customize a brief, then make it your own."
    />
    <div className="template-grid">
      {creativeTemplates.map((template) => (
        <TemplateCard
          key={template.title}
          template={template}
        />
      ))}
    </div>
  </StudioShell>
)
export default ExamplesPage
