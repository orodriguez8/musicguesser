import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/errors';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  /** Dónde está (para el aviso de error) */
  place: string;
  /** "Volver al inicio": si no se da, el botón recarga la app */
  onReset?: () => void;
  /** Al cambiar (p. ej. otra pantalla), se olvida el error y se vuelve a intentar */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  key: unknown;
}

/** Si una pantalla revienta, en vez de dejarla en blanco enseña un aviso con salida. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, `render:${this.props.place}`, { component: info.componentStack?.trim().split('\n').slice(0, 6).join(' | ') });
  }

  private reset = () => {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
    else window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen">
        <section className="stage state-card" role="alert">
          <p className="state-title">Algo ha fallado</p>
          <p className="muted center">
            Vuelve al inicio y prueba otra vez. Si se repite, prueba con otro modo mientras lo arreglamos.
          </p>
          <div className="row-actions">
            <button className="btn-ghost" onClick={() => window.location.reload()}>
              Recargar
            </button>
            <button className="btn-primary" onClick={this.reset}>
              <Icon name="back" /> Volver al inicio
            </button>
          </div>
        </section>
      </main>
    );
  }
}
