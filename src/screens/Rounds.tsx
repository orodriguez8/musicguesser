import { useCallback, useEffect, useRef, useState } from 'react';
import { audio, useAudio } from '../audio/engine';
import { AnswerPanel } from '../components/AnswerPanel';
import { AudioStage } from '../components/AudioStage';
import { Icon } from '../components/Icon';
import { PixelCover } from '../components/PixelCover';
import { SafeImg } from '../components/SafeImg';
import { HEARDLE_FACTORS, HEARDLE_STEPS, PIXEL_FACTORS, PIXEL_LEVELS, speedFactor, yearPoints } from '../game/scoring';
import { answerMatches, lineMatches } from '../game/text';
import type { Outcome, Question } from '../game/types';

interface RoundProps<K extends Question['kind']> {
  q: Extract<Question, { kind: K }>;
  answered: boolean;
  showOptions: boolean;
  onOutcome: (o: Outcome) => void;
}

/**
 * Cronómetro de la prueba. Si hay audio, empieza cuando el fragmento empieza a sonar de verdad:
 * con una conexión lenta no es justo descontar puntos por los segundos de carga.
 */
function useElapsed(url?: string) {
  const mounted = useRef(performance.now());
  const start = useRef<number | null>(url ? null : mounted.current);
  const { url: current, playing } = useAudio();
  useEffect(() => {
    if (url && start.current == null && playing && current === url) start.current = performance.now();
  }, [url, current, playing]);
  return useCallback(() => performance.now() - (start.current ?? mounted.current), []);
}

const secs = (ms: number) => Math.max(1, Math.round(ms / 1000));

export function Round({ q, answered, showOptions, onOutcome }: RoundProps<Question['kind']>) {
  const props = { answered, showOptions, onOutcome };
  switch (q.kind) {
    case 'cancion':
      return <CancionRound q={q} {...props} />;
    case 'artista':
      return <ArtistaRound q={q} {...props} />;
    case 'subgenero':
      return <SubgeneroRound q={q} {...props} />;
    case 'completa':
      return <CompletaRound q={q} {...props} />;
    case 'misteriosa':
      return <MisteriosaRound q={q} {...props} />;
    case 'anio':
      return <AnioRound q={q} {...props} />;
    case 'portada':
      return <PortadaRound q={q} {...props} />;
    case 'intruso':
      return <IntrusoRound q={q} {...props} />;
  }
}

function CancionRound({ q, answered, showOptions, onOutcome }: RoundProps<'cancion'>) {
  const [step, setStep] = useState(0);
  const resolve = useCallback(
    ({ correct, typed }: { correct: boolean; typed: boolean }) =>
      onOutcome({
        correct,
        typed,
        factor: HEARDLE_FACTORS[step],
        seconds: HEARDLE_STEPS[step],
        short: correct ? `${HEARDLE_STEPS[step]}s` : '—',
        reveal: `Era «${q.track.title}»`,
      }),
    [onOutcome, step, q.track.title],
  );
  return (
    <>
      <AudioStage
        track={q.track}
        variant="heardle"
        step={step}
        answered={answered}
        onMore={() => setStep((s) => Math.min(s + 1, HEARDLE_STEPS.length - 1))}
      />
      <AnswerPanel
        options={q.options}
        answer={q.answer}
        accept={(s) => answerMatches(s, q.accept)}
        placeholder="Escribe el título y gana ×2"
        locked={answered}
        startWithOptions={showOptions}
        onResolve={resolve}
      />
    </>
  );
}

const KIND_HINT = {
  group: { icon: 'users', text: 'Es un grupo: escribe el nombre de la banda, no el de su cantante.', placeholder: 'Nombre del grupo (×2)' },
  person: { icon: 'user', text: 'Es un artista en solitario.', placeholder: 'Nombre del artista (×2)' },
  unknown: { icon: 'mic', text: 'Escribe el nombre del artista o de la banda, no el de su cantante.', placeholder: 'Artista o grupo (×2)' },
} as const;

function ArtistaRound({ q, answered, showOptions, onOutcome }: RoundProps<'artista'>) {
  const elapsed = useElapsed(q.track.preview);
  const hint = KIND_HINT[q.artistType ?? 'unknown'];
  const who = q.artistType === 'group' ? 'Eran' : 'Era';
  const resolve = useCallback(
    ({ correct, typed }: { correct: boolean; typed: boolean }) => {
      const ms = elapsed();
      onOutcome({ correct, typed, factor: speedFactor(ms), seconds: ms / 1000, short: correct ? `${secs(ms)}s` : '—', reveal: `${who} ${q.track.artistName}` });
    },
    [elapsed, onOutcome, q.track.artistName, who],
  );
  return (
    <>
      <AudioStage track={q.track} variant="full" answered={answered} />
      <p className={q.artistType === 'group' ? 'kind-hint group' : 'kind-hint'}>
        <Icon name={hint.icon} size={18} />
        {hint.text}
      </p>
      <AnswerPanel
        options={q.options}
        answer={q.answer}
        accept={(s) => answerMatches(s, q.accept)}
        placeholder={hint.placeholder}
        locked={answered}
        startWithOptions={showOptions}
        onResolve={resolve}
      />
    </>
  );
}

function SubgeneroRound({ q, answered, onOutcome }: RoundProps<'subgenero'>) {
  const elapsed = useElapsed(q.track.preview);
  const resolve = useCallback(
    ({ correct }: { correct: boolean }) => {
      const ms = elapsed();
      onOutcome({ correct, typed: false, factor: speedFactor(ms), seconds: ms / 1000, short: correct ? `${secs(ms)}s` : '—', reveal: `Era ${q.options[q.answer].label}` });
    },
    [elapsed, onOutcome, q],
  );
  return (
    <>
      <AudioStage track={q.track} variant="full" answered={answered} />
      <p className="hint">¿A qué género pertenece este fragmento?</p>
      <AnswerPanel options={q.options} answer={q.answer} locked={answered} startWithOptions onResolve={resolve} />
    </>
  );
}

function TrackHeader({ q }: { q: { track: { cover: string; title: string; artistName: string } } }) {
  return (
    <div className="track-head">
      <SafeImg src={q.track.cover} alt="" width={56} height={56} />
      <div>
        <strong>{q.track.title}</strong>
        <span>{q.track.artistName}</span>
      </div>
    </div>
  );
}

function CompletaRound({ q, answered, showOptions, onOutcome }: RoundProps<'completa'>) {
  const elapsed = useElapsed(q.track.preview);
  const line = q.options[q.answer].label;
  const resolve = useCallback(
    ({ correct, typed }: { correct: boolean; typed: boolean }) => {
      const ms = elapsed();
      onOutcome({ correct, typed, factor: speedFactor(ms, 40000), seconds: ms / 1000, short: correct ? `${secs(ms)}s` : '—', reveal: `Seguía: «${line}»` });
    },
    [elapsed, onOutcome, line],
  );
  return (
    <>
      <div className="stage lyric-stage">
        <TrackHeader q={q} />
        <div className="lyrics">
          <p className="lyric dim">{q.context[0]}</p>
          <p className="lyric">{q.context[1]}</p>
          <p className={answered ? 'lyric reveal' : 'lyric blank'}>{answered ? line : <span className="caret">¿…?</span>}</p>
        </div>
        <AudioStage track={q.track} variant="mini" answered={answered} caption="Suena de fondo" />
      </div>
      <AnswerPanel
        options={q.options}
        answer={q.answer}
        accept={(s) => lineMatches(s, line)}
        placeholder="Escribe la siguiente frase (×2)"
        locked={answered}
        startWithOptions={showOptions}
        onResolve={resolve}
      />
    </>
  );
}

function MisteriosaRound({ q, answered, showOptions, onOutcome }: RoundProps<'misteriosa'>) {
  const elapsed = useElapsed();
  const resolve = useCallback(
    ({ correct, typed }: { correct: boolean; typed: boolean }) => {
      const ms = elapsed();
      onOutcome({ correct, typed, factor: speedFactor(ms, 40000), seconds: ms / 1000, short: correct ? `${secs(ms)}s` : '—', reveal: `Era «${q.track.title}»` });
    },
    [elapsed, onOutcome, q.track.title],
  );
  return (
    <>
      <div className="stage lyric-stage mystery">
        <Icon name="quote" size={34} className="quote-mark" />
        <div className="lyrics">
          {q.lines.map((l, i) => (
            <p className="lyric big" key={i}>
              {l}
            </p>
          ))}
        </div>
        {answered ? (
          <AudioStage track={q.track} variant="mini" answered caption={`${q.track.title} · ${q.track.artistName}`} />
        ) : (
          <p className="hint">La canción sonará cuando respondas</p>
        )}
      </div>
      <AnswerPanel
        options={q.options}
        answer={q.answer}
        accept={(s) => answerMatches(s, q.accept)}
        placeholder="¿Qué canción es? (×2)"
        locked={answered}
        startWithOptions={showOptions}
        onResolve={resolve}
      />
    </>
  );
}

const MIN_YEAR = 1960;

function AnioRound({ q, answered, onOutcome }: RoundProps<'anio'>) {
  const maxYear = new Date().getFullYear();
  const [year, setYear] = useState(2005);
  const [hint, setHint] = useState(false);
  const clamp = (y: number) => Math.min(maxYear, Math.max(MIN_YEAR, y));
  const diff = Math.abs(year - q.year);

  const fix = () => {
    if (answered) return;
    const base = Math.round(yearPoints(diff) * (hint ? 0.8 : 1));
    onOutcome({
      correct: diff <= 2,
      typed: false,
      factor: 1,
      yearDiff: diff,
      basePoints: base,
      short: diff === 0 ? '0' : `±${diff}`,
      reveal: `Salió en ${q.year}`,
    });
  };

  return (
    <>
      <div className="stage year-stage">
        <TrackHeader q={q} />
        <AudioStage track={q.track} variant="mini" answered={answered} caption="Fragmento" />
        <div className="year-picker">
          <span className="eyebrow">{hint && !answered ? `Pista: década de ${Math.floor(q.year / 10) * 10}` : '¿En qué año salió?'}</span>
          <div className="year-row">
            <button className="btn-square lg" onClick={() => setYear((y) => clamp(y - 1))} disabled={answered} aria-label="Un año menos">
              <Icon name="minus" size={22} />
            </button>
            <output className="year-value" aria-live="polite">
              {year}
            </output>
            <button className="btn-square lg" onClick={() => setYear((y) => clamp(y + 1))} disabled={answered} aria-label="Un año más">
              <Icon name="plus" size={22} />
            </button>
          </div>
          <label className="sr-only" htmlFor="year-range">
            Año de lanzamiento
          </label>
          <input
            id="year-range"
            className="year-range"
            type="range"
            min={MIN_YEAR}
            max={maxYear}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={answered}
            style={{ ['--pct' as string]: `${((year - MIN_YEAR) / (maxYear - MIN_YEAR)) * 100}%` }}
          />
          <div className="year-ticks" aria-hidden="true">
            <span>{MIN_YEAR}</span>
            <span>1980</span>
            <span>2000</span>
            <span>{maxYear}</span>
          </div>
          {answered && (
            <p className="year-result">
              Salió en <strong>{q.year}</strong> · {diff === 0 ? '¡clavado!' : `te has ido ${diff} ${diff === 1 ? 'año' : 'años'}`}
            </p>
          )}
        </div>
      </div>
      {!answered && (
        <div className="row-actions">
          <button className="btn-ghost" onClick={() => setHint(true)} disabled={hint}>
            <Icon name="clock" /> Pista: década <span className="muted">−20 %</span>
          </button>
          <button className="btn-primary grow" onClick={fix}>
            Fijar {year}
          </button>
        </div>
      )}
    </>
  );
}

function PortadaRound({ q, answered, showOptions, onOutcome }: RoundProps<'portada'>) {
  // La nitidez solo sube cuando el jugador la pide; cada paso vale menos
  const [level, setLevel] = useState(0);
  const elapsed = useElapsed();
  const max = PIXEL_LEVELS.length - 1;
  const nextWorth = Math.round((PIXEL_FACTORS[level + 1] ?? 0) * 100);

  const resolve = useCallback(
    ({ correct, typed }: { correct: boolean; typed: boolean }) => {
      const ms = elapsed();
      onOutcome({ correct, typed, factor: PIXEL_FACTORS[level], seconds: ms / 1000, short: correct ? `${secs(ms)}s` : '—', reveal: `Era «${q.options[q.answer].label}»` });
    },
    [elapsed, onOutcome, level, q],
  );

  return (
    <>
      <div className="stage cover-stage">
        <PixelCover src={q.track.cover} level={answered ? max : level} />
        <div className="cover-row">
          <span className="muted-strong">Nitidez {Math.min(level + 1, max + 1)}/{max + 1}</span>
          {!answered && (
            <button className="btn-chip" onClick={() => setLevel((l) => Math.min(max, l + 1))} disabled={level >= max}>
              <Icon name="eye" size={16} />
              {level >= max ? 'Ya está nítida' : <>Más nítida <span className="muted">· vale {nextWorth} %</span></>}
            </button>
          )}
        </div>
        {answered && <AudioStage track={q.track} variant="mini" answered caption={`${q.track.title} · ${q.track.artistName}`} />}
      </div>
      <AnswerPanel
        options={q.options}
        answer={q.answer}
        accept={(s) => answerMatches(s, q.accept)}
        placeholder="Nombre del disco (×2)"
        locked={answered}
        startWithOptions={showOptions}
        onResolve={resolve}
      />
    </>
  );
}

function IntrusoRound({ q, answered, onOutcome }: RoundProps<'intruso'>) {
  const { url, playing } = useAudio();
  const [picked, setPicked] = useState<number | null>(null);
  const elapsed = useElapsed(q.clips[0].preview);

  const playClip = (i: number) => {
    audio.unlock();
    audio.playRange(q.clips[i].preview, 5, 13).catch(() => {});
  };

  useEffect(() => {
    audio.playRange(q.clips[0].preview, 5, 13).catch(() => {});
    return () => audio.stop();
  }, [q]);

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    const ms = elapsed();
    const intruder = q.clips[q.answer];
    onOutcome({
      correct: i === q.answer,
      typed: false,
      factor: speedFactor(ms, 45000),
      seconds: ms / 1000,
      short: i === q.answer ? `${secs(ms)}s` : '—',
      reveal: `El intruso era ${intruder.artistName}`,
    });
  };

  return (
    <div className="stage intruso-stage">
      <div className="intruso-head">
        <SafeImg src={q.host.picture} alt="" width={52} height={52} />
        <div>
          <span className="eyebrow">¿Cuál NO es de…</span>
          <strong>{q.host.name}?</strong>
        </div>
      </div>
      <div className="clips">
        {q.clips.map((c, i) => {
          const isOn = playing && url === c.preview;
          const state = answered ? (i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim') : '';
          return (
            <div className={`clip ${state} ${isOn ? 'on' : ''}`} key={c.id}>
              <button className="clip-play" onClick={() => (isOn ? audio.pause() : playClip(i))} aria-label={`${isOn ? 'Pausar' : 'Escuchar'} fragmento ${i + 1}`}>
                <span className="clip-eq" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <span className="clip-num">Fragmento {i + 1}</span>
                <Icon name={isOn ? 'pause' : 'play'} size={18} />
              </button>
              {answered ? (
                <span className="clip-reveal">
                  {c.title} · {c.artistName}
                </span>
              ) : (
                <button className="clip-pick" onClick={() => choose(i)}>
                  Es el intruso
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
