import { createRoot } from "react-dom/client"
import { GenerationApp } from "@/components/generation/GenerationApp"
import "@/styles/generation.css"
const root = document.getElementById("root")
if (root) createRoot(root).render(<GenerationApp />)
