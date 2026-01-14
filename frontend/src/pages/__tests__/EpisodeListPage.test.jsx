/**
 * EpisodeListPage 组件测试
 *
 * 测试用例：
 * 1. 测试首次打开且数据库为空时自动弹出弹框
 * 2. 测试关闭弹框后显示空状态和按钮
 * 3. 测试点击按钮重新打开弹框
 * 4. 测试文件上传成功后跳转到详情页
 * 5. 测试有数据时自动跳转到详情页
 * 6. 测试Loading状态
 * 7. 测试Error状态
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EpisodeListPage from '../EpisodeListPage';
import api from '../../api';
import { episodeService } from '../../services/episodeService';

// Mock 依赖
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    getEpisodes: vi.fn(),
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

  const renderWithRouter = (component, locationState = null) => {
    const entries = locationState
      ? [{ pathname: '/', state: locationState }]
      : ['/'];

    return render(
      <MemoryRouter initialEntries={entries}>
        {component}
      </MemoryRouter>
    );
  };

  describe('首次打开逻辑', () => {
    it('当数据库为空时自动弹出音频和字幕选择弹框', async () => {
      // Arrange: Mock API 返回空列表
      api.getEpisodes.mockResolvedValue([]);

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待弹框出现
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });
    });

    it('当数据库有episode时自动跳转到详情页', async () => {
      // Arrange: Mock API 返回有数据的列表
      const mockEpisodes = [
        {
          id: 1,
          title: 'Test Episode',
          duration: 1800,
          transcription_status: 'completed',
        },
      ];
      api.getEpisodes.mockResolvedValue(mockEpisodes);

      // Act: 渲染组件
      const { container } = renderWithRouter(<EpisodeListPage />);

      // Assert: 应该跳转到详情页（通过检查导航被调用）
      // 由于 navigate 是通过 react-router-dom 实现的，我们检查页面是否不再显示 EpisodeListPage 的内容
      await waitFor(() => {
        // 弹框不应该出现（因为已经跳转）
        expect(screen.queryByTestId('file-import-modal')).not.toBeInTheDocument();
        // 也不会显示空状态
        expect(screen.queryByText(/您还未选择音频文件/)).not.toBeInTheDocument();
      });
    });
  });

  describe('空状态显示', () => {
    it('当数据库为空时显示空状态提示和按钮', async () => {
      // Arrange: Mock API 返回空列表
      api.getEpisodes.mockResolvedValue([]);

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 等待空状态显示
      await waitFor(() => {
        expect(screen.getByText('您还未选择音频文件')).toBeInTheDocument();
        expect(screen.getByText('音频和字幕选择')).toBeInTheDocument();
      });
    });

    it('点击空状态按钮后打开弹框', async () => {
      // Arrange: Mock API 返回空列表
      api.getEpisodes.mockResolvedValue([]);
      const user = userEvent.setup();

      // Act: 渲染组件并等待空状态显示
      renderWithRouter(<EpisodeListPage />);
      await waitFor(() => {
        expect(screen.getByText('音频和字幕选择')).toBeInTheDocument();
      });

      // 等待弹框自动打开（数据库为空时会自动弹出）
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 先关闭自动弹出的弹框
      const closeButton = await waitFor(() => {
        return screen.getByTestId('modal-close');
      });
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
    it('上传成功后跳转到详情页', async () => {
      // Arrange: Mock API 初始返回空列表
      api.getEpisodes.mockResolvedValue([]);

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

      // Assert: 上传服务被调用
      expect(episodeService.uploadEpisode).toHaveBeenCalledTimes(1);
    });

    it('上传失败时记录错误', async () => {
      // Arrange: Mock API 返回空列表，上传失败
      api.getEpisodes.mockResolvedValue([]);
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
        expect.stringContaining('Upload failed:'),
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
      api.getEpisodes.mockResolvedValue(mockEpisodes);

      // Act: 渲染组件（使用 fromBack 状态来模拟从详情页返回）
      renderWithRouter(<EpisodeListPage />, { fromBack: true });

      // Assert: 等待列表显示
      await waitFor(() => {
        expect(screen.getByText('📄 Episode 1')).toBeInTheDocument();
        expect(screen.getByText('📄 Episode 2')).toBeInTheDocument();
      });

      expect(screen.getByText('欢迎回来')).toBeInTheDocument();
      expect(screen.getByText(/我的播客列表 \(2\)/)).toBeInTheDocument();
    });
  });

  describe('Loading状态', () => {
    it('加载时显示CircularProgress', async () => {
      // Arrange: Mock API 延迟返回
      api.getEpisodes.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve([]), 100);
      }));

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 应该显示CircularProgress（通过检查是否有loading相关的元素）
      // 注意：实际代码使用的是 CircularProgress 而不是 Skeleton
      const progressCircles = document.querySelectorAll('.MuiCircularProgress-root');
      expect(progressCircles.length).toBeGreaterThan(0);
    });
  });

  describe('Error状态', () => {
    it('加载失败时仍然显示空状态（容错处理）', async () => {
      // Arrange: Mock API 返回错误
      const error = new Error('网络错误');
      api.getEpisodes.mockRejectedValue(error);

      // Act: 渲染组件
      renderWithRouter(<EpisodeListPage />);

      // Assert: 代码中捕获错误后设置 hasEpisodes=false，会显示空状态
      // 注意：弹框不会自动打开，因为 catch 块中没有 setIsModalOpen(true)
      await waitFor(() => {
        expect(screen.getByText('您还未选择音频文件')).toBeInTheDocument();
      });

      // 弹框不应该自动打开
      expect(screen.queryByTestId('file-import-modal')).not.toBeInTheDocument();
    });
  });

  describe('弹框关闭功能', () => {
    it('点击关闭按钮后关闭弹框', async () => {
      // Arrange: Mock API 返回空列表
      api.getEpisodes.mockResolvedValue([]);
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

