import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Navigation } from '../Navigation';

// Mock the WebSocket hook
vi.mock('../../hooks/useWebSocket', () => ({
  default: vi.fn(() => ({
    isConnected: true,
    connectionStatus: 'connected',
    lastMessage: null,
    sendMessage: vi.fn(),
  })),
}));

const NavigationWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('Navigation Component', () => {
  it('renders navigation links', () => {
    render(
      <NavigationWrapper>
        <Navigation />
      </NavigationWrapper>
    );

    expect(screen.getByText('BarnHand')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows connection status indicator', () => {
    render(
      <NavigationWrapper>
        <Navigation />
      </NavigationWrapper>
    );

    // Should show connected status
    expect(screen.getByTitle(/websocket.*connected/i)).toBeInTheDocument();
  });

  it('applies glass morphism styling', () => {
    const { container } = render(
      <NavigationWrapper>
        <Navigation />
      </NavigationWrapper>
    );

    const nav = container.querySelector('nav');
    expect(nav).toHaveClass('glass');
  });

  it('highlights active navigation item', () => {
    render(
      <NavigationWrapper>
        <Navigation />
      </NavigationWrapper>
    );

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveClass('text-cyan-400');
  });
});