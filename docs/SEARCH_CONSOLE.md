# Google Search Console — passo a passo (combinado para 26/09/2026)

> **Status:** domínio **verificado em 26/09/2026** (registro TXT `google-site-verification` no DNS da Hostinger).
> Seguem os passos 3.2 em diante (sitemap, indexação) e o Bing.

Última etapa da auditoria de SEO de 25/09/2026 (ver `CLAUDE.md` → "SEO orgânico" e `docs/ROADMAP.md` → "SEO orgânico").
O site já está pronto para o Google (página inicial com a apresentação, páginas públicas `/brgol`, `/times` e
`/time/<slug>`, `robots.txt` e `sitemap.xml` com 54 endereços). Falta **provar ao Google que o domínio é nosso**, e isso
é no DNS.

**O domínio jogagol.com.br está na conta Hostinger do Erickles** (nameservers `solar/lunar.dns-parking.com`). Fazer
com ele junto — ou ele faz o passo 2 sozinho com o código que o Guilherme mandar.

## 1. Criar a propriedade (Guilherme, na conta Google que vai cuidar do site)
1. Abrir **search.google.com/search-console**.
2. **Adicionar propriedade** → escolher **Domínio** (o quadro da esquerda, não "Prefixo do URL").
3. Digitar `jogagol.com.br` → **Continuar**.
4. O Google mostra um registro **TXT** no formato `google-site-verification=XXXXXXXX…` → **copiar**.
   Não clicar em "Verificar" ainda.

## 2. Pôr o código no DNS (Erickles, na Hostinger)
1. Entrar no **hPanel** da Hostinger → **Domínios** → `jogagol.com.br` → **DNS / Nameservers**
   (ou "Gerenciar registros DNS").
2. **Adicionar registro**:
   - **Tipo:** `TXT`
   - **Nome / Host:** `@`
   - **Valor / Conteúdo:** colar o `google-site-verification=…` inteiro
   - **TTL:** deixar o padrão
3. **Adicionar / Salvar**. Não apagar nem mexer em nenhum outro registro (o `A` que aponta para a VPS
   `187.127.17.121` é o site no ar).

## 3. Verificar e mandar o sitemap (Guilherme, de volta no Search Console)
1. Voltar à tela do passo 1 → **Verificar**. Se der "não encontrado", esperar de 15 min a 1 h e tentar de novo
   (o DNS demora a propagar).
2. Menu **Sitemaps** → digitar `sitemap.xml` → **Enviar**. Tem de aparecer "Sucesso" com 54 URLs descobertos.
3. Menu **Inspeção de URL** → colar `https://jogagol.com.br/` → **Solicitar indexação**.
   Repetir com `https://jogagol.com.br/brgol` e `https://jogagol.com.br/times`.
4. (Opcional) **Configurações → Usuários e permissões** → adicionar o Erickles.

## 4. Bing (2 minutos, depois do passo 3)
**bing.com/webmasters** → entrar com a mesma conta → **Importar do Google Search Console**. Ele traz o site e o
sitemap sozinho.

## Depois
- Em 1–2 semanas, abrir **Desempenho** no Search Console (quais buscas mostram o site, cliques e posição) e
  **Páginas** (o que foi indexado e o que não foi, e por quê) → mandar os prints para decidir as próximas páginas
  (`docs/ROADMAP.md` → "SEO orgânico").
- Links de fora ajudam mais que tudo: `https://jogagol.com.br` na descrição dos vídeos do YouTube que falam do jogo,
  bio do Instagram (`jogagol.com.br/?utm_source=instagram&utm_medium=bio`), grupos de nostalgia do BRGOL com o link
  da `/brgol`.

## Se o DNS não der certo
Plano B sem DNS: no passo 1 escolher **Prefixo do URL** → `https://jogagol.com.br` → método **Tag HTML** → copiar a
`<meta name="google-site-verification" …>` e mandar para quem mexe no código: ela entra no `<head>` do
`web/index.html`, deploy, e aí **Verificar**. (Cobre só `https://jogagol.com.br`; o de Domínio cobre tudo — prefira ele.)
