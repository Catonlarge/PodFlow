/**
 * EpisodeListPage 组件测试
 * 
 * 测试用例：
 * 1. 测试首次打开且数据库为空时自动弹出弹框
 * 2. 测试关闭弹框后显示空状态和按钮
 * 3. 测试点击按钮重新打开弹框
 * 4. 测试文件上传成功后刷新列表
 * 5. 测试正常显示episode列表
 * 6. 测试Loading状态
 * 7. 测试Error状态
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import EpisodeListPage from '../EpisodeListPage';
import api from '../../api';
import { episodeService } from '../../services/episodeService';

// Mock 依赖
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../../services/episodeService', () => ({
  episodeService: {
    uploadEpisode: vi.fn(),
  },
}));

vi.mock('../../components/upload/FileImportModal', () => ({
  default: ({ open, onClose, onConfirm }) => {
    if (!open) return null;
    return (
      <div data-testid="file-import-modal">
        <button data-testid="modal-close" onClick={() => onClose({}, 'closeButton')}>
          关闭
        </button>
        <button
          data-testid="modal-confirm"
          onClick={async () => {
            try {
              await onConfirm({
                audioFile: new File(['audio'], 'test.mp3', { type: 'audio/mpeg' }),
                subtitleFile: null,
                enableTranscription: false,
                useHistoricalSubtitle: false,
              });
            } catch (error) {
              // 错误已经被handleFileUpload处理，这里静默捕获避免unhandled rejection
            }
          }}
        >
          确认
        </button>
      </div>
    );
  },
}));

describe('EpisodeListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (component) => {
    return render(
      <BrowserRouter>
        {component}
      </BrowserRouter>
    );
  };

  describe('首次打开逻辑', () => {
    it('当数据库为空时自动弹出音频和字幕选择弹框', async () => {
      // Arrange: Mock API 返回空列表
      api.get.mockResolvedValue({ items: [] });

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待弹框出现
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });
    });

    it('当数据库有episode时不自动弹出弹框', async () => {
      // Arrange: Mock API 返回有数据的列表
      const mockEpisodes = [
        {
          id: 1,
          title: 'Test Episode',
          duration: 1800,
          transcription_status: 'completed',
        },
      ];
      api.get.mockResolvedValue({ items: mockEpisodes });

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待列表加载完成，弹框不应该出现
      await waitFor(() => {
        expect(screen.getByText('Test Episode')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('file-import-modal')).not.toBeInTheDocument();
    });
  });

  describe('空状态显示', () => {
    it('当数据库为空时显示空状态提示和按钮', async () => {
      // Arrange: Mock API 返回空列表
      api.get.mockResolvedValue({ items: [] });

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待空状态显示
      await waitFor(() => {
        expect(screen.getByText('您还未选择音频文件，点击按钮进行选择')).toBeInTheDocument();
        expect(screen.getByText('音频和字幕选择')).toBeInTheDocument();
      });
    });

    it('点击空状态按钮后打开弹框', async () => {
      // Arrange: Mock API 返回空列表
      api.get.mockResolvedValue({ items: [] });
      const user = userEvent.setup();

      // Act: 渲染组件并等待空状态显示
      renderWithRouter(<EpisodeListPage />);
      await waitFor(() => {
        expect(screen.getByText('音频和字幕选择')).toBeInTheDocument();
      });

      // 先关闭自动弹出的弹框
      const closeButton = screen.getByTestId('modal-close');
      await user.click(closeButton);

      // 等待弹框关闭
      await waitFor(() => {
        expect(screen.queryByTestId('file-import-modal')).not.toBeInTheDocument();
      });

      // 点击空状态按钮
      const uploadButton = screen.getByText('音频和字幕选择');
      await user.click(uploadButton);

      // Assert: 弹框应该重新打开
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });
    });
  });

  describe('文件上传功能', () => {
    it('上传成功后刷新episode列表', async () => {
      // Arrange: Mock API 初始返回空列表，上传后返回有数据的列表
      api.get
        .mockResolvedValueOnce({ items: [] }) // 首次加载
        .mockResolvedValueOnce({ items: [{ id: 1, title: 'Test Episode', duration: 1800, transcription_status: 'completed' }] }); // 上传后刷新

      episodeService.uploadEpisode.mockResolvedValue({
        episode_id: 1,
        status: 'processing',
        is_duplicate: false,
      });

      const user = userEvent.setup();

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // 等待弹框出现并确认上传
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // Assert: 等待列表刷新并显示新episode
      await waitFor(() => {
        expect(screen.getByText('Test Episode')).toBeInTheDocument();
      });

      expect(episodeService.uploadEpisode).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledTimes(2); // 初始加载 + 刷新
    });

    it('上传失败时抛出错误', async () => {
      // Arrange: Mock API 返回空列表，上传失败
      api.get.mockResolvedValue({ items: [] });
      const uploadError = new Error('上传失败');
      episodeService.uploadEpisode.mockRejectedValue(uploadError);

      // Mock console.error 以避免测试输出错误信息
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const user = userEvent.setup();

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // 等待弹框出现并确认上传
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('modal-confirm');
      
      // Assert: 上传应该失败（错误会被handleFileUpload捕获并记录，但不会阻止UI）
      await act(async () => {
        await user.click(confirmButton);
      });

      // 等待错误被处理
      await waitFor(() => {
        expect(episodeService.uploadEpisode).toHaveBeenCalledTimes(1);
      });

      // 验证错误被记录
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EpisodeListPage] 上传失败:'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Episode列表显示', () => {
    it('正常显示episode列表', async () => {
      // Arrange: Mock API 返回episode列表
      const mockEpisodes = [
        {
          id: 1,
          title: 'Episode 1',
          duration: 1800,
          transcription_status: 'completed',
        },
        {
          id: 2,
          title: 'Episode 2',
          duration: 3600,
          transcription_status: 'processing',
          transcription_progress: 50.5,
        },
      ];
      api.get.mockResolvedValue({ items: mockEpisodes });

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待列表显示
      await waitFor(() => {
        expect(screen.getByText('Episode 1')).toBeInTheDocument();
        expect(screen.getByText('Episode 2')).toBeInTheDocument();
      });

      expect(screen.getByText('Episode 列表')).toBeInTheDocument();
    });

    it('显示episode的时长和状态', async () => {
      // Arrange: Mock API 返回episode
      const mockEpisodes = [
        {
          id: 1,
          title: 'Test Episode',
          duration: 3665, // 1小时1分5秒
          transcription_status: 'completed',
        },
      ];
      api.get.mockResolvedValue({ items: mockEpisodes });

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待并验证显示内容
      await waitFor(() => {
        expect(screen.getByText('Test Episode')).toBeInTheDocument();
        expect(screen.getByText(/时长:/)).toBeInTheDocument();
        expect(screen.getByText('completed')).toBeInTheDocument();
      });
    });

    it('显示转录进度', async () => {
      // Arrange: Mock API 返回有进度的episode
      const mockEpisodes = [
        {
          id: 1,
          title: 'Test Episode',
          duration: 1800,
          transcription_status: 'processing',
          transcription_progress: 75.5,
        },
      ];
      api.get.mockResolvedValue({ items: mockEpisodes });

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待并验证进度显示（文本可能被分割，使用正则匹配）
      await waitFor(() => {
        expect(screen.getByText(/进度:/)).toBeInTheDocument();
        expect(screen.getByText(/75\.5/)).toBeInTheDocument();
      });
    });
  });

  describe('Loading状态', () => {
    it('加载时显示Skeleton', async () => {
      // Arrange: Mock API 延迟返回
      api.get.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve({ items: [] }), 100);
      }));

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 应该显示Skeleton（通过检查是否有loading相关的元素）
      // 注意：MUI Skeleton 可能没有特定的testid，我们检查是否有skeleton元素
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error状态', () => {
    it('加载失败时显示错误提示', async () => {
      // Arrange: Mock API 返回错误
      const error = new Error('网络错误');
      api.get.mockRejectedValue(error);

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待错误提示显示
      await waitFor(() => {
        expect(screen.getByText(/加载 Episode 列表失败/)).toBeInTheDocument();
      });
    });
  });

  describe('弹框关闭功能', () => {
    it('点击关闭按钮后关闭弹框', async () => {
      // Arrange: Mock API 返回空列表
      api.get.mockResolvedValue({ items: [] });
      const user = userEvent.setup();

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // 等待弹框出现
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击关闭按钮
      const closeButton = screen.getByTestId('modal-close');
      await user.click(closeButton);

      // Assert: 弹框应该关闭
      await waitFor(() => {
        expect(screen.queryByTestId('file-import-modal')).not.toBeInTheDocument();
      });
    });
  });
});

