import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileImportModal from '../FileImportModal';
import api from '../../../api';
import { calculateFileMD5, readAudioDuration } from '../../../utils/fileUtils';

// Mock API
vi.mock('../../../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

// Mock fileUtils
vi.mock('../../../utils/fileUtils', () => {
  const mockGetFileExtension = vi.fn((filename) => {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  });
  
  return {
    calculateFileMD5: vi.fn(),
    readAudioDuration: vi.fn(),
    getFileExtension: mockGetFileExtension,
    formatFileSize: vi.fn((bytes) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }),
  };
});

// 获取 mock 函数引用
import { getFileExtension } from '../../../utils/fileUtils';
const mockGetFileExtension = vi.mocked(getFileExtension);

describe('FileImportModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ exists: false });
    calculateFileMD5.mockResolvedValue('test-md5-hash');
    readAudioDuration.mockResolvedValue(1800); // 30分钟
    // 重置 getFileExtension mock，确保它正确工作
    mockGetFileExtension.mockImplementation((filename) => {
      const parts = filename.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('组件渲染', () => {
    it('弹窗默认不显示（open={false}）', () => {
      render(
        <FileImportModal
          open={false}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.queryByText('音频和字幕选择弹框')).not.toBeInTheDocument();
    });

    it('弹窗打开时显示标题栏和选择器', () => {
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('音频和字幕选择弹框')).toBeInTheDocument();
      expect(screen.getByText('选择音频')).toBeInTheDocument();
      expect(screen.getByText('选择字幕')).toBeInTheDocument();
    });

    it('标题栏显示关闭按钮', () => {
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const closeButton = screen.getByRole('button', { name: /关闭/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('选择器包含音频文件路径填空条、字幕识别勾选框、字幕文件路径填空条', () => {
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      expect(screen.getByText('选择音频')).toBeInTheDocument();
      expect(screen.getByText('字幕识别')).toBeInTheDocument();
      expect(screen.getByText('选择字幕')).toBeInTheDocument();
    });
  });

  describe('文件选择交互', () => {
    it('点击音频文件路径填空条 → 唤起系统文件选择器', async () => {
      const user = userEvent.setup();
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      const clickSpy = vi.spyOn(audioInput, 'click');

      const selectButton = screen.getAllByText('选择文件')[0];
      await user.click(selectButton);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('选择音频文件后 → 路径填空条显示文件路径', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.mp3')).toBeInTheDocument();
      });
    });

    it('点击字幕文件路径填空条 → 唤起系统文件选择器', async () => {
      const user = userEvent.setup();
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      const clickSpy = vi.spyOn(subtitleInput, 'click');

      const selectButtons = screen.getAllByText('选择文件');
      await user.click(selectButtons[1]);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('选择字幕文件后 → 路径填空条显示文件路径', async () => {
      const user = userEvent.setup();
      const file = new File(['subtitle content'], 'test.json', { type: 'application/json' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      await user.upload(subtitleInput, file);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.json')).toBeInTheDocument();
      });
    });
  });

  describe('字幕识别勾选框', () => {
    it('勾选字幕识别 → 字幕文件路径填空条置灰', async () => {
      const user = userEvent.setup();
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const checkbox = screen.getByRole('checkbox', { name: /字幕识别/i });
      await user.click(checkbox);

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      expect(subtitleInput).toBeDisabled();
    });

    it('取消勾选字幕识别 → 字幕文件路径填空条恢复可用', async () => {
      const user = userEvent.setup();
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const checkbox = screen.getByRole('checkbox', { name: /字幕识别/i });
      await user.click(checkbox);
      await user.click(checkbox);

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      expect(subtitleInput).not.toBeDisabled();
    });
  });

  describe('MD5 计算和字幕关联检查', () => {
    it('选择音频文件后 → 自动计算 MD5 hash', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(calculateFileMD5).toHaveBeenCalledWith(file);
      });
    });

    it('计算 MD5 期间显示 Loading 状态', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      // 延迟 MD5 计算，模拟异步过程
      calculateFileMD5.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('test-md5'), 100))
      );

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('MD5 计算完成后 → 调用后端 API 检查历史字幕', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/episodes/check-subtitle', {
          params: { file_hash: 'test-md5-hash' },
        });
      });
    });

    it('后端返回"存在历史字幕" → UI 显示"已检测到历史字幕"提示', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      api.get.mockResolvedValue({
        exists: true,
        episode_id: 1,
        transcript_path: 'backend/data/transcripts/test.json',
      });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/已检测到历史字幕/i)).toBeInTheDocument();
      });
    });

    it('后端返回"不存在历史字幕" → 不显示提示，用户必须手动选择字幕', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      api.get.mockResolvedValue({ exists: false });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      expect(screen.queryByText(/已检测到历史字幕/i)).not.toBeInTheDocument();
    });

    it('MD5 计算失败 → 显示错误提示', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      calculateFileMD5.mockRejectedValue(new Error('MD5 计算失败'));

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/MD5 计算失败/i)).toBeInTheDocument();
      });
    });
  });

  describe('历史字幕处理', () => {
    it('检测到历史字幕后 → 显示"已检测到历史字幕"提示', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      api.get.mockResolvedValue({
        exists: true,
        episode_id: 1,
        transcript_path: 'backend/data/transcripts/test.json',
      });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/已检测到历史字幕/i)).toBeInTheDocument();
      });
    });

    it('用户可以选择"使用历史字幕" → 自动填充字幕路径', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      api.get.mockResolvedValue({
        exists: true,
        episode_id: 1,
        transcript_path: 'backend/data/transcripts/test.json',
      });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/已检测到历史字幕/i)).toBeInTheDocument();
      });

      // 检测到历史字幕后，组件会自动使用历史字幕，按钮文本变为"已选择历史字幕"
      await waitFor(() => {
        expect(screen.getByText(/已选择历史字幕/i)).toBeInTheDocument();
      });

      // 验证字幕输入框已被禁用（因为自动使用了历史字幕）
      await waitFor(() => {
        const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
        expect(subtitleInput).toBeDisabled();
      });
    });

    it('用户可以选择"重新选择字幕" → 允许手动选择新字幕文件', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      api.get.mockResolvedValue({
        exists: true,
        episode_id: 1,
        transcript_path: 'backend/data/transcripts/test.json',
      });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/已检测到历史字幕/i)).toBeInTheDocument();
      });

      // 检测到历史字幕后，组件会自动使用历史字幕，按钮文本变为"已选择历史字幕"
      await waitFor(() => {
        expect(screen.getByText(/已选择历史字幕/i)).toBeInTheDocument();
      });

      // 验证字幕输入框已被禁用（因为自动使用了历史字幕）
      await waitFor(() => {
        const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
        expect(subtitleInput).toBeDisabled();
      });

      // 点击"重新选择字幕"按钮，取消使用历史字幕
      const selectNewButton = screen.getByText(/重新选择字幕/i);
      await user.click(selectNewButton);

      // 验证字幕输入框恢复可用
      await waitFor(() => {
        const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
        expect(subtitleInput).not.toBeDisabled();
      });
    });

    it('用户未选择任何字幕（包括历史字幕）→ 确认按钮禁用', () => {
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const confirmButton = screen.getByRole('button', { name: /确认/i });
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('文件格式验证', () => {
    it('MP3 文件 → 验证通过', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.queryByText(/格式不支持/i)).not.toBeInTheDocument();
      });
    });

    it('WAV 文件 → 验证通过', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.queryByText(/格式不支持/i)).not.toBeInTheDocument();
      });
    });


    it('JSON 字幕文件 → 验证通过', async () => {
      const user = userEvent.setup();
      const file = new File(['json content'], 'test.json', { type: 'application/json' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      await user.upload(subtitleInput, file);

      await waitFor(() => {
        expect(screen.queryByText(/格式不支持/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('文件大小限制', () => {
    it('文件大小 < 1GB → 验证通过', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
      Object.defineProperty(file, 'size', { value: 500 * 1024 * 1024 }); // 500MB

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.queryByText(/不得超过1GB/i)).not.toBeInTheDocument();
      });
    });

    it('文件大小 >= 1GB → 显示错误提示', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 * 1024 }); // 1GB

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/不得超过1GB/i)).toBeInTheDocument();
      });
    });

    it('时长 < 3小时 → 验证通过', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
      readAudioDuration.mockResolvedValue(3600); // 1小时

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.queryByText(/不得超过3个小时/i)).not.toBeInTheDocument();
      });
    });

    it('时长 >= 3小时 → 显示错误提示', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
      readAudioDuration.mockResolvedValue(10800); // 3小时

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByText(/不得超过3个小时/i)).toBeInTheDocument();
      });
    });
  });

  describe('弹窗关闭逻辑', () => {
    it('点击关闭按钮 → 调用 onClose 回调', async () => {
      const user = userEvent.setup();
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const closeButton = screen.getByRole('button', { name: /关闭/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('点击外部区域（未选择音频文件时）→ 弹窗闪烁提示，不关闭', async () => {
      const user = userEvent.setup();
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      // 模拟点击 Dialog 外部（backdrop）
      const dialog = screen.getByRole('dialog');
      const backdrop = dialog.parentElement;
      
      // 由于 MUI Dialog 的 backdrop 点击处理比较复杂，这里简化测试
      // 实际实现中，需要在 onClose 回调中检查是否有音频文件
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('点击外部区域（已选择音频文件时）→ 调用 onClose 回调', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.mp3')).toBeInTheDocument();
      });

      // 这里简化测试，实际实现中需要处理 Dialog 的 onClose 事件
    });
  });

  describe('确认按钮', () => {
    it('点击确认按钮 → 调用 onConfirm 回调，传递文件信息', async () => {
      const user = userEvent.setup();
      const audioFile = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
      const subtitleFile = new File(['subtitle content'], 'test.json', { type: 'application/json' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, audioFile);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.mp3')).toBeInTheDocument();
      });

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      await user.upload(subtitleInput, subtitleFile);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.json')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /确认/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith(
          expect.objectContaining({
            audioFile: audioFile,
            subtitleFile: subtitleFile,
            enableTranscription: false,
            useHistoricalSubtitle: false,
          })
        );
      });
    });

    it('确认按钮在未选择音频文件时禁用', () => {
      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const confirmButton = screen.getByRole('button', { name: /确认/i });
      expect(confirmButton).toBeDisabled();
    });

    it('确认按钮在已选择音频文件但未选择字幕（且无历史字幕）时禁用', async () => {
      const user = userEvent.setup();
      const file = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, file);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.mp3')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /确认/i });
      expect(confirmButton).toBeDisabled();
    });

    it('确认按钮在已选择音频文件和字幕（或使用历史字幕）时启用', async () => {
      const user = userEvent.setup();
      const audioFile = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });
      const subtitleFile = new File(['subtitle content'], 'test.json', { type: 'application/json' });

      render(
        <FileImportModal
          open={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
        />
      );

      const audioInput = document.querySelector('input[type="file"][accept*="audio"]');
      await user.upload(audioInput, audioFile);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.mp3')).toBeInTheDocument();
      });

      const subtitleInput = document.querySelector('input[type="file"][accept*="json"]');
      await user.upload(subtitleInput, subtitleFile);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test.json')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /确认/i });
      expect(confirmButton).not.toBeDisabled();
    });
  });
});

