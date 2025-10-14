# Horse Streaming Platform - Design System & Styles Guide

## 1. Core Design Philosophy

### Design Principles

- **Technical Precision**: Clean, data-driven interfaces with purposeful information hierarchy
- **Natural Elegance**: Earthy tones balanced with high-tech accents
- **Subtle Motion**: Micro-animations that enhance without distraction
- **Professional Depth**: Layered interfaces with glass morphism and subtle shadows
- **Accessible Contrast**: High visibility overlays on varied video backgrounds

## 2. Color System

### Primary Palette

```css
:root {
  /* Core Brand Colors */
  --forest-900: #0a1f0d; /* Deep Forest - Primary Dark */
  --forest-700: #1a3a1f; /* Forest Green - Headers */
  --forest-500: #2d5016; /* Medium Forest - Primary Actions */
  --forest-300: #4a7c2e; /* Light Forest - Hover States */

  /* Technical Accent Colors */
  --cyan-500: #06b6d4; /* Bright Cyan - Data Points */
  --cyan-400: #22d3ee; /* Light Cyan - Active States */
  --cyan-300: #67e8f9; /* Pale Cyan - Highlights */

  /* Earth Tones */
  --amber-600: #d97706; /* Warm Amber - Warnings */
  --amber-500: #f59e0b; /* Golden - Important Metrics */
  --amber-400: #fbbf24; /* Light Gold - Badges */

  /* Neutral Scale */
  --slate-950: #020617; /* Near Black - Text */
  --slate-900: #0f172a; /* Dark Slate - Backgrounds */
  --slate-800: #1e293b; /* Medium Slate - Cards */
  --slate-700: #334155; /* Light Slate - Borders */
  --slate-600: #475569; /* Lighter Slate - Muted Text */
  --slate-400: #94a3b8; /* Pale Slate - Disabled */
  --slate-200: #e2e8f0; /* Very Light - Highlights */
  --slate-100: #f1f5f9; /* Off White - Backgrounds */

  /* Semantic Colors */
  --success: #10b981; /* Emerald - Healthy Status */
  --warning: #f59e0b; /* Amber - Attention Needed */
  --error: #ef4444; /* Red - Critical Alerts */
  --info: #06b6d4; /* Cyan - Information */
}
```

### Dark Mode Palette

```css
:root[data-theme='dark'] {
  /* Inverted Neutrals */
  --bg-primary: #0a0f1b; /* Deep Blue-Black */
  --bg-secondary: #131a2a; /* Raised Surface */
  --bg-tertiary: #1c2537; /* Card Background */
  --bg-overlay: rgba(10, 15, 27, 0.85);

  /* Adjusted Brand Colors */
  --forest-primary: #3ecf8e; /* Bright Mint - Better contrast */
  --cyan-primary: #06b6d4; /* Keep cyan vivid */
  --amber-primary: #ffb84d; /* Brightened amber */
}
```

### Horse Tracking Colors

```css
/* Distinctive colors for multi-horse tracking */
:root {
  --horse-1: #06b6d4; /* Cyan */
  --horse-2: #10b981; /* Emerald */
  --horse-3: #f59e0b; /* Amber */
  --horse-4: #8b5cf6; /* Violet */
  --horse-5: #ec4899; /* Pink */
  --horse-6: #14b8a6; /* Teal */
  --horse-7: #f97316; /* Orange */
  --horse-8: #6366f1; /* Indigo */
  --horse-9: #84cc16; /* Lime */
  --horse-10: #ef4444; /* Red */
}
```

## 3. Typography System

### Font Stack

```css
:root {
  /* Primary Font - Headlines & UI */
  --font-primary:
    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Display Font - Large Headlines */
  --font-display: 'Sora', 'Inter', sans-serif;

  /* Mono Font - Data & Metrics */
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
}
```

### Type Scale

```css
/* Fluid Typography with clamp() */
.text-display-xl {
  font-size: clamp(2.5rem, 4vw, 4.5rem);
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.text-display {
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.text-heading-xl {
  font-size: clamp(1.5rem, 2.5vw, 2.25rem);
  line-height: 1.3;
  font-weight: 600;
}

.text-heading {
  font-size: clamp(1.25rem, 2vw, 1.875rem);
  line-height: 1.4;
  font-weight: 500;
}

.text-subheading {
  font-size: clamp(1.125rem, 1.5vw, 1.5rem);
  line-height: 1.5;
  font-weight: 500;
}

.text-body {
  font-size: 1rem;
  line-height: 1.6;
  font-weight: 400;
}

.text-small {
  font-size: 0.875rem;
  line-height: 1.5;
  font-weight: 400;
}

.text-micro {
  font-size: 0.75rem;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* Data Typography */
.text-metric {
  font-family: var(--font-mono);
  font-weight: 600;
  font-feature-settings:
    'tnum' on,
    'lnum' on;
}

.text-metric-large {
  font-size: clamp(2rem, 3vw, 3.5rem);
  line-height: 1;
}

.text-metric-medium {
  font-size: clamp(1.25rem, 2vw, 2rem);
  line-height: 1.2;
}
```

## 4. Component Styles

### Glass Morphism Cards

```css
.glass-card {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05),
    rgba(255, 255, 255, 0.02)
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.12);
}
```

### Neumorphic Elements

```css
.neu-button {
  background: linear-gradient(145deg, #1f2937, #111827);
  border-radius: 12px;
  padding: 12px 24px;
  box-shadow:
    8px 8px 16px rgba(0, 0, 0, 0.4),
    -8px -8px 16px rgba(255, 255, 255, 0.05),
    inset 1px 1px 2px rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
}

.neu-button:active {
  box-shadow:
    inset 8px 8px 16px rgba(0, 0, 0, 0.4),
    inset -8px -8px 16px rgba(255, 255, 255, 0.05);
}

.neu-input {
  background: linear-gradient(145deg, #0f172a, #1e293b);
  border: none;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow:
    inset 4px 4px 8px rgba(0, 0, 0, 0.3),
    inset -4px -4px 8px rgba(255, 255, 255, 0.03);
  transition: all 0.2s ease;
}

.neu-input:focus {
  outline: none;
  box-shadow:
    inset 4px 4px 8px rgba(0, 0, 0, 0.4),
    inset -4px -4px 8px rgba(255, 255, 255, 0.05),
    0 0 0 2px rgba(6, 182, 212, 0.3);
}
```

### Stream Cards

```css
.stream-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: var(--slate-900);
  border: 1px solid var(--slate-700);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stream-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--cyan-500), transparent);
  transform: translateX(-100%);
  animation: shimmer 3s infinite;
}

.stream-card.active::before {
  background: linear-gradient(90deg, transparent, var(--success), transparent);
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

.stream-thumbnail {
  position: relative;
  aspect-ratio: 16/9;
  background: var(--slate-800);
  overflow: hidden;
}

.stream-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 60%, rgba(0, 0, 0, 0.9));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stream-card:hover .stream-overlay {
  opacity: 1;
}
```

### Detection Overlays

```css
.detection-box {
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  animation: pulse-subtle 2s infinite;
}

@keyframes pulse-subtle {
  0%,
  100% {
    opacity: 0.9;
  }
  50% {
    opacity: 1;
  }
}

.pose-skeleton {
  stroke-width: 3;
  stroke-linecap: round;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}

.pose-joint {
  fill: var(--cyan-400);
  stroke: var(--slate-900);
  stroke-width: 2;
  filter: drop-shadow(0 0 4px rgba(6, 182, 212, 0.5));
}

.confidence-badge {
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--cyan-300);
  border: 1px solid rgba(6, 182, 212, 0.3);
}
```

## 5. Animation System

### Micro-animations

```css
/* Entrance Animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Loading States */
@keyframes skeleton-loading {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--slate-800) 25%,
    var(--slate-700) 50%,
    var(--slate-800) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

/* Data Updates */
@keyframes data-flash {
  0% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(6, 182, 212, 0.1);
  }
  100% {
    background-color: transparent;
  }
}

.data-updated {
  animation: data-flash 0.5s ease;
}

/* Smooth Transitions */
.transition-all {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.transition-colors {
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.transition-transform {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Interactive States

```css
/* Hover Effects */
.hover-lift {
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
}

.hover-glow {
  transition: box-shadow 0.3s ease;
}

.hover-glow:hover {
  box-shadow:
    0 0 20px rgba(6, 182, 212, 0.3),
    0 0 40px rgba(6, 182, 212, 0.1);
}

/* Focus States */
.focus-ring {
  outline: none;
  position: relative;
}

.focus-ring:focus-visible::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 2px solid var(--cyan-500);
  animation: focus-pulse 1.5s infinite;
}

@keyframes focus-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
```

## 6. Layout System

### Grid System

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  padding: 24px;
}

.stream-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1280px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}

/* Sidebar Layout */
.app-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 100vh;
}

.app-sidebar {
  background: var(--slate-900);
  border-right: 1px solid var(--slate-700);
}

.app-main {
  background: var(--slate-950);
  overflow-y: auto;
}
```

### Spacing System

```css
:root {
  --space-xs: 0.25rem; /* 4px */
  --space-sm: 0.5rem; /* 8px */
  --space-md: 1rem; /* 16px */
  --space-lg: 1.5rem; /* 24px */
  --space-xl: 2rem; /* 32px */
  --space-2xl: 3rem; /* 48px */
  --space-3xl: 4rem; /* 64px */
}
```

## 7. Interactive Components

### Control Panel

```css
.control-panel {
  background: linear-gradient(135deg, var(--slate-900), var(--slate-800));
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--slate-700);
  position: relative;
  overflow: hidden;
}

.control-panel::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle,
    rgba(6, 182, 212, 0.05) 0%,
    transparent 70%
  );
  animation: rotate-slow 30s linear infinite;
}

@keyframes rotate-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.control-group {
  position: relative;
  z-index: 1;
  margin-bottom: 20px;
}

.control-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--slate-400);
  margin-bottom: 8px;
}

.control-value {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--cyan-400);
  text-shadow: 0 0 20px rgba(6, 182, 212, 0.5);
}
```

### Status Indicators

```css
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.status-indicator::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-active {
  background: rgba(16, 185, 129, 0.1);
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.status-active::before {
  background: var(--success);
  box-shadow: 0 0 10px var(--success);
}

.status-processing {
  background: rgba(6, 182, 212, 0.1);
  color: var(--cyan-400);
  border: 1px solid rgba(6, 182, 212, 0.2);
}

.status-processing::before {
  background: var(--cyan-400);
  animation: spin 1s linear infinite;
}

.status-warning {
  background: rgba(245, 158, 11, 0.1);
  color: var(--amber-500);
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.status-error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

### Data Visualization

```css
.metric-card {
  background: var(--slate-800);
  border-radius: 12px;
  padding: 20px;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--slate-700);
}

.metric-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 100px;
  height: 100px;
  background: radial-gradient(
    circle at center,
    var(--cyan-500) 0%,
    transparent 70%
  );
  opacity: 0.1;
  transform: translate(30%, -30%);
}

.metric-label {
  font-size: 0.875rem;
  color: var(--slate-400);
  margin-bottom: 8px;
}

.metric-value {
  font-size: 2rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--slate-100);
  line-height: 1;
  margin-bottom: 12px;
}

.metric-change {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.metric-change.positive {
  color: var(--success);
}

.metric-change.negative {
  color: var(--error);
}

.metric-chart {
  height: 60px;
  margin-top: 16px;
  background: linear-gradient(
    to right,
    rgba(6, 182, 212, 0.1),
    rgba(6, 182, 212, 0.05)
  );
  border-radius: 4px;
  position: relative;
}
```

## 8. Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        forest: {
          300: '#4A7C2E',
          500: '#2D5016',
          700: '#1A3A1F',
          900: '#0A1F0D',
        },
        cyan: {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
        },
        amber: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeInUp 0.5s ease-out',
        'slide-in': 'slideInRight 0.3s ease-out',
        'pulse-subtle': 'pulse-subtle 2s infinite',
        shimmer: 'shimmer 3s infinite',
        'data-flash': 'data-flash 0.5s ease',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(6, 182, 212, 0.3)',
        'glow-lg': '0 0 40px rgba(6, 182, 212, 0.4)',
        'inner-glow': 'inset 0 0 20px rgba(6, 182, 212, 0.1)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
```

## 9. CSS Variables for Dynamic Theming

```css
/* Dynamic Theme Variables */
:root {
  /* Overlay Opacity */
  --overlay-opacity-light: 0.85;
  --overlay-opacity-heavy: 0.95;

  /* Animation Speeds */
  --animation-fast: 150ms;
  --animation-normal: 300ms;
  --animation-slow: 500ms;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1);

  /* Glows */
  --glow-cyan: 0 0 20px rgba(6, 182, 212, 0.5);
  --glow-success: 0 0 20px rgba(16, 185, 129, 0.5);
  --glow-warning: 0 0 20px rgba(245, 158, 11, 0.5);
  --glow-error: 0 0 20px rgba(239, 68, 68, 0.5);
}
```

## 10. Responsive Design Breakpoints

```css
/* Mobile First Approach */
:root {
  --breakpoint-xs: 475px;
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}

/* Container Widths */
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
}

@media (min-width: 640px) {
  .container {
    max-width: 640px;
  }
}

@media (min-width: 768px) {
  .container {
    max-width: 768px;
  }
}

@media (min-width: 1024px) {
  .container {
    max-width: 1024px;
  }
}

@media (min-width: 1280px) {
  .container {
    max-width: 1280px;
  }
}

@media (min-width: 1536px) {
  .container {
    max-width: 1536px;
  }
}
```

## 11. Accessibility Features

```css
/* Focus Visible Only */
.focus-visible-only:focus {
  outline: none;
}

.focus-visible-only:focus-visible {
  outline: 2px solid var(--cyan-500);
  outline-offset: 2px;
}

/* Screen Reader Only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* High Contrast Mode Support */
@media (prefers-contrast: high) {
  :root {
    --forest-500: #00ff00;
    --cyan-500: #00ffff;
    --amber-500: #ffff00;
  }

  .glass-card {
    border-width: 2px;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## 12. Implementation Examples

### React Component with Styles

```jsx
// StreamCard.tsx
import React from 'react';
import { cn } from '@/utils/cn';

export const StreamCard = ({ stream, isActive }) => {
  return (
    <div
      className={cn(
        'stream-card glass-card hover-lift',
        isActive && 'stream-card-active'
      )}
    >
      <div className="stream-thumbnail">
        <img src={stream.thumbnail} alt={stream.name} />
        <div className="stream-overlay">
          <div className="flex items-center justify-between p-4">
            <span className="status-indicator status-active">Live</span>
            <span className="confidence-badge">95% accuracy</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-heading text-slate-100 mb-2">{stream.name}</h3>

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Horses Detected</div>
            <div className="metric-value">{stream.horseCount}</div>
            <div className="metric-change positive">
              <svg className="w-4 h-4" />
              +2 from last hour
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### Custom Hook for Theme

```javascript
// useTheme.js
import { useEffect, useState } from 'react';

export const useTheme = () => {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    // Update CSS variables based on theme
    if (theme === 'dark') {
      root.style.setProperty('--bg-primary', '#0A0F1B');
      root.style.setProperty('--text-primary', '#F1F5F9');
    } else {
      root.style.setProperty('--bg-primary', '#FFFFFF');
      root.style.setProperty('--text-primary', '#0F172A');
    }
  }, [theme]);

  return { theme, setTheme };
};
```
