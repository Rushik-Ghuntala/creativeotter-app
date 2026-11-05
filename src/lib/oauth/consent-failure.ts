export const getConsentFailure = (error: string | string[] | undefined) => {
  if (error === "scope")
    return {
      title: "This assistant requested unsupported access.",
      message:
        "Reconnect from your assistant using standard sign-in permissions. CreativeOtter supports email, profile, phone and persistent sign-in; workspace and media access are approved separately.",
      retry: false,
    }
  if (error === "failed")
    return {
      title: "The connection could not be completed.",
      message:
        "Try this authorization again. If your assistant has closed its sign-in window, start a new connection there.",
      retry: true,
    }
  return {
    title: "This sign-in request has expired.",
    message:
      "Open the CreativeOtter connection in your assistant and choose Sign in or Reconnect to get a fresh link. Signing in to this website alone does not connect your assistant.",
    retry: false,
  }
}
