"use client"
import { useState } from "react"
import Link from "next/link"
import { CopyButton } from "@/components/common/CopyButton"
import { Sparkles, ArrowUpRight } from "lucide-react"
type CreateBriefProps = {
  initialBrief: string
  brands: { id: string; name: string }[]
  characters: { id: string; name: string }[]
}
export const CreateBrief = ({
  initialBrief,
  brands,
  characters,
}: CreateBriefProps) => {
  const [prompt, setPrompt] = useState(initialBrief),
    [ratio, setRatio] = useState("4:5"),
    [brand, setBrand] = useState(""),
    [character, setCharacter] = useState("")
  const full = `Use CreativeOtter to generate one image. Aspect ratio: ${ratio}. ${brand ? `Load and follow CreativeOtter brand kit ${brand}. ` : ""}${character ? `Use CreativeOtter character ${character} and its saved visual reference. ` : ""}${prompt}\nUse a suitable native image tool first, with CreativeOtter's configured image credit quote and execution claim. Save the result to CreativeOtter and show its branded preview. No additional image variants unless requested.`
  return (
    <div className="create-layout">
      <section className="panel create-composer">
        <span className="eyebrow">
          <Sparkles size={14} />
          From an idea to an image
        </span>
        <h2>What do you want to create?</h2>
        <label className="form-label">
          Your brief
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image, audience, headline and visual direction…"
            maxLength={7000}
            rows={7}
          />
        </label>
        <div className="form-row">
          <label className="form-label">
            Format
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
            >
              {["4:5", "1:1", "9:16", "16:9"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Brand kit
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="">None</option>
              {brands.map((b) => (
                <option
                  value={b.id}
                  key={b.id}
                >
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-label">
          Character
          <select
            value={character}
            onChange={(e) => setCharacter(e.target.value)}
          >
            <option value="">None</option>
            {characters.map((c) => (
              <option
                key={c.id}
                value={c.id}
              >
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="button-row">
          {prompt.trim() && (
            <CopyButton
              text={full}
              label="Copy assistant prompt"
            />
          )}
          <Link
            href="/connect"
            className="button-primary"
          >
            Open connection guide <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
      <aside className="panel">
        <span className="status-badge">Native first</span>
        <h2>Create where you already chat.</h2>
        <p>
          Your assistant supplies the native image tool. CreativeOtter manages
          the workspace, configured credits, private save and branded preview.
        </p>
        <ol className="numbered-steps">
          <li>Write your brief and choose references.</li>
          <li>Copy the prompt into your connected Codex or Claude chat.</li>
          <li>
            Your assistant quotes and reserves CreativeOtter credits, creates
            the image and saves it here.
          </li>
        </ol>
        <div className="notice-inline">
          Direct API generation is disabled. This website cannot invoke an
          assistant’s private native image tool on its own.
        </div>
        <Link
          href="/studio/library"
          className="button-text"
        >
          Open your saved images ↗
        </Link>
      </aside>
    </div>
  )
}
