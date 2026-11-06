import test from "node:test"
import assert from "node:assert/strict"
import { downloadSavedImage, savedImageDownloadUrl } from "@/lib/mcp/download"

const url =
  "https://storage.example.invalid/storage/v1/object/sign/private/image.png?token=fixture"
const asset = {
  id: "10000000-0000-4000-8000-000000000001",
  label: "Second image",
  url,
  download_url: `${url}&download=creativeotter-second.png`,
  mime_type: "image/png",
  width: 100,
  height: 100,
  favorite: false,
}

test("saved image download uses the host file API for the exact refreshed image without a browser detour", async () => {
  let calls = 0
  const result = await downloadSavedImage(
    {
      getHostCapabilities: () => ({ downloadFile: {} }),
      downloadFile: async (params) => {
        calls++
        assert.deepEqual(params, {
          contents: [
            {
              type: "resource_link",
              uri: asset.download_url,
              name: "creativeotter-second.png",
              mimeType: "image/png",
            },
          ],
        })
        return {}
      },
      openLink: async () => {
        throw new Error("Unexpected browser dialog")
      },
    },
    asset,
  )
  assert.equal(result.isError, undefined)
  assert.equal(calls, 1)
})

test("older hosts retain their signed-link download and denial never opens a second dialog", async () => {
  let downloads = 0
  let links = 0
  const bridge = {
    getHostCapabilities: () => ({}),
    downloadFile: async () => {
      downloads++
      return { isError: true }
    },
    openLink: async (params: { url: string }) => {
      links++
      assert.equal(params.url, asset.download_url)
      return {}
    },
  }
  await downloadSavedImage(bridge, asset)
  assert.equal(links, 1)
  assert.equal(downloads, 0)
  const denied = await downloadSavedImage(
    { ...bridge, getHostCapabilities: () => ({ downloadFile: {} }) },
    asset,
  )
  assert.equal(denied.isError, true)
  assert.equal(downloads, 1)
  assert.equal(links, 1)
})

test("download cannot substitute a different origin, asset path or non-HTTPS destination", async () => {
  const bridge = {
    getHostCapabilities: () => ({}),
    downloadFile: async () => {
      throw new Error("Unexpected file request")
    },
    openLink: async () => {
      throw new Error("Unexpected navigation")
    },
  }
  for (const bad of [
    "http://storage.example.invalid/storage/v1/object/sign/private/image.png",
    "https://attacker.invalid/image.png",
    "https://storage.example.invalid/another-image.png",
    `${asset.download_url}#fragment`,
  ]) {
    await assert.rejects(
      () => downloadSavedImage(bridge, { ...asset, download_url: bad }),
      /Invalid saved image download/,
    )
  }
})

test("explicit download recovery validates the exact saved asset URL", () => {
  assert.equal(savedImageDownloadUrl(asset), asset.download_url)
  assert.throws(
    () =>
      savedImageDownloadUrl({
        ...asset,
        download_url: "https://attacker.invalid/image.png",
      }),
    /Invalid saved image download/,
  )
})
