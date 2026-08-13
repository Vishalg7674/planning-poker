'use client';

import { useAppSelector } from '@/store';
import type { Participant } from '@/lib/types';
import Avatar from '@/components/Avatar';
import styles from './ParticipantsPanel.module.scss';

interface ParticipantsPanelProps {
  onRemove: (participant: Participant) => void;
}

/** Presence labels — JOINED in the waiting room, THINKING while voting, VOTED once locked, DISCONNECTED when a tab closes. */
function PresenceText({ p, phase }: { p: Participant; phase: string }) {
  if (p.status === 'disconnected') {
    return (
      <span className={styles.presence}>
        <span aria-hidden="true">⚠</span> Disconnected
      </span>
    );
  }
  if (phase === 'waiting') {
    return (
      <span className={styles.presence}>
        <span aria-hidden="true">○</span> Joined
      </span>
    );
  }
  if (phase === 'voting' || phase === 'ended') {
    if (p.status === 'voted' || p.hasVoted) {
      return (
        <span className={styles.presence}>
          <span aria-hidden="true">✓</span> {p.skipped ? 'Skipped' : 'Voted'}
        </span>
      );
    }
    return (
      <span className={styles.presence}>
        <span aria-hidden="true">○</span> Thinking
        <span className={styles.dots} aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    );
  }
  return null;
}

/**
 * Live participant list with realtime presence. Before the reveal nobody sees
 * actual values — only who has voted and who is still thinking. After the
 * reveal the values are public, so the list shows them too.
 */
export default function ParticipantsPanel({ onRemove }: ParticipantsPanelProps) {
  const participants = useAppSelector((s) => s.participants.list);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const hostId = useAppSelector((s) => s.room.hostId);
  const phase = useAppSelector((s) => s.voting.phase);
  const votes = useAppSelector((s) => s.voting.votes);
  const skippedIds = useAppSelector((s) => s.voting.skippedIds);
  const isHost = hostId === myId;

  const subText = (p: Participant) => {
    if (phase === 'revealed') {
      if (votes[p.id] !== undefined) {
        return (
          <>
            Voted <span className={styles.valuePip}>{votes[p.id]}</span>
          </>
        );
      }
      if (p.skipped || skippedIds.includes(p.id)) return 'Skipped';
      return "Didn't vote";
    }
    return <PresenceText p={p} phase={phase} />;
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>
        Participants
        <span className={styles.count}>
          {participants.length} {participants.length === 1 ? 'person' : 'people'}
        </span>
      </h3>
      <ul className={styles.list}>
        {participants.map((p) => {
          const me = p.id === myId;
          return (
            <li key={p.id} className={styles.row} data-status={p.status}>
              <Avatar name={p.name} hue={p.hue} size="md" status={p.status} isHost={p.id === hostId} isMe={me} />
              <div className={styles.meta}>
                <span className={styles.name}>
                  {p.name}
                  {me && <span className={styles.you}>(you)</span>}
                </span>
                <span className={styles.sub}>
                  {p.id === hostId && <span className={styles.hostLabel}>Host</span>}
                  {p.id === hostId && <span className={styles.sep}>·</span>}
                  <span className={styles.status}>{subText(p)}</span>
                </span>
              </div>
              {isHost && p.id !== hostId && (
                <div className={styles.controls}>
                  <button type="button" className={styles.iconBtn} title="Remove from table" onClick={() => onRemove(p)}>
                    ✕
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {participants.length === 0 && <li className={styles.empty}>Nobody here yet — share the invite link.</li>}
      </ul>
      <p className={styles.note}>
        {phase === 'revealed' ? 'Round revealed — votes are final.' : 'Votes stay hidden until the host reveals the round.'}
      </p>
    </div>
  );
}
