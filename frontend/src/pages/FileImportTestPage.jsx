/**
 * FileImportTestPage 组件
 * 
 * 用于测试 FileImportModal 组件的临时页面
 * 
 * 访问方式：在浏览器中访问 /test-file-import
 */
import { useState } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import FileImportModal from '../components/upload/FileImportModal';

export default function FileImportTestPage() {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(null);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleConfirm = (files) => {
    console.log('选择的文件:', files);
    // 格式化显示，包含文件详细信息
    const formattedFiles = {
      audioFile: files.audioFile ? {
        name: files.audioFile.name,
        size: files.audioFile.size,
        type: files.audioFile.type,
        lastModified: new Date(files.audioFile.lastModified).toLocaleString(),
      } : null,
      subtitleFile: files.subtitleFile ? {
        name: files.subtitleFile.name,
        size: files.subtitleFile.size,
        type: files.subtitleFile.type,
        lastModified: new Date(files.subtitleFile.lastModified).toLocaleString(),
      } : null,
      enableTranscription: files.enableTranscription,
      useHistoricalSubtitle: files.useHistoricalSubtitle,
    };
    setSelectedFiles(formattedFiles);
    setOpen(false);
  };

  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          FileImportModal 测试页面
        </Typography>
        
        <Box sx={{ mt: 3, mb: 3 }}>
          <Button 
            variant="contained" 
            onClick={handleOpen}
            sx={{ mb: 2 }}
          >
            打开文件选择弹窗
          </Button>
        </Box>

        {selectedFiles && (
          <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              已选择的文件：
            </Typography>
            <Typography variant="body2" component="pre" sx={{ mt: 1 }}>
              {JSON.stringify(selectedFiles, null, 2)}
            </Typography>
          </Box>
        )}

        <FileImportModal
          open={open}
          onClose={handleClose}
          onConfirm={handleConfirm}
        />
      </Paper>
    </Box>
  );
}

