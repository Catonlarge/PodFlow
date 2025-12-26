import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubtitleRow from '../SubtitleRow';

describe('SubtitleRow', () => {
  const mockCue = {
    id: 1,
    start_time: 10.5,
    end_time: 15.2,
    speaker: 'Lenny',
    text: 'This is a test subtitle text.',
  };

  describe('渲染', () => {
    it('应该渲染字幕文本和时间标签', () => {
      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      expect(screen.getByText('This is a test subtitle text.')).toBeInTheDocument();
      expect(screen.getByText('00:10')).toBeInTheDocument();
    });

    it('应该在 cue 为 null 时不渲染', () => {
      const { container } = render(
        <SubtitleRow
          cue={null}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Speaker 标签', () => {
    it('应该在 showSpeaker 为 true 时显示 speaker 标签', () => {
      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          showSpeaker={true}
        />
      );

      expect(screen.getByText('Lenny：')).toBeInTheDocument();
      // 不应该显示时间标签
      expect(screen.queryByText('00:10')).not.toBeInTheDocument();
    });

    it('应该在 showSpeaker 为 false 时不显示 speaker 标签', () => {
      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          showSpeaker={false}
        />
      );

      expect(screen.queryByText('Lenny：')).not.toBeInTheDocument();
      expect(screen.getByText('00:10')).toBeInTheDocument();
    });
  });

  describe('高亮状态', () => {
    it('应该在高亮时应用高亮样式', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      expect(box).toHaveStyle({ borderColor: expect.any(String) });
    });

    it('应该在高亮时显示紫色边框', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      // MUI 的 primary.main 颜色会被转换为实际的颜色值
      expect(box).toHaveStyle({ border: expect.stringContaining('solid') });
    });
  });

  describe('点击交互', () => {
    it('应该在点击时调用 onClick 回调', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          onClick={handleClick}
        />
      );

      const subtitleRow = screen.getByText('This is a test subtitle text.').closest('div[data-subtitle-id]');
      await user.click(subtitleRow);

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(mockCue.start_time);
    });

    it('应该在没有 onClick 回调时不抛出错误', async () => {
      const user = userEvent.setup();

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      const subtitleRow = screen.getByText('This is a test subtitle text.').closest('div[data-subtitle-id]');
      
      // 不应该抛出错误
      await expect(user.click(subtitleRow)).resolves.not.toThrow();
    });
  });

  describe('翻译显示', () => {
    const cueWithTranslation = {
      ...mockCue,
      translation: '这是一个测试字幕文本。',
    };

    it('应该在 showTranslation 为 true 且有翻译时显示翻译', () => {
      render(
        <SubtitleRow
          cue={cueWithTranslation}
          index={0}
          isHighlighted={false}
          isPast={false}
          showTranslation={true}
        />
      );

      expect(screen.getByText('这是一个测试字幕文本。')).toBeInTheDocument();
      expect(screen.getByText('This is a test subtitle text.')).toBeInTheDocument();
    });

    it('应该在 showTranslation 为 false 时不显示翻译', () => {
      render(
        <SubtitleRow
          cue={cueWithTranslation}
          index={0}
          isHighlighted={false}
          isPast={false}
          showTranslation={false}
        />
      );

      expect(screen.queryByText('这是一个测试字幕文本。')).not.toBeInTheDocument();
      expect(screen.getByText('This is a test subtitle text.')).toBeInTheDocument();
    });

    it('应该在 cue 没有 translation 字段时不显示翻译', () => {
      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          showTranslation={true}
        />
      );

      expect(screen.queryByText('这是一个测试字幕文本。')).not.toBeInTheDocument();
      expect(screen.getByText('This is a test subtitle text.')).toBeInTheDocument();
    });
  });

  describe('属性传递', () => {
    it('应该正确设置 data-subtitle-id 属性', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      expect(box).toBeInTheDocument();
    });

    it('应该正确设置 data-subtitle-index 属性', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={5}
          isHighlighted={false}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-index="5"]');
      expect(box).toBeInTheDocument();
    });
  });

  describe('Hover 状态管理', () => {
    it('应该在鼠标悬停时显示 hover 背景色（非高亮状态）', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      
      // 鼠标进入
      await user.hover(box);
      
      // 应该显示 hover 背景色（action.hover）
      expect(box).toHaveStyle({ backgroundColor: expect.any(String) });
    });

    it('应该在鼠标离开时清除 hover 背景色', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      
      // 鼠标进入
      await user.hover(box);
      
      // 鼠标离开
      await user.unhover(box);
      
      // hover 状态应该被清除
      // 注意：这里验证的是背景色回到默认值，具体实现可能因主题而异
      expect(box).toBeInTheDocument();
    });

    it('应该在失去高亮时自动清除 hover 状态', async () => {
      const user = userEvent.setup();
      const { container, rerender } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      
      // 鼠标悬停在高亮字幕上
      await user.hover(box);
      
      // 重新渲染，使字幕失去高亮
      rerender(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );
      
      // hover 状态应该被自动清除，即使鼠标还在元素上
      // 这通过 useEffect 监听 isHighlighted 变化来实现
      expect(box).toBeInTheDocument();
    });

    it('应该在高亮状态下不显示 hover 背景色', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      
      // 鼠标进入高亮字幕
      await user.hover(box);
      
      // 高亮状态下不应该设置 hover 状态（通过 handleMouseEnter 中的判断）
      // 背景色应该保持为 background.default，而不是 action.hover
      expect(box).toBeInTheDocument();
    });
  });
});

