import { useEffect, useState, useRef } from 'react'
import { api } from '../ipc'
import type { GenerateResult } from '../ipc'
import './Generating.css'

type Props = {
  folderPath: string
  outputPath: string
  onUpload: (outputPath: string, result: GenerateResult) => void
  onBack: () => void
}

export function Generating({ folderPath, outputPath, onUpload, onBack }: Props) {
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const startRef = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    api.generateVideo(folderPath, outputPath)
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
    <div className="generating-screen">
      <h2>Generation Failed</h2>
      <pre className="error-box">{error}</pre>
      <button className="secondary-btn" onClick={onBack}>← Back to Home</button>
    </div>
  )

  if (!result) return (
    <div className="generating-screen">
      <div className="spinner" />
      <h2>Generating video…</h2>
      <p className="elapsed">{fmtElapsed(elapsed)}</p>
      <p className="hint">This takes ~10 minutes. Don&apos;t close the app.</p>
      <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
    </div>
  )

  return (
    <div className="generating-screen done">
      <div className="checkmark">✓</div>
      <h2>Video Ready</h2>
      <div className="result-grid">
        <span>Duration</span><span>{result.duration}</span>
        <span>Tracks</span><span>{result.trackCount}</span>
        <span>Video</span><span className="path">{result.videoPath}</span>
        <span>CSV</span><span className="path">{result.csvPath}</span>
      </div>
      <div className="action-row">
        <button className="secondary-btn" onClick={() => api.openPath(outputPath)}>
          Open Output Folder
        </button>
        <button className="primary-btn" onClick={() => onUpload(outputPath, result)}>
          Upload to YouTube →
        </button>
      </div>
    </div>
  )
}
