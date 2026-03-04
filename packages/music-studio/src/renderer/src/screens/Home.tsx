import './Home.css'

type Props = {
  onRender: () => void
  onPublish: () => void
}

export function Home({ onRender, onPublish }: Props) {
  return (
    <div className="home-screen">
      <h1>Music Studio</h1>

      <div className="home-cards">
        <button className="home-card" onClick={onRender}>
          <div className="card-icon">🎬</div>
          <div className="card-title">Render Video</div>
          <div className="card-desc">Audio tracks + image → MP4 video with chapters</div>
        </button>

        <button className="home-card" onClick={onPublish}>
          <div className="card-icon">📡</div>
          <div className="card-title">Publish Video</div>
          <div className="card-desc">Upload existing video to YouTube as private draft</div>
        </button>
      </div>
    </div>
  )
}
