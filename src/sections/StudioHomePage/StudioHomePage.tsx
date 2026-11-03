import Link from "next/link"
import Image from "next/image"
import {
  Camera,
  Replace,
  Grid2X2,
  AudioLines,
  Music2,
  Plus,
  ArrowRight,
  PlugZap,
} from "lucide-react"
import { StudioShell } from "@/components/studio/StudioShell"
import { TemplateCard } from "@/components/studio/TemplateCard"
import { StudioRecordCard } from "@/components/studio/StudioRecordCard"
import { getPersonalWorkspace } from "@/lib/auth/session"
import {
  listStudioRecords,
  listLibraryAssets,
  getRecordImages,
} from "@/lib/studio/service"
import { creativeTemplates } from "@/lib/studio/config"
const StudioHomePage = async () => {
  const { supabase, workspace } = await getPersonalWorkspace("/studio")
  const [characters, library] = await Promise.all([
    listStudioRecords(supabase, workspace.id, "characters"),
    listLibraryAssets(supabase, workspace.id),
  ])
  const characterImages = await getRecordImages(
    supabase,
    workspace.id,
    characters.slice(0, 3),
  )
  const cards = [
    {
      title: "Cast yourself",
      body: "Save a face and a visual identity once. Reuse them in every image and campaign.",
      href: "/studio/characters/new",
      icon: Camera,
      accent: true,
    },
    {
      title: "Create something",
      body: "Shape an idea with your references and take it to your connected assistant.",
      href: "/studio/create",
      icon: Replace,
      accent: true,
    },
    {
      title: "Your library",
      body: `${library.total} saved ${library.total === 1 ? "asset" : "assets"}. Native creations and references, together.`,
      href: "/studio/library",
      icon: Grid2X2,
    },
    {
      title: "Explore voices",
      body: "Save scripts and voice direction. Audition with your browser's available voices.",
      href: "/studio/voices",
      icon: AudioLines,
    },
    {
      title: "Explore music",
      body: "Pick a mood, save your lyrics and prepare your next original track.",
      href: "/studio/music",
      icon: Music2,
    },
  ]
  return (
    <StudioShell>
      <div className="studio-hero">
        <span className="eyebrow">Your connected creative workspace</span>
        <h1>What are we making?</h1>
        <p>
          Your characters, films and generations in one place.
          <br />
          Create with your assistant. Make it yours in CreativeOtter.
        </p>
      </div>
      <div className="studio-quick-cards">
        {cards.map(({ title, body, href, icon: Icon, accent }) => (
          <Link
            key={title}
            href={href}
            className={accent ? "quick-card accent" : "quick-card"}
          >
            <span className="quick-card-icon">
              <Icon size={20} />
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
          </Link>
        ))}
      </div>
      <div className="studio-section-label">
        <h2>Characters</h2>
        <Link href="/studio/characters">
          See all <ArrowRight size={14} />
        </Link>
      </div>
      <div className="home-characters">
        {characters.slice(0, 3).map((record) => (
          <StudioRecordCard
            key={record.id}
            record={record}
            section="characters"
            imageUrl={characterImages[record.id]}
          />
        ))}
        <Link
          className="new-character-link"
          href="/studio/characters/new"
        >
          <span>
            <Plus size={22} />
          </span>
          New character
        </Link>
      </div>
      <div className="studio-section-label">
        <h2>Start from an idea</h2>
        <Link href="/studio/examples">
          See all <ArrowRight size={14} />
        </Link>
      </div>
      <div className="template-grid home-templates">
        {creativeTemplates.slice(0, 4).map((template) => (
          <TemplateCard
            key={template.title}
            template={template}
          />
        ))}
      </div>
      <div className="studio-section-label">
        <h2>Recent</h2>
        <Link href="/studio/library">
          See all <ArrowRight size={14} />
        </Link>
      </div>
      {library.items.length ? (
        <div className="recent-grid">
          {library.items.slice(0, 6).map((item) => (
            <Link
              key={item.asset.id}
              href={item.href || "/studio/library"}
            >
              <Image
                src={item.asset.url}
                width={400}
                height={400}
                alt={item.asset.label}
                unoptimized
              />
              <span>{item.asset.label}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="connect-banner">
          <PlugZap size={24} />
          <div>
            <h3>Your next idea starts in conversation.</h3>
            <p>Connect Codex or Claude to create and save your first image.</p>
          </div>
          <Link
            href="/connect"
            className="button-primary"
          >
            Connect your assistant ↗
          </Link>
        </div>
      )}
    </StudioShell>
  )
}
export default StudioHomePage
