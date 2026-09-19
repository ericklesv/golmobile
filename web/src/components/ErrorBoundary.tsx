import { Component, type ErrorInfo, type ReactNode } from 'react';
import { track } from '../lib/track';

/**
 * Rede de segurança: se uma tela quebrar (erro de render), mostra um aviso com botão em vez de
 * derrubar o site inteiro (antes o jogador tinha de recarregar a página — 13/09/2026, ranking).
 * `resetKey` = rota atual: trocar de tela limpa o erro.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[tela quebrou]', error, info.componentStack);
    track('erro.tela', { tela: this.props.resetKey, msg: String(error?.message || error).slice(0, 120) }); // relatório do painel: tela que quebrou
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
        <div className="panel w-full max-w-sm text-center text-navy-ink">
          <div className="t-display text-[22px]">Esta tela deu um erro</div>
          <p className="mt-1 text-[14px] font-bold leading-snug">Toque abaixo para voltar ao início. Se continuar, feche e abra o jogo de novo.</p>
          <button className="btn btn-orange btn-md mt-4 w-full" onClick={() => window.location.assign('/')}>Voltar ao início</button>
        </div>
      </div>
    );
  }
}
