import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubtitleList from '../SubtitleList';
import { getMockCues, subtitleService } from '../../../services/subtitleService';
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
  default: ({ cue, showSpeaker }) => {
    if (showSpeaker) {
      return <div data-testid={`speaker-${cue.speaker}`}>{cue.speaker}：</div>;
    }
    return (
      <div data-testid={`subtitle-${cue.id}`}>
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

describe('SubtitleList - 性能测试', () => {
  // 创建大量字幕数据（模拟1小时音频，约3000条字幕）
  const largeMockCues = Array.from({ length: 3000 }, (_, i) => ({
    id: i + 1,
    start_time: i * 1.2,
    end_time: (i + 1) * 1.2,
    speaker: i % 3 === 0 ? 'Speaker1' : i % 3 === 1 ? 'Speaker2' : 'Speaker3',
    text: `Subtitle text ${i + 1} with some content to make it longer`,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockVirtualItems.length = 0;
    getMockCues.mockResolvedValue(largeMockCues);
    subtitleService.getEpisodeSegments.mockResolvedValue([]);
    highlightService.getHighlightsByEpisode.mockResolvedValue([]);
    noteService.getNotesByEpisode.mockResolvedValue([]);
    
    // 只渲染可视区域内的虚拟项（约20个）
    for (let i = 0; i < 20; i++) {
      mockVirtualItems.push({
        index: i,
        start: i * 80,
        size: 80,
        measureElement: vi.fn(),
      });
    }
  });

  describe('DOM节点数量优化', () => {
    it('应该只渲染可视区域内的字幕行，即使有3000+条字幕', () => {
      render(
        <SubtitleList
          cues={largeMockCues}
          currentTime={1.0}
          duration={3600.0}
        />
      );

      // 统计实际渲染的DOM节点
      const renderedSubtitles = screen.queryAllByTestId(/^subtitle-\d+$/);
      const renderedSpeakers = screen.queryAllByTestId(/^speaker-\w+$/);
      const totalRenderedNodes = renderedSubtitles.length + renderedSpeakers.length;

      // 即使有3000条字幕，也应该只渲染可视区域内的（约20-30个）
      expect(totalRenderedNodes).toBeLessThan(50);
      expect(totalRenderedNodes).toBeGreaterThan(0);
    });

    it('应该大幅减少DOM节点数量', () => {
      render(
        <SubtitleList
          cues={largeMockCues}
          currentTime={1.0}
          duration={3600.0}
        />
      );

      const renderedSubtitles = screen.queryAllByTestId(/^subtitle-\d+$/);
      const totalCues = largeMockCues.length;

      // DOM节点数量应该远小于总字幕数
      const reductionRatio = renderedSubtitles.length / totalCues;
      expect(reductionRatio).toBeLessThan(0.02); // 应该减少98%以上
    });
  });

  describe('滚动性能', () => {
    it('应该在滚动时只更新可视区域内的DOM节点', () => {
      const { rerender } = render(
        <SubtitleList
          cues={largeMockCues}
          currentTime={1.0}
          duration={3600.0}
        />
      );

      const initialRendered = screen.queryAllByTestId(/^subtitle-\d+$/).length;

      // 模拟滚动到中间位置
      mockVirtualItems.length = 0;
      for (let i = 1500; i < 1520; i++) {
        mockVirtualItems.push({
          index: i,
          start: i * 80,
          size: 80,
          measureElement: vi.fn(),
        });
      }

      rerender(
        <SubtitleList
          cues={largeMockCues}
          currentTime={1800.0}
          duration={3600.0}
        />
      );

      const afterScrollRendered = screen.queryAllByTestId(/^subtitle-\d+$/).length;

      // 滚动后渲染的节点数量应该与滚动前相近（都是可视区域内的数量）
      expect(afterScrollRendered).toBeLessThan(50);
      expect(Math.abs(afterScrollRendered - initialRendered)).toBeLessThan(10);
    });
  });

  describe('内存占用', () => {
    it('应该保持较低的内存占用', () => {
      render(
        <SubtitleList
          cues={largeMockCues}
          currentTime={1.0}
          duration={3600.0}
        />
      );

      // 验证虚拟滚动器只维护可视区域内的数据
      expect(mockVirtualizer.getVirtualItems).toHaveBeenCalled();
      
      // 虚拟项数量应该远小于总字幕数
      expect(mockVirtualItems.length).toBeLessThan(50);
    });
  });

  describe('渲染性能', () => {
    it('应该在大量字幕时保持快速渲染', () => {
      const startTime = performance.now();
      
      render(
        <SubtitleList
          cues={largeMockCues}
          currentTime={1.0}
          duration={3600.0}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // 渲染时间应该小于100ms（即使有3000条字幕）
      expect(renderTime).toBeLessThan(100);
    });
  });
});

