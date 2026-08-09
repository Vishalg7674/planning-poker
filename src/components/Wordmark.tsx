import Link from 'next/link';
import styles from './Wordmark.module.scss';
import { cx } from '@/lib/cx';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  className?: string;
}

/** The Reveal wordmark — serif display face with a gold shimmer. */
export default function Wordmark({ size = 'md', href = '/', className }: WordmarkProps) {
  const inner = (
    <span className={cx(styles.mark, styles[size])}>
      <span className={styles.suit} aria-hidden="true">
        ♦
      </span>
      Reveal
    </span>
  );
  if (href) {
    return (
      <Link href={href} className={cx(styles.link, className)} aria-label="Reveal home">
        {inner}
      </Link>
    );
  }
  return inner;
}
