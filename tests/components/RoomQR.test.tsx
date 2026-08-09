import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RoomQR from '@/components/RoomQR';

describe('RoomQR', () => {
  it('renders an SVG QR encoding the room URL', () => {
    const { container } = render(<RoomQR value="http://localhost:3000/r/ABCDE" />);
    expect(screen.getByRole('img', { name: 'QR code for http://localhost:3000/r/ABCDE' })).toBeInTheDocument();
    // SVG is generated locally by qrcode.react — no canvas, no external fetch.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('allows a custom size', () => {
    const { container } = render(<RoomQR value="http://x/r/1" size={96} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('96');
  });
});
