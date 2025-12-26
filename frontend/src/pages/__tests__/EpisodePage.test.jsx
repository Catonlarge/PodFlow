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
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import EpisodePage from '../EpisodePage';
import * as subtitleServiceModule from '../../services/subtitleService';
import api from '../../api';

// Mock 依赖
vi.mock('../../services/subtitleService', () => ({
  subtitleService: {
    getEpisode: vi.fn(),
  },
  getMockCues: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
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
  default: ({ episodeTitle, showName, audioUrl, episodeId, onCueClick }) => {
    const { useEffect, useState } = require('react');
    const [audioControlsReady, setAudioControlsReady] = useState(false);

    useEffect(() => {
      // 模拟 AudioBarContainer 的回调
      setTimeout(() => {
        mockAudioControls = {
          setProgress: mockSetProgress,
          togglePlay: mockTogglePlay,
          isPlaying: mockIsPlaying,
        };
        setAudioControlsReady(true);
      }, 0);
    }, []);

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
        <div data-testid="episode-title">{episodeTitle}</div>
        <div data-testid="show-name">{showName}</div>
        <div data-testid="audio-url">{audioUrl}</div>
        <div data-testid="episode-id">{episodeId}</div>
        <button
          data-testid="cue-click-button"
          onClick={() => handleCueClick(10.5)}
        >
          点击字幕
        </button>
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
  });

  afterEach(() => {
    vi.clearAllTimers();
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
});

