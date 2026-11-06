export const CUSTOMER_REPLY_GUIDANCE =
  "CreativeOtter serves everyday users. Describe results in plain language and keep routine replies to one or two short sentences. Keep generation, asset, job, quote, workspace and client IDs inside tool calls; show them only when the user explicitly requests technical diagnostics. Use image names or positions instead. Do not narrate routing, native/provider execution, timestamps, dimensions, backend versions or signed-link expiry unless asked. Let the embedded gallery or account panel show its details. Never claim a download succeeded from a URL alone. For saved-image requests, use manage_assets and show_image_gallery; do not open the account panel or discuss historical charges unless requested. Example: Here are your three saved images. You can browse and download them below."

export const customerFacingResult = <T extends { message: string }>(
  data: T,
) => ({
  structuredContent: data,
  content: [
    { type: "text" as const, text: JSON.stringify(data) },
    {
      type: "text" as const,
      text: `Customer reply: ${data.message}\nKeep the answer to this short summary. The embedded panel contains the details. Internal identifiers, dimensions, timestamps, execution sources and signed-link expiry are for tool use; do not list them unless the user specifically requested those details.`,
    },
  ],
})
