import { useEffect, useRef, useState } from 'react';
import { audio } from './audio/engine';
import { Icon } from './components/Icon';
import { Modal } from './components/Modal';
import { MODES, modeTitle } from './game/modes';
import type { Filter, PlayMode, Summary } from './game/types';
import { fmtInt } from './lib/util';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Puzzle } from './screens/Puzzle';
import { Online } from './screens/Online';
import { Challenge } from './screens/Challenge';
import { validChallengeId } from './online/challenges';
import { validCode } from './online/room';
import { Ranking } from './screens/Ranking';
import type { PuzzleId } from './game/daily';
import { Results } from './screens/Results';
import { useAuth } from './auth/auth';
import { onlineEnabled } from './lib/supabase';
import { load, save } from './lib/storage';
import { Account } from './screens/Account';
import { Login, NewPassword } from './screens/Login';
import {
  clearRecords,
  loadFilter,
  loadRecords,
  loadSettings,
  recordGame,
  saveFilter,
  saveSettings,
  type Records,
  type Settings,
} from './settings';

type ResultsView = { name: 'results'; mode: PlayMode; filter: Filter; summary: Summary; isRecord: boolean };
type View =
  | { name: 'home' }
  | { name: 'ranking' }
  | { name: 'puzzle'; id: PuzzleId }
  | { name: 'online'; code?: string }
  | { name: 'challenge'; id: string }
  | { name: 'account' }
  | { name: 'login'; initial: 'login' | 'signup'; back: View | null }
  | { name: 'game'; mode: PlayMode; filter: Filter; key: number }
  | ResultsView;

/** Enlaces compartidos: ?sala=CODIGO (sala en directo) o ?reto=CODIGO (reto de un amigo). */
function initialView(): View {
  const params = new URLSearchParams(window.location.search);
  const sala = params.get('sala')?.toUpperCase() ?? '';
  const reto = params.get('reto')?.toUpperCase() ?? '';
  if (sala || reto) {
    // Quitamos el parámetro para que al recargar no vuelva a entrar
    history.replaceState(null, '', window.location.pathname);
    if (onlineEnabled && validChallengeId(reto)) return { name: 'challenge', id: reto };
    if (onlineEnabled && validCode(sala)) return { name: 'online', code: sala };
  }
  return { name: 'home' };
}

export default function App() {
  const [view, setView] = useState<View>(initialView);
  const auth = useAuth();
  const [setupDone, setSetupDone] = useState(() => load<Record<string, boolean>>('setup-done', {}));
  // Quien entra por primera vez con Google tiene un nombre provisional: le pedimos el suyo
  const needsSetup =
    !!auth.profile && auth.session?.user.app_metadata?.provider === 'google' && !setupDone[auth.profile.id];
  const [filter, setFilter] = useState<Filter>(loadFilter);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [records, setRecords] = useState<Records>(loadRecords);
  const [modal, setModal] = useState<'settings' | 'records' | null>(null);

  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const leavingRef = useRef(false);

  // El botón "atrás" del navegador (o del móvil) vuelve al inicio; en mitad de una
  // partida pregunta antes, para no perderla por un toque sin querer.
  useEffect(() => {
    const onPop = () => {
      const fromApp = leavingRef.current;
      leavingRef.current = false;
      if (!fromApp && viewRef.current.name === 'game' && !window.confirm('¿Salir de la partida? Se perderá el progreso.')) {
        history.pushState({ mg: true }, '');
        return;
      }
      audio.stop();
      setView({ name: 'home' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const updateFilter = (f: Filter) => {
    setFilter(f);
    saveFilter(f);
  };
  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const play = (mode: PlayMode) => {
    if (view.name === 'home') history.pushState({ mg: true }, '');
    setView({ name: 'game', mode, filter, key: Date.now() });
    window.scrollTo(0, 0);
  };

  const openRanking = () => {
    if (view.name === 'home') history.pushState({ mg: true }, '');
    audio.stop();
    setView({ name: 'ranking' });
    window.scrollTo(0, 0);
  };

  const goHome = () => {
    audio.stop();
    if (history.state?.mg) {
      leavingRef.current = true;
      history.back();
    } else setView({ name: 'home' });
  };

  const openLogin = (initial: 'login' | 'signup' = 'login') => {
    if (view.name === 'home') history.pushState({ mg: true }, '');
    audio.stop();
    // Desde la pantalla final volvemos a ella tras entrar (para subir la partida al ranking);
    // desde las salas y los retos, también
    setView({ name: 'login', initial, back: ['results', 'online', 'challenge'].includes(view.name) ? view : null });
    window.scrollTo(0, 0);
  };

  const openPuzzle = (id: PuzzleId) => {
    if (view.name === 'home') history.pushState({ mg: true }, '');
    audio.stop();
    setView({ name: 'puzzle', id });
    window.scrollTo(0, 0);
  };

  const openOnline = () => {
    if (view.name === 'home') history.pushState({ mg: true }, '');
    audio.stop();
    setView({ name: 'online' });
    window.scrollTo(0, 0);
  };

  const openAccount = () => {
    if (view.name === 'home') history.pushState({ mg: true }, '');
    setView({ name: 'account' });
    window.scrollTo(0, 0);
  };

  // Si cierras sesión (o caduca) estando en "Tu cuenta", al inicio en vez de pantalla en blanco
  useEffect(() => {
    if (view.name === 'account' && auth.ready && !auth.session) setView({ name: 'home' });
  }, [view.name, auth.ready, auth.session]);

  const finishSetup = () => {
    if (!auth.profile) return;
    const next = { ...setupDone, [auth.profile.id]: true };
    setSetupDone(next);
    save('setup-done', next);
  };

  const finish = (mode: PlayMode, f: Filter) => (summary: Summary) => {
    const { records: next, isRecord } = recordGame(summary);
    setRecords({ ...next });
    setView({ name: 'results', mode, filter: f, summary, isRecord });
    window.scrollTo(0, 0);
  };

  if (auth.recovering) {
    return (
      <div className="app">
        <div className="glow" aria-hidden="true" />
        <NewPassword onDone={() => setView({ name: 'home' })} />
      </div>
    );
  }

  if (needsSetup && auth.profile) {
    return (
      <div className="app">
        <div className="glow" aria-hidden="true" />
        <Account profile={auth.profile} email={auth.session?.user.email} setup onSaved={auth.refreshProfile} onClose={finishSetup} />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="glow" aria-hidden="true" />
      {view.name === 'home' && (
        <Home
          filter={filter}
          onFilter={updateFilter}
          records={records}
          onPlay={play}
          onPuzzle={openPuzzle}
          onOnline={onlineEnabled ? openOnline : undefined}
          onOpenSettings={() => setModal('settings')}
          onOpenRecords={() => setModal('records')}
          onOpenRanking={onlineEnabled ? openRanking : undefined}
          account={
            onlineEnabled && auth.ready
              ? { profile: auth.profile, onClick: auth.session ? openAccount : () => openLogin('login') }
              : undefined
          }
        />
      )}
      {view.name === 'ranking' && <Ranking myId={auth.session?.user.id ?? null} onBack={goHome} />}
      {view.name === 'puzzle' && <Puzzle key={view.id} id={view.id} filter={filter} onBack={goHome} />}
      {view.name === 'online' && (
        <Online
          me={auth.profile}
          filter={filter}
          settings={settings}
          initialCode={view.code}
          onBack={goHome}
          onLogin={() => openLogin('login')}
        />
      )}
      {view.name === 'challenge' && (
        <Challenge id={view.id} settings={settings} loggedIn={!!auth.session} onBack={goHome} onLogin={() => openLogin('login')} />
      )}
      {view.name === 'login' && (
        <Login
          initial={view.initial}
          onBack={goHome}
          onDone={() => {
            if (view.back) setView(view.back);
            else goHome();
          }}
        />
      )}
      {view.name === 'account' && auth.profile && (
        <Account profile={auth.profile} email={auth.session?.user.email} onSaved={auth.refreshProfile} onClose={goHome} />
      )}
      {view.name === 'game' && (
        <Game
          key={view.key}
          mode={view.mode}
          filter={view.filter}
          settings={settings}
          onExit={goHome}
          onFinish={finish(view.mode, view.filter)}
        />
      )}
      {view.name === 'results' && (
        <Results
          summary={view.summary}
          filter={view.filter}
          isRecord={view.isRecord}
          loggedIn={!!auth.session}
          onLogin={() => openLogin('login')}
          onOpenRanking={onlineEnabled ? openRanking : undefined}
          onHome={goHome}
          onReplay={() => setView({ name: 'game', mode: view.mode, filter: view.filter, key: Date.now() })}
        />
      )}

      <Modal open={modal === 'settings'} onClose={() => setModal(null)} title="Ajustes">
        <div className="setting">
          <label htmlFor="vol" className="setting-label">
            <Icon name="volume" /> Volumen <span className="muted">{Math.round(settings.volume * 100)} %</span>
          </label>
          <input
            id="vol"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            className="year-range"
            style={{ ['--pct' as string]: `${settings.volume * 100}%` }}
            onChange={(e) => updateSettings({ ...settings, volume: Number(e.target.value) })}
          />
        </div>
        <label className="setting toggle">
          <span>
            <span className="setting-label">Mostrar las opciones desde el principio</span>
            <span className="muted small">Si escribes la respuesta sin verlas, vale ×1,5.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.showOptions}
            onChange={(e) => updateSettings({ ...settings, showOptions: e.target.checked })}
          />
        </label>
        <div className="setting row">
          <button className="btn-ghost" onClick={() => setModal('records')}>
            <Icon name="trophy" /> Mis récords
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              if (window.confirm('¿Borrar todos los récords?')) setRecords(clearRecords());
            }}
          >
            Borrar récords
          </button>
        </div>
        <p className="muted small">
          Los fragmentos de audio (30 s) vienen de Deezer y las letras de LRCLIB. Tus récords y ajustes se guardan solo en este
          navegador.
        </p>
      </Modal>

      <Modal open={modal === 'records'} onClose={() => setModal(null)} title="Récords">
        <ul className="records">
          {(['mezcla', ...MODES.map((m) => m.id)] as PlayMode[]).map((m) => {
            const r = records[m];
            return (
              <li key={m}>
                <span className="records-mode">{modeTitle(m)}</span>
                {r ? (
                  <span className="records-score">
                    <strong>{fmtInt(r.score)}</strong>
                    <span className="muted small">
                      {r.grade} · {r.label}
                    </span>
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
