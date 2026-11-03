"use client"
import { useState, useEffect } from "react"
import { Play, Square } from "lucide-react"
type VoiceAuditionProps = { script: string; language: string }
export const VoiceAudition = ({ script, language }: VoiceAuditionProps) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [voice, setVoice] = useState(""),
    [message, setMessage] = useState("")
  useEffect(() => {
    if (!("speechSynthesis" in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener("voiceschanged", load)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load)
      window.speechSynthesis.cancel()
    }
  }, [])
  return (
    <section className="panel">
      <h2>Audition your script</h2>
      <p>
        Listen using a voice available in this browser. This is a browser
        preview, not saved or generated CreativeOtter audio.
      </p>
      <label className="form-label">
        Browser voice
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          aria-label="Browser voice"
        >
          <option value="">Default for {language}</option>
          {voices.map((v) => (
            <option
              value={v.voiceURI}
              key={v.voiceURI}
            >
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <button
          className="button-primary"
          disabled={!voices.length || !script.trim()}
          onClick={() => {
            if (!("speechSynthesis" in window)) return
            window.speechSynthesis.cancel()
            const utterance = new SpeechSynthesisUtterance(script)
            utterance.lang = language
            utterance.voice = voices.find((v) => v.voiceURI === voice) || null
            utterance.onerror = () =>
              setMessage("This browser could not play the selected voice.")
            window.speechSynthesis.speak(utterance)
            setMessage("Playing a browser-only preview.")
          }}
        >
          <Play size={15} />
          Play preview
        </button>
        <button
          className="button-secondary"
          onClick={() => {
            if ("speechSynthesis" in window) window.speechSynthesis.cancel()
            setMessage("Stopped")
          }}
        >
          <Square size={14} />
          Stop
        </button>
      </div>
      {!voices.length && (
        <p className="small-muted">
          This browser has not exposed any speech voices.
        </p>
      )}
      {message && (
        <p
          role="status"
          className="small-muted"
        >
          {message}
        </p>
      )}
    </section>
  )
}
