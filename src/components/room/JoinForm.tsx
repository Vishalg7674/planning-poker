'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Button from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { useAppDispatch } from '@/store';
import { setMyIdentity, pushToast } from '@/store/slices/uiSlice';
import { snapshotReceived } from '@/store/actions';
import { emitAck } from '@/lib/socket';
import { saveIdentity } from '@/lib/identity';
import styles from './JoinForm.module.scss';

const schema = yup.object({
  name: yup.string().trim().required('Your name is the only thing we need').min(2, 'At least 2 characters').max(24, 'Keep it under 24 characters'),
});

type Form = yup.InferType<typeof schema>;

interface JoinFormProps {
  code: string;
  onGone: (message: string) => void;
}

interface JoinAck {
  ok: boolean;
  participantId?: string;
  snapshot?: any;
  error?: string;
}

export default function JoinForm({ code, onGone }: JoinFormProps) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: yupResolver(schema) });

  const onSubmit = async (values: Form) => {
    setBusy(true);
    setFormError(null);
    try {
      const res = await emitAck<JoinAck>('room:join', { code, name: values.name.trim() });
      if (res?.ok && res.participantId && res.snapshot) {
        const me = res.snapshot.participants.find((p: any) => p.id === res.participantId);
        const finalRole = me?.role ?? 'voter';
        saveIdentity({ participantId: res.participantId, name: values.name.trim(), role: finalRole });
        dispatch(setMyIdentity({ participantId: res.participantId, name: values.name.trim(), role: finalRole }));
        dispatch(snapshotReceived(res.snapshot));
        dispatch(pushToast({ kind: 'success', title: `Welcome, ${values.name.trim()}`, message: `You joined room ${code}.` }));
      } else if (res?.error === 'not_found') {
        onGone(`Room ${code} doesn’t exist anymore — rooms live in memory and vanish when they empty out.`);
      } else if (res?.error === 'room_locked') {
        setFormError('This room is locked. Ask the host for access.');
        setBusy(false);
      } else if (res?.error === 'name_taken') {
        setFormError('This name is already taken. Please choose another name.');
        setBusy(false);
      } else {
        setFormError(res?.error || 'Could not join the room.');
        setBusy(false);
      }
    } catch {
      setFormError('Can’t reach the realtime server. Is it running?');
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.codeChip}>
        <span className={styles.codeLabel}>room</span>
        <span className={styles.code}>{code}</span>
      </div>
      <h1 className={styles.h1}>Join the room</h1>
      <p className={styles.sub}>Enter your name — no account, no email, no history. Your identity lives in this tab.</p>

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
        <Field label="Enter your name" error={errors.name?.message} htmlFor="join-name">
          <Input id="join-name" placeholder="Your name" autoComplete="off" maxLength={24} {...register('name')} />
        </Field>

        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}

        <Button type="submit" variant="gold" size="lg" block disabled={busy}>
          {busy ? 'Joining…' : 'Join Room'}
        </Button>
      </form>
    </div>
  );
}
