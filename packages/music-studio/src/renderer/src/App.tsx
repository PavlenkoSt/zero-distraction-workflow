import { useState } from 'react'
import { Home } from './screens/Home'
import { DropZone } from './screens/DropZone'
import { Generating } from './screens/Generating'
import { ShortsGenerating } from './screens/ShortsGenerating'
import { Upload } from './screens/Upload'
import { PublishShorts } from './screens/PublishShorts'
import type { GenerateResult } from './ipc'

type Screen =
  | { name: 'home' }
  | { name: 'drop' }
  | { name: 'generating'; folderPath: string; outputPath: string }
  | { name: 'upload'; outputPath: string; result: GenerateResult }
  | { name: 'publish' }
  | { name: 'shorts-drop' }
  | { name: 'shorts-generating'; folderPath: string; outputPath: string; thematicText: string }
  | { name: 'publish-shorts' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  const goHome = () => setScreen({ name: 'home' })

  let content

  if (screen.name === 'home') {
    content = (
      <Home
        onRender={() => setScreen({ name: 'drop' })}
        onPublish={() => setScreen({ name: 'publish' })}
        onGenerateShorts={() => setScreen({ name: 'shorts-drop' })}
        onPublishShorts={() => setScreen({ name: 'publish-shorts' })}
      />
    )
  } else if (screen.name === 'drop') {
    content = (
      <DropZone
        mode="video"
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
  } else if (screen.name === 'shorts-drop') {
    content = (
      <DropZone
        mode="shorts"
        onGenerate={(folderPath, outputPath, thematicText) =>
          setScreen({ name: 'shorts-generating', folderPath, outputPath, thematicText })
        }
        onBack={goHome}
      />
    )
  } else if (screen.name === 'shorts-generating') {
    content = (
      <ShortsGenerating
        folderPath={screen.folderPath}
        outputPath={screen.outputPath}
        thematicText={screen.thematicText}
        onBack={goHome}
      />
    )
  } else if (screen.name === 'publish-shorts') {
    content = <PublishShorts onBack={goHome} />
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
