import { Link } from 'react-router-dom';

/**
 * Topo das páginas abertas a quem não entrou (apresentação "/", /brgol, /times e /time/<slug>): logo à esquerda e o
 * "Entrar" sempre à vista, sem rolar. Antes a página inicial só tinha o "Já tenho conta" lá embaixo, depois do
 * jogo, do placar e dos cartões, e /brgol e /times não tinham nenhum: quem já tinha conta não achava onde entrar
 * (dono, 15/10/2026). Página pública nova = este topo.
 * `cadastro`: o "Jogar grátis" ao lado. A apresentação não usa — lá o convite é o próprio jogo de demonstração.
 * `logo`: altura do logo; a apresentação usa maior (ela só tem um botão ao lado).
 */
export function PublicHeader({ cadastro = true, logo = 'h-11' }: { cadastro?: boolean; logo?: string }) {
  return (
    <header className="relative flex items-center justify-between gap-2">
      <Link to="/" aria-label="JogaGol — página inicial" className="min-w-0 shrink">
        <img src="/brand/logo-h.webp" alt="JogaGol" width={800} height={267} fetchPriority="high"
          className={`${logo} w-auto max-w-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]`} />
      </Link>
      <nav className="flex shrink-0 items-center gap-1.5">
        <Link to="/entrar" className="btn btn-blue btn-sm">Entrar</Link>
        {cadastro && <Link to="/cadastro" className="btn btn-orange btn-sm">Jogar grátis</Link>}
      </nav>
    </header>
  );
}
