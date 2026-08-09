'use client';

import { QRCodeSVG } from 'qrcode.react';
import styles from './RoomQR.module.scss';

interface RoomQRProps {
  /** The full room URL to encode. */
  value: string;
  size?: number;
}

/**
 * Locally-generated QR code for the room invite URL. Rendering is pure SVG —
 * nothing leaves the browser, no canvas, no external service.
 */
export default function RoomQR({ value, size = 128 }: RoomQRProps) {
  return (
    <span className={styles.qr} role="img" aria-label={`QR code for ${value}`}>
      <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#0c1f18" level="M" marginSize={1} />
    </span>
  );
}
