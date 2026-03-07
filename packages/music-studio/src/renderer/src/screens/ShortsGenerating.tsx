import { useEffect, useState, useRef } from 'react'
import { api } from '../ipc'
import type { ShortsGenerateResult } from '../ipc'
import './ShortsGenerating.css'

type Props = {
  folderPath: string
  outputPath: string
  trackTexts: string[]
  onBack: () => void
}

export function ShortsGenerating({ folderPath, outputPath, trackTexts, onBack }: Props) {
  const [result, setResult] = useState<ShortsGenerateResult | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const startRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    api.generateShorts(folderPath, outputPath, trackTexts)
      .then(r => {
        clearInterval(timerRef.current!)
        setResult(r)
      })
      .catch(err => {
        clearInterval(timerRef.current!)
        if (!cancelled) setError(String(err))
      })

    return () => clearInterval(timerRef.current!)
  }, [])

  const handleCancel = async () => {
    setCancelled(true)
    clearInterval(timerRef.current!)
    await api.cancelGenerate()
    onBack()
  }

  const fmtElapsed = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (error) return (
    <div className="shorts-generating-screen">
      <h2>Generation Failed</h2>
      <pre className="error-box">{error}</pre>
      <button className="secondary-btn" onClick={onBack}>← Back to Home</button>
    </div>
  )

  if (!result) return (
    <div className="shorts-generating-screen">
      <div className="spinner" />
      <h2>Generating shorts…</h2>
      <p className="elapsed">{fmtElapsed(elapsed)}</p>
      <p className="hint">Rendering {folderPath.split('/').pop()} into portrait clips.</p>
      <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
    </div>
  )

  return (
    <div className="shorts-generating-screen done">
      <div className="checkmark">✓</div>
      <h2>{result.count} Shorts Ready</h2>
      <ul className="shorts-file-list">
        {result.files.map((f, i) => (
          <li key={i} className="shorts-file-item">
            <span className="shorts-file-name">{f.video.split('/').pop()}</span>
          </li>
        ))}
      </ul>
      <div className="action-row">
        <button className="secondary-btn" onClick={() => api.openPath(result.outputPath)}>
          Open Output Folder
        </button>
        <button className="primary-btn" onClick={onBack}>
          Back to Home
        </button>
      </div>
    </div>
  )
}
