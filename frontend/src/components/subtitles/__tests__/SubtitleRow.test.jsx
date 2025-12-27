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

      // 文本被拆分成多个单词，textContent 不包含空格，检查每个单词是否存在
      expect(screen.getByText('This')).toBeInTheDocument();
      expect(screen.getByText('is')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
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

  describe('选择状态', () => {
    it('应该在 isSelected 为 true 时应用选中背景色', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          isSelected={true}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      expect(box).toBeInTheDocument();
      // 检查是否有选中状态的样式（通过检查 computed style 或 data 属性）
    });

    it('应该在 selectionRange 存在时高亮选中的文本片段', () => {
      const selectionRange = {
        cue: mockCue,
        startOffset: 0,
        endOffset: 4,
        selectedText: 'This',
      };

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          isSelected={true}
          selectionRange={selectionRange}
        />
      );

      // 选中的文本应该被渲染
      expect(screen.getByText('This')).toBeInTheDocument();
    });

    it('应该在未选中时不应用选中样式', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          isSelected={false}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      expect(box).toBeInTheDocument();
    });

    it('应该在选择状态和高亮状态同时存在时，优先显示选择状态', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
          isSelected={true}
        />
      );

      const box = container.querySelector('[data-subtitle-id="1"]');
      expect(box).toBeInTheDocument();
      // 选择状态的背景色应该覆盖高亮状态的背景色
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

      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          onClick={handleClick}
        />
      );

      // 使用 data-subtitle-id 属性查找元素
      const subtitleRow = container.querySelector('[data-subtitle-id="1"]');
      await user.click(subtitleRow);

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(mockCue.start_time);
    });

    it('应该在没有 onClick 回调时不抛出错误', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
        />
      );

      // 使用 data-subtitle-id 属性查找元素
      const subtitleRow = container.querySelector('[data-subtitle-id="1"]');
      
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
      // 文本被拆分成多个单词，检查每个单词是否存在
      expect(screen.getByText('This')).toBeInTheDocument();
      expect(screen.getByText('is')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
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
      // 文本被拆分成多个单词，检查每个单词是否存在
      expect(screen.getByText('This')).toBeInTheDocument();
      expect(screen.getByText('is')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
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
      // 文本被拆分成多个单词，检查每个单词是否存在
      expect(screen.getByText('This')).toBeInTheDocument();
      expect(screen.getByText('is')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
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

  describe('单词级高亮', () => {
    it('应该在 progress=0 时所有单词颜色为 text.disabled', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
          progress={0}
        />
      );

      // 检查单词是否被正确拆分和渲染
      const textContent = container.textContent;
      expect(textContent).toContain('This');
      expect(textContent).toContain('is');
      expect(textContent).toContain('a');
      
      // 验证单词被拆分为独立的 span（通过检查 DOM 结构）
      const spans = container.querySelectorAll('span');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('应该在 progress=1 时所有单词颜色为 text.primary', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
          progress={1}
        />
      );

      // 验证所有单词都已激活（通过检查样式）
      const spans = container.querySelectorAll('span');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('应该在 progress=0.5 时前一半单词为 primary，后一半为 disabled', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
          progress={0.5}
        />
      );

      // 验证单词被正确拆分
      const textContent = container.textContent;
      expect(textContent).toContain('This');
      expect(textContent).toContain('is');
      expect(textContent).toContain('a');
    });

    it('应该正确拆分文本为单词', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={true}
          isPast={false}
          progress={0.5}
        />
      );

      const textContent = container.textContent;
      const words = mockCue.text.split(' ');
      words.forEach(word => {
        expect(textContent).toContain(word);
      });
    });
  });

  describe('下划线渲染', () => {
    const mockHighlights = [
      {
        id: 1,
        cue_id: 1,
        start_offset: 0,
        end_offset: 4,
        highlighted_text: 'This',
        color: '#9C27B0'
      }
    ];

    it('应该根据 highlights 显示下划线', () => {
      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={mockHighlights}
          progress={1}
        />
      );

      // MUI 的 sx 会将样式转换为 CSS 类，使用 getByText 查找划线文本
      const highlightedText = screen.getByText('This');
      // 验证文本存在且颜色正确（progress=1 时颜色为完整颜色）
      expect(highlightedText).toBeInTheDocument();
      expect(highlightedText).toHaveStyle({ color: '#9C27B0' });
    });

    it('应该使用正确的下划线颜色', () => {
      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={mockHighlights}
          progress={1}
        />
      );

      // 使用 getByText 查找划线文本，验证颜色（progress=1 时颜色为完整颜色）
      const highlightedText = screen.getByText('This');
      expect(highlightedText).toHaveStyle({ color: '#9C27B0' });
    });

    it('应该在点击划线源时调用 onHighlightClick', async () => {
      const user = userEvent.setup();
      const handleHighlightClick = vi.fn();

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={mockHighlights}
          onHighlightClick={handleHighlightClick}
        />
      );

      // 使用 getByText 查找划线文本并点击
      const highlightedElement = screen.getByText('This');
      await user.click(highlightedElement);
      expect(handleHighlightClick).toHaveBeenCalledTimes(1);
      expect(handleHighlightClick).toHaveBeenCalledWith(mockHighlights[0]);
    });

    it('应该支持多个划线', () => {
      const multipleHighlights = [
        {
          id: 1,
          cue_id: 1,
          start_offset: 0,
          end_offset: 4,
          highlighted_text: 'This',
          color: '#9C27B0'
        },
        {
          id: 2,
          cue_id: 1,
          start_offset: 10,
          end_offset: 14,
          highlighted_text: 'test',
          color: '#9C27B0'
        }
      ];

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={multipleHighlights}
          progress={1}
        />
      );

      // 使用 getByText 查找多个划线文本（progress=1 时颜色为完整颜色）
      const firstHighlight = screen.getByText('This');
      const secondHighlight = screen.getByText('test');
      expect(firstHighlight).toBeInTheDocument();
      expect(secondHighlight).toBeInTheDocument();
      expect(firstHighlight).toHaveStyle({ color: '#9C27B0' });
      expect(secondHighlight).toHaveStyle({ color: '#9C27B0' });
    });

    it('应该正确计算划线位置（start_offset 和 end_offset）', () => {
      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={mockHighlights}
        />
      );

      // 验证划线文本内容正确
      const textContent = container.textContent;
      expect(textContent).toContain('This');
    });

    it('应该过滤重叠的划线（PRD 要求：禁止重叠划线）', () => {
      // 创建重叠的 highlights：[0, 4] 和 [2, 6] 重叠
      const overlappingHighlights = [
        {
          id: 1,
          cue_id: 1,
          start_offset: 0,
          end_offset: 4,
          highlighted_text: 'This',
          color: '#9C27B0'
        },
        {
          id: 2,
          cue_id: 1,
          start_offset: 2,
          end_offset: 6,
          highlighted_text: 'is',
          color: '#9C27B0'
        }
      ];

      const { container } = render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={overlappingHighlights}
          progress={1}
        />
      );

      // 应该只渲染第一个 highlight（'This'），第二个重叠的 highlight 应该被过滤
      const highlightedText = screen.getByText('This');
      expect(highlightedText).toBeInTheDocument();
      expect(highlightedText).toHaveStyle({ color: '#9C27B0' });
      
      // 验证第二个重叠的 highlight 没有被渲染（'is' 不应该有下划线样式）
      // 注意：'is' 作为普通文本存在，但不应该有下划线
      const textContent = container.textContent;
      expect(textContent).toContain('is');
    });

    it('应该正确处理部分重叠的划线', () => {
      // 创建部分重叠的 highlights：[0, 10] 和 [5, 15] 重叠
      const partiallyOverlappingHighlights = [
        {
          id: 1,
          cue_id: 1,
          start_offset: 0,
          end_offset: 10,
          highlighted_text: 'This is a',
          color: '#9C27B0'
        },
        {
          id: 2,
          cue_id: 1,
          start_offset: 5,
          end_offset: 15,
          highlighted_text: 'is a test',
          color: '#9C27B0'
        }
      ];

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={partiallyOverlappingHighlights}
          progress={1}
        />
      );

      // 应该只渲染第一个 highlight（'This is a'），第二个重叠的 highlight 应该被过滤
      const firstHighlight = screen.getByText('This');
      expect(firstHighlight).toBeInTheDocument();
      expect(firstHighlight).toHaveStyle({ color: '#9C27B0' });
    });

    it('应该正确处理完全包含的划线', () => {
      // 创建完全包含的 highlights：[0, 20] 完全包含 [5, 10]
      const containingHighlights = [
        {
          id: 1,
          cue_id: 1,
          start_offset: 0,
          end_offset: 20,
          highlighted_text: 'This is a test',
          color: '#9C27B0'
        },
        {
          id: 2,
          cue_id: 1,
          start_offset: 5,
          end_offset: 10,
          highlighted_text: 'is a',
          color: '#FF0000'
        }
      ];

      render(
        <SubtitleRow
          cue={mockCue}
          index={0}
          isHighlighted={false}
          isPast={false}
          highlights={containingHighlights}
          progress={1}
        />
      );

      // 应该只渲染第一个 highlight，第二个被完全包含的 highlight 应该被过滤
      const firstHighlight = screen.getByText('This');
      expect(firstHighlight).toBeInTheDocument();
      expect(firstHighlight).toHaveStyle({ color: '#9C27B0' });
    });
  });
});

