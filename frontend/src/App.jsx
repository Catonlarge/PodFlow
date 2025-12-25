import { useState } from 'react'
import axios from 'axios'
import { Button, Container, Typography, Card, Box, Stack } from '@mui/material'
import AudioPlayer from './components/AudioPlayer'

function App() {
  const [msg, setMsg] = useState("")

  const testConnection = async () => {
    try {
      const res = await axios.get('http://localhost:8000/')
      setMsg(res.data.message)
    } catch (err) {
      alert("连接失败，请检查后端是否启动")
    }
  }

  // 使用示例音频文件
  const testAudioUrl = 'http://localhost:8000/static/sample_audio/003.mp3'

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Stack spacing={4}>
        {/* 开发环境检测 */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom>PodFlow 开发环境检测</Typography>
          <Button variant="contained" onClick={testConnection}>点击测试连接</Button>
          {msg && (
            <Card sx={{ mt: 4, p: 2, bgcolor: '#e3f2fd' }}>
              <Typography color="primary">✅ {msg}</Typography>
            </Card>
          )}
        </Box>

        {/* AudioPlayer 组件测试 */}
        <Box>
          <Typography variant="h5" gutterBottom sx={{ mb: 2 }}>
            AudioPlayer 组件测试
          </Typography>
          <AudioPlayer 
            audioUrl={testAudioUrl}
            onTimeUpdate={(time) => {
              // 可选：用于调试，查看时间更新
              console.log('当前播放时间:', time);
            }}
          />
        </Box>
      </Stack>
    </Container>
  )
}

export default App