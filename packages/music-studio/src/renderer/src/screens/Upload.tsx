import { useState, useCallback } from 'react'
import { api } from '../ipc'
import type { GenerateResult, UploadResult } from '../ipc'
import './Upload.css'

type Props = {
  outputPath?: string
  generateResult?: GenerateResult
  onBack?: () => void
}

type Status = 'idle' | 'authenticating' | 'uploading' | 'done' | 'error'

export function Upload({ outputPath: initialPath, generateResult, onBack }: Props) {
  const [folderPath, setFolderPath] = useState(initialPath ?? '')
  const [keyword, setKeyword] = useState('')
  const [mixNumber, setMixNumber] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const isPublishMode = !generateResult

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = api.getPathForFile(file)
    if (path) setFolderPath(path)
  }, [])

  const handleBrowse = useCallback(async () => {
    const path = await api.selectFolder()
    if (path) setFolderPath(path)
  }, [])

  const handleUpload = async () => {
    if (!keyword.trim() || !folderPath) return
    setStatus('authenticating')
    setError('')
    try {
      const mix = mixNumber.trim() ? parseInt(mixNumber) : undefined
      setStatus('uploading')
      const result = await api.uploadVideo(folderPath, keyword.trim(), mix)
      setUploadResult(result)
      setStatus('done')
    } catch (err) {
      setError(String(err))
      setStatus('error')
    }
  }

  const statusLabel: Record<Status, string> = {
    idle: '',
    authenticating: 'Opening browser for Google sign-in…',
    uploading: 'Uploading video (~20 min)…',
    done: 'Uploaded!',
    error: 'Upload failed',
  }

  return (
    <div className="upload-screen">
      {onBack && <button className="back-btn" onClick={onBack}>← Back</button>}
      <h2>Upload to YouTube</h2>

      {generateResult && (
        <div className="video-info">
          <span>{generateResult.duration}</span>
          <span>·</span>
          <span>{generateResult.trackCount} tracks</span>
        </div>
      )}

      {isPublishMode && (
        <div
          className={`folder-picker ${dragging ? 'dragging' : ''} ${folderPath ? 'has-folder' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleFolderDrop}
        >
          {folderPath ? (
            <div className="folder-selected">
              <span className="folder-name">{folderPath.split('/').pop()}</span>
              <button className="link-btn" onClick={() => setFolderPath('')}>change</button>
            </div>
          ) : (
            <>
              <p>Drop a folder with .mp4, .png, .csv</p>
              <button className="link-btn" onClick={handleBrowse}>or browse…</button>
            </>
          )}
        </div>
      )}

      <div className="field">
        <label>Keyword / Theme *</label>
        <input
          type="text"
          placeholder="e.g. deep work, build the system"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          disabled={status !== 'idle' && status !== 'error'}
        />
      </div>

      <div className="field">
        <label>Mix number (optional)</label>
        <input
          type="number"
          placeholder="e.g. 12"
          value={mixNumber}
          onChange={e => setMixNumber(e.target.value)}
          disabled={status !== 'idle' && status !== 'error'}
        />
      </div>

      {(status === 'idle' || status === 'error') && (
        <button
          className="primary-btn"
          disabled={!keyword.trim() || !folderPath}
          onClick={handleUpload}
        >
          Authenticate &amp; Upload
        </button>
      )}

      {status === 'done' && uploadResult && (
        <div className="done-panel">
          <div className="checkmark">✓</div>
          <p>Video uploaded as private draft</p>
          <a onClick={() => api.openExternal(uploadResult.url)} className="yt-link">
            Open in YouTube Studio →
          </a>
          <p className="hint">Set Altered content → No, then publish when ready.</p>
        </div>
      )}

      {(status === 'authenticating' || status === 'uploading') && (
        <div className="uploading-panel">
          <div className="spinner" />
          <p>{statusLabel[status]}</p>
        </div>
      )}

      {error && <pre className="error-box">{error}</pre>}
    </div>
  )
}
