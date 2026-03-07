import { useState, useCallback } from 'react'
import { api } from '../ipc'
import type { ShortsUploadResult } from '../ipc'
import './PublishShorts.css'

type Status = 'idle' | 'uploading' | 'done' | 'error'

type Props = {
  onBack: () => void
}

export function PublishShorts({ onBack }: Props) {
  const [folderPath, setFolderPath] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [uploadResult, setUploadResult] = useState<ShortsUploadResult | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const p = api.getPathForFile(file)
    if (p) setFolderPath(p)
  }, [])

  const handleBrowse = useCallback(async () => {
    const p = await api.selectFolder()
    if (p) setFolderPath(p)
  }, [])

  const handlePublish = async () => {
    if (!folderPath) return
    setStatus('uploading')
    setError('')
    try {
      const result = await api.publishShorts(folderPath)
      setUploadResult(result)
      setStatus('done')
    } catch (err) {
      setError(String(err))
      setStatus('error')
    }
  }

  return (
    <div className="publish-shorts-screen">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h2>Publish Shorts</h2>

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
            <p>Drop shorts folder here</p>
            <button className="link-btn" onClick={handleBrowse}>or browse…</button>
          </>
        )}
      </div>

      {(status === 'idle' || status === 'error') && (
        <button
          className="primary-btn"
          disabled={!folderPath}
          onClick={handlePublish}
        >
          Authenticate &amp; Publish
        </button>
      )}

      {status === 'uploading' && (
        <div className="uploading-panel">
          <div className="spinner" />
          <p>Authenticating &amp; uploading shorts…</p>
        </div>
      )}

      {status === 'done' && uploadResult && (
        <div className="done-panel">
          <div className="checkmark">✓</div>
          <p className="summary">
            {uploadResult.succeeded} of {uploadResult.total} uploaded
            {uploadResult.failed > 0 && ` · ${uploadResult.failed} failed`}
          </p>
          <ul className="results-list">
            {uploadResult.results.map((r, i) => (
              <li key={i} className={`result-item ${r.error ? 'failed' : 'ok'}`}>
                <span className="result-filename">{r.filename}</span>
                {r.studioUrl ? (
                  <a
                    className="result-link"
                    href={r.studioUrl}
                    onClick={e => { e.preventDefault(); api.openExternal(r.studioUrl!) }}
                  >
                    Studio →
                  </a>
                ) : (
                  <span className="result-error">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">Set Altered content → No, then publish when ready.</p>
        </div>
      )}

      {error && <pre className="error-box">{error}</pre>}
    </div>
  )
}
