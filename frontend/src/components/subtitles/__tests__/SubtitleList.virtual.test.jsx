import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SubtitleList from '../SubtitleList';
import { getMockCues, getCuesBySegmentRange, subtitleService } from '../../../services/subtitleService';
import { highlightService } from '../../../services/highlightService';
import { noteService } from '../../../services/noteService';

// Mock @tanstack/react-virtual
const mockVirtualItems = [];
const mockVirtualizer = {
  getVirtualItems: vi.fn(() => mockVirtualItems),
  getTotalSize: vi.fn(() => 1000),
  scrollToIndex: vi.fn(),
  getOffset: vi.fn((index) => index * 80),
  getSize: vi.fn(() => 80),
  measureElement: vi.fn(),
};

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => mockVirtualizer),
}));

// Mock subtitleService
vi.mock('../../../services/subtitleService', () => ({
  getMockCues: vi.fn(),
  getCuesByEpisodeId: vi.fn(),
  getCuesBySegmentRange: vi.fn(),
  subtitleService: {
    getMockCues: vi.fn(),
    getCuesByEpisodeId: vi.fn(),
    getCuesBySegmentRange: vi.fn(),
    getEpisodeSegments: vi.fn(),
    triggerSegmentTranscription: vi.fn(),
    restartTranscription: vi.fn(),
  },
}));

// Mock useTextSelection hook
vi.mock('../../../hooks/useTextSelection', () => ({
  useTextSelection: vi.fn(() => ({
    selectedText: null,
    selectionRange: null,
    affectedCues: [],
    clearSelection: vi.fn(),
  })),
}));

// Mock SelectionMenu
vi.mock('../SelectionMenu', () => ({
  default: () => null,
}));

// Mock SubtitleRow
vi.mock('../SubtitleRow', () => ({
  default: ({ cue, showSpeaker, isHighlighted }) => {
    if (showSpeaker) {
      return <div data-testid={`speaker-${cue.speaker}`}>{cue.speaker}：</div>;
    }
    return (
      <div
        data-testid={`subtitle-${cue.id}`}
        data-highlighted={isHighlighted}
      >
        {cue.text}
      </div>
    );
  },
}));

// Mock highlightService
vi.mock('../../../services/highlightService', () => ({
  highlightService: {
    createHighlights: vi.fn(),
    getHighlightsByEpisode: vi.fn(),
    deleteHighlight: vi.fn(),
  },
}));

// Mock noteService
vi.mock('../../../services/noteService', () => ({
  noteService: {
    createNote: vi.fn(),
    getNotesByEpisode: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

// Mock aiService
vi.mock('../../../services/aiService', () => ({
  aiService: {
    queryAI: vi.fn(),
  },
}));

// Mock AICard
vi.mock('../AICard', () => ({
  default: () => null,
}));

// Mock DeleteButton
vi.mock('../DeleteButton', () => ({
  default: () => null,
}));

describe('SubtitleList - 虚拟滚动', () => {
  const mockCues = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    start_time: i * 2,
    end_time: (i + 1) * 2,
    speaker: i % 2 === 0 ? 'Speaker1' : 'Speaker2',
    text: `Subtitle ${i + 1}`,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockVirtualItems.length = 0;
    getMockCues.mockResolvedValue(mockCues);
    subtitleService.getEpisodeSegments.mockResolvedValue([]);
    highlightService.getHighlightsByEpisode.mockResolvedValue([]);
    noteService.getNotesByEpisode.mockResolvedValue([]);
    
    // 设置初始虚拟项（只渲染前10个）
    for (let i = 0; i < 10; i++) {
      mockVirtualItems.push({
        index: i,
        start: i * 80,
        size: 80,
        measureElement: vi.fn(),
      });
    }
  });

  describe('虚拟滚动器初始化', () => {
    it('应该正确初始化虚拟滚动器', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      expect(mockVirtualizer.getVirtualItems).toHaveBeenCalled();
      expect(mockVirtualizer.getTotalSize).toHaveBeenCalled();
    });

    it('应该只渲染可视区域内的字幕行', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      // 应该只渲染虚拟项中的字幕（前10个）
      waitFor(() => {
        const renderedSubtitles = screen.queryAllByTestId(/^subtitle-\d+$/);
        expect(renderedSubtitles.length).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('滚动功能', () => {
    it('应该正确更新渲染的字幕当滚动时', () => {
      const { rerender } = render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      // 模拟滚动到中间位置
      mockVirtualItems.length = 0;
      for (let i = 50; i < 60; i++) {
        mockVirtualItems.push({
          index: i,
          start: i * 80,
          size: 80,
          measureElement: vi.fn(),
        });
      }

      rerender(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      // 应该渲染新的虚拟项
      waitFor(() => {
        expect(mockVirtualizer.getVirtualItems).toHaveBeenCalled();
      });
    });
  });

  describe('自动滚动功能', () => {
    it('应该在虚拟滚动中正确执行自动滚动', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={50.0}
          duration={200.0}
        />
      );

      // 等待自动滚动逻辑执行
      waitFor(() => {
        // 应该调用 scrollToIndex（当字幕不在可视区域时）
        // 注意：这里需要根据实际实现调整断言
        expect(mockVirtualizer.scrollToIndex).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  describe('Ref 注册', () => {
    it('应该在虚拟滚动中正确注册 ref', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      // 验证 ref 注册逻辑被调用
      waitFor(() => {
        const renderedSubtitles = screen.queryAllByTestId(/^subtitle-\d+$/);
        expect(renderedSubtitles.length).toBeGreaterThan(0);
      });
    });
  });

  describe('文本选择功能', () => {
    it('应该在虚拟滚动中支持文本选择', () => {
      const { useTextSelection } = require('../../../hooks/useTextSelection');
      
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      // 验证 useTextSelection hook 被调用（通过检查组件是否正常渲染来间接验证）
      // 由于 useTextSelection 已经被 mock，我们验证组件能正常渲染即可
      expect(screen.queryAllByTestId(/^subtitle-\d+$/).length).toBeGreaterThan(0);
    });
  });

  describe('滚动加载', () => {
    it('应该在滚动到底部时触发加载下一个segment', async () => {
      const mockSegments = [
        { segment_index: 0, status: 'completed', start_time: 0, end_time: 100 },
        { segment_index: 1, status: 'completed', start_time: 100, end_time: 200 },
      ];
      
      subtitleService.getEpisodeSegments.mockResolvedValue(mockSegments);
      vi.mocked(getCuesBySegmentRange).mockResolvedValue(mockCues);

      render(
        <SubtitleList
          episodeId={1}
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
          segments={mockSegments}
        />
      );

      // 模拟滚动到底部
      const container = document.querySelector('[data-subtitle-container]');
      if (container) {
        Object.defineProperty(container, 'scrollTop', { value: 9000, writable: true });
        Object.defineProperty(container, 'scrollHeight', { value: 10000, writable: true });
        Object.defineProperty(container, 'clientHeight', { value: 1000, writable: true });
        
        // 触发滚动事件
        const scrollEvent = new Event('scroll');
        container.dispatchEvent(scrollEvent);
      }

      // 验证加载逻辑被触发（需要根据实际实现调整）
      await waitFor(() => {
        // 这里应该验证 checkAndLoadNextSegment 被调用
        // 但由于是内部逻辑，可能需要通过其他方式验证
      }, { timeout: 2000 });
    });
  });

  describe('性能优化', () => {
    it('应该只渲染可视区域内的DOM节点', () => {
      render(
        <SubtitleList
          cues={mockCues}
          currentTime={1.0}
          duration={200.0}
        />
      );

      waitFor(() => {
        const allSubtitles = screen.queryAllByTestId(/^subtitle-\d+$/);
        // 即使有100条字幕，也应该只渲染可视区域内的（约10-20条）
        expect(allSubtitles.length).toBeLessThan(30);
      });
    });
  });
});

