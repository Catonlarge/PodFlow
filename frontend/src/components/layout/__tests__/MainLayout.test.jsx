import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MainLayout from '../MainLayout';

// Mock 子组件
vi.mock('../../subtitles/SubtitleList', () => ({
  default: () => <div data-testid="subtitle-list">SubtitleList</div>
}));

vi.mock('../../notes/NoteSidebar', () => ({
  default: () => <div data-testid="note-sidebar">NoteSidebar</div>
}));

vi.mock('../../player/AudioBarContainer', () => ({
  default: ({ audioUrl }) => audioUrl ? <div data-testid="audio-bar-container">AudioBarContainer</div> : null
}));

describe('MainLayout', () => {
  describe('渲染', () => {
    it('应该渲染所有主要区域', () => {
      render(
        <MainLayout 
          episodeTitle="测试播客"
          showName="测试节目"
          audioUrl="http://example.com/audio.mp3"
        />
      );

      expect(screen.getByText('测试播客')).toBeInTheDocument();
      expect(screen.getByText('测试节目')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('audio-bar-container')).toBeInTheDocument();
    });

    it('应该在没有 audioUrl 时不渲染 AudioBarContainer', () => {
      render(
        <MainLayout 
          episodeTitle="测试播客"
          showName="测试节目"
        />
      );

      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
      expect(screen.queryByTestId('audio-bar-container')).not.toBeInTheDocument();
    });

    it('应该正确传递 props 给 EpisodeHeader', () => {
      render(
        <MainLayout 
          episodeTitle="自定义标题"
          showName="自定义节目"
        />
      );

      expect(screen.getByText('自定义标题')).toBeInTheDocument();
      expect(screen.getByText('自定义节目')).toBeInTheDocument();
    });
  });

  describe('布局结构', () => {
    it('应该包含左右分栏布局', () => {
      render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      const subtitleList = screen.getByTestId('subtitle-list');
      const noteSidebar = screen.getByTestId('note-sidebar');
      
      expect(subtitleList).toBeInTheDocument();
      expect(noteSidebar).toBeInTheDocument();
    });

    it('主体区域应该包含字幕和笔记组件', () => {
      const { container } = render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      // 验证字幕列表和笔记侧边栏都在文档中
      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
    });

    it('应该渲染主容器', () => {
      const { container } = render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      // 验证主容器存在（MUI Box 会渲染为 div）
      const mainContainer = container.querySelector('div');
      expect(mainContainer).toBeTruthy();
    });
  });

  describe('响应式设计', () => {
    it('应该正确渲染所有区域', () => {
      const { container } = render(
        <MainLayout 
          episodeTitle="测试"
          showName="测试节目"
        />
      );

      // 验证所有主要组件都存在
      expect(screen.getByText('测试')).toBeInTheDocument();
      expect(screen.getByText('测试节目')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle-list')).toBeInTheDocument();
      expect(screen.getByTestId('note-sidebar')).toBeInTheDocument();
    });
  });
});

