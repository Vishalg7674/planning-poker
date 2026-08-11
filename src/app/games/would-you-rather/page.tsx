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
import { MAX_WYR_QUESTIONS, WYR_QUESTIONS } from '@/lib/wyrQuestions';
import type { Accent, WyrQuestion } from '@/lib/types';
import styles from './wyr-create.module.scss';
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

/** Stable identity for a question across selection state (text-based, so custom questions work too). */
const qKey = (q: WyrQuestion) => `${q.a}\u0000${q.b}`;

export default function WouldYouRatherCreatePage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [accent, setAccent] = useState<Accent>('gold');
  const [selected, setSelected] = useState<WyrQuestion[]>(WYR_QUESTIONS.slice(0, 12));
  const [custom, setCustom] = useState<WyrQuestion>({ a: '', b: '' });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateForm>({ resolver: yupResolver(createSchema), defaultValues: { name: '', teamName: '', roomTitle: '' } });

  const isSelected = (q: WyrQuestion) => selected.some((s) => qKey(s) === qKey(q));
  const atCap = selected.length >= MAX_WYR_QUESTIONS;

  const toggle = (q: WyrQuestion) => {
    if (isSelected(q)) {
      setSelected(selected.filter((s) => qKey(s) !== qKey(q)));
    } else if (!atCap) {
      setSelected([...selected, q]);
    }
  };

  const addCustom = () => {
    const a = custom.a.trim();
    const b = custom.b.trim();
    if (!a || !b || atCap) return;
    setSelected([...selected, { a: a.slice(0, 120), b: b.slice(0, 120) }]);
    setCustom({ a: '', b: '' });
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
      setServerError('Pick at least one question — or add your own below.');
      return;
    }
    setCreating(true);
    setServerError(null);
    try {
      const res = await emitAck<{ ok: boolean; code?: string; participantId?: string; error?: string }>('room:create', {
        hostName: values.name,
        teamName: values.teamName,
        roomTitle: values.roomTitle,
        game: 'would-you-rather',
        questions: selected.map((q) => ({ a: q.a.trim(), b: q.b.trim() })),
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
            🤔
          </span>
          <h1 className={styles.h1}>Would You Rather</h1>
          <p className={styles.sub}>
            Pick a question, share the link, and the team votes A or B. Everyone votes once per question — then reveal
            the split together.
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

            <div className={styles.questions}>
              <div className={styles.questionsHead}>
                <span className={styles.groupLabel}>Questions</span>
                <span className={styles.countChip} role="status">
                  {selected.length} / {MAX_WYR_QUESTIONS} selected
                </span>
              </div>

              <div className={styles.qToolbar} role="group" aria-label="Question selection tools">
                <Button variant="outline" size="sm" onClick={() => setSelected(WYR_QUESTIONS.slice(0, MAX_WYR_QUESTIONS))}>
                  Select all
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                  Clear
                </Button>
                <Button variant="outline" size="sm" onClick={shuffle} disabled={selected.length < 2}>
                  Shuffle order
                </Button>
              </div>

              <ul className={styles.qList} aria-label="Question bank">
                {WYR_QUESTIONS.map((q) => (
                  <li key={qKey(q)}>
                    <button
                      type="button"
                      className={cx(styles.qRow, isSelected(q) && styles.qRowActive)}
                      onClick={() => toggle(q)}
                      aria-pressed={isSelected(q)}
                      aria-label={`Would you rather ${q.a} or ${q.b}`}
                    >
                      <span className={styles.qSide}>
                        <span className={styles.qLetter}>A</span>
                        {q.a}
                      </span>
                      <span className={styles.qOr}>or</span>
                      <span className={styles.qSide}>
                        <span className={styles.qLetter}>B</span>
                        {q.b}
                      </span>
                      <span className={styles.qCheck} aria-hidden="true">
                        {isSelected(q) ? '✓' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className={styles.custom} role="group" aria-label="Add a custom question">
                <span className={styles.groupLabel}>Add your own</span>
                <div className={styles.customGrid}>
                  <Input
                    aria-label="Custom option A"
                    placeholder="Option A — e.g. Only use a trackpad"
                    value={custom.a}
                    maxLength={120}
                    onChange={(e) => setCustom({ ...custom, a: e.target.value })}
                  />
                  <Input
                    aria-label="Custom option B"
                    placeholder="Option B — e.g. Only use a mouse"
                    value={custom.b}
                    maxLength={120}
                    onChange={(e) => setCustom({ ...custom, b: e.target.value })}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={addCustom} disabled={!custom.a.trim() || !custom.b.trim() || atCap}>
                  Add question
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
