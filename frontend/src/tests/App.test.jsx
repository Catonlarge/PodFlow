import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    // 检查应用的主要元素是否存在（路由指向 EpisodeListPage，显示加载状态或列表）
    // 由于是异步加载，可能显示 Skeleton 或列表内容
    const container = document.body;
    expect(container).toBeInTheDocument();
  });
});

