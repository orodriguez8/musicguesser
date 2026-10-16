import { useState, type FormEvent } from 'react';
import { deleteAccount, isUsernameAccount, signOut, updateProfile, USERNAME_RE, type Profile } from '../auth/auth';
import { Icon } from '../components/Icon';
import { BigCassette, TapeArt, TAPES } from '../components/Tapes';

interface Props {
  profile: Profile;
  email?: string | null;
  /** Primera vez tras entrar con Google: elegir nombre y cinta. */
  setup?: boolean;
  onSaved: () => void;
  onClose: () => void;
}

export function Account({ profile, email, setup, onSaved, onClose }: Props) {
  const [username, setUsername] = useState(profile.username);
  const [tape, setTape] = useState(TAPES.some((t) => t.id === profile.avatar) ? profile.avatar : TAPES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const removeAccount = async () => {
    if (!window.confirm('¿Borrar tu cuenta? Se eliminarán tu perfil y todas tus partidas del ranking. No se puede deshacer.')) return;
    setError('');
    setBusy(true);
    try {
      await deleteAccount();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    if (!USERNAME_RE.test(username.trim()))
      return setError('El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.');
    setBusy(true);
    try {
      await updateProfile(profile.id, { username, avatar: tape });
      setSaved(true);
      onSaved();
      if (setup) onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen login">
      <header className="login-head">
        <button className="btn-square" onClick={onClose} aria-label="Volver">
          <Icon name="back" size={20} />
        </button>
        <span className="rec-title">{setup ? 'ÚLTIMO PASO' : 'TU CUENTA'}</span>
        <span className="head-spacer" />
      </header>

      <BigCassette tapeId={tape} handle={username.trim() || profile.username} />

      {setup && (
        <div className="login-title">
          <h1>¿Cómo quieres salir en el ranking?</h1>
          <p>Elige tu nombre de usuario y tu cinta. Puedes cambiarlos cuando quieras.</p>
        </div>
      )}

      <form className="login-form" onSubmit={submit} noValidate>
        <label className="lcd on">
          <span className="lcd-prefix" aria-hidden="true">
            USER&gt;
          </span>
          <span className="sr-only">Nombre de usuario</span>
          <input
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
          />
        </label>

        <fieldset className="tape-picker">
          <legend>Tu cinta</legend>
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
        {saved && !setup && <p className="lcd-note ok">Guardado.</p>}

        <button type="submit" className="btn-primary big" disabled={busy}>
          {busy ? 'Guardando…' : setup ? 'Guardar y jugar' : 'Guardar cambios'}
        </button>
      </form>

      {!setup && (
        <>
          <p className="muted small center">
            {isUsernameAccount(email) ? 'Cuenta de solo usuario' : email ? `Entras con ${email}` : ''}
          </p>
          <button
            className="btn-ghost"
            onClick={async () => {
              await signOut();
              onClose();
            }}
          >
            Cerrar sesión
          </button>
          <button className="btn-delete-account" onClick={removeAccount} disabled={busy}>
            Borrar mi cuenta
          </button>
        </>
      )}
      <span className="credit login-credit">
        <a href="privacidad.html">Privacidad</a> · made by Raksoda
      </span>
    </main>
  );
}
