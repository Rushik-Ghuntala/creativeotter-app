import type { App } from "@modelcontextprotocol/ext-apps"
import type { DisplayAsset } from "@/lib/media/contracts"

type DownloadBridge = Pick<
  App,
  "getHostCapabilities" | "downloadFile" | "openLink"
>

export const savedImageDownloadUrl = (asset: DisplayAsset) => {
  const url = new URL(asset.download_url)
  const preview = new URL(asset.url)
  if (
    url.protocol !== "https:" ||
    url.origin !== preview.origin ||
    url.pathname !== preview.pathname ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Invalid saved image download")
  return url.href
}

export const downloadSavedImage = async (
  app: DownloadBridge,
  asset: DisplayAsset,
) => {
  const url = new URL(savedImageDownloadUrl(asset))
  if (app.getHostCapabilities()?.downloadFile) {
    // A denial/cancellation is final: never open a second dialog behind it.
    return app.downloadFile({
      contents: [
        {
          type: "resource_link",
          uri: url.href,
          name: url.searchParams.get("download") || `creativeotter-${asset.id}`,
          mimeType: asset.mime_type,
        },
      ],
    })
  }
  return app.openLink({ url: url.href })
}
