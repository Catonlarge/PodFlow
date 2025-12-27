/**
 * EpisodePage 组件测试
 * 
 * 测试用例：
 * 1. 测试页面渲染（从 URL 获取 episode_id）
 * 2. 测试数据加载（调用 subtitleService.getEpisode）
 * 3. 测试 Loading 状态（显示 Skeleton）
 * 4. 测试 Error 状态（404、500、网络错误）
 * 5. 测试音频 URL 处理（从 episode.audio_path 构建完整 URL）
 * 6. 测试数据刷新机制（轮询转录状态）
 * 7. 测试路由跳转
 * 8. 测试首次打开逻辑（自动弹出文件选择弹窗）
 * 9. 测试已选择逻辑（localStorage 自动加载）
 * 10. 测试文件上传流程
 * 11. 测试空状态显示
 * 12. 测试秒传/去重逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Routes, Route, MemoryRouter } from 'react-router-dom';
import EpisodePage from '../EpisodePage';
import * as subtitleServiceModule from '../../services/subtitleService';
import * as episodeServiceModule from '../../services/episodeService';

// Mock 依赖
vi.mock('../../services/subtitleService', () => ({
  subtitleService: {
    getEpisode: vi.fn(),
  },
  getMockCues: vi.fn().mockResolvedValue([]),
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
        <button data-testid="modal-close" onClick={() => onClose({}, 'closeButton')}>关闭</button>
        <button 
          data-testid="modal-confirm" 
          onClick={() => onConfirm({
            audioFile: new File(['audio'], 'test.mp3'),
            subtitleFile: null,
            enableTranscription: false,
            useHistoricalSubtitle: false,
          })}
        >
          确认
        </button>
      </div>
    );
  },
}));

vi.mock('../../components/upload/ProcessingOverlay', () => ({
  default: ({ type, progress, error, onRetry }) => {
    if (!type) return null;
    return (
      <div data-testid="processing-overlay">
        <div data-testid="processing-type">{type}</div>
        <div data-testid="processing-progress">{progress}</div>
        {error && <div data-testid="processing-error">{error}</div>}
        {onRetry && <button data-testid="processing-retry" onClick={onRetry}>重试</button>}
      </div>
    );
  },
}));

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: {
      baseURL: 'http://localhost:8000',
    },
  },
}));

// Mock MainLayout 和 SubtitleList 以避免复杂的子组件测试
const mockSetProgress = vi.fn();
const mockTogglePlay = vi.fn();
let mockIsPlaying = false;
let mockAudioControls = null;

vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ episodeTitle, showName, audioUrl, episodeId, onCueClick, onFileImportClick, children }) => {
    // 直接设置 mockAudioControls，避免在 mock 中使用 hooks
    if (audioUrl) {
      setTimeout(() => {
        mockAudioControls = {
          setProgress: mockSetProgress,
          togglePlay: mockTogglePlay,
          isPlaying: mockIsPlaying,
        };
      }, 0);
    }

    const handleCueClick = (startTime) => {
      if (mockAudioControls) {
        if (mockAudioControls.setProgress) {
          mockAudioControls.setProgress(null, startTime);
        }
        if (mockAudioControls.togglePlay && !mockAudioControls.isPlaying) {
          mockAudioControls.togglePlay();
        }
      }
      if (onCueClick) {
        onCueClick(startTime);
      }
    };

    return (
      <div data-testid="main-layout">
        <div data-testid="episode-title">{episodeTitle || ''}</div>
        <div data-testid="show-name">{showName || ''}</div>
        <div data-testid="audio-url">{audioUrl || ''}</div>
        <div data-testid="episode-id">{episodeId || ''}</div>
        {onFileImportClick && (
          <button
            data-testid="file-import-button"
            onClick={onFileImportClick}
          >
            文件导入
          </button>
        )}
        <button
          data-testid="cue-click-button"
          onClick={() => handleCueClick(10.5)}
        >
          点击字幕
        </button>
        {children}
      </div>
    );
  },
}));

describe('EpisodePage', () => {
  const mockEpisode = {
    id: 1,
    title: 'Test Episode',
    duration: 1800,
    audio_path: './data/audios/abc123.mp3',
    transcription_status: 'completed',
    transcription_progress: 100,
    show_name: 'Test Podcast',
    cues: [
      {
        id: 1,
        start_time: 0.28,
        end_time: 2.22,
        speaker: 'Speaker1',
        text: 'Hello world'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPlaying = false;
    mockAudioControls = null;
    // 清除 localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    localStorage.clear();
  });

  const renderWithRouter = (episodeId = '1') => {
    window.history.pushState({}, 'Test page', `/episodes/${episodeId}`);
    return render(
      <BrowserRouter>
        <Routes>
          <Route path="/episodes/:episodeId" element={<EpisodePage />} />
        </Routes>
      </BrowserRouter>
    );
  };

  it('应该从 URL 参数获取 episode_id 并加载数据', async () => {
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

    renderWithRouter('1');

    await waitFor(() => {
      expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledWith('1');
    });
  });

  it('应该在加载时显示 Skeleton', () => {
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockImplementation(() => new Promise(() => {})); // 永不 resolve

    renderWithRouter('1');

    // Skeleton 使用 MUI Skeleton 组件，检查是否有 Skeleton 元素
    const skeletons = screen.getAllByRole('generic').filter(el => 
      el.className.includes('MuiSkeleton-root')
    );
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('main-layout')).not.toBeInTheDocument();
  });

  it('应该在加载成功后渲染 MainLayout', async () => {
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

    renderWithRouter('1');

    await waitFor(() => {
      expect(screen.getByTestId('episode-title')).toHaveTextContent('Test Episode');
    });
  });

  it('应该处理 404 错误', async () => {
    const error = {
      response: { status: 404 },
      message: 'Not Found'
    };
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockRejectedValue(error);

    renderWithRouter('999');

    await waitFor(() => {
      expect(screen.getByText(/Episode 999 不存在/)).toBeInTheDocument();
    });
  });

  it('应该处理 500 错误', async () => {
    const error = {
      response: { status: 500 },
      message: 'Internal Server Error'
    };
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockRejectedValue(error);

    renderWithRouter('1');

    await waitFor(() => {
      expect(screen.getByText(/服务器错误/)).toBeInTheDocument();
    });
  });

  it('应该处理网络错误', async () => {
    const error = {
      message: 'Network Error'
    };
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockRejectedValue(error);

    renderWithRouter('1');

    await waitFor(() => {
      expect(screen.getByText(/Network Error/)).toBeInTheDocument();
    });
  });

  it('应该正确处理音频 URL（从 audio_path 构建）', async () => {
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

    renderWithRouter('1');

    await waitFor(() => {
      // 验证 audioUrl 被正确传递（使用 new URL 构建的完整 URL）
      const audioUrlElement = screen.getByTestId('audio-url');
      expect(audioUrlElement).toBeInTheDocument();
      expect(audioUrlElement.textContent).toContain('/static/audio/abc123.mp3');
    });
  });

  it('应该传递 episodeId 给 MainLayout', async () => {
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

    renderWithRouter('1');

    await waitFor(() => {
      expect(screen.getByTestId('episode-id')).toHaveTextContent('1');
    });
  });

  it('应该在转录进行中时轮询状态', async () => {
    const processingEpisode = {
      ...mockEpisode,
      transcription_status: 'processing',
      transcription_progress: 50
    };
    
    subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(processingEpisode);

    renderWithRouter('1');

    await waitFor(() => {
      expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledTimes(1);
    });

    // 等待轮询触发（3秒后）
    await waitFor(() => {
      // 轮询时应该再次调用 getEpisode（不调用 /status 接口）
      expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledTimes(2);
    }, { timeout: 4000 });
  });

  it('应该在转录完成时停止轮询并重新获取数据', async () => {
    const processingEpisode = {
      ...mockEpisode,
      transcription_status: 'processing',
      transcription_progress: 50
    };
    
    subtitleServiceModule.subtitleService.getEpisode = vi.fn()
      .mockResolvedValueOnce(processingEpisode)
      .mockResolvedValueOnce(mockEpisode); // 轮询时返回完成状态

    renderWithRouter('1');

    await waitFor(() => {
      expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledTimes(1);
    });

    // 等待轮询触发（3秒后）
    await waitFor(() => {
      // 轮询时应该再次调用 getEpisode，返回完成状态
      expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledTimes(2);
    }, { timeout: 4000 });

    // 验证第二次调用返回的是完成状态（mockEpisode）
    // 由于转录已完成，轮询应该停止，不应该再有第三次调用
    const callCount = subtitleServiceModule.subtitleService.getEpisode.mock.calls.length;
    expect(callCount).toBe(2);
  });

  it('应该提供重试按钮', async () => {
    const user = userEvent.setup();
    const error = {
      response: { status: 404 },
      message: 'Not Found'
    };
    subtitleServiceModule.subtitleService.getEpisode = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(mockEpisode);

    renderWithRouter('1');

    await waitFor(() => {
      expect(screen.getByText(/重试/)).toBeInTheDocument();
    });

    // 点击重试按钮
    const retryButton = screen.getByText(/重试/);
    await user.click(retryButton);

    await waitFor(() => {
      // 重试时应该再次调用 getEpisode（isInitialLoad=true）
      expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledTimes(2);
    });
  });

  describe('点击字幕跳转和取消暂停', () => {
    it('应该在点击字幕时调用 setProgress 跳转时间', async () => {
      const user = userEvent.setup();
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      renderWithRouter('1');

      // 等待 MainLayout 渲染和音频控制方法就绪
      await waitFor(() => {
        expect(screen.getByTestId('main-layout')).toBeInTheDocument();
      }, { timeout: 1000 });

      // 等待音频控制方法就绪
      await waitFor(() => {
        expect(mockAudioControls).not.toBeNull();
      }, { timeout: 1000 });

      // 点击字幕
      const cueClickButton = screen.getByTestId('cue-click-button');
      await user.click(cueClickButton);

      // 验证 setProgress 被调用
      await waitFor(() => {
        expect(mockSetProgress).toHaveBeenCalledTimes(1);
        expect(mockSetProgress).toHaveBeenCalledWith(null, 10.5);
      });
    });

    it('应该在点击字幕时，如果暂停则调用 togglePlay 开始播放', async () => {
      const user = userEvent.setup();
      mockIsPlaying = false; // 设置为暂停状态
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      renderWithRouter('1');

      // 等待 MainLayout 渲染和音频控制方法就绪
      await waitFor(() => {
        expect(screen.getByTestId('main-layout')).toBeInTheDocument();
      }, { timeout: 1000 });

      // 等待音频控制方法就绪
      await waitFor(() => {
        expect(mockAudioControls).not.toBeNull();
      }, { timeout: 1000 });

      // 更新 mockAudioControls 的 isPlaying 状态
      if (mockAudioControls) {
        mockAudioControls.isPlaying = false;
      }

      // 点击字幕
      const cueClickButton = screen.getByTestId('cue-click-button');
      await user.click(cueClickButton);

      // 验证 togglePlay 被调用（因为 isPlaying 为 false）
      await waitFor(() => {
        expect(mockTogglePlay).toHaveBeenCalledTimes(1);
      });
    });

    it('应该在点击字幕时，如果正在播放则不调用 togglePlay', async () => {
      const user = userEvent.setup();
      mockIsPlaying = true; // 设置为播放状态
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      renderWithRouter('1');

      // 等待 MainLayout 渲染和音频控制方法就绪
      await waitFor(() => {
        expect(screen.getByTestId('main-layout')).toBeInTheDocument();
      }, { timeout: 1000 });

      // 等待音频控制方法就绪
      await waitFor(() => {
        expect(mockAudioControls).not.toBeNull();
      }, { timeout: 1000 });

      // 更新 mockAudioControls 的 isPlaying 状态
      if (mockAudioControls) {
        mockAudioControls.isPlaying = true;
      }

      // 清空之前的调用记录
      vi.clearAllMocks();

      // 点击字幕
      const cueClickButton = screen.getByTestId('cue-click-button');
      await user.click(cueClickButton);

      // 验证 setProgress 被调用
      await waitFor(() => {
        expect(mockSetProgress).toHaveBeenCalledTimes(1);
      });

      // 验证 togglePlay 没有被调用（因为 isPlaying 为 true）
      expect(mockTogglePlay).not.toHaveBeenCalled();
    });
  });

  describe('首次打开逻辑', () => {
    it('应该在没有 URL 参数且没有 localStorage 时自动弹出文件选择弹窗', async () => {
      // 确保 localStorage 为空
      localStorage.clear();

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });
    });

    it('应该在用户关闭弹窗后显示空状态', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击关闭按钮
      const closeButton = screen.getByTestId('modal-close');
      await user.click(closeButton);

      // 验证空状态显示
      await waitFor(() => {
        expect(screen.getByText(/您还未选择音频文件/)).toBeInTheDocument();
      });
    });
  });

  describe('已选择逻辑', () => {
    it('应该在有 localStorage 中的 episodeId 时自动加载', async () => {
      // 设置 localStorage
      localStorage.setItem('podflow_last_episode_id', '123');
      
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 应该跳转到 /episodes/123 并加载数据
      await waitFor(() => {
        expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledWith('123');
      });
    });

    it('应该在有 URL 参数时使用 URL 参数而不是 localStorage', async () => {
      // 设置 localStorage
      localStorage.setItem('podflow_last_episode_id', '999');
      
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      renderWithRouter('1');

      // 应该使用 URL 参数 '1' 而不是 localStorage 中的 '999'
      await waitFor(() => {
        expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledWith('1');
        expect(subtitleServiceModule.subtitleService.getEpisode).not.toHaveBeenCalledWith('999');
      });
    });
  });

  describe('文件上传流程', () => {
    it('应该处理文件上传成功', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      const mockUploadResponse = {
        episode_id: 456,
        status: 'processing',
        is_duplicate: false,
      };

      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockResolvedValue(mockUploadResponse);
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 验证上传 API 被调用
      await waitFor(() => {
        expect(episodeServiceModule.episodeService.uploadEpisode).toHaveBeenCalled();
      });

      // 验证处理进度遮罩显示（在跳转之前）
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('processing-type')).toHaveTextContent('upload');
      }, { timeout: 100 });
    });

    it('应该处理文件上传失败', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      const mockError = new Error('上传失败');
      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockRejectedValue(mockError);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 验证错误状态显示
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('processing-error')).toBeInTheDocument();
      });
    });
  });

  describe('秒传/去重逻辑', () => {
    it('应该在 is_duplicate=true 时立即完成并跳过转录等待', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      const mockUploadResponse = {
        episode_id: 789,
        status: 'completed',
        is_duplicate: true,
      };

      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockResolvedValue(mockUploadResponse);
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 验证上传 API 被调用
      await waitFor(() => {
        expect(episodeServiceModule.episodeService.uploadEpisode).toHaveBeenCalled();
      });

      // 验证处理进度遮罩显示
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
      }, { timeout: 100 });

      // 验证进度立即设为 100%
      await waitFor(() => {
        const progressElement = screen.getByTestId('processing-progress');
        expect(progressElement).toHaveTextContent('100');
      }, { timeout: 500 });

      // 验证 localStorage 已保存
      expect(localStorage.getItem('podflow_last_episode_id')).toBe('789');
    });

    it('应该在 is_duplicate=false 时正常处理', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      const mockUploadResponse = {
        episode_id: 789,
        status: 'processing',
        is_duplicate: false,
      };

      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockResolvedValue(mockUploadResponse);
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 验证上传 API 被调用
      await waitFor(() => {
        expect(episodeServiceModule.episodeService.uploadEpisode).toHaveBeenCalled();
      });

      // 验证处理进度遮罩显示（在跳转之前）
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
      }, { timeout: 100 });

      // 验证 localStorage 已保存
      await waitFor(() => {
        expect(localStorage.getItem('podflow_last_episode_id')).toBe('789');
      }, { timeout: 1000 });
    });
  });

  describe('空状态显示', () => {
    it('应该在没有选择音频文件时显示空状态', async () => {
      localStorage.clear();

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗自动显示，然后关闭
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 模拟关闭弹窗（直接点击关闭按钮）
      const user = userEvent.setup();
      const closeButton = screen.getByTestId('modal-close');
      await user.click(closeButton);

      // 验证空状态显示
      await waitFor(() => {
        expect(screen.getByText(/您还未选择音频文件，点击按钮进行选择/)).toBeInTheDocument();
        expect(screen.getByText(/音频和字幕选择/)).toBeInTheDocument();
      });
    });
  });

  describe('字幕识别进度显示', () => {
    it('应该在上传新文件后显示字幕识别进度（status=processing）', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      const mockUploadResponse = {
        episode_id: 999,
        status: 'processing',
        is_duplicate: false,
      };

      const processingEpisode = {
        ...mockEpisode,
        id: 999,
        transcription_status: 'processing',
        transcription_progress: 25,
      };

      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockResolvedValue(mockUploadResponse);
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(processingEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 验证上传 API 被调用
      await waitFor(() => {
        expect(episodeServiceModule.episodeService.uploadEpisode).toHaveBeenCalled();
      });

      // 等待跳转后加载 episode 数据
      await waitFor(() => {
        expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledWith('999');
      }, { timeout: 2000 });

      // 验证显示字幕识别进度遮罩
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('processing-type')).toHaveTextContent('recognize');
        const progressElement = screen.getByTestId('processing-progress');
        expect(progressElement).toHaveTextContent('25');
      }, { timeout: 2000 });
    });

    it('应该在转录完成后清除识别进度遮罩', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      const mockUploadResponse = {
        episode_id: 888,
        status: 'processing',
        is_duplicate: false,
      };

      // 第一次返回 processing 状态，第二次返回 completed 状态
      const processingEpisode = {
        ...mockEpisode,
        id: 888,
        transcription_status: 'processing',
        transcription_progress: 50,
      };

      const completedEpisode = {
        ...mockEpisode,
        id: 888,
        transcription_status: 'completed',
        transcription_progress: 100,
      };

      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockResolvedValue(mockUploadResponse);
      subtitleServiceModule.subtitleService.getEpisode = vi.fn()
        .mockResolvedValueOnce(processingEpisode)
        .mockResolvedValueOnce(completedEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 等待跳转后加载 episode 数据
      await waitFor(() => {
        expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledWith('888');
      }, { timeout: 2000 });

      // 验证显示字幕识别进度遮罩
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('processing-type')).toHaveTextContent('recognize');
      }, { timeout: 2000 });

      // 等待轮询更新（3秒后）
      await waitFor(() => {
        // 轮询时应该再次调用 getEpisode，返回 completed 状态
        expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledTimes(2);
      }, { timeout: 4000 });

      // 验证 ProcessingOverlay 已清除（转录完成后）
      await waitFor(() => {
        expect(screen.queryByTestId('processing-overlay')).not.toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('应该在已有 episode 页面中上传新文件后显示识别进度', async () => {
      const user = userEvent.setup();
      localStorage.clear();

      // 先加载一个已有的 episode
      subtitleServiceModule.subtitleService.getEpisode = vi.fn().mockResolvedValue(mockEpisode);

      render(
        <MemoryRouter initialEntries={['/episodes/1']}>
          <Routes>
            <Route path="/episodes/:episodeId?" element={<EpisodePage />} />
          </Routes>
        </MemoryRouter>
      );

      // 等待 episode 加载完成
      await waitFor(() => {
        expect(screen.getByTestId('main-layout')).toBeInTheDocument();
      });

      // 点击文件导入按钮
      const fileImportButton = screen.getByTestId('file-import-button');
      await user.click(fileImportButton);

      // 等待弹窗显示
      await waitFor(() => {
        expect(screen.getByTestId('file-import-modal')).toBeInTheDocument();
      });

      // 准备新的上传响应
      const mockUploadResponse = {
        episode_id: 777,
        status: 'processing',
        is_duplicate: false,
      };

      const newProcessingEpisode = {
        ...mockEpisode,
        id: 777,
        transcription_status: 'processing',
        transcription_progress: 30,
      };

      episodeServiceModule.episodeService.uploadEpisode = vi.fn().mockResolvedValue(mockUploadResponse);
      subtitleServiceModule.subtitleService.getEpisode = vi.fn()
        .mockResolvedValueOnce(mockEpisode) // 第一次加载 episode 1
        .mockResolvedValueOnce(newProcessingEpisode); // 上传后加载 episode 777

      // 点击确认按钮（触发上传）
      const confirmButton = screen.getByTestId('modal-confirm');
      await user.click(confirmButton);

      // 验证上传 API 被调用
      await waitFor(() => {
        expect(episodeServiceModule.episodeService.uploadEpisode).toHaveBeenCalled();
      });

      // 等待跳转后加载新 episode 数据
      await waitFor(() => {
        expect(subtitleServiceModule.subtitleService.getEpisode).toHaveBeenCalledWith('777');
      }, { timeout: 2000 });

      // 验证显示字幕识别进度遮罩
      await waitFor(() => {
        expect(screen.getByTestId('processing-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('processing-type')).toHaveTextContent('recognize');
        const progressElement = screen.getByTestId('processing-progress');
        expect(progressElement).toHaveTextContent('30');
      }, { timeout: 2000 });
    });
  });
});

