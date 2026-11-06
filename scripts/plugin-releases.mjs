import { readdir, rm } from "node:fs/promises"
import path from "node:path"

export const pruneOldPluginArchives = async (directory, version) => {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("A release version is required")
  const removed = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const match = /^creativeotter-.+-v(\d+\.\d+\.\d+)\.zip(?:\.sha256)?$/.exec(
      entry.name,
    )
    if (entry.isFile() && match && match[1] !== version) {
      await rm(path.join(directory, entry.name))
      removed.push(entry.name)
    }
  }
  return removed
}
