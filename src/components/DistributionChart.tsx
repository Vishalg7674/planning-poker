'use client';

import { useEffect, useState } from 'react';
import styles from './DistributionChart.module.scss';
import { cx } from '@/lib/cx';

export interface DistributionDatum {
  label: string;
  count: number;
}

interface DistributionChartProps {
  data: DistributionDatum[];
  title?: string;
  /** Highlight the most common value (default true). */
  highlightMode?: boolean;
}

/**
 * Pure-CSS estimation distribution chart (no chart library): animated bars
 * sized by share, mode highlighted, counts + percentages on each row.
 */
export default function DistributionChart({ data, title, highlightMode = true }: DistributionChartProps) {
  const [grown, setGrown] = useState(false);
  const dataSig = data.map((d) => `${d.label}:${d.count}`).join('|');

  // Replay the grow animation whenever the underlying data changes.
  useEffect(() => {
    setGrown(false);
    const id = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(id);
  }, [dataSig]);

  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (!total) {
    return (
      <div className={styles.empty}>
        {title && <h4 className={styles.title}>{title}</h4>}
        <p className={styles.emptyBody}>No estimates yet — finish a round to see the distribution.</p>
      </div>
    );
  }

  const modeCount = highlightMode ? Math.max(...data.map((d) => d.count)) : -1;

  return (
    <div className={styles.chart}>
      {title && <h4 className={styles.title}>{title}</h4>}
      <div className={styles.rows}>
        {data.map((d) => {
          const share = Math.round((d.count / total) * 100);
          const isMode = highlightMode && d.count === modeCount;
          return (
            <div key={d.label} className={styles.row}>
              <span className={styles.label}>{d.label}</span>
              <div className={styles.track}>
                <div
                  className={cx(styles.fill, isMode && styles.fillMode, grown && styles.grown)}
                  style={{ width: grown ? `${share}%` : '0%' }}
                />
              </div>
              <span className={styles.count}>
                {d.count} <span className={styles.pct}>{share}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
