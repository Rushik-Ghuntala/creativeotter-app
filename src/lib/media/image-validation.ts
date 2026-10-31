import { imageSize } from "image-size"
import { imageSignatureMatches } from "@/lib/media/contracts"

export const validateImageBytes = (
  bytes: Uint8Array,
  mime: string,
  maxBytes = 12582912,
) => {
  if (
    !bytes.length ||
    bytes.length > maxBytes ||
    !imageSignatureMatches(bytes, mime)
  )
    throw new Error(
      "Use a valid PNG, JPEG or WebP image within the upload limit",
    )
  const { width, height } = imageSize(bytes)
  if (!width || !height || width > 8192 || height > 8192)
    throw new Error("Image dimensions must be between 1 and 8192 pixels")
  return { width, height }
}
