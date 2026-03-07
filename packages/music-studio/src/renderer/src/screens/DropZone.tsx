import { useState, useCallback, useEffect } from 'react'
import { api } from '../ipc'
import type { ScanResult } from '../ipc'
import './DropZone.css'

type Props = {
  mode: 'video' | 'shorts'
  onGenerate: (folderPath: string, outputPath: string, thematicText: string) => void
  onBack: () => void
}

export function DropZone({ mode, onGenerate, onBack }: Props) {
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [outputPath, setOutputPath] = useState('')
  const [thematicText, setThematicText] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    api.getDefaultOutputPath().then(setOutputPath)
  }, [])

  const scanPath = useCallback(async (filePath: string) => {
    setError('')
    try {
      const result = await api.scanFolder(filePath)
      setScan(result)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const filePath = api.getPathForFile(file)
    if (!filePath) { setError('Could not get folder path'); return }
    scanPath(filePath)
  }, [scanPath])

  const handleBrowse = useCallback(async () => {
    const folderPath = await api.selectFolder()
    if (folderPath) scanPath(folderPath)
  }, [scanPath])

  const isReady = scan && scan.hasImage && !!outputPath && (mode === 'video' || !!thematicText.trim())

  const title = mode === 'shorts' ? 'Generate Shorts' : 'Render Video'
  const buttonLabel = mode === 'shorts' ? 'Generate Shorts' : 'Generate Video'

  return (
    <div className="dropzone-screen">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1>{title}</h1>

      <div
        className={`drop-target ${dragging ? 'dragging' : ''} ${scan ? 'has-scan' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {scan ? (
          <div className="scan-result">
            <div className="folder-name">{scan.folderPath.split('/').pop()}</div>
            <div className="scan-info">
              <span className={scan.trackCount > 0 ? 'ok' : 'warn'}>
                {scan.trackCount} audio tracks
              </span>
              <span className={scan.hasImage ? 'ok' : 'warn'}>
                {scan.hasImage ? '✓ background image' : '✗ no image found'}
              </span>
            </div>
            <button className="link-btn" onClick={() => setScan(null)}>
              Drop a different folder
            </button>
          </div>
        ) : (
          <>
            <p>Drop a music folder here</p>
            <button className="link-btn" onClick={handleBrowse}>or browse…</button>
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="output-row">
        <label>Output folder</label>
        <input
          type="text"
          value={outputPath}
          onChange={e => setOutputPath(e.target.value)}
          placeholder="~/Desktop/Music"
        />
      </div>

      {mode === 'shorts' && (
        <div className="output-row">
          <label>Thematic text</label>
          <input
            type="text"
            value={thematicText}
            onChange={e => setThematicText(e.target.value)}
            placeholder="e.g. lofi ambient focus music for deep work"
          />
        </div>
      )}

      <button
        className="primary-btn"
        disabled={!isReady}
        onClick={() => scan && onGenerate(scan.folderPath, outputPath, thematicText)}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
