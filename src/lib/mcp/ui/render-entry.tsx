import { createRoot } from "react-dom/client"
import { RenderApp } from "@/components/render/RenderApp"
import "@/styles/render.css"
const root = document.getElementById("root")
if (root) createRoot(root).render(<RenderApp />)
