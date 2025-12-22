import { useState } from 'react'
import axios from 'axios'
import { Button, Container, Typography, Card, Box } from '@mui/material'

function App() {
  const [msg, setMsg] = useState("")

  const testConnection = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/')
      setMsg(res.data.message)
    } catch (err) {
      alert("连接失败，请检查后端是否启动")
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
      <Typography variant="h4" gutterBottom>PodFlow 开发环境检测</Typography>
      <Button variant="contained" onClick={testConnection}>点击测试连接</Button>
      {msg && (
        <Card sx={{ mt: 4, p: 2, bgcolor: '#e3f2fd' }}>
          <Typography color="primary">✅ {msg}</Typography>
        </Card>
      )}
    </Container>
  )
}

export default App