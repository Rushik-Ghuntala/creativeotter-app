import { createRoot } from "react-dom/client"
import { AccountApp } from "@/components/mcp-account/AccountApp"
import "@/lib/mcp/ui/account.css"

declare const __OTTER_ICON__: string

const root = document.getElementById("root")
if (root) createRoot(root).render(<AccountApp icon={__OTTER_ICON__} />)
