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
import styles from './create.module.scss';

const createSchema = yup.object({
  name: yup.string().trim().required('Give yourself a name for the table').min(2, 'At least 2 characters').max(24, 'Keep it under 24 characters'),
});

type CreateForm = yup.InferType<typeof createSchema>;

export default function CreatePage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateForm>({ resolver: yupResolver(createSchema), defaultValues: { name: '' } });

  const onSubmit = async (values: CreateForm) => {
    setCreating(true);
    setServerError(null);
    try {
      const res = await emitAck<{ ok: boolean; code?: string; participantId?: string; error?: string }>('room:create', {
        hostName: values.name,
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
            One round, one vote each. Rooms are born in server memory and die with it — share the link and your team just
            needs a name to join.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
            <Field label="Your Name" error={errors.name?.message} htmlFor="name">
              <Input id="name" placeholder="e.g. Ada" autoComplete="off" maxLength={24} {...register('name')} />
            </Field>

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
