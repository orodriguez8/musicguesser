import { useId, useState } from 'react';
import { REPORT_REASONS, reportQuestion, type ReportInput, type ReportReason } from '../api/telemetry';
import { onlineEnabled } from '../lib/supabase';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  /** Qué se reporta (canción, disco...) */
  what: Omit<ReportInput, 'reason' | 'comment'>;
  /** Motivos que tienen sentido aquí (por defecto, todos) */
  reasons?: ReportReason[];
  label?: string;
  compact?: boolean;
}

/** "Esta pregunta está mal": el jugador elige el motivo y nos llega al panel de administración. */
export function ReportButton({ what, reasons, label = 'Reportar', compact }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const name = useId();
  if (!onlineEnabled) return null;

  const list = REPORT_REASONS.filter((r) => !reasons || reasons.includes(r.id));
  const send = async () => {
    if (!reason) return;
    setState('sending');
    const ok = await reportQuestion({ ...what, reason, comment });
    setState(ok ? 'done' : 'error');
  };

  return (
    <>
      <button
        className={compact ? 'btn-square sm' : 'btn-ghost'}
        onClick={() => setOpen(true)}
        aria-label={compact ? `Reportar ${what.title ?? 'esta pregunta'}` : undefined}
        title="Algo está mal"
        disabled={state === 'done'}
      >
        <Icon name={state === 'done' ? 'check' : 'flag'} size={16} />
        {!compact && (state === 'done' ? ' Reportado' : ` ${label}`)}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="¿Qué está mal?">
        {state === 'done' ? (
          <>
            <p>Gracias, lo revisaremos.</p>
            <button className="btn-primary" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </>
        ) : (
          <>
            <p className="muted small">{[what.title, what.artist, what.album].filter(Boolean).join(' · ')}</p>
            <fieldset className="report-reasons">
              <legend className="muted small">Motivo</legend>
              {list.map((r) => (
                <label key={r.id}>
                  <input type="radio" name={name} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <textarea
              className="report-comment"
              placeholder="Cuéntanos más (opcional)"
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              aria-label="Comentario"
            />
            {state === 'error' && <p className="form-error">No se ha podido enviar. Inténtalo en un momento.</p>}
            <button className="btn-primary" disabled={!reason || state === 'sending'} onClick={send}>
              {state === 'sending' ? 'Enviando…' : 'Enviar'}
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
