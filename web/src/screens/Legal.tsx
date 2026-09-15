/**
 * Páginas públicas exigidas pela Play Store (não pedem login):
 *   /privacidade   → Política de Privacidade (URL declarada no Google Play Console)
 *   /termos        → Termos de Uso
 *   /excluir-conta → como excluir a conta (URL declarada em "Segurança dos dados")
 * O texto descreve o que o jogo FAZ de verdade (api/: cadastro, IP, foto, chat, PIX na Efí,
 * Google Play Billing). Mudou o tratamento de dados? Mude aqui e a data em UPDATED.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Panel } from '../components/ui';
import { useSeo } from '../lib/seo';

export const CONTACT_EMAIL = 'contato@jogagol.com.br';
export const RESPONSIBLE = 'Managol Softwares';
const UPDATED = '14 de setembro de 2026';

function LegalFrame({ title, ribbon, children }: { title: string; ribbon: 'blue' | 'orange' | 'green'; children: React.ReactNode }) {
  const nav = useNavigate();
  const me = useAuth((s) => s.me);
  return (
    <div className="app-frame relative flex min-h-full flex-col px-4 pb-8" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
      <div className="stadium-bg" />
      <div className="relative flex items-center justify-between pb-3">
        <button onClick={() => (window.history.length > 1 ? nav(-1) : nav(me ? '/' : '/bem-vindo'))} className="btn-sq btn-sq-white h-12 w-12"><img src="/ui/pi-back.png" className="h-5 w-5" alt="voltar" /></button>
        <div className={`ribbon ribbon-${ribbon}`}>{title}</div>
        <img src="/brand/logo-h.webp" alt="JogaGol" className="h-9 w-auto" />
      </div>
      <div className="relative flex flex-col gap-4 text-[13px] font-bold leading-relaxed text-navy-ink [&_h3]:t-display [&_h3]:mt-1 [&_h3]:text-[15px] [&_h3]:text-navy-ink [&_ul]:list-disc [&_ul]:pl-5 [&_p+p]:mt-2 [&_ul+p]:mt-2 [&_p+ul]:mt-1">
        {children}
        <p className="t-display t-out text-center text-[11px]">
          <Link to="/privacidade">Privacidade</Link> · <Link to="/termos">Termos de uso</Link> · <Link to="/excluir-conta">Excluir conta</Link>
        </p>
      </div>
    </div>
  );
}

export function PrivacyScreen() {
  useSeo('Política de privacidade', 'Como o JogaGol trata os dados da sua conta.', '/privacidade');
  return (
    <LegalFrame title="PRIVACIDADE" ribbon="blue">
      <Panel>
        <p>Esta política explica quais dados o <b>JogaGol</b> (jogagol.com.br e o app da Google Play) coleta, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). Responsável: <b>{RESPONSIBLE}</b> · contato: <b>{CONTACT_EMAIL}</b>. Atualizada em {UPDATED}.</p>
      </Panel>
      <Panel title="O QUE COLETAMOS" ribbon="blue">
        <h3>Dados que você informa</h3>
        <ul>
          <li><b>Cadastro:</b> nick, e-mail, senha (guardada só como hash, nunca em texto), gênero do avatar e time do coração.</li>
          <li><b>Perfil:</b> foto de perfil (opcional) e texto pessoal (opcional).</li>
          <li><b>Chat:</b> as mensagens que você envia nas salas Geral e da Torcida.</li>
          <li><b>Denúncias:</b> o motivo e o texto que você escreve ao denunciar alguém.</li>
        </ul>
        <h3>Dados coletados automaticamente</h3>
        <ul>
          <li><b>Endereço IP</b> do último acesso e a <b>localização aproximada</b> (cidade/estado) obtida a partir dele. Usamos para segurança e moderação: coibir contas falsas, fraudes em propostas e trocas de VIP e para aplicar suspensões.</li>
          <li><b>Dados de jogo:</b> gols, chutes, recargas, nível, dinheiro virtual, itens, VIP, partidas dos minigames, cargo no time, propostas e histórico de ações — é o próprio jogo.</li>
          <li><b>Compras:</b> pacote, valor, identificadores da transação e data. O pagamento em si é feito pelos parceiros (abaixo); não vemos nem guardamos dados do seu banco ou cartão.</li>
          <li><b>No aparelho:</b> o token de login e preferências (som, nível já visto) ficam no armazenamento do navegador/app. Não usamos cookies de rastreamento nem anúncios.</li>
        </ul>
      </Panel>
      <Panel title="PARA QUE USAMOS" ribbon="green">
        <ul>
          <li>Fazer o jogo funcionar: sua conta, seu time, rankings, placares, prêmios e chat.</li>
          <li>Segurança e moderação: impedir múltiplas contas, golpes, spam e ofensas; analisar denúncias; aplicar suspensões.</li>
          <li>Compras de VIP: gerar a cobrança, confirmar o pagamento e creditar os dias.</li>
          <li>Comunicação: e-mail de recuperação de senha e avisos sobre a sua conta. Não mandamos propaganda.</li>
        </ul>
        <p>A base legal é a execução do contrato (os Termos de Uso), o legítimo interesse em manter o jogo seguro e, para a foto e o texto pessoal, o seu consentimento (você pode remover quando quiser).</p>
      </Panel>
      <Panel title="O QUE É PÚBLICO" ribbon="orange">
        <p>Outros jogadores veem: nick, foto, texto pessoal, time, nível, gols, posição nos rankings, cargo no time, VIP ativo, últimos lances e as mensagens que você manda no chat. E-mail, senha, IP e localização <b>nunca</b> são mostrados a outros jogadores.</p>
      </Panel>
      <Panel title="COM QUEM COMPARTILHAMOS" ribbon="blue">
        <ul>
          <li><b>Efí (Efí S.A.)</b> — processa os pagamentos por PIX feitos no site. Recebe o valor e o identificador da cobrança.</li>
          <li><b>Google Play</b> — processa as compras feitas dentro do app Android, conforme a política de privacidade do Google.</li>
          <li><b>ip-api.com</b> — recebe apenas o endereço IP para devolver a localização aproximada usada na moderação.</li>
          <li><b>Google Fonts</b> — as fontes do jogo são carregadas dos servidores do Google, que recebem o seu IP nessa requisição.</li>
          <li><b>Hospedagem</b> — os dados ficam em servidor próprio contratado de provedor de hospedagem, com acesso restrito à equipe.</li>
        </ul>
        <p>Não vendemos dados e não compartilhamos com anunciantes. Podemos entregar dados a autoridades quando a lei exigir.</p>
      </Panel>
      <Panel title="POR QUANTO TEMPO" ribbon="green">
        <ul>
          <li>Enquanto a conta existir. Ao <Link to="/excluir-conta" className="text-sky-deep">excluir a conta</Link>, os dados pessoais são apagados ou anonimizados na hora; os gols ficam no placar dos times sem o seu nome.</li>
          <li>Registros de compras: 5 anos, por obrigação fiscal e contábil.</li>
          <li>Registros de acesso (IP, data e hora): 6 meses, como exige o Marco Civil da Internet.</li>
          <li>Denúncias e suspensões: até 1 ano após a resolução, para moderação.</li>
        </ul>
      </Panel>
      <Panel title="SEUS DIREITOS" ribbon="orange">
        <p>Você pode, a qualquer momento: ver e corrigir seus dados (no Perfil), remover foto e texto pessoal, pedir uma cópia dos seus dados, revogar consentimentos e <Link to="/excluir-conta" className="text-sky-deep">excluir a conta</Link>. Pedidos que não dá para fazer pelo app: escreva para <b>{CONTACT_EMAIL}</b> a partir do e-mail cadastrado. Respondemos em até 15 dias.</p>
      </Panel>
      <Panel title="CRIANÇAS" ribbon="blue">
        <p>O JogaGol é para maiores de 13 anos. Não coletamos de propósito dados de crianças; se soubermos de uma conta de menor de 13 anos sem autorização dos responsáveis, ela será excluída.</p>
      </Panel>
      <Panel title="SEGURANÇA E MUDANÇAS" ribbon="green">
        <p>Toda comunicação é criptografada (HTTPS); senhas são guardadas com hash bcrypt; o acesso ao banco de dados é restrito. Se esta política mudar, avisamos no jogo e atualizamos a data no topo.</p>
      </Panel>
    </LegalFrame>
  );
}

export function TermsScreen() {
  useSeo('Termos de uso', 'Regras de uso do JogaGol.', '/termos');
  return (
    <LegalFrame title="TERMOS DE USO" ribbon="orange">
      <Panel>
        <p>Ao criar uma conta no <b>JogaGol</b> você concorda com estes termos e com a <Link to="/privacidade" className="text-sky-deep">Política de Privacidade</Link>. O JogaGol é um jogo casual de futebol de {RESPONSIBLE} · {CONTACT_EMAIL}. Atualizado em {UPDATED}.</p>
      </Panel>
      <Panel title="SUA CONTA" ribbon="orange">
        <ul>
          <li>É preciso ter 13 anos ou mais.</li>
          <li><b>Uma conta por pessoa.</b> Contas extras, contas em nome de outra pessoa e "contas laranja" para juntar VIP, dinheiro ou propostas podem ser suspensas — inclusive todas as contas da mesma conexão.</li>
          <li>Você é responsável pela senha. Não a compartilhe.</li>
          <li>Nick, foto e texto pessoal não podem ser ofensivos, enganosos ou imitar outra pessoa ou a equipe do jogo.</li>
        </ul>
      </Panel>
      <Panel title="JOGO LIMPO" ribbon="green">
        <ul>
          <li>Proibido usar robôs, scripts, macros, cliques automáticos ou qualquer programa para chutar, resolver desafios ou jogar por você.</li>
          <li>Proibido explorar falhas. Achou uma? Avise em {CONTACT_EMAIL} — a gente agradece.</li>
          <li>Trocas, propostas e doações de VIP existem para o jogo em equipe; vender, comprar ou trocar contas, VIP ou dinheiro do jogo por dinheiro real fora do jogo é proibido.</li>
        </ul>
      </Panel>
      <Panel title="CHAT E CONVIVÊNCIA" ribbon="blue">
        <p>No chat, no texto pessoal e no nick não são permitidos: ofensas, ameaças, discriminação, assédio, conteúdo sexual, spam, propaganda, links, pedidos de dados de outros jogadores ou golpes. Você pode <b>bloquear</b> qualquer jogador (as mensagens dele somem para você) e <b>denunciar</b> mensagens e perfis; a moderação pode apagar conteúdo, suspender ou excluir contas que quebrem estas regras, sem reembolso.</p>
      </Panel>
      <Panel title="DINHEIRO, VIP E ITENS" ribbon="orange">
        <ul>
          <li>O dinheiro do jogo (R$ virtuais), a destreza, os itens da loja e os prêmios <b>não têm valor real</b>, não podem ser sacados nem trocados por dinheiro de verdade.</li>
          <li><b>VIP</b> é um serviço digital: dias de benefícios dentro do jogo. A compra é feita por PIX no site ou pelo Google Play no app; os dias entram na conta assim que o pagamento é confirmado e você ativa quando quiser.</li>
          <li>Por ser conteúdo digital entregue na hora, pedidos de reembolso devem ser enviados a {CONTACT_EMAIL} em até 7 dias da compra (compras pelo Google Play seguem também a política de reembolso do Google) e são analisados conforme o Código de Defesa do Consumidor. Dias de VIP já ativados não são reembolsados.</li>
          <li>Preços e pacotes podem mudar; o preço vale no momento da compra.</li>
        </ul>
      </Panel>
      <Panel title="O JOGO PODE MUDAR" ribbon="green">
        <p>Regras, números (recargas, chances, prêmios, níveis), minigames e temporadas podem ser ajustados a qualquer momento para manter o equilíbrio. O serviço é fornecido "como está"; fazemos o possível para mantê-lo no ar, mas não garantimos disponibilidade ininterrupta nem respondemos por perdas de itens virtuais causadas por falhas, manutenção ou encerramento do jogo.</p>
      </Panel>
      <Panel title="ENCERRAMENTO" ribbon="blue">
        <p>Você pode <Link to="/excluir-conta" className="text-sky-deep">excluir sua conta</Link> quando quiser. Podemos suspender ou excluir contas que violem estes termos. Estes termos seguem as leis do Brasil; fica eleito o foro do seu domicílio para qualquer questão.</p>
      </Panel>
    </LegalFrame>
  );
}

export function DeleteAccountInfoScreen() {
  useSeo('Excluir conta', 'Como excluir sua conta do JogaGol.', '/excluir-conta');
  const me = useAuth((s) => s.me);
  return (
    <LegalFrame title="EXCLUIR CONTA" ribbon="orange">
      <Panel>
        <p>Você pode excluir sua conta do <b>JogaGol</b> a qualquer momento, pelo próprio jogo. A exclusão é definitiva.</p>
      </Panel>
      <Panel title="PELO JOGO (NA HORA)" ribbon="orange">
        <ol className="list-decimal pl-5">
          <li>Entre na sua conta e abra a aba <b>Perfil</b>.</li>
          <li>Role até o fim e toque em <b>Excluir minha conta</b>.</li>
          <li>Marque que entendeu, digite sua <b>senha</b> e confirme.</li>
        </ol>
        {me
          ? <Link to="/perfil" className="btn btn-orange btn-md mt-3 w-full">Ir para o meu Perfil</Link>
          : <Link to="/entrar" className="btn btn-orange btn-md mt-3 w-full">Entrar para excluir</Link>}
      </Panel>
      <Panel title="POR E-MAIL" ribbon="blue">
        <p>Não consegue entrar? Mande um e-mail para <b>{CONTACT_EMAIL}</b> <b>a partir do e-mail cadastrado</b>, com o seu nick e o assunto "Excluir conta". Fazemos em até 15 dias e respondemos confirmando.</p>
      </Panel>
      <Panel title="O QUE É APAGADO" ribbon="green">
        <ul>
          <li>Nick, e-mail, senha, gênero do avatar, foto de perfil (o arquivo também), texto pessoal e cor do nick.</li>
          <li>Endereço IP e localização aproximada.</li>
          <li>Todas as suas mensagens no chat e as denúncias que você fez.</li>
          <li>Dinheiro do jogo, destreza, itens, VIP guardado e ativo, cargo no time, propostas e contratos.</li>
        </ul>
        <h3>O que fica (sem o seu nome)</h3>
        <ul>
          <li>Os gols já marcados continuam contando no placar do seu time e nas rodadas e temporadas já fechadas — aparecem como "Jogador excluído".</li>
          <li>Registros de compras de VIP, por 5 anos (obrigação fiscal), sem dados pessoais.</li>
          <li>Registros de acesso por 6 meses (Marco Civil da Internet).</li>
        </ul>
      </Panel>
    </LegalFrame>
  );
}
