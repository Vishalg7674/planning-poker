'use client';

import { useAppSelector } from '@/store';
import type { Participant } from '@/lib/types';
import Avatar from '@/components/Avatar';
import styles from './ParticipantsPanel.module.scss';

const STATUS_TEXT: Record<string, string> = {
  connected: 'Thinking',
  voted: 'Voted',
  disconnected: 'Disconnected',
};

interface ParticipantsPanelProps {
  onRemove: (participant: Participant) => void;
}

/**
 * Live participant list. Before the reveal nobody sees actual values — only
 * who has voted (✓ Voted) and who is still thinking (○ Thinking). After the
 * reveal the values are public, so the list shows them too.
 */
export default function ParticipantsPanel({ onRemove }: ParticipantsPanelProps) {
  const participants = useAppSelector((s) => s.participants.list);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const hostId = useAppSelector((s) => s.room.hostId);
  const phase = useAppSelector((s) => s.voting.phase);
  const votes = useAppSelector((s) => s.voting.votes);
  const isHost = hostId === myId;

  const subText = (p: Participant) => {
    // The host badge is rendered separately; everyone (host included) shows
    // the same status here. Disconnected = no live status this round.
    if (phase === 'waiting' || p.status === 'disconnected') return '';
    if (phase === 'revealed') {
      return votes[p.id] !== undefined ? (
        <>
          Voted <span className={styles.valuePip}>{votes[p.id]}</span>
        </>
      ) : (
        "Didn't vote"
      );
    }
    return STATUS_TEXT[p.status];
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Participants</h3>
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
