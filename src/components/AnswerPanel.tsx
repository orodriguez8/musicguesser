import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Option } from '../game/types';
import { Icon } from './Icon';

interface Props {
  options: Option[];
  answer: number;
  /** Si existe, se puede escribir la respuesta (vale el doble). */
  accept?: (input: string) => boolean;
  placeholder?: string;
  locked: boolean;
  startWithOptions: boolean;
  onResolve: (r: { correct: boolean; typed: boolean }) => void;
}

const finePointer = () => window.matchMedia('(pointer: fine)').matches;

export function AnswerPanel({ options, answer, accept, placeholder, locked, startWithOptions, onResolve }: Props) {
  const typing = !!accept;
  const [revealed, setRevealed] = useState(startWithOptions || !typing);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState<'right' | 'wrong' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = locked || picked !== null || typed !== null;

  useEffect(() => {
    // En ordenador, el cursor directamente en la caja; en móvil no, que abre el teclado
    if (typing && !startWithOptions && finePointer()) inputRef.current?.focus({ preventScroll: true });
  }, [typing, startWithOptions]);

  const pick = (i: number) => {
    if (done) return;
    setPicked(i);
    onResolve({ correct: i === answer, typed: false });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (done || !accept || !input.trim()) return;
    const ok = accept(input);
    setTyped(ok ? 'right' : 'wrong');
    setRevealed(true);
    onResolve({ correct: ok, typed: true });
  };

  // Atajos de teclado 1–4
  useEffect(() => {
    if (!revealed || done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        setPicked(n - 1);
        onResolve({ correct: n - 1 === answer, typed: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, done, options.length, answer, onResolve]);

  const long = options.some((o) => o.label.length > 24 || o.sub);

  return (
    <div className="answer">
      {typing && (
        <form className={`answer-form ${typed ?? ''}`} onSubmit={submit}>
          <label className="field">
            <span className="sr-only">Tu respuesta</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={done}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
            />
            {!revealed && !done && <span className="x2">×2</span>}
            {typed === 'right' && <Icon name="check" className="field-state" />}
            {typed === 'wrong' && <Icon name="x" className="field-state" />}
          </label>
          <button type="submit" className="btn-square btn-cyan" aria-label="Enviar respuesta" disabled={done || !input.trim()}>
            <Icon name="arrow" size={20} />
          </button>
        </form>
      )}

      {typing && !revealed && (
        <button type="button" className="btn-reveal" onClick={() => setRevealed(true)}>
          <Icon name="eye" />
          Ver 4 opciones <span className="muted">· puntos ×1</span>
        </button>
      )}

      {revealed && (
        <>
          {typing && <div className="divider">{done ? 'solución' : 'o elige una'}</div>}
          <div className={long ? 'options one-col' : 'options'}>
            {options.map((o, i) => {
              const state = done ? (i === answer ? 'right' : i === picked ? 'wrong' : 'dim') : '';
              return (
                <button
                  key={i}
                  type="button"
                  className={`option ${state}`}
                  onClick={() => pick(i)}
                  aria-disabled={done}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className="option-key" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="option-text">
                    <span className="option-label">{o.label}</span>
                    {o.sub && <span className="option-sub">{o.sub}</span>}
                  </span>
                  {state === 'right' && <Icon name="check" />}
                  {state === 'wrong' && <Icon name="x" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
