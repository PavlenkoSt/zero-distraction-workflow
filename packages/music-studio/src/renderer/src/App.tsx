import { useState } from 'react'
import { Home } from './screens/Home'
import { DropZone } from './screens/DropZone'
import { Generating } from './screens/Generating'
import { Upload } from './screens/Upload'
import type { GenerateResult } from './ipc'

type Screen =
  | { name: 'home' }
  | { name: 'drop' }
  | { name: 'generating'; folderPath: string; outputPath: string }
  | { name: 'upload'; outputPath: string; result: GenerateResult }
  | { name: 'publish' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  const goHome = () => setScreen({ name: 'home' })

  let content

  if (screen.name === 'home') {
    content = (
      <Home
        onRender={() => setScreen({ name: 'drop' })}
        onPublish={() => setScreen({ name: 'publish' })}
      />
    )
  } else if (screen.name === 'drop') {
    content = (
      <DropZone
        onGenerate={(folderPath, outputPath) =>
          setScreen({ name: 'generating', folderPath, outputPath })
        }
        onBack={goHome}
      />
    )
  } else if (screen.name === 'generating') {
    content = (
      <Generating
        folderPath={screen.folderPath}
        outputPath={screen.outputPath}
        onUpload={(outputPath, result) =>
          setScreen({ name: 'upload', outputPath, result })
        }
        onBack={goHome}
      />
    )
  } else if (screen.name === 'publish') {
    content = <Upload onBack={goHome} />
  } else {
    content = (
      <Upload
        outputPath={screen.outputPath}
        generateResult={screen.result}
        onBack={goHome}
      />
    )
  }

  return (
    <>
      <div className="drag-region" />
      {content}
    </>
  )
}
