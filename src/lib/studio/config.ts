import type { StudioSection } from "@/lib/studio/contracts"
export type EditorField = {
  name: string
  label: string
  type?: "text" | "textarea" | "select" | "asset" | "number"
  placeholder?: string
  options?: { value: string; label: string }[]
  maxLength?: number
  required?: boolean
}
const status = {
  name: "status",
  label: "Status",
  type: "select",
  options: [
    { value: "draft", label: "Draft" },
    { value: "active", label: "In progress" },
    { value: "complete", label: "Complete" },
  ],
} as const
const ratio = {
  name: "aspect_ratio",
  label: "Aspect ratio",
  type: "select",
  options: ["9:16", "16:9", "4:5", "1:1"].map((value) => ({
    value,
    label: value,
  })),
} as const
export const studioSections: Record<
  StudioSection,
  {
    title: string
    description: string
    singular: string
    empty: string
    fields: EditorField[]
  }
> = {
  characters: {
    title: "Your cast",
    description:
      "Reusable people and personas. Keep their identity and reference image ready for your next creation.",
    singular: "character",
    empty: "No characters yet",
    fields: [
      {
        name: "appearance",
        label: "Appearance & identity",
        type: "textarea",
        placeholder:
          "Face, outfit, materials, colors and details that should stay consistent.",
        maxLength: 4000,
      },
      {
        name: "identity_type",
        label: "Character identity",
        type: "select",
        options: [
          { value: "fictional", label: "Fictional character" },
          { value: "self", label: "My own likeness" },
          {
            value: "authorized",
            label: "Another person, with their permission",
          },
        ],
      },
      {
        name: "reference_asset_id",
        label: "Saved reference image",
        type: "asset",
      },
    ],
  },
  films: {
    title: "Your films",
    description:
      "Plan the story with your assistant, then manage every shot here. Keep the brief, narration and references together.",
    singular: "film",
    empty: "Your first story starts here",
    fields: [
      { ...status, options: [...status.options] },
      { ...ratio, options: [...ratio.options] },
      {
        name: "budget",
        label: "Budget target (credits)",
        type: "number",
        placeholder: "Planning target; does not enforce a spending cap",
      },
    ],
  },
  voices: {
    title: "Voice library",
    description:
      "Save reusable voice direction and scripts. Audition text using voices available in your browser.",
    singular: "voice preset",
    empty: "Give your next idea a voice",
    fields: [
      {
        name: "language",
        label: "Language code",
        placeholder: "en-US",
        maxLength: 40,
        required: true,
      },
      {
        name: "style",
        label: "Voice direction",
        placeholder: "Warm, conversational, a little playful…",
        maxLength: 500,
      },
      {
        name: "script",
        label: "Script",
        type: "textarea",
        placeholder: "The exact words to say.",
        maxLength: 8000,
      },
    ],
  },
  music: {
    title: "Music",
    description:
      "Keep track ideas, genre, mood and lyrics in one place. Pick a direction, then take it to your assistant.",
    singular: "music brief",
    empty: "Find your next sound",
    fields: [
      {
        name: "genre",
        label: "Genre / mood",
        placeholder: "Cinematic, chill, electronic…",
        maxLength: 80,
      },
      {
        name: "lyrics",
        label: "Lyrics or musical direction",
        type: "textarea",
        maxLength: 8000,
      },
      { ...status, options: [...status.options] },
      { name: "budget", label: "Budget target (credits)", type: "number" },
    ],
  },
  projects: {
    title: "Know what every project costs.",
    description:
      "Group saved work by client or campaign. See the original CreativeOtter charges for the assets assigned to each project.",
    singular: "project",
    empty: "Everything in its place",
    fields: [
      { ...status, options: [...status.options] },
      {
        name: "budget",
        label: "Budget target (credits)",
        type: "number",
        placeholder: "A planning target, not an enforced spending cap",
      },
    ],
  },
  brands: {
    title: "Always on brand.",
    description:
      "Save your colors, typography, logo and creative direction once. Reuse them with every assistant.",
    singular: "brand kit",
    empty: "Give your brand a home",
    fields: [
      {
        name: "colors",
        label: "Brand colors",
        placeholder: "#173D32, #D2864A, #F9F8F3",
        maxLength: 100,
      },
      {
        name: "font_family",
        label: "Font family",
        placeholder: "Your brand typeface",
        maxLength: 100,
      },
      {
        name: "tone",
        label: "Tone of voice",
        placeholder: "Clear, warm, confident…",
        maxLength: 500,
      },
      { name: "logo_asset_id", label: "Saved logo image", type: "asset" },
    ],
  },
}
export const creativeTemplates = [
  {
    title: "A launch worth sharing",
    category: "Image",
    description:
      "A portrait launch poster with one confident headline, a distinctive hero visual and a clear call to action.",
    color: "peach",
    section: "create",
  },
  {
    title: "One product. Every angle.",
    category: "Campaign",
    description:
      "A coordinated product campaign: hero, close-up, in-use scene and a minimal social card. Keep the product consistent.",
    color: "sage",
    section: "projects/new",
  },
  {
    title: "A story in six shots",
    category: "Film",
    description:
      "A short product story: problem, discovery, product reveal, demonstration, benefit and end card. Plan the shots before generating.",
    color: "lavender",
    section: "films/new",
  },
  {
    title: "Find your brand voice",
    category: "Voice",
    description:
      "A warm, clear and conversational narration for a product introduction. Keep the wording precise and easy to follow.",
    color: "blue",
    section: "voices/new",
  },
  {
    title: "The sound of a new idea",
    category: "Music",
    description:
      "An optimistic instrumental bed for a product launch. Light percussion, a memorable motif and room for narration.",
    color: "yellow",
    section: "music/new",
  },
  {
    title: "A recognizable character",
    category: "Character",
    description:
      "A distinctive fictional character with a consistent face, outfit, color palette and material style.",
    color: "rose",
    section: "characters/new",
  },
]
