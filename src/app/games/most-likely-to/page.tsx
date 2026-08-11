'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import Button from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { emitAck } from '@/lib/socket';
import { saveIdentity } from '@/lib/identity';
import { useAppDispatch } from '@/store';
import { setMyIdentity, pushToast } from '@/store/slices/uiSlice';
import { MAX_MLT_PROMPTS, MLT_PROMPTS, DEFAULT_MLT_SELECTION } from '@/lib/mltPrompts';
import type { Accent } from '@/lib/types';
import styles from './mlt-create.module.scss';
import { cx } from '@/lib/cx';

const ACCENTS: { id: Accent; label: string }[] = [
  { id: 'gold', label: 'Gold' },
  { id: 'purple', label: 'Purple' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
];

const createSchema = yup.object({
  name: yup.string().trim().required('Give yourself a name for the table').min(2, 'At least 2 characters').max(24, 'Keep it under 24 characters'),
  teamName: yup.string().trim().max(40, 'Keep it under 40 characters'),
  roomTitle: yup.string().trim().max(60, 'Keep it under 60 characters'),
});

type CreateForm = yup.InferType<typeof createSchema>;

export default function MostLikelyToCreatePage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [accent, setAccent] = useState<Accent>('gold');
  const [selected, setSelected] = useState<string[]>(DEFAULT_MLT_SELECTION);
  const [custom, setCustom] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateForm>({ resolver: yupResolver(createSchema), defaultValues: { name: '', teamName: '', roomTitle: '' } });

  const isSelected = (prompt: string) => selected.includes(prompt);
  const atCap = selected.length >= MAX_MLT_PROMPTS;

  const toggle = (prompt: string) => {
    if (isSelected(prompt)) {
      setSelected(selected.filter((s) => s !== prompt));
    } else if (!atCap) {
      setSelected([...selected, prompt]);
    }
  };

  const addCustom = () => {
    const p = custom.trim();
    if (!p || atCap) return;
    setSelected([...selected, p.slice(0, 160)]);
    setCustom('');
  };

  const shuffle = () => {
    const copy = [...selected];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setSelected(copy);
  };

  const onSubmit = async (values: CreateForm) => {
    if (selected.length === 0) {
      setServerError('Pick at least one prompt — or add your own below.');
      return;
    }
    setCreating(true);
    setServerError(null);
    try {
      const res = await emitAck<{ ok: boolean; code?: string; participantId?: string; error?: string }>('room:create', {
        hostName: values.name,
        teamName: values.teamName,
        roomTitle: values.roomTitle,
        game: 'most-likely-to',
        prompts: selected.map((p) => p.trim()),
        accent,
      });
      if (!res?.ok || !res.code || !res.participantId) {
        setServerError(res?.error || 'Could not create the room.');
        setCreating(false);
        return;
      }
      const participantId = res.participantId;
      saveIdentity({ participantId, name: values.name.trim(), role: 'facilitator' });
      dispatch(setMyIdentity({ participantId, name: values.name.trim(), role: 'facilitator' }));
      dispatch(pushToast({ kind: 'success', title: 'Room created', message: `Code ${res.code} — share the link with your team.` }));
      router.push(`/r/${res.code}`);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Could not create the room.');
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/games" className={styles.back}>
          ← All games
        </Link>
        <Wordmark size="sm" />
        <span className={styles.step}>create a room</span>
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <span className={styles.gameTag} aria-hidden="true">
            😂
          </span>
          <h1 className={styles.h1}>Most Likely To</h1>
          <p className={styles.sub}>
            Every round drops a prompt — everyone secretly nominates the teammate most likely to do it. Crowned teammates
            earn points, and anyone who predicted the crown earns a bonus.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
            <Field label="Your Name" error={errors.name?.message} htmlFor="name" hint="Required — you become the host.">
              <Input id="name" placeholder="e.g. Ada" autoComplete="off" maxLength={24} {...register('name')} />
            </Field>

            <Field label="Team Name" error={errors.teamName?.message} htmlFor="teamName" hint="Optional — shown at the top of the room.">
              <Input id="teamName" placeholder="e.g. Frontend Team" autoComplete="off" maxLength={40} {...register('teamName')} />
            </Field>

            <Field label="Room Title" error={errors.roomTitle?.message} htmlFor="roomTitle" hint="Optional — e.g. Friday Icebreaker.">
              <Input id="roomTitle" placeholder="e.g. Friday Icebreaker" autoComplete="off" maxLength={60} {...register('roomTitle')} />
            </Field>

            <div className={styles.prompts}>
              <div className={styles.promptsHead}>
                <span className={styles.groupLabel}>Prompts</span>
                <span className={styles.countChip} role="status">
                  {selected.length} / {MAX_MLT_PROMPTS} selected
                </span>
              </div>

              <div className={styles.pToolbar} role="group" aria-label="Prompt selection tools">
                <Button variant="outline" size="sm" onClick={() => setSelected(MLT_PROMPTS.slice(0, MAX_MLT_PROMPTS))}>
                  Select all
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                  Clear
                </Button>
                <Button variant="outline" size="sm" onClick={shuffle} disabled={selected.length < 2}>
                  Shuffle order
                </Button>
              </div>

              <ul className={styles.pList} aria-label="Prompt bank">
                {MLT_PROMPTS.map((prompt) => (
                  <li key={prompt}>
                    <button
                      type="button"
                      className={cx(styles.pRow, isSelected(prompt) && styles.pRowActive)}
                      onClick={() => toggle(prompt)}
                      aria-pressed={isSelected(prompt)}
                      aria-label={prompt}
                    >
                      <span className={styles.pText}>{prompt}</span>
                      <span className={styles.pCheck} aria-hidden="true">
                        {isSelected(prompt) ? '✓' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className={styles.custom} role="group" aria-label="Add a custom prompt">
                <span className={styles.groupLabel}>Add your own</span>
                <div className={styles.customGrid}>
                  <Input
                    aria-label="Custom prompt"
                    placeholder="e.g. Send a message to the wrong Slack channel"
                    value={custom}
                    maxLength={160}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={addCustom} disabled={!custom.trim() || atCap}>
                  Add prompt
                </Button>
              </div>
            </div>

            <div role="radiogroup" aria-label="Accent color">
              <span className={styles.groupLabel}>Accent</span>
              <div className={styles.accentRow}>
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={accent === a.id}
                    className={cx(styles.accent, accent === a.id && styles.accentActive)}
                    data-accent={a.id}
                    onClick={() => setAccent(a.id)}
                  >
                    <span className={styles.accentDot} aria-hidden="true" />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {serverError && (
              <p className={styles.serverError} role="alert">
                {serverError}
              </p>
            )}

            <Button type="submit" variant="gold" size="lg" block disabled={creating}>
              {creating ? 'Creating…' : 'Create Room'}
            </Button>
            <p className={styles.ephemeralNote}>
              <span className={styles.dot} /> No database — this room exists only in memory for as long as it&apos;s used.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
