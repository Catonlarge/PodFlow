import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  FormControlLabel,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Stack,
} from '@mui/material';
import { Close, CheckCircle } from '@mui/icons-material';
import api from '../../api';
import { calculateFileMD5, readAudioDuration, getFileExtension } from '../../utils/fileUtils';

/**
 * FileImportModal 组件
 * 
 * 文件上传弹窗组件，支持音频和字幕文件选择
 * 
 * @param {boolean} open - 弹窗是否打开
 * @param {Function} onClose - 关闭回调 (event, reason) => void
 * @param {Function} onConfirm - 确认回调 (files) => void
 *   files: { 
 *     audioFile: File, 
 *     subtitleFile: File | null, 
 *     enableTranscription: boolean,
 *     useHistoricalSubtitle: boolean
 *   }
 */
export default function FileImportModal({ open, onClose, onConfirm }) {
  // 状态管理
  const [audioFile, setAudioFile] = useState(null);
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [enableTranscription, setEnableTranscription] = useState(false);
  const [audioPath, setAudioPath] = useState('');
  const [subtitlePath, setSubtitlePath] = useState('');
  const [errors, setErrors] = useState({ audio: '', subtitle: '' });
  const [isCalculatingMD5, setIsCalculatingMD5] = useState(false);
  const [historicalSubtitle, setHistoricalSubtitle] = useState(null);
  const [useHistoricalSubtitle, setUseHistoricalSubtitle] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // Refs
  const audioInputRef = useRef(null);
  const subtitleInputRef = useRef(null);

  // 常量
  const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
  const MAX_DURATION = 3 * 60 * 60; // 3小时（秒）
  const VALID_AUDIO_EXTENSIONS = ['.mp3', '.wav'];
  const VALID_SUBTITLE_EXTENSIONS = ['.json'];

  // 重置状态（当弹窗关闭时）
  useEffect(() => {
    if (!open) {
      setAudioFile(null);
      setSubtitleFile(null);
      setEnableTranscription(false);
      setAudioPath('');
      setSubtitlePath('');
      setErrors({ audio: '', subtitle: '' });
      setIsCalculatingMD5(false);
      setHistoricalSubtitle(null);
      setUseHistoricalSubtitle(false);
      setIsShaking(false);
    }
  }, [open]);

  /**
   * 验证音频文件
   */
  const validateAudioFile = async (file) => {
    const errors = { audio: '', subtitle: '' };

    // 验证格式
    const ext = getFileExtension(file.name).toLowerCase();
    if (!VALID_AUDIO_EXTENSIONS.includes(ext)) {
      errors.audio = '音频文件格式不支持，仅支持 MP3 和 WAV 格式';
      return errors;
    }

    // 验证大小
    if (file.size >= MAX_FILE_SIZE) {
      errors.audio = '选择音频文件不得超过1GB';
      return errors;
    }

    // 验证时长
    try {
      const duration = await readAudioDuration(file);
      if (duration >= MAX_DURATION) {
        errors.audio = '选择音频文件不得超过3个小时';
        return errors;
      }
    } catch {
      errors.audio = '无法读取音频文件时长';
      return errors;
    }

    return errors;
  };

  /**
   * 验证字幕文件
   */
  const validateSubtitleFile = (file) => {
    const errors = { audio: '', subtitle: '' };

    // 验证格式
    const ext = getFileExtension(file.name).toLowerCase();
    if (!VALID_SUBTITLE_EXTENSIONS.includes(ext)) {
      errors.subtitle = '字幕文件格式不支持，仅支持 JSON 格式';
      return errors;
    }

    return errors;
  };

  /**
   * 检查历史字幕
   * 
   * 注意：此函数失败时静默返回 { exists: false }，不影响文件选择流程
   */
  const checkHistoricalSubtitle = async (fileHash) => {
    try {
      // 确保 fileHash 是有效的 MD5 格式（32位十六进制字符串）
      if (!fileHash || typeof fileHash !== 'string') {
        return { exists: false };
      }
      
      // 清理可能的额外字符（如冒号、空格等）
      const cleanHash = fileHash.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
      
      // 验证长度（MD5 应该是32位）
      if (cleanHash.length !== 32) {
        return { exists: false };
      }
      
      // 调用 API 检查历史字幕
      const response = await api.get('/api/episodes/check-subtitle', {
        params: { file_hash: cleanHash },
      });
      return response;
    } catch (error) {
      // 静默处理错误：历史字幕检查失败不影响文件选择
      // 只在开发环境下输出详细错误信息
      if (import.meta.env.DEV) {
        console.warn('[checkHistoricalSubtitle] 检查历史字幕失败（不影响文件选择）:', {
          message: error.message,
          status: error.response?.status,
        });
      }
      return { exists: false };
    }
  };

  /**
   * 处理音频文件选择
   */
  const handleAudioFileSelect = async (file) => {
    if (!file) return;

    // 重置状态
    setErrors({ audio: '', subtitle: '' });
    setHistoricalSubtitle(null);
    setUseHistoricalSubtitle(false);
    setSubtitleFile(null);
    setSubtitlePath('');

    // 验证文件
    const validationErrors = await validateAudioFile(file);
    if (validationErrors.audio) {
      setErrors(validationErrors);
      setAudioFile(null);
      setAudioPath('');
      return;
    }

    // 设置文件
    setAudioFile(file);
    setAudioPath(file.name);

    // 计算 MD5 并检查历史字幕
    setIsCalculatingMD5(true);
    try {
      // 计算 MD5 hash
      const fileHash = await calculateFileMD5(file);
      
      // 验证 MD5 hash 格式
      if (!fileHash || typeof fileHash !== 'string' || fileHash.length !== 32) {
        throw new Error('MD5 计算结果格式错误');
      }
      
      // 检查历史字幕（失败不影响文件选择）
      const historicalData = await checkHistoricalSubtitle(fileHash);
      
      if (historicalData.exists) {
        setHistoricalSubtitle(historicalData);
        // 自动使用历史字幕，让用户可以直接确认
        setUseHistoricalSubtitle(true);
        setSubtitlePath(historicalData.transcript_path || '已检测到历史字幕');
      } else {
        setHistoricalSubtitle(null);
        setUseHistoricalSubtitle(false);
      }
    } catch (error) {
      // 只有 MD5 计算失败才显示错误（历史字幕检查失败不影响文件选择）
      console.error('[handleAudioFileSelect] MD5 计算失败:', error);
      setErrors({ audio: 'MD5 计算失败，请重试', subtitle: '' });
      setAudioFile(null);
      setAudioPath('');
    } finally {
      setIsCalculatingMD5(false);
    }
  };

  /**
   * 处理字幕文件选择
   */
  const handleSubtitleFileSelect = (file) => {
    if (!file) return;

    // 重置历史字幕选择
    setUseHistoricalSubtitle(false);

    // 验证文件
    const validationErrors = validateSubtitleFile(file);
    if (validationErrors.subtitle) {
      setErrors(validationErrors);
      setSubtitleFile(null);
      setSubtitlePath('');
      return;
    }

    // 设置文件
    setSubtitleFile(file);
    setSubtitlePath(file.name);
    setErrors({ ...errors, subtitle: '' });
  };

  /**
   * 处理使用历史字幕
   */
  const handleUseHistoricalSubtitle = () => {
    setUseHistoricalSubtitle(true);
    setSubtitleFile(null);
    setSubtitlePath(historicalSubtitle.transcript_path || '已检测到历史字幕');
  };

  /**
   * 处理重新选择字幕
   */
  const handleSelectNewSubtitle = () => {
    setUseHistoricalSubtitle(false);
    setSubtitleFile(null);
    setSubtitlePath('');
  };

  /**
   * 处理弹窗关闭
   */
  const handleClose = (event, reason) => {
    // 如果未选择音频文件且点击外部区域，闪烁提示
    if (reason === 'backdropClick' && !audioFile) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    // 其他情况正常关闭
    if (onClose) {
      onClose(event, reason);
    }
  };

  /**
   * 处理确认操作
   */
  const handleConfirm = () => {
    // 根据PRD b.i：如果勾选了"字幕识别勾选框"，但是没有选择音频文件，点击确认，此时弹框提示"请选择需要识别字幕的音频文件"
    if (enableTranscription && !audioFile) {
      setErrors({ audio: '请选择需要识别字幕的音频文件', subtitle: errors.subtitle });
      return;
    }

    // 验证音频文件
    if (!audioFile) {
      setErrors({ audio: '请选择音频文件', subtitle: errors.subtitle });
      return;
    }

    // 验证字幕选择
    if (!enableTranscription) {
      if (!useHistoricalSubtitle && !subtitleFile) {
        setErrors({ audio: errors.audio, subtitle: '请选择字幕文件或使用历史字幕' });
        return;
      }
    }

    // 调用确认回调
    if (onConfirm) {
      onConfirm({
        audioFile,
        subtitleFile: useHistoricalSubtitle ? null : subtitleFile,
        enableTranscription,
        useHistoricalSubtitle,
      });
    }
  };

  /**
   * 判断确认按钮是否可用
   */
  const isConfirmDisabled = () => {
    // 根据PRD b.i：如果勾选了"字幕识别"，即使没有选择音频文件，也应该允许点击确认（以便显示错误提示）
    if (enableTranscription) {
      // 如果启用转录，允许点击（即使没有音频文件，也会在handleConfirm中显示错误提示）
      return false;
    }
    
    // 如果没有音频文件，禁用
    if (!audioFile) return true;
    
    // 如果使用历史字幕，不需要字幕文件
    if (useHistoricalSubtitle) return false;
    
    // 如果没有字幕文件，禁用
    if (!subtitleFile) return true;
    
    return false;
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          animation: isShaking ? 'shake 0.5s' : 'none',
          '@keyframes shake': {
            '0%, 100%': { transform: 'translateX(0)' },
            '25%': { transform: 'translateX(-10px)' },
            '75%': { transform: 'translateX(10px)' },
          },
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">音频和字幕选择弹框</Typography>
          <IconButton
            onClick={(e) => handleClose(e, 'closeButton')}
            size="small"
            aria-label="关闭"
            sx={{
              '&:hover': { bgcolor: 'action.hover' },
              '&:active': { transform: 'scale(0.95)' },
            }}
          >
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* 音频文件选择 */}
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              选择音频
            </Typography>
            <Box display="flex" gap={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                value={audioPath}
                placeholder="支持格式：MP3、WAV"
                InputProps={{
                  readOnly: true,
                }}
                error={!!errors.audio}
                helperText={errors.audio}
              />
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/mp3,audio/wav,audio/mpeg"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleAudioFileSelect(file);
                  }
                }}
              />
              <Button
                variant="outlined"
                onClick={() => audioInputRef.current?.click()}
                disabled={isCalculatingMD5}
                sx={{
                  minWidth: '100px',
                  whiteSpace: 'nowrap',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              >
                选择文件
              </Button>
              {isCalculatingMD5 && (
                <CircularProgress size={20} sx={{ ml: 1 }} />
              )}
            </Box>
          </Box>

          {/* 字幕识别勾选框 */}
          <FormControlLabel
            control={
              <Checkbox
                checked={enableTranscription}
                onChange={(e) => setEnableTranscription(e.target.checked)}
              />
            }
            label="字幕识别"
          />

          {/* 历史字幕提示 */}
          {historicalSubtitle && historicalSubtitle.exists && (
            <Alert severity="info" icon={<CheckCircle />}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                已检测到历史字幕
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant={useHistoricalSubtitle ? "contained" : "outlined"}
                  onClick={handleUseHistoricalSubtitle}
                  disabled={useHistoricalSubtitle}
                  sx={{
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:active': { transform: 'scale(0.95)' },
                  }}
                >
                  {useHistoricalSubtitle ? '已选择历史字幕' : '使用历史字幕'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleSelectNewSubtitle}
                  disabled={!useHistoricalSubtitle}
                  sx={{
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:active': { transform: 'scale(0.95)' },
                  }}
                >
                  重新选择字幕
                </Button>
              </Stack>
            </Alert>
          )}

          {/* 字幕文件选择 */}
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              选择字幕
            </Typography>
            <Box display="flex" gap={1} alignItems="center">
              <TextField
                fullWidth
                size="small"
                value={subtitlePath}
                placeholder="支持格式：JSON"
                InputProps={{
                  readOnly: true,
                }}
                error={!!errors.subtitle}
                helperText={errors.subtitle}
                disabled={enableTranscription || useHistoricalSubtitle}
              />
              <input
                ref={subtitleInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleSubtitleFileSelect(file);
                  }
                }}
                disabled={enableTranscription || useHistoricalSubtitle}
              />
              <Button
                variant="outlined"
                onClick={() => subtitleInputRef.current?.click()}
                disabled={enableTranscription || useHistoricalSubtitle}
                sx={{
                  minWidth: '100px',
                  whiteSpace: 'nowrap',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              >
                选择文件
              </Button>
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={(e) => handleClose(e, 'cancel')}
          sx={{
            '&:hover': { bgcolor: 'action.hover' },
            '&:active': { transform: 'scale(0.95)' },
          }}
        >
          取消
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={isConfirmDisabled()}
          sx={{
            '&:hover': { bgcolor: 'primary.dark' },
            '&:active': { transform: 'scale(0.95)' },
          }}
        >
          确认
        </Button>
      </DialogActions>
    </Dialog>
  );
}
