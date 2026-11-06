import {
  House,
  Images,
  FolderKanban,
  UsersRound,
  Clapperboard,
  AudioLines,
  Music2,
  Palette,
} from "lucide-react"
export const studioNavigation = [
  {
    label: "Workspace",
    items: [
      { href: "/studio", label: "Overview", icon: House },
      { href: "/studio/library", label: "Media library", icon: Images },
      { href: "/studio/projects", label: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Creative tools",
    items: [
      { href: "/studio/designs", label: "Designs & motion", icon: Palette },
      { href: "/studio/characters", label: "Characters", icon: UsersRound },
      {
        href: "/studio/films",
        label: "Films & storyboards",
        icon: Clapperboard,
      },
      { href: "/studio/voices", label: "Voice library", icon: AudioLines },
      { href: "/studio/music", label: "Music", icon: Music2 },
      { href: "/studio/brands", label: "Brand kits", icon: Palette },
    ],
  },
]
export const isStudioLinkActive = (href: string, path: string) => {
  if (href === "/studio") return path === href
  if (href === "/studio/library")
    return /^\/studio\/(library|assets|native|jobs|gallery|review)(\/|$)/.test(
      path,
    )
  return path === href || path.startsWith(`${href}/`)
}
export const studioBreadcrumbs = (path: string) => {
  if (path === "/studio") return [{ label: "Overview", href: "/studio" }]
  const entry = studioNavigation
    .flatMap((group) => group.items)
    .find((item) => isStudioLinkActive(item.href, path))
  const items = [
    { label: entry?.label || "Create", href: entry?.href || "/studio/create" },
  ]
  if (path.endsWith("/new")) items.push({ label: "New", href: path })
  else if (path.split("/").filter(Boolean).length > 2)
    items.push({ label: "Details", href: path })
  else if (path === "/studio/gallery")
    items.push({ label: "Gallery", href: path })
  else if (path === "/studio/examples")
    return [{ label: "Creative starting points", href: path }]
  return items
}
