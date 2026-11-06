export const readRenderBody = async (request: Request, limit: number) => {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new Error("This request is too large.")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("This request is empty.")
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.length
      if (length > limit) {
        await reader.cancel()
        throw new Error("This request is too large.")
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}
