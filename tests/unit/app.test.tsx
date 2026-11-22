import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App.tsx';

describe('App hash router scaffold', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('renders presenter shell at #/ and switches to audience shell at #/audience', () => {
    render(<App />);
    expect(screen.getByTestId('presenter-shell')).toBeInTheDocument();

    act(() => {
      window.location.hash = '#/audience?session=demo-123';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByTestId('audience-shell')).toBeInTheDocument();
  });

  it('handles empty hash, #/audience without query, #/audience/sub, unknown hash fallback, and unmount cleanup', () => {
    window.location.hash = '';
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<App />);
    expect(screen.getByTestId('presenter-shell')).toBeInTheDocument();

    act(() => {
      window.location.hash = '#/audience';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('audience-shell')).toBeInTheDocument();

    act(() => {
      window.location.hash = '#/unknown/route';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('presenter-shell')).toBeInTheDocument();

    act(() => {
      window.location.hash = '#/audience/sub';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('audience-shell')).toBeInTheDocument();

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
    removeSpy.mockRestore();
  });
});
