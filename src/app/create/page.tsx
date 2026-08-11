'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import Button from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { emitAck } from '@/lib/socket';
import { friendlyError } from '@/lib/errors';
import { saveIdentity } from '@/lib/identity';
import { useAppDispatch } from '@/store';
import { setMyIdentity, pushToast } from '@/store/slices/uiSlice';
import { DECKS } from '@/lib/decks';
import type { Accent } from '@/lib/types';
import styles from './create.module.scss';
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

export default function CreatePage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const [deckId, setDeckId] = useState<string>('fibonacci');
  const [accent, setAccent] = useState<Accent>('gold');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateForm>({ resolver: yupResolver(createSchema), defaultValues: { name: '', teamName: '', roomTitle: '' } });

  const onSubmit = async (values: CreateForm) => {
    // Double-click protection: a second submit would create a duplicate room.
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setServerError(null);
    try {
      const res = await emitAck<{ ok: boolean; code?: string; participantId?: string; error?: string }>('room:create', {
        hostName: values.name,
        teamName: values.teamName,
        roomTitle: values.roomTitle,
        deckId,
        accent,
      });
      if (!res?.ok || !res.code || !res.participantId) {
        setServerError(friendlyError(res?.error, 'Could not create the room.'));
        setCreating(false);
        creatingRef.current = false;
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
      creatingRef.current = false;
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Back
        </Link>
        <Wordmark size="sm" />
        <span className={styles.step}>create a room</span>
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <h1 className={styles.h1}>Create Room</h1>
          <p className={styles.sub}>
            One round, one vote each. Configure the table below, share the link, and your team just needs a name to join.
          </p>

          {/* eslint-disable-next-line react-hooks/refs -- handleSubmit wraps an async handler that reads a ref guard against same-tick double submits; the rule cannot trace ref usage through react-hook-form's wrapper. */}
          <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
            <Field label="Your Name" error={errors.name?.message} htmlFor="name" hint="Required — you become the host.">
              <Input id="name" placeholder="e.g. Ada" autoComplete="off" maxLength={24} {...register('name')} />
            </Field>

            <Field label="Team Name" error={errors.teamName?.message} htmlFor="teamName" hint="Optional — shown at the top of the room.">
              <Input id="teamName" placeholder="e.g. Frontend Team" autoComplete="off" maxLength={40} {...register('teamName')} />
            </Field>

            <Field label="Room Title" error={errors.roomTitle?.message} htmlFor="roomTitle" hint="Optional — e.g. Sprint 24 Planning.">
              <Input id="roomTitle" placeholder="e.g. Sprint 24 Planning" autoComplete="off" maxLength={60} {...register('roomTitle')} />
            </Field>

            <div role="radiogroup" aria-label="Voting deck">
              <span className={styles.groupLabel}>Voting Deck</span>
              <div className={styles.deckGrid}>
                {DECKS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={deckId === d.id}
                    className={cx(styles.choice, deckId === d.id && styles.choiceActive)}
                    onClick={() => setDeckId(d.id)}
                  >
                    <span className={styles.choiceName}>{d.name}</span>
                    <span className={styles.choiceMeta}>{d.short}</span>
                  </button>
                ))}
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
