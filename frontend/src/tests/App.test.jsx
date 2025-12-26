import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    // 检查应用的主要元素是否存在
    expect(screen.getByText(/PodFlow 开发环境检测/i)).toBeInTheDocument();
    expect(screen.getByText(/AudioBarContainer 组件测试/i)).toBeInTheDocument();
  });
});

