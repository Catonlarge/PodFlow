import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProcessingOverlay from '../ProcessingOverlay';

describe('ProcessingOverlay', () => {
  const mockOnRetry = vi.fn();
  const mockOnTogglePause = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('遮罩渲染', () => {
    it('组件正常渲染', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={50}
        />
      );

      expect(screen.getByText(/请稍等/i)).toBeInTheDocument();
    });

    it('type="upload" 显示"请稍等，音频上传中"', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={50}
        />
      );

      expect(screen.getByText('请稍等，音频上传中')).toBeInTheDocument();
    });

    it('type="load" 显示"请稍等，字幕加载中"', () => {
      render(
        <ProcessingOverlay
          type="load"
          progress={50}
        />
      );

      expect(screen.getByText('请稍等，字幕加载中')).toBeInTheDocument();
    });

    it('type="recognize" 显示"请稍等，努力识别字幕中"', () => {
      render(
        <ProcessingOverlay
          type="recognize"
          progress={50}
        />
      );

      expect(screen.getByText('请稍等，努力识别字幕中')).toBeInTheDocument();
    });

    it('显示进度条', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={50}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });
  });

  describe('音频上传进度', () => {
    it('上传进度条显示', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={30}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '30');
    });

    it('上传完成后进度条到 100%', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={100}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('字幕加载进度', () => {
    it('加载进度条显示', () => {
      render(
        <ProcessingOverlay
          type="load"
          progress={60}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '60');
    });

    it('进度值更新', () => {
      const { rerender } = render(
        <ProcessingOverlay
          type="load"
          progress={30}
        />
      );

      let progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '30');

      rerender(
        <ProcessingOverlay
          type="load"
          progress={80}
        />
      );

      progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '80');
    });
  });

  describe('字幕识别进度', () => {
    it('识别进度条显示', () => {
      render(
        <ProcessingOverlay
          type="recognize"
          progress={45}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '45');
    });

    it('控制按钮显示（默认方形）', () => {
      render(
        <ProcessingOverlay
          type="recognize"
          progress={50}
          isPaused={false}
          onTogglePause={mockOnTogglePause}
        />
      );

      const controlButton = screen.getByRole('button', { name: /暂停识别/i });
      expect(controlButton).toBeInTheDocument();
    });

    it('控制按钮显示（暂停时三角形）', () => {
      render(
        <ProcessingOverlay
          type="recognize"
          progress={50}
          isPaused={true}
          onTogglePause={mockOnTogglePause}
        />
      );

      const controlButton = screen.getByRole('button', { name: /继续识别/i });
      expect(controlButton).toBeInTheDocument();
    });

    it('控制按钮点击切换状态', async () => {
      const user = userEvent.setup();
      render(
        <ProcessingOverlay
          type="recognize"
          progress={50}
          isPaused={false}
          onTogglePause={mockOnTogglePause}
        />
      );

      const controlButton = screen.getByRole('button', { name: /暂停识别/i });
      await user.click(controlButton);

      expect(mockOnTogglePause).toHaveBeenCalledTimes(1);
    });

    it('onTogglePause 回调被调用', async () => {
      const user = userEvent.setup();
      render(
        <ProcessingOverlay
          type="recognize"
          progress={50}
          isPaused={false}
          onTogglePause={mockOnTogglePause}
        />
      );

      const controlButton = screen.getByRole('button', { name: /暂停识别/i });
      await user.click(controlButton);

      expect(mockOnTogglePause).toHaveBeenCalled();
    });

    it('非 recognize 类型不显示控制按钮', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={50}
        />
      );

      expect(screen.queryByRole('button', { name: /暂停识别/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /继续识别/i })).not.toBeInTheDocument();
    });
  });

  describe('错误状态', () => {
    it('显示错误提示', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={0}
          error="上传失败"
        />
      );

      expect(screen.getByText(/上传失败，错误原因：上传失败，请重试/i)).toBeInTheDocument();
    });

    it('显示重试图标', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={0}
          error="上传失败"
          onRetry={mockOnRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /重试/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('onRetry 回调被调用', async () => {
      const user = userEvent.setup();
      render(
        <ProcessingOverlay
          type="upload"
          progress={0}
          error="上传失败"
          onRetry={mockOnRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /重试/i });
      await user.click(retryButton);

      expect(mockOnRetry).toHaveBeenCalled();
    });

    it('错误状态不显示进度条', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={50}
          error="上传失败"
        />
      );

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('重试逻辑', () => {
    it('点击重试图标调用 onRetry', async () => {
      const user = userEvent.setup();
      render(
        <ProcessingOverlay
          type="load"
          progress={0}
          error="加载失败"
          onRetry={mockOnRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /重试/i });
      await user.click(retryButton);

      expect(mockOnRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('按钮三状态', () => {
    it('重试图标有 hover 状态', () => {
      render(
        <ProcessingOverlay
          type="upload"
          progress={0}
          error="上传失败"
          onRetry={mockOnRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /重试/i });
      expect(retryButton).toHaveStyle({ cursor: 'pointer' });
    });

    it('控制按钮有 hover 状态', () => {
      render(
        <ProcessingOverlay
          type="recognize"
          progress={50}
          isPaused={false}
          onTogglePause={mockOnTogglePause}
        />
      );

      const controlButton = screen.getByRole('button', { name: /暂停识别/i });
      expect(controlButton).toHaveStyle({ cursor: 'pointer' });
    });
  });
});

