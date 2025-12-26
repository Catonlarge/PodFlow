import { Routes, Route, Navigate } from 'react-router-dom'
import EpisodePage from './pages/EpisodePage'
import EpisodeListPage from './pages/EpisodeListPage'
import FileImportTestPage from './pages/FileImportTestPage'
import MainLayout from './components/layout/MainLayout'

function App() {
  return (
    <Routes>
      {/* 默认路由：显示 Episode 列表 */}
      <Route path="/" element={<EpisodeListPage />} />
      
      {/* 测试页面路由（保留用于开发测试） */}
      <Route 
        path="/test" 
        element={
          <MainLayout
            episodeTitle="测试播客 - Product Management Discussion"
            showName="Lenny's Podcast"
            audioUrl="http://localhost:8000/static/sample_audio/003.mp3"
          />
        } 
      />
      
      {/* FileImportModal 测试页面 */}
      <Route path="/test-file-import" element={<FileImportTestPage />} />
      
      {/* Episode 页面路由 */}
      <Route path="/episodes/:episodeId" element={<EpisodePage />} />
      
      {/* 404 重定向到首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App