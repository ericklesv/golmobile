# Incidente 16/09/2026 — cadastro barrando jogador real (falsos positivos do anti-robô)

> **Para a IA do Erickles:** este arquivo foi escrito pela IA do Guilherme em 16/09/2026 depois de investigar um
> alerta do Manabot. Leia até o fim — a seção **"O que pedimos à IA do Erickles"** lista o que ainda falta e
> precisa da decisão dele. Nada aqui é para ser aplicado sem ele ver.

## O alerta

Telegram (Manabot), 16/09/2026 ~09:22 BRT:

> ⚽ JogaGol ⚠️ 🧱 Cadastro barrado (honeypot) — IP 177.92.122.158, nick `ibrahimovic`,
> e-mail `henriquedefbferreira@gmail.com`

Pareceu legítimo ao Guilherme (nick e e-mail normais). Ele pediu investigação.

## O que encontramos

### 1. O honeypot barrou **só gente de verdade** — zero robôs

O cadastro tinha um campo escondido `website` (fora da tela, `autocomplete="off"`): humano não vê, robô
preenche → servidor devolvia `400 "Cadastro inválido."` (55 bytes).

Nos logs do nginx (`/var/log/nginx/*access*`, todo o histórico disponível), os `POST /api/auth/register` com
400 e 55 bytes — isto é, **todos os bloqueios de honeypot da vida do site** — foram estes:

| IP | Quando (UTC) | Tentativas | Aparelho / navegador |
|---|---|---|---|
| 189.18.228.31 | 15/09 08:28–08:30 | **9 em 2 minutos** | Samsung Galaxy S24+ (SM-S926B), Android 16, **WebView do Instagram** (`Instagram 446.0.0.49.77 Android`) |
| 177.92.122.158 | 16/09 12:21 | 1 | **exatamente o mesmo** modelo, build (`BP4A.251205.006`), Chrome 153 e versão do Instagram |

- É a **mesma pessoa** (o IP mudou porque é rede móvel), tentando em dois dias diferentes. Nove tentativas
  seguidas em dois minutos é comportamento de humano frustrado, não de script.
- Referer `https://jogagol.com.br/cadastro` — chegou pelo Instagram (post/anúncio/link na bio).
- **Nunca conseguiu criar a conta**: não existe usuário com esse e-mail nem com o nick `ibrahimovic`, e
  nenhum cadastro com 200 saiu desses IPs.
- Os outros 400 do cadastro (85 bytes) são erro de validação normal (nick/senha), e **todos** esses IPs
  cadastraram com sucesso logo em seguida.

**Placar do honeypot: 0 robôs, 1 jogador real barrado 10 vezes.**

### Por que aconteceu

O **autofill do Android (Samsung Pass / Google) dentro do WebView do Instagram ignora `autocomplete="off"`**.
Um campo chamado `website` é exatamente o tipo que ele reconhece — preenche com a URL do site sem a pessoa
ver. O servidor recebe `website` cheio e recusa. Como o campo é invisível, a pessoa não tem o que corrigir e
tenta de novo e de novo.

### 2. Outro jogador perdido pelo "rápido demais" (caso do relógio adiantado, 15/09)

O mesmo levantamento achou os `429` do cadastro:

| IP | Quando (UTC) | Tentativas | Motivo | Cadastrou depois? |
|---|---|---|---|---|
| 191.17.138.104 | 15/09 02:26–02:28 | **7 em 2 minutos** | `slow-down` ("rápido demais") — Windows/Chrome | **Não** |
| 37.203.37.187 | 15/09 15:02 | 1 | `too-many-accounts` (4ª conta em 24 h) | já tinha 3 (StorM, shasko, bagreee) |
| 87.196.85.71 | 15/09 14:48 | 2 | `too-many-accounts` | já tinha 3 (Zapp, RubenSantos, LEOpepsi) |

- O de **191.17.138.104** é o caso já documentado no `CLAUDE.md` (servidor comparava `startedAt` do cliente
  com o relógio dele; PC adiantado = "rápido demais" mesmo depois de 1 min no formulário). Foi corrigido em
  15/09 (`elapsedMs`), **mas a pessoa nunca voltou**. O nick/e-mail dela não fica no servidor — só no
  histórico do Manabot no Telegram, se o alerta de "cadastro barrado" já estava no ar às 02:26 UTC de 15/09
  (os deploys daquela madrugada foram 00:26, 01:02, 01:49, 01:56, 02:09 e 02:11 UTC).
- Os dois `too-many-accounts` parecem **multi-conta de verdade** (3 contas por IP com nicks diferentes,
  IPs fora do Brasil) — o bloqueio está funcionando como deveria.

## O que já foi feito (Guilherme, 16/09/2026, commit `d9d5b9b`, em produção às 12:39 UTC)

1. **Honeypot removido** — `api/src/lib/security.js` (`checkRegisterForm` não olha mais `website`),
   `api/src/routes/auth.js` (campo ainda aceito de fronts em cache e ignorado; o motivo "honeypot" saiu do
   alerta do Telegram), `web/src/screens/Register.tsx` (campo removido), tipos em `web/src/lib/api.ts` e
   `web/src/store/auth.ts`.
2. `api/scripts/test-seguranca.js` atualizado (`website` cheio agora tem de PASSAR) — rodado no banco local,
   **TUDO OK**.
3. `docs/SEGURANCA.md` e `CLAUDE.md` atualizados com a regra: **não reintroduzir campo escondido com nome que
   autofill reconheça**. Se precisar de mais defesa contra robô, o caminho é ligar o **Turnstile** (código
   pronto; falta só `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` no `.env` — hoje está desligado).
4. Defesas que continuam ativas: tempo mínimo de 3 s no formulário (`elapsedMs`, medido no aparelho),
   e-mail descartável, 5 cadastros/h e 3 contas/24 h por IP, 3 contas online por aparelho, trava de login por
   conta.

## O que pedimos à IA do Erickles

Investigar e levar ao Erickles para ele decidir — **não aplicar nada sozinho**:

1. **Contato com as pessoas barradas.** Ver com o Erickles a melhor forma de falar com quem tentou e desistiu:
   - `henriquedefbferreira@gmail.com` (nick `ibrahimovic`) — e-mail conhecido, dá para avisar que o cadastro
     já funciona (Galaxy S24+ pelo Instagram; sugerir abrir no Chrome se o WebView der problema de novo).
   - A pessoa do PC (`191.17.138.104`, 15/09 02:26 UTC) — nick/e-mail só no Telegram do Manabot, se o alerta
     já existia naquela hora. Se não existir, não há como contatar.
   - Vale checar também os `too-many-accounts` de 15/09? Provavelmente multi-conta, mas é decisão dele.
2. **Varrer outros falsos positivos parecidos** com o mesmo método (nginx: `POST /api/auth/register` com
   status ≠ 200, agrupado por IP, cruzado com "esse IP cadastrou depois?"). Pontos que merecem olhar:
   - `slow-down` em fronts que ainda estão em cache com `startedAt` (PWA guarda o bundle antigo — o front novo
     com `elapsedMs` só chega depois da atualização do service worker);
   - `too-many-accounts` / 3 online em **CGNAT** (operadora móvel colocando muita gente atrás do mesmo IP) e
     em redes de escola/lan house;
   - e-mail descartável: a lista `disposable-email-domains` tem ~120 mil domínios — conferir se algum provedor
     brasileiro legítimo caiu nela;
   - se o Telegram tem mais alertas 🧱 desde 15/09 que não bateram com cadastro bem-sucedido depois.
3. **Decidir a proteção anti-robô daqui pra frente**: Turnstile ligado (custo: mais um passo invisível no
   cadastro; Cloudflare fora do ar já está tratado — registra e deixa passar), ou ficar só com o que está.
   Nossa recomendação é ligar o Turnstile **só se** robô aparecer de verdade nos logs; até agora não apareceu.
4. **Ver se o alerta do Telegram deve incluir o aparelho** (User-Agent resumido): foi o que permitiu ligar as
   duas tentativas à mesma pessoa e distinguir humano de robô. Hoje o alerta só traz IP, nick e e-mail.

## Como reproduzir o levantamento (na VPS, só leitura)

```bash
# status dos cadastros
zcat -f /var/log/nginx/*access* | grep 'POST /api/auth/register' | awk '{print $9}' | sort | uniq -c
# recusas com IP, hora, tamanho da resposta (55 = ex-honeypot, 82/85 = validação ou slow-down, 109 = teto por IP) e navegador
zcat -f /var/log/nginx/*access* | grep 'POST /api/auth/register' | awk '$9!=200' \
  | sed -E 's/^([0-9.]+) - - \[([^]]+)\] "[^"]+" ([0-9]+) ([0-9]+) "[^"]*" "(Mozilla[^"]{0,70}).*/\1 | \2 | \3 | \4 | \5/' | sort
# esse IP cadastrou depois?
zcat -f /var/log/nginx/*access* | grep '^IP ' | grep 'POST /api/auth/register' | awk '$9==200' | wc -l
```
