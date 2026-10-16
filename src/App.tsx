import { useEffect, useState } from 'react';
import { audio } from './audio/engine';
import { Icon } from './components/Icon';
import { Modal } from './components/Modal';
import { MODES, modeTitle } from './game/modes';
import type { Filter, PlayMode, Summary } from './game/types';
import { fmtInt } from './lib/util';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Results } from './screens/Results';
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

type View =
  | { name: 'home' }
  | { name: 'game'; mode: PlayMode; filter: Filter; key: number }
  | { name: 'results'; mode: PlayMode; filter: Filter; summary: Summary; isRecord: boolean };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [filter, setFilter] = useState<Filter>(loadFilter);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [records, setRecords] = useState<Records>(loadRecords);
  const [modal, setModal] = useState<'settings' | 'records' | null>(null);

  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);

  // El botón "atrás" del navegador (o del móvil) vuelve al inicio
  useEffect(() => {
    const onPop = () => {
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

  const goHome = () => {
    audio.stop();
    if (history.state?.mg) history.back();
    else setView({ name: 'home' });
  };

  const finish = (mode: PlayMode, f: Filter) => (summary: Summary) => {
    const { records: next, isRecord } = recordGame(summary);
    setRecords({ ...next });
    setView({ name: 'results', mode, filter: f, summary, isRecord });
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <div className="glow" aria-hidden="true" />
      {view.name === 'home' && (
        <Home
          filter={filter}
          onFilter={updateFilter}
          records={records}
          onPlay={play}
          onOpenSettings={() => setModal('settings')}
          onOpenRecords={() => setModal('records')}
        />
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
          isRecord={view.isRecord}
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
            <span className="muted small">Si escribes la respuesta sin verlas, vale el doble.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.showOptions}
            onChange={(e) => updateSettings({ ...settings, showOptions: e.target.checked })}
          />
        </label>
        <div className="setting">
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
