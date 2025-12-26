import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MiniAudioBar from '../MiniAudioBar';

describe('MiniAudioBar', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染', () => {
    it('应该渲染收缩态进度条', () => {
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('应该显示正确的进度百分比', () => {
      const { container } = render(<MiniAudioBar progressPercent={75} onClick={mockOnClick} />);
      
      // 验证组件能够正常渲染
      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证进度条宽度（内部 Box 的宽度应该为 75%）
      const progressBar = rootElement.firstChild;
      expect(progressBar).toBeTruthy();
      const computedStyle = window.getComputedStyle(progressBar);
      expect(computedStyle.width).toBe('75%');
    });

    it('应该显示 0% 进度当 progressPercent 为 0 时', () => {
      const { container } = render(<MiniAudioBar progressPercent={0} onClick={mockOnClick} />);
      
      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证进度条宽度为 0%
      const progressBar = rootElement.firstChild;
      expect(progressBar).toBeTruthy();
      const computedStyle = window.getComputedStyle(progressBar);
      expect(computedStyle.width).toBe('0%');
    });

    it('应该显示 100% 进度当 progressPercent 为 100 时', () => {
      const { container } = render(<MiniAudioBar progressPercent={100} onClick={mockOnClick} />);
      
      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证进度条宽度为 100%
      const progressBar = rootElement.firstChild;
      expect(progressBar).toBeTruthy();
      const computedStyle = window.getComputedStyle(progressBar);
      expect(computedStyle.width).toBe('100%');
    });
  });

  describe('交互', () => {
    it('应该调用 onClick 当点击收缩面板时', async () => {
      const user = userEvent.setup();
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);

      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      await user.click(rootElement);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('应该显示指针光标', () => {
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);

      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证 cursor: pointer
      const computedStyle = window.getComputedStyle(rootElement);
      expect(computedStyle.cursor).toBe('pointer');
    });
  });

  describe('样式', () => {
    it('应该固定在屏幕底部', () => {
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);

      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证 position: fixed 和 bottom: 0
      const computedStyle = window.getComputedStyle(rootElement);
      expect(computedStyle.position).toBe('fixed');
      expect(computedStyle.bottom).toBe('0px');
    });

    it('应该有正确的 z-index', () => {
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);

      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证 z-index
      const computedStyle = window.getComputedStyle(rootElement);
      expect(computedStyle.zIndex).toBe('1000');
    });

    it('应该有正确的高度', () => {
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);

      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      
      // 验证高度为 5px
      const computedStyle = window.getComputedStyle(rootElement);
      expect(computedStyle.height).toBe('5px');
    });

    it('进度条应该有过渡动画', () => {
      const { container } = render(<MiniAudioBar progressPercent={50} onClick={mockOnClick} />);

      // 查找内部的进度条 Box
      const rootElement = container.firstChild;
      expect(rootElement).toBeTruthy();
      const progressBar = rootElement.firstChild;
      expect(progressBar).toBeTruthy();
      
      // 验证 transition 属性
      const computedStyle = window.getComputedStyle(progressBar);
      expect(computedStyle.transition).toContain('width');
    });
  });
});

