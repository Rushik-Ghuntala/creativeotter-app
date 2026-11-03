"use client"
import { useState } from "react"
import { Check, Copy } from "lucide-react"
type CopyButtonProps = { text: string; label?: string }
export const CopyButton = ({ text, label = "Copy" }: CopyButtonProps) => {
  const [message, setMessage] = useState("")
  return (
    <button
      type="button"
      className="button-secondary copy-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setMessage("Copied")
        } catch {
          setMessage("Select and copy the text manually")
        }
      }}
    >
      {message === "Copied" ? <Check size={14} /> : <Copy size={14} />}
      {message || label}
    </button>
  )
}
