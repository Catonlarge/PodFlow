import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AICard from '../AICard';

describe('AICard', () => {
  const mockAnchorPosition = {
    top: 100,
    left: 200,
    right: 300,
    bottom: 150,
  };

  const mockQueryText = 'taxonomy';

  const mockResponseDataWord = {
    type: 'word',
    content: {
      phonetic: '/tækˈsɒnəmi/',
      definition: '分类学；分类法',
      explanation: '生物学中用于分类和命名生物体的科学体系。',
    },
  };

  const mockResponseDataPhrase = {
    type: 'phrase',
    content: {
      phonetic: '/blæk swɒn ɪˈvent/',
      definition: '黑天鹅事件',
      explanation: '金融和经济学术语。指那些极其罕见、难以预测，但一旦发生就会造成极端严重后果的事件。',
    },
  };

  const mockResponseDataSentence = {
    type: 'sentence',
    content: {
      translation: '资本的积累是投资的先决条件。',
      highlight_vocabulary: [
        { term: 'accumulation', definition: '积累；堆积' },
        { term: 'prerequisite', definition: '先决条件；前提' },
        { term: 'investment', definition: '投资' },
      ],
    },
  };

  const mockOnAddToNote = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.innerWidth and innerHeight
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基础渲染', () => {
    it('应该渲染卡片标题栏（包含 AI 查询图标、标题"AI查询"、笔记图标）', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('AI查询')).toBeInTheDocument();
      expect(screen.getByLabelText(/添加到笔记/i)).toBeInTheDocument();
    });

    it('应该在 Loading 状态显示转圈图标', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={null}
          isLoading={true}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      // 检查是否有 CircularProgress（Loading 图标）
      const loadingIcon = document.querySelector('.MuiCircularProgress-root');
      expect(loadingIcon).toBeInTheDocument();
    });

    it('应该在完成状态显示打勾图标', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      // 检查是否有 CheckCircle 图标（完成状态）
      const checkIcon = document.querySelector('[data-testid="ai-card-complete-icon"]');
      expect(checkIcon).toBeInTheDocument();
    });

    it('应该渲染内容区域', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      const cardContent = document.querySelector('.MuiCardContent-root');
      expect(cardContent).toBeInTheDocument();
    });

    it('应该在 anchorPosition 为 null 时不渲染', () => {
      const { container } = render(
        <AICard
          anchorPosition={null}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('内容渲染（根据 type 类型）', () => {
    it('应该渲染 word 类型的内容（phonetic、definition、explanation）', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/发音：/i)).toBeInTheDocument();
      // 检查音标是否存在（使用 getAllByText 因为可能有多个匹配）
      const phoneticElements = screen.getAllByText((content, element) => {
        return element.textContent?.includes(mockResponseDataWord.content.phonetic) || false;
      });
      expect(phoneticElements.length).toBeGreaterThan(0);
      expect(screen.getByText(mockResponseDataWord.content.definition)).toBeInTheDocument();
      expect(screen.getByText(mockResponseDataWord.content.explanation)).toBeInTheDocument();
    });

    it('应该渲染 phrase 类型的内容（phonetic、definition、explanation）', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText="black swan event"
          responseData={mockResponseDataPhrase}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/发音：/i)).toBeInTheDocument();
      // 检查音标是否存在（使用 getAllByText 因为可能有多个匹配）
      const phoneticElements = screen.getAllByText((content, element) => {
        return element.textContent?.includes(mockResponseDataPhrase.content.phonetic) || false;
      });
      expect(phoneticElements.length).toBeGreaterThan(0);
      expect(screen.getByText(mockResponseDataPhrase.content.definition)).toBeInTheDocument();
      expect(screen.getByText(mockResponseDataPhrase.content.explanation)).toBeInTheDocument();
    });

    it('应该渲染 sentence 类型的内容（translation、highlight_vocabulary 列表）', () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText="The accumulation of capital is a prerequisite for investment."
          responseData={mockResponseDataSentence}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(mockResponseDataSentence.content.translation)).toBeInTheDocument();
      expect(screen.getByText(/难点词汇：/i)).toBeInTheDocument();
      
      mockResponseDataSentence.content.highlight_vocabulary.forEach((vocab) => {
        expect(screen.getByText(new RegExp(vocab.term, 'i'))).toBeInTheDocument();
        // definition 可能在同一个元素中（与 term 一起），使用 getAllByText
        const definitionElements = screen.getAllByText((content, element) => {
          return element.textContent?.includes(vocab.definition) || false;
        });
        expect(definitionElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('定位逻辑', () => {
    it('应该使用固定定位悬浮显示', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const card = document.querySelector('[data-testid="ai-card"]');
        expect(card).toBeInTheDocument();
        const style = window.getComputedStyle(card);
        expect(style.position).toBe('fixed');
        expect(style.width).toBe('420px');
      });
    });

    it('应该在划线位置在屏幕上半部分时，卡片显示在划线源下方', async () => {
      const anchorInUpperHalf = {
        top: 100, // 屏幕上半部分
        left: 200,
        right: 300,
        bottom: 150,
      };

      render(
        <AICard
          anchorPosition={anchorInUpperHalf}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const card = document.querySelector('[data-testid="ai-card"]');
        expect(card).toBeInTheDocument();
        const style = window.getComputedStyle(card);
        const top = parseInt(style.top, 10);
        // 卡片应该在划线源下方（bottom + 10px）
        expect(top).toBeGreaterThanOrEqual(anchorInUpperHalf.bottom + 10);
      });
    });

    it('应该在划线位置在屏幕下半部分时，卡片显示在划线源上方', async () => {
      const anchorInLowerHalf = {
        top: 800, // 屏幕下半部分
        left: 200,
        right: 300,
        bottom: 850,
      };

      render(
        <AICard
          anchorPosition={anchorInLowerHalf}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const card = document.querySelector('[data-testid="ai-card"]');
        expect(card).toBeInTheDocument();
        const style = window.getComputedStyle(card);
        const top = parseInt(style.top, 10);
        const cardHeight = parseInt(style.height, 10) || 200; // 估算卡片高度
        // 卡片应该在划线源上方（top - cardHeight - 10px）
        expect(top + cardHeight).toBeLessThanOrEqual(anchorInLowerHalf.top - 10);
      });
    });

    it('应该与划线源中心水平对齐', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const card = document.querySelector('[data-testid="ai-card"]');
        expect(card).toBeInTheDocument();
        const style = window.getComputedStyle(card);
        const left = parseInt(style.left, 10);
        const cardWidth = 420;
        const anchorCenter = mockAnchorPosition.left + (mockAnchorPosition.right - mockAnchorPosition.left) / 2;
        const expectedLeft = anchorCenter - cardWidth / 2;
        // 允许一定的误差（1px）
        expect(Math.abs(left - expectedLeft)).toBeLessThanOrEqual(1);
      });
    });

    it('应该在屏幕左边不够用时自动调整位置', async () => {
      const anchorNearLeft = {
        top: 100,
        left: 10, // 靠近左边界
        right: 100,
        bottom: 150,
      };

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920,
      });

      render(
        <AICard
          anchorPosition={anchorNearLeft}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const card = document.querySelector('[data-testid="ai-card"]');
        expect(card).toBeInTheDocument();
        const style = window.getComputedStyle(card);
        const left = parseInt(style.left, 10);
        // 卡片不应该超出屏幕左边界
        expect(left).toBeGreaterThanOrEqual(0);
      });
    });

    it('应该在屏幕右边不够用时自动调整位置', async () => {
      const anchorNearRight = {
        top: 100,
        left: 1600, // 靠近右边界
        right: 1700,
        bottom: 150,
      };

      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920,
      });

      render(
        <AICard
          anchorPosition={anchorNearRight}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const card = document.querySelector('[data-testid="ai-card"]');
        expect(card).toBeInTheDocument();
        const style = window.getComputedStyle(card);
        const left = parseInt(style.left, 10);
        const cardWidth = 420;
        // 卡片不应该超出屏幕右边界
        expect(left + cardWidth).toBeLessThanOrEqual(window.innerWidth);
      });
    });
  });

  describe('退出逻辑', () => {
    it('应该在点击卡片外部区域时调用 onClose', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('AI查询')).toBeInTheDocument();
      });

      // 点击卡片外部（body）
      await userEvent.click(document.body);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it('不应该在点击卡片内部时调用 onClose', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('AI查询')).toBeInTheDocument();
      });

      // 点击卡片内部
      const card = document.querySelector('[data-testid="ai-card"]');
      await userEvent.click(card);

      // onClose 不应该被调用
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('添加到笔记功能', () => {
    it('应该在点击笔记图标时调用 onAddToNote 回调', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
          queryId={123}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/添加到笔记/i)).toBeInTheDocument();
      });

      const noteButton = screen.getByLabelText(/添加到笔记/i);
      await userEvent.click(noteButton);

      await waitFor(() => {
        expect(mockOnAddToNote).toHaveBeenCalledTimes(1);
        expect(mockOnAddToNote).toHaveBeenCalledWith(mockResponseDataWord, 123);
      });
    });

    it('应该在添加到笔记后调用 onAddToNote（不调用 onClose）', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
          queryId={123}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/添加到笔记/i)).toBeInTheDocument();
      });

      const noteButton = screen.getByLabelText(/添加到笔记/i);
      await userEvent.click(noteButton);

      await waitFor(() => {
        expect(mockOnAddToNote).toHaveBeenCalledTimes(1);
        expect(mockOnAddToNote).toHaveBeenCalledWith(mockResponseDataWord, 123);
        // 注意：添加到笔记后不应该调用 onClose（根据实现代码注释）
        expect(mockOnClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('流式输出效果', () => {
    it('应该显示完整内容（流式输出功能在 Task 4.4 中实现）', async () => {
      render(
        <AICard
          anchorPosition={mockAnchorPosition}
          queryText={mockQueryText}
          responseData={mockResponseDataWord}
          isLoading={false}
          onAddToNote={mockOnAddToNote}
          onClose={mockOnClose}
        />
      );

      // 应该直接显示完整内容
      await waitFor(() => {
        expect(screen.getByText('AI查询')).toBeInTheDocument();
        expect(screen.getByText(mockResponseDataWord.content.definition)).toBeInTheDocument();
      });
    });
  });
});

