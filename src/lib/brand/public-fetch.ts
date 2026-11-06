import "server-only"
import { lookup } from "node:dns/promises"
import { request } from "node:https"
import { createGunzip, createBrotliDecompress, createInflate } from "node:zlib"
import ipaddr from "ipaddr.js"

export const publicWebsiteUrl = (value: string, base?: string) => {
  const normalized =
    !base && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value
  const url = new URL(normalized, base)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.href.length > 2048 ||
    !url.hostname.includes(".") ||
    ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) ||
    /\.(localhost|local|internal|test|invalid|example|onion)$/i.test(
      url.hostname,
    )
  )
    throw new Error("Use a public company website with HTTPS.")
  url.hash = ""
  return url
}
export const publicAddress = (address: string) => {
  try {
    return ipaddr.parse(address).range() === "unicast"
  } catch {
    return false
  }
}
export type WebsiteFile = { url: string; mime: string; bytes: Buffer }
export type WebsiteReader = (url: string, limit: number) => Promise<WebsiteFile>

export const createPublicWebsiteReader = (
  resolve = (hostname: string) =>
    lookup(hostname, { all: true, verbatim: true }),
): WebsiteReader => {
  const deadline = Date.now() + 45000
  let requests = 0,
    total = 0
  const read: WebsiteReader = async (value, limit) => {
    const url = publicWebsiteUrl(value)
    if (++requests > 24 || Date.now() >= deadline)
      throw new Error(
        "Website discovery reached its limit. Try a more specific company page.",
      )
    const addresses = await Promise.race([
      resolve(url.hostname),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Website lookup timed out.")),
          4000,
        )
        timer.unref()
      }),
    ])
    if (
      !addresses.length ||
      addresses.some(({ address }) => !publicAddress(address))
    )
      throw new Error("This website address is not public.")
    const address = addresses[0]
    const result = await new Promise<WebsiteFile | { redirect: string }>(
      (resolve, reject) => {
        const req = request(
          url,
          {
            method: "GET",
            family: address.family,
            // Pin the validated address for this connection; redirects resolve afresh.
            lookup: (_name, _options, callback) =>
              callback(null, address.address, address.family),
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; CreativeOtterArtwork/1.0)",
              Accept: "text/html,image/*;q=0.9,*/*;q=0.1",
              "Accept-Encoding": "identity",
            },
          },
          async (response) => {
            try {
              if (
                [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
                response.headers.location
              ) {
                response.destroy()
                resolve({
                  redirect: publicWebsiteUrl(
                    response.headers.location,
                    url.href,
                  ).href,
                })
                return
              }
              if (response.statusCode !== 200)
                throw new Error("This website did not allow artwork retrieval.")
              if (Number(response.headers["content-length"] || 0) > limit)
                throw new Error("Website file is too large.")
              const encoding = response.headers["content-encoding"]
              const stream =
                encoding === "gzip"
                  ? response.pipe(createGunzip())
                  : encoding === "br"
                    ? response.pipe(createBrotliDecompress())
                    : encoding === "deflate"
                      ? response.pipe(createInflate())
                      : response
              if (
                encoding &&
                !["identity", "gzip", "br", "deflate"].includes(encoding)
              )
                throw new Error("Unsupported website encoding.")
              const chunks: Buffer[] = []
              let size = 0
              for await (const part of stream) {
                const bytes = Buffer.from(part)
                size += bytes.length
                total += bytes.length
                if (
                  size > limit ||
                  total > 24 * 1024 * 1024 ||
                  Date.now() >= deadline
                ) {
                  stream.destroy()
                  response.destroy()
                  throw new Error(
                    "Website discovery reached its download limit.",
                  )
                }
                chunks.push(bytes)
              }
              resolve({
                url: url.href,
                mime: String(response.headers["content-type"] || "")
                  .split(";")[0]
                  .toLowerCase(),
                bytes: Buffer.concat(chunks),
              })
            } catch (error) {
              response.destroy()
              reject(error)
            }
          },
        )
        const timer = setTimeout(
          () => req.destroy(new Error("Website download timed out.")),
          Math.max(1, Math.min(7000, deadline - Date.now())),
        )
        req.once("close", () => clearTimeout(timer))
        req.once("error", reject)
        req.end()
      },
    )
    if ("redirect" in result) {
      if (requests > 20) throw new Error("Too many website redirects.")
      return read(result.redirect, limit)
    }
    return result
  }
  return read
}
