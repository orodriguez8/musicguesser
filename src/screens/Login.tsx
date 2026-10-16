import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signInWithUsername,
  signUp,
  updatePassword,
  usernameAvailable,
  USERNAME_RE,
} from '../auth/auth';
import { Boombox } from '../components/Boombox';
import { Icon } from '../components/Icon';
import { BigCassette, randomTape, TapeArt, TAPES } from '../components/Tapes';

type Mode = 'login' | 'signup' | 'reset';

interface Props {
  initial?: Mode;
  onDone: () => void;
  onBack: () => void;
}

export function Login({ initial = 'login', onDone, onBack }: Props) {
  const [mode, setMode] = useState<Mode>(initial);
  if (mode === 'signup') return <Signup onDone={onDone} onBack={() => setMode('login')} />;
  if (mode === 'reset') return <Reset onBack={() => setMode('login')} />;
  return <SignIn onDone={onDone} onBack={onBack} onSignup={() => setMode('signup')} onReset={() => setMode('reset')} />;
}

function Credit() {
  return <span className="credit login-credit">made by Raksoda</span>;
}

/** Campo con aspecto de pantalla LCD de cadena de música. */
function LcdField({
  prefix,
  label,
  children,
  active,
}: {
  prefix: string;
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <label className={active ? 'lcd on' : 'lcd'}>
      <span className="lcd-prefix" aria-hidden="true">
        {prefix}&gt;
      </span>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}

function GoogleButton({ onError }: { onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn-google"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithGoogle();
        } catch (e) {
          onError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {busy ? 'Abriendo Google…' : 'Continuar con Google'}
    </button>
  );
}

function SignIn({ onDone, onBack, onSignup, onReset }: { onDone: () => void; onBack: () => void; onSignup: () => void; onReset: () => void }) {
  const [side, setSide] = useState<'email' | 'user'>('email');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !password) return setError(side === 'email' ? 'Escribe tu email y tu contraseña.' : 'Escribe tu usuario y tu contraseña.');
    setBusy(true);
    setError('');
    try {
      if (side === 'email') await signInWithEmail(id, password);
      else await signInWithUsername(id.replace(/^@/, ''), password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="screen login">
      <header className="login-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver al inicio">
          <Icon name="back" size={20} />
        </button>
        <button className="link" onClick={onBack}>
          Jugar sin cuenta
        </button>
      </header>

      <Boombox />

      <div className="login-title">
        <h1>Dale al play</h1>
        <p>Entra para guardar tus partidas y aparecer en el ranking.</p>
      </div>

      <form className="login-form" onSubmit={submit} noValidate>
        <div className="tape-sides" role="tablist" aria-label="Forma de entrar">
          <button type="button" role="tab" aria-selected={side === 'email'} className={side === 'email' ? 'on' : ''} onClick={() => { setSide('email'); setError(''); }}>
            CARA A · EMAIL
          </button>
          <button type="button" role="tab" aria-selected={side === 'user'} className={side === 'user' ? 'on' : ''} onClick={() => { setSide('user'); setError(''); }}>
            CARA B · USUARIO
          </button>
        </div>

        <LcdField prefix={side === 'email' ? 'EMAIL' : 'USER'} label={side === 'email' ? 'Email' : 'Nombre de usuario'} active>
          <input
            key={side}
            type={side === 'email' ? 'email' : 'text'}
            inputMode={side === 'email' ? 'email' : 'text'}
            autoComplete={side === 'email' ? 'email' : 'username'}
            autoCapitalize="off"
            spellCheck={false}
            placeholder={side === 'email' ? 'tu@email.com' : 'tu_nombre'}
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <span className="lcd-cursor" aria-hidden="true" />
        </LcdField>
        <LcdField prefix="PASS" label="Contraseña">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="lcd-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <Icon name="eye" size={18} />
          </button>
        </LcdField>

        {error && (
          <p className="lcd-error" role="alert">
            ERR&gt; {error}
          </p>
        )}

        <button type="submit" className="btn-primary big" disabled={busy}>
          <Icon name="play" size={18} /> {busy ? 'Cargando cinta…' : 'PLAY · Entrar'}
        </button>
        {side === 'email' && (
          <button type="button" className="link center-link" onClick={onReset}>
            ¿Olvidaste la contraseña?
          </button>
        )}
      </form>

      <GoogleButton onError={setError} />
      <button className="btn-rec" onClick={onSignup}>
        <span className="rec-dot" aria-hidden="true" /> REC · Grabar cuenta nueva
      </button>
      <Credit />
    </main>
  );
}

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'error';

function Signup({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [method, setMethod] = useState<'email' | 'user'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [tape, setTape] = useState(randomTape);
  const [avail, setAvail] = useState<Availability>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handle = username.trim() || 'tu_nombre';

  // ¿Está libre el nombre? Se comprueba mientras escribes (con un pequeño retardo)
  useEffect(() => {
    const u = username.trim();
    if (!u) return setAvail('idle');
    if (!USERNAME_RE.test(u)) return setAvail('invalid');
    setAvail('checking');
    let alive = true;
    const t = setTimeout(() => {
      usernameAvailable(u)
        .then((ok) => alive && setAvail(ok ? 'free' : 'taken'))
        .catch(() => alive && setAvail('error'));
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [username]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!USERNAME_RE.test(username.trim()))
      return setError('El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.');
    if (avail === 'taken') return setError('Ese nombre de usuario ya está cogido.');
    if (method === 'email' && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Ese email no parece válido.');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    setBusy(true);
    try {
      await signUp({ username, email: method === 'email' ? email : undefined, password, avatar: tape });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const availText: Partial<Record<Availability, string>> = {
    checking: 'Comprobando…',
    free: 'Libre',
    taken: 'Cogido',
    invalid: '3-20 letras, números, . o _',
  };

  return (
    <main className="screen login">
      <header className="login-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver">
          <Icon name="back" size={20} />
        </button>
        <span className="rec-title">
          <span className="rec-dot blink" aria-hidden="true" /> REC · NUEVA CUENTA
        </span>
        <span className="head-spacer" />
      </header>

      <BigCassette tapeId={tape} handle={handle} />

      <form className="login-form" onSubmit={submit} noValidate>
        <LcdField prefix="USER" label="Nombre de usuario (sale en el ranking)" active>
          <input
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            placeholder="tu_nombre"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
          />
          {availText[avail] && <span className={`lcd-status ${avail}`}>{availText[avail]}</span>}
        </LcdField>

        <div className="tape-sides" role="tablist" aria-label="Cómo quieres entrar">
          <button type="button" role="tab" aria-selected={method === 'email'} className={method === 'email' ? 'on' : ''} onClick={() => setMethod('email')}>
            CON EMAIL
          </button>
          <button type="button" role="tab" aria-selected={method === 'user'} className={method === 'user' ? 'on' : ''} onClick={() => setMethod('user')}>
            SOLO USUARIO
          </button>
        </div>

        {method === 'email' ? (
          <LcdField prefix="EMAIL" label="Email">
            <input type="email" inputMode="email" autoComplete="email" autoCapitalize="off" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </LcdField>
        ) : (
          <p className="lcd-note">Sin email no podrás recuperar la contraseña si la olvidas.</p>
        )}

        <LcdField prefix="PASS" label="Contraseña (mínimo 6 caracteres)">
          <input type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="mín. 6" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="lcd-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <Icon name="eye" size={18} />
          </button>
        </LcdField>

        <fieldset className="tape-picker">
          <legend>Elige tu cinta</legend>
          <div className="tape-grid">
            {TAPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={t.id === tape ? 'tape-option on' : 'tape-option'}
                style={t.id === tape ? { borderColor: t.color, boxShadow: `0 0 20px ${t.glow}` } : undefined}
                aria-pressed={t.id === tape}
                aria-label={t.label}
                onClick={() => setTape(t.id)}
              >
                <TapeArt id={t.id} />
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="lcd-error" role="alert">
            ERR&gt; {error}
          </p>
        )}

        <button type="submit" className="btn-primary big" disabled={busy}>
          <span className="rec-dot dark" aria-hidden="true" /> {busy ? 'Grabando…' : 'Grabar y jugar'}
        </button>
      </form>
      <Credit />
    </main>
  );
}

function Reset({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Ese email no parece válido.');
    setBusy(true);
    setError('');
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen login">
      <header className="login-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver">
          <Icon name="back" size={20} />
        </button>
        <span className="rec-title">REBOBINAR CONTRASEÑA</span>
        <span className="head-spacer" />
      </header>
      <div className="login-title">
        <h1>¿Se te olvidó?</h1>
        <p>Te mandamos un enlace para poner una contraseña nueva. Solo funciona con cuentas creadas con email.</p>
      </div>
      {sent ? (
        <p className="lcd-note ok">Enviado. Mira tu correo (y la carpeta de spam) y abre el enlace en este navegador.</p>
      ) : (
        <form className="login-form" onSubmit={submit} noValidate>
          <LcdField prefix="EMAIL" label="Email" active>
            <input type="email" inputMode="email" autoComplete="email" autoCapitalize="off" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </LcdField>
          {error && (
            <p className="lcd-error" role="alert">
              ERR&gt; {error}
            </p>
          )}
          <button type="submit" className="btn-primary big" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}
      <Credit />
    </main>
  );
}

/** Tras abrir el enlace de recuperación: elegir contraseña nueva. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="screen login">
      <div className="login-title">
        <h1>Contraseña nueva</h1>
        <p>Escribe la contraseña que quieres usar a partir de ahora.</p>
      </div>
      <form
        className="login-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await updatePassword(password);
            onDone();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <LcdField prefix="PASS" label="Contraseña nueva" active>
          <input type="password" autoComplete="new-password" placeholder="mín. 6" value={password} onChange={(e) => setPassword(e.target.value)} />
        </LcdField>
        {error && (
          <p className="lcd-error" role="alert">
            ERR&gt; {error}
          </p>
        )}
        <button type="submit" className="btn-primary big" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
      <Credit />
    </main>
  );
}
