import MainLayout from './components/layout/MainLayout'

function App() {
  // 使用示例音频文件
  const testAudioUrl = 'http://localhost:8000/static/sample_audio/003.mp3'

  return (
    <MainLayout
      episodeTitle="测试播客 - Product Management Discussion"
      showName="Lenny's Podcast"
      audioUrl={testAudioUrl}
    />
  )
}

export default App