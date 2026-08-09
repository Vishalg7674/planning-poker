'use client';

import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.scss';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.btn, styles[variant], styles[size], block && styles.block, className)}
      {...rest}
    >
      {children}
    </button>
  );
}
