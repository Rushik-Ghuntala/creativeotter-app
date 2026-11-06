import test from "node:test"
import assert from "node:assert/strict"
import { zipSync, strToU8 } from "fflate"
import {
  readProjectZip,
  packProject,
  projectDigest,
} from "@/lib/render/project"
import { validateRenderInput } from "@/lib/render/sanitize"
import { motionTemplate } from "@/lib/render/motion-template"
const files = {
  "index.html": strToU8(motionTemplate("Fresh mornings start here.")),
}
test("complete motion archives preserve their editable source byte-for-byte", () => {
  const zip = zipSync(files)
  assert.deepEqual(readProjectZip(zip)["index.html"], files["index.html"])
  assert.equal(projectDigest(zip), projectDigest(zip.slice()))
  assert.equal(
    Object.keys(
      readProjectZip(
        packProject([
          {
            path: "index.html",
            content: motionTemplate("Fresh mornings start here."),
          },
        ]),
      ),
    ).length,
    1,
  )
})
test("project archives reject traversal, duplicate casing, symlinks, archive bombs and unsupported files", () => {
  for (const path of [
    "../escape.js",
    "/absolute.html",
    "a/../../secret.js",
    ".env",
    "node_modules/run.js",
    "a\\evil.js",
    "run.sh",
  ]) {
    assert.throws(() =>
      readProjectZip(zipSync({ ...files, [path]: strToU8("bad") })),
    )
  }
  assert.throws(() =>
    readProjectZip(zipSync({ ...files, "INDEX.HTML": strToU8("duplicate") })),
  )
  const zip = zipSync(files)
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22,
    central = view.getUint32(end + 16, true)
  const symlink = zip.slice(),
    symbol = new DataView(symlink.buffer)
  symbol.setUint32(central + 38, 0xa1ff0000, true)
  assert.throws(() => readProjectZip(symlink))
  const bomb = zip.slice()
  new DataView(bomb.buffer).setUint32(central + 24, 0x7fffffff, true)
  assert.throws(() => readProjectZip(bomb))
  assert.throws(() =>
    readProjectZip(zipSync({ "compositions/scene.html": files["index.html"] })),
  )
  assert.throws(() => readProjectZip(zip.slice(0, -10)))
})
test("HyperFrames uses private revisions and motion-only bounded MP4 settings", () => {
  const input = {
    title: "Summer sale",
    engine: "hyperframes",
    revision_id: "10000000-0000-4000-8000-000000000001",
    format: "mp4",
    html: "",
    css: "",
    width: 864,
    height: 1080,
    duration_seconds: 10,
    fps: 30,
    asset_ids: [],
  }
  assert.equal(validateRenderInput(input).fps, 30)
  for (const patch of [
    { format: "png" },
    { revision_id: undefined },
    { html: "<script>x</script>" },
    { fps: 60 },
    { duration_seconds: 31 },
    { asset_ids: [input.revision_id] },
  ])
    assert.throws(() => validateRenderInput({ ...input, ...patch }))
})
test("everyday headlines are HTML escaped before motion authoring", () => {
  const source = motionTemplate('<img src=x onerror="alert(1)">')
  assert.ok(source.includes("&lt;img"))
  assert.equal(source.includes("<img src=x"), false)
})

test("authored archive retries have the same digest across time and file order", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-01-01").getTime(),
  })
  const first = packProject([
    { path: "index.html", content: motionTemplate("Weekend treats") },
    { path: "notes.txt", content: "Keep the music" },
  ])
  t.mock.timers.setTime(new Date("2028-01-01").getTime())
  const retry = packProject([
    { path: "notes.txt", content: "Keep the music" },
    { path: "index.html", content: motionTemplate("Weekend treats") },
  ])
  assert.equal(projectDigest(first), projectDigest(retry))
})
