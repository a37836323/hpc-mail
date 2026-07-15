import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('有 avatarUrl 时渲染图片', () => {
    render(<Avatar avatarUrl="https://cdn.test/a.png" name="alice" />);
    const img = screen.getByRole('img', { name: 'alice' });
    expect(img).toHaveAttribute('src', 'https://cdn.test/a.png');
  });

  it('无 avatarUrl 时回退到用户名首字母', () => {
    render(<Avatar avatarUrl={null} name="alice" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('al')).toBeInTheDocument();
  });
});
