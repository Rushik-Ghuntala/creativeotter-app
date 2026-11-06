"use client"
import { useEffect, useRef, useState } from "react"
import { motionTemplate } from "@/lib/render/motion-template"
import type { MotionRevision, MotionSettings } from "@/lib/render/project"
import type { RenderInput } from "@/lib/render/contracts"
type ProjectView = {
  revision: MotionRevision
  files: { path: string; content: string }[]
  history: { id: string; version: number; change_summary: string }[]
  source_url?: string
}
type Props = {
  disabled: boolean
  onRender: (input: RenderInput) => Promise<void>
  price: string | null
}
const projectFingerprint = (
  title: string,
  settings: MotionSettings,
  files: { path: string; content: string }[],
) =>
  JSON.stringify({
    title,
    settings: {
      width: settings.width,
      height: settings.height,
      duration_seconds: settings.duration_seconds,
      fps: settings.fps,
    },
    files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
  })
export const MotionProjectEditor = ({ disabled, onRender, price }: Props) => {
  const [headline, setHeadline] = useState("Good ideas deserve to be seen.")
  const [accent, setAccent] = useState("#f6b96d")
  const [duration, setDuration] = useState(6)
  const [project, setProject] = useState<ProjectView | null>(null)
  const [projects, setProjects] = useState<
    { id: string; project_id: string; title: string; version: number }[]
  >([])
  const [files, setFiles] = useState<{ path: string; content: string }[]>([])
  const [selected, setSelected] = useState("index.html")
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const savedFingerprint = useRef("")
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const requestKey = (content: unknown) => {
    const fingerprint = JSON.stringify(content)
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() }
    return pending.current!.key
  }
  const call = async (body: unknown) => {
    const response = await fetch("/api/motion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data
  }
  const load = async (id: string) => {
    const response = await fetch(`/api/motion?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    savedFingerprint.current = projectFingerprint(
      data.revision.title,
      data.revision.settings,
      data.files,
    )
    setProject(data)
    setFiles(data.files)
    setSelected("index.html")
    setAdvanced(true)
    setHeadline(data.revision.title)
    setDuration(data.revision.settings.duration_seconds)
    setMessage(
      `Version ${data.revision.version} opened. Saving changes creates a new version.`,
    )
  }
  const list = async () => {
    const response = await fetch("/api/motion", { cache: "no-store" })
    if (response.ok) {
      const data = await response.json()
      setProjects(data.projects || [])
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void list().catch(() =>
        setError("We couldn’t load your projects. Please try again."),
      )
      const id = new URL(location.href).searchParams.get("project")
      if (id)
        void load(id).catch(() =>
          setError("We couldn’t open this motion project."),
        )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  const safely = async (run: () => Promise<void>) => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await run()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.")
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const settings: MotionSettings = project
      ? { ...project.revision.settings, duration_seconds: duration }
      : { width: 864, height: 1080, duration_seconds: duration, fps: 30 }
    const source = advanced
      ? files
      : [
          {
            path: "index.html",
            content: motionTemplate(headline, accent, duration),
          },
        ]
    const fingerprint = projectFingerprint(headline, settings, source)
    if (project && savedFingerprint.current === fingerprint) return project
    const body = project
      ? {
          action: "revise",
          title: headline,
          settings,
          parent_id: project.revision.id,
          changes: source,
          change_summary: "Updated in CreativeOtter Studio",
        }
      : {
          action: "save",
          title: headline,
          settings,
          files: source,
          change_summary: "Created in CreativeOtter Studio",
        }
    const saved = (await call({
      ...body,
      request_key: requestKey(body),
    })) as ProjectView
    savedFingerprint.current = fingerprint
    setProject(saved)
    setFiles(saved.files)
    pending.current = null
    await list()
    return saved
  }
  const upload = async (file: File) => {
    if (file.size > 25 * 1024 * 1024)
      throw new Error("Choose a project ZIP smaller than 25 MB.")
    const bytes = await file.arrayBuffer()
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
    // Settings are read from the root's declarative contract; HTML never executes in Studio.
    const { unzipSync, strFromU8 } = await import("fflate")
    const archive = unzipSync(new Uint8Array(bytes), {
      filter: (f) => f.name === "index.html" && f.originalSize < 512000,
    })
    if (!archive["index.html"])
      throw new Error("Add index.html at the top level of the ZIP.")
    const doc = new DOMParser().parseFromString(
      strFromU8(archive["index.html"]),
      "text/html",
    )
    const root = doc.querySelector<HTMLElement>("[data-composition-id]")
    if (!root) throw new Error("This ZIP needs a HyperFrames composition.")
    const settings = {
      width: Number(root.dataset.width),
      height: Number(root.dataset.height),
      duration_seconds: Number(root.dataset.duration),
      fps: 30,
    }
    const body = {
      action: "upload",
      title: file.name.replace(/\.zip$/i, ""),
      settings,
      source_sha256: digest,
      source_bytes: file.size,
    }
    const prepared = await call({ ...body, request_key: requestKey(body) })
    const response = await fetch(prepared.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: bytes,
    })
    if (!response.ok && response.status !== 409)
      throw new Error("The upload could not finish. Please try again.")
    const view = (await call({
      action: "confirm",
      revision_id: prepared.revision.id,
    })) as ProjectView
    savedFingerprint.current = projectFingerprint(
      view.revision.title,
      view.revision.settings,
      view.files,
    )
    setProject(view)
    setFiles(view.files)
    setHeadline(view.revision.title)
    setDuration(view.revision.settings.duration_seconds)
    setAdvanced(true)
    pending.current = null
    await list()
    setMessage("Your editable project is saved. No credits spent.")
  }
  const newProject = () => {
    savedFingerprint.current = ""
    setProject(null)
    setAdvanced(false)
    setFiles([])
    setMessage("")
    setError("")
    pending.current = null
  }
  return (
    <section className="motion-editor">
      <h3>Make your ideas move.</h3>
      <p>
        Animated headlines, brand reveals and motion graphics. Save a project
        for free; credits are used when you create a video.
      </p>
      <label>
        Project name / headline
        <input
          value={headline}
          maxLength={120}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </label>
      {!project && !advanced && (
        <label>
          Accent colour
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          />
        </label>
      )}
      <label>
        Length
        <select
          aria-label="Video length"
          value={duration}
          onChange={(e) => {
            const next = Number(e.target.value)
            setDuration(next)
            setFiles((previous) =>
              previous.map((file) => {
                if (file.path !== "index.html") return file
                const document = new DOMParser().parseFromString(
                  file.content,
                  "text/html",
                )
                const root = document.querySelector<HTMLElement>(
                  "[data-composition-id]",
                )
                if (root) root.dataset.duration = String(next)
                return {
                  ...file,
                  content: `<!doctype html>\n${document.documentElement.outerHTML}`,
                }
              }),
            )
          }}
        >
          {[4, 6, 8, 10, 15, 20, 30].map((n) => (
            <option
              key={n}
              value={n}
            >
              {n} seconds
            </option>
          ))}
        </select>
      </label>
      <div className="motion-editor-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void safely(async () => {
              const next = await save()
              setMessage(
                `Version ${next.revision.version} saved. No credits spent.`,
              )
            })
          }}
        >
          Save project
        </button>
        <button
          type="button"
          disabled={busy || disabled || !price}
          onClick={() => {
            void safely(async () => {
              const next = await save()
              await onRender({
                title: next.revision.title,
                format: "mp4",
                engine: "hyperframes",
                revision_id: next.revision.id,
                html: "",
                css: "",
                asset_ids: [],
                ...next.revision.settings,
              })
            })
          }}
        >
          {busy
            ? "Working…"
            : price
              ? `Create video · ${price} credits`
              : "Rendering not enabled"}
        </button>
      </div>
      {project && (
        <div className="motion-editor-actions">
          <button
            type="button"
            onClick={newProject}
          >
            New project
          </button>
          <button
            type="button"
            onClick={() => {
              void safely(async () => {
                const response = await fetch(
                  `/api/motion?id=${project.revision.id}`,
                  { cache: "no-store" },
                )
                const data = await response.json()
                if (!response.ok || !data.source_url)
                  throw new Error("We couldn’t prepare this download.")
                const a = document.createElement("a")
                a.href = data.source_url
                a.download = "project.zip"
                document.body.append(a)
                a.click()
                a.remove()
              })
            }}
          >
            Download project ZIP
          </button>
        </div>
      )}
      <details open={advanced}>
        <summary
          onClick={(e) => {
            e.preventDefault()
            if (!advanced && !files.length)
              setFiles([
                {
                  path: "index.html",
                  content: motionTemplate(headline, accent, duration),
                },
              ])
            setAdvanced(!advanced)
          }}
        >
          Edit project source
        </summary>
        {advanced && (
          <>
            <p>
              HTML, JavaScript and GSAP timelines. Bundle fonts, logos, images,
              video and audio in your project ZIP. Editing code never runs it in
              this page.
            </p>
            <select
              aria-label="Project source file"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {files.map((file) => (
                <option key={file.path}>{file.path}</option>
              ))}
            </select>
            <textarea
              aria-label="Project source"
              value={files.find((f) => f.path === selected)?.content || ""}
              onChange={(e) =>
                setFiles((previous) =>
                  previous.map((f) =>
                    f.path === selected ? { ...f, content: e.target.value } : f,
                  ),
                )
              }
            />
          </>
        )}
      </details>
      <label>
        Import a HyperFrames project
        <input
          aria-label="Import project ZIP"
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void safely(() => upload(file))
            e.target.value = ""
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {project && (
        <label>
          Saved versions
          <select
            value={project.revision.id}
            onChange={(e) => {
              void safely(() => load(e.target.value))
            }}
          >
            {project.history.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                Version {item.version}
                {item.change_summary ? ` · ${item.change_summary}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {projects.length > 0 && (
        <aside>
          <h3>Your motion projects</h3>
          {projects
            .filter(
              (p, i, all) =>
                all.findIndex((x) => x.project_id === p.project_id) === i,
            )
            .map((item) => (
              <button
                className="saved-design"
                key={item.id}
                type="button"
                onClick={() => {
                  void safely(() => load(item.id))
                }}
              >
                {item.title} · Version {item.version}
              </button>
            ))}
        </aside>
      )}
    </section>
  )
}
