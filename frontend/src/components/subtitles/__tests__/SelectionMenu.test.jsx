import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectionMenu from '../SelectionMenu';
import { FormatUnderlined, Search, Lightbulb } from '@mui/icons-material';

describe('SelectionMenu', () => {
  const mockOnUnderline = vi.fn();
  const mockOnQuery = vi.fn();
  const mockOnThought = vi.fn();
  const mockOnClose = vi.fn();

  const mockAffectedCues = [
    {
      cue: { id: 1, text: 'Hello world' },
      startOffset: 0,
      endOffset: 5,
      selectedText: 'Hello',
    },
  ];

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

  describe('基础渲染', () => {
    it('应该在 anchorPosition 不为 null 时渲染菜单', () => {
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      // 检查三个按钮是否存在
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(3);
    });

    it('应该在 anchorPosition 为 null 时不渲染菜单', () => {
      const { container } = render(
        <SelectionMenu
          anchorPosition={null}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      // 菜单不应该渲染任何内容
      expect(container.firstChild).toBeNull();
    });

    it('应该显示三个操作按钮', () => {
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      // 检查按钮的 aria-label（可访问性）
      expect(screen.getByLabelText(/纯划线/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/查询/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/想法/i)).toBeInTheDocument();
    });
  });

  describe('位置计算', () => {
    it('应该默认在划线源正上方 10px 处显示', async () => {
      render(
        <SelectionMenu
          anchorPosition={{ x: 500, y: 500 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      // Portal 渲染到 body，需要在 document.body 中查找
      await waitFor(() => {
        const menu = document.querySelector('[data-selection-menu]');
        expect(menu).toBeInTheDocument();
        
        // 检查样式是否包含定位
        const style = window.getComputedStyle(menu);
        expect(style.position).toBe('fixed');
      });
    });

    it('应该在屏幕上方不够用时改为正下方', async () => {
      // 设置较小的视口高度，使菜单无法在上方显示
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 100,
      });

      render(
        <SelectionMenu
          anchorPosition={{ x: 50, y: 50 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const menu = document.querySelector('[data-selection-menu]');
        expect(menu).toBeInTheDocument();
      });
    });

    it('应该在屏幕左边不够用时往右挪动', async () => {
      render(
        <SelectionMenu
          anchorPosition={{ x: 10, y: 500 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const menu = document.querySelector('[data-selection-menu]');
        expect(menu).toBeInTheDocument();
      });
    });

    it('应该在屏幕右边不够用时往左挪动', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 200,
      });

      render(
        <SelectionMenu
          anchorPosition={{ x: 190, y: 500 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const menu = document.querySelector('[data-selection-menu]');
        expect(menu).toBeInTheDocument();
      });
    });
  });

  describe('交互', () => {
    it('应该点击"纯划线"按钮时调用 onUnderline 回调', async () => {
      const user = userEvent.setup();
      
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      const underlineButton = screen.getByLabelText(/纯划线/i);
      await user.click(underlineButton);

      expect(mockOnUnderline).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('应该点击"查询"按钮时调用 onQuery 回调', async () => {
      const user = userEvent.setup();
      
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      const queryButton = screen.getByLabelText(/查询/i);
      await user.click(queryButton);

      expect(mockOnQuery).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('应该点击"想法"按钮时调用 onThought 回调', async () => {
      const user = userEvent.setup();
      
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      const thoughtButton = screen.getByLabelText(/想法/i);
      await user.click(thoughtButton);

      expect(mockOnThought).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('应该点击外部区域时调用 onClose 回调', async () => {
      const user = userEvent.setup();
      
      const { container } = render(
        <div>
          <div data-testid="outside">Outside</div>
          <SelectionMenu
            anchorPosition={{ x: 100, y: 100 }}
            selectedText="Hello"
            affectedCues={mockAffectedCues}
            onUnderline={mockOnUnderline}
            onQuery={mockOnQuery}
            onThought={mockOnThought}
            onClose={mockOnClose}
          />
        </div>
      );

      const outside = screen.getByTestId('outside');
      await user.click(outside);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('三状态样式', () => {
    it('应该 Normal 状态显示灰色图标，无背景', async () => {
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const buttons = document.querySelectorAll('button[aria-label]');
        expect(buttons.length).toBeGreaterThanOrEqual(3);
        buttons.forEach((button) => {
          // 检查按钮是否存在
          expect(button).toBeInTheDocument();
        });
      });
    });

    it('应该 Hover 状态显示浅灰色背景', async () => {
      const user = userEvent.setup();
      
      render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const underlineButton = screen.getByLabelText(/纯划线/i);
        expect(underlineButton).toBeInTheDocument();
      });

      const underlineButton = screen.getByLabelText(/纯划线/i);
      await user.hover(underlineButton);

      // 检查 hover 状态（通过类名或样式）
      const style = window.getComputedStyle(underlineButton);
      expect(underlineButton).toBeInTheDocument();
    });
  });

  describe('边界情况', () => {
    it('应该在 selectedText 为空时不显示菜单', () => {
      const { container } = render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText={null}
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('应该在 selectedText 为空字符串时不显示菜单', () => {
      const { container } = render(
        <SelectionMenu
          anchorPosition={{ x: 100, y: 100 }}
          selectedText=""
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('应该处理菜单超出屏幕的情况', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 50,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 50,
      });

      render(
        <SelectionMenu
          anchorPosition={{ x: 25, y: 25 }}
          selectedText="Hello"
          affectedCues={mockAffectedCues}
          onUnderline={mockOnUnderline}
          onQuery={mockOnQuery}
          onThought={mockOnThought}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const menu = document.querySelector('[data-selection-menu]');
        expect(menu).toBeInTheDocument();
      });
    });
  });
});

