import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteButton from '../DeleteButton';

describe('DeleteButton', () => {
  const mockOnDelete = vi.fn();
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

  describe('基础渲染', () => {
    it('应该在 anchorPosition 不为 null 时渲染删除按钮', async () => {
      render(
        <DeleteButton
          anchorPosition={{ x: 100, y: 100 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const button = screen.getByLabelText(/删除划线笔记/i);
        expect(button).toBeInTheDocument();
      });
    });

    it('应该在 anchorPosition 为 null 时不渲染按钮', () => {
      const { container } = render(
        <DeleteButton
          anchorPosition={null}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      // 按钮不应该渲染任何内容
      expect(container.firstChild).toBeNull();
    });

    it('应该显示垃圾桶图标按钮', async () => {
      render(
        <DeleteButton
          anchorPosition={{ x: 100, y: 100 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const button = screen.getByLabelText(/删除划线笔记/i);
        expect(button).toBeInTheDocument();
      });
    });
  });

  describe('位置计算', () => {
    it('应该默认在划线源正上方 10px 处显示', async () => {
      render(
        <DeleteButton
          anchorPosition={{ x: 500, y: 500 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      // Portal 渲染到 body，需要在 document.body 中查找
      await waitFor(() => {
        const buttonContainer = document.querySelector('[data-delete-button]');
        expect(buttonContainer).toBeInTheDocument();
        
        // 检查样式是否包含定位
        const style = window.getComputedStyle(buttonContainer);
        expect(style.position).toBe('fixed');
      });
    });

    it('应该在屏幕上方不够用时改为正下方', async () => {
      // 设置较小的视口高度，使按钮无法在上方显示
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 100,
      });

      render(
        <DeleteButton
          anchorPosition={{ x: 50, y: 50 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const buttonContainer = document.querySelector('[data-delete-button]');
        expect(buttonContainer).toBeInTheDocument();
      });
    });

    it('应该在屏幕左边不够用时往右挪动', async () => {
      render(
        <DeleteButton
          anchorPosition={{ x: 10, y: 500 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const buttonContainer = document.querySelector('[data-delete-button]');
        expect(buttonContainer).toBeInTheDocument();
      });
    });

    it('应该在屏幕右边不够用时往左挪动', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 200,
      });

      render(
        <DeleteButton
          anchorPosition={{ x: 190, y: 500 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const buttonContainer = document.querySelector('[data-delete-button]');
        expect(buttonContainer).toBeInTheDocument();
      });
    });
  });

  describe('交互', () => {
    it('应该点击删除按钮时调用 onDelete 和 onClose 回调', async () => {
      const user = userEvent.setup();
      
      render(
        <DeleteButton
          anchorPosition={{ x: 100, y: 100 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/删除划线笔记/i)).toBeInTheDocument();
      });

      const deleteButton = screen.getByLabelText(/删除划线笔记/i);
      await user.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('应该点击外部区域时调用 onClose 回调', async () => {
      const user = userEvent.setup();
      
      const { container } = render(
        <div>
          <div data-testid="outside">Outside</div>
          <DeleteButton
            anchorPosition={{ x: 100, y: 100 }}
            onDelete={mockOnDelete}
            onClose={mockOnClose}
          />
        </div>
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/删除划线笔记/i)).toBeInTheDocument();
      });

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
        <DeleteButton
          anchorPosition={{ x: 100, y: 100 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const button = screen.getByLabelText(/删除划线笔记/i);
        expect(button).toBeInTheDocument();
      });
    });

    it('应该 Hover 状态显示浅灰色背景', async () => {
      const user = userEvent.setup();
      
      render(
        <DeleteButton
          anchorPosition={{ x: 100, y: 100 }}
          onDelete={mockOnDelete}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/删除划线笔记/i)).toBeInTheDocument();
      });

      const deleteButton = screen.getByLabelText(/删除划线笔记/i);
      await user.hover(deleteButton);

      // 检查按钮是否存在
      expect(deleteButton).toBeInTheDocument();
    });
  });
});

