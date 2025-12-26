import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EpisodeHeader from '../EpisodeHeader';

describe('EpisodeHeader', () => {
  describe('渲染', () => {
    it('应该渲染播客标题和节目名称', () => {
      render(
        <EpisodeHeader 
          episodeTitle="测试播客标题"
          showName="测试节目名称"
        />
      );

      expect(screen.getByText('测试播客标题')).toBeInTheDocument();
      expect(screen.getByText('测试节目名称')).toBeInTheDocument();
    });

    it('应该在没有数据时显示占位文本', () => {
      render(<EpisodeHeader />);

      expect(screen.getByText('未选择播客')).toBeInTheDocument();
    });

    it('应该只显示标题当没有节目名称时', () => {
      render(<EpisodeHeader episodeTitle="只有标题" />);

      expect(screen.getByText('只有标题')).toBeInTheDocument();
      expect(screen.queryByText('未选择播客')).not.toBeInTheDocument();
    });

    it('应该只显示节目名称当没有标题时', () => {
      render(<EpisodeHeader showName="只有节目名称" />);

      expect(screen.getByText('只有节目名称')).toBeInTheDocument();
      expect(screen.getByText('未选择播客')).toBeInTheDocument();
    });
  });

  describe('布局和样式', () => {
    it('应该固定在屏幕顶部', () => {
      const { container } = render(
        <EpisodeHeader episodeTitle="测试" showName="测试节目" />
      );

      const headerElement = container.firstChild;
      const computedStyle = window.getComputedStyle(headerElement);
      
      expect(computedStyle.position).toBe('fixed');
      expect(computedStyle.top).toBe('0px');
    });

    it('应该有正确的 z-index', () => {
      const { container } = render(
        <EpisodeHeader episodeTitle="测试" showName="测试节目" />
      );

      const headerElement = container.firstChild;
      const computedStyle = window.getComputedStyle(headerElement);
      
      expect(computedStyle.zIndex).toBe('100');
    });
  });
});

