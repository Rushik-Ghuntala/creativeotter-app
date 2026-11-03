import Link from "next/link"
import Image from "next/image"
import {
  ImagePlus,
  UsersRound,
  Clapperboard,
  Palette,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Images,
  Layers,
  PlugZap,
  Sparkles,
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
const actions = [
  {
    title: "Create an image",
    description: "Start with a brief and your references.",
    href: "/studio/create",
    icon: ImagePlus,
    tone: "sage",
  },
  {
    title: "Build your cast",
    description: "Keep a recognizable face for every idea.",
    href: "/studio/characters/new",
    icon: UsersRound,
    tone: "peach",
  },
  {
    title: "Plan a film",
    description: "Turn a story into a clear shot list.",
    href: "/studio/films/new",
    icon: Clapperboard,
    tone: "lavender",
  },
  {
    title: "Save your brand",
    description: "Colors, type and a voice that is yours.",
    href: "/studio/brands/new",
    icon: Palette,
    tone: "sand",
  },
]
const StudioHomePage = async () => {
  const { supabase, workspace } = await getPersonalWorkspace("/studio")
  const [characters, library] = await Promise.all([
    listStudioRecords(supabase, workspace.id, "characters"),
    listLibraryAssets(supabase, workspace.id, { size: 4 }),
  ])
  const characterImages = await getRecordImages(
    supabase,
    workspace.id,
    characters.slice(0, 3),
  )
  return (
    <StudioShell>
      <div className="studio-home-heading">
        <div>
          <p className="eyebrow">A little space for big ideas</p>
          <h1>What are we making?</h1>
          <p>Pick up where you left off, or start something entirely new.</p>
        </div>
        <Link
          className="home-library-shortcut"
          href="/studio/library"
        >
          <Images size={16} />
          <span>
            <strong>{library.total}</strong> saved{" "}
            {library.total === 1 ? "asset" : "assets"}
          </span>
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <section className="studio-welcome-banner">
        <div className="welcome-banner-copy">
          <span className="welcome-banner-label">
            <Sparkles size={13} />
            Your next idea starts here
          </span>
          <h2>
            A little imagination.
            <br />A world of possibility.
          </h2>
          <p>
            Your assistants bring the spark. Your studio keeps it all together.
          </p>
          <Link
            href="/studio/create"
            className="welcome-banner-cta"
          >
            Create something <ArrowRight size={15} />
          </Link>
        </div>
        <div
          className="welcome-banner-art"
          aria-hidden="true"
        >
          <i />
          <i />
          <span className="banner-spark spark-one">✳</span>
          <span className="banner-spark spark-two">✧</span>
          <Image
            src="/creativeotter.png"
            alt=""
            width={280}
            height={280}
            priority
          />
          <span className="banner-note">
            <Layers size={12} />
            One workspace. Every idea.
          </span>
        </div>
      </section>
      <div className="studio-launch-grid">
        {actions.map(({ title, description, href, icon: Icon, tone }) => (
          <Link
            key={title}
            className={`studio-launch-card launch-${tone}`}
            href={href}
          >
            <span className="launch-icon">
              <Icon size={19} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <ArrowUpRight
              className="launch-arrow"
              size={14}
            />
          </Link>
        ))}
      </div>
      <div className="studio-section-label">
        <div>
          <h2>Recent work</h2>
          <p>Your latest creations and references, all in one place.</p>
        </div>
        <Link href="/studio/library">
          View library <ArrowRight size={14} />
        </Link>
      </div>
      {library.items.length ? (
        <div className="studio-recent-grid">
          {library.items.slice(0, 4).map((item) => (
            <Link
              key={item.asset.id}
              href={item.href || "/studio/library"}
              className="studio-recent-card"
            >
              <div>
                <Image
                  src={item.asset.url}
                  width={420}
                  height={420}
                  alt={item.asset.label}
                  unoptimized
                />
                <span>{item.kind === "reference" ? "Reference" : "Image"}</span>
              </div>
              <footer>
                <h3 title={item.asset.label}>{item.asset.label}</h3>
                <ArrowUpRight size={14} />
              </footer>
            </Link>
          ))}
        </div>
      ) : (
        <div className="studio-empty-recent">
          <Images size={25} />
          <div>
            <h3>Your creative story starts here.</h3>
            <p>
              Bring a reference or connect your assistant to save your first
              creation.
            </p>
          </div>
          <Link
            href="/studio/library"
            className="button-secondary"
          >
            Open your library <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <div className="studio-section-label">
        <div>
          <h2>Start from an idea</h2>
          <p>A few starting points. A thousand possible directions.</p>
        </div>
        <Link href="/studio/examples">
          Explore ideas <ArrowRight size={14} />
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
        <div>
          <h2>Your characters</h2>
          <p>A familiar face for everything you create.</p>
        </div>
        <Link href="/studio/characters">
          View your cast <ArrowRight size={14} />
        </Link>
      </div>
      {characters.length ? (
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
      ) : (
        <div className="studio-cast-callout">
          <span className="cast-callout-icon">
            <UsersRound size={25} />
          </span>
          <div>
            <h3>Meet your next main character.</h3>
            <p>
              Save a visual identity once. Bring it into your next image, film
              or campaign.
            </p>
          </div>
          <Link
            className="button-secondary"
            href="/studio/characters/new"
          >
            <Plus size={15} />
            New character
          </Link>
        </div>
      )}
      <div className="studio-assistant-strip">
        <span>
          <PlugZap size={17} />
          Made for the assistants you already use.
        </span>
        <Link href="/connect">
          Connect Codex or Claude <ArrowUpRight size={14} />
        </Link>
      </div>
    </StudioShell>
  )
}
export default StudioHomePage
