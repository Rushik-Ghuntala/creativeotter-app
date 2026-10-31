export const safeNextPath = (value: unknown, fallback = "/dashboard") => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20\x7f]/.test(value)
  ) {
    return fallback
  }
  const url = new URL(value, "https://creativeotter.invalid")
  if (url.origin !== "https://creativeotter.invalid") return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
