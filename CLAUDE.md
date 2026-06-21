# CLAUDE.md — App Carteira de Investimentos

> Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
> Ele define **como** trabalhar neste projeto. O detalhamento técnico está em @HANDOFF.md.

## Sobre mim (o usuário)
- Sou **iniciante em programação**. Quero **acompanhar o resultado visual**, não ler código.
- Explique em **linguagem simples**, sem jargão. **Mostre, não descreva.**

## Como você DEVE trabalhar comigo — regra principal
1. Construa **um componente por vez**, na ordem definida em @HANDOFF.md.
2. **Antes** de cada componente: diga em 1–2 frases o que vai fazer e **pergunte "posso seguir?"**. Só comece depois do meu "sim".
3. Garanta que o site esteja rodando em modo de desenvolvimento (`npm run dev`) e **me diga a URL local** (ex.: http://localhost:5173) para eu abrir no navegador.
4. **Depois** de construir: me diga exatamente **o que mudou na tela** e o que eu devo ver ou clicar para conferir. Então **espere minha aprovação**.
5. **Não avance** para o próximo componente sem eu aprovar.
6. Se algo quebrar, **conserte antes de seguir**. O site deve sempre abrir sem erro.
7. Prefira **mudanças pequenas e visíveis** a grandes refatorações.
8. (Opcional, recomendado) Faça um **commit git curto** a cada componente aprovado, para eu poder voltar atrás.

## Pilha (stack) — já decidida
- **Front-end:** React + Vite
- **Gráficos:** Recharts (rosca, linhas, barras). Treemap, mapa de calor e sparkline ficam em SVG/CSS próprios (Recharts não tem esses nativos).
- **Back-end/dados:** Firebase — **Authentication** (login e senha) + **Firestore** (banco)
- **Mobile (depois):** Capacitor (Android)
- **Cotações de mercado:** yfinance (preços históricos), API Banco Central (CDI), BRAPI (cotações ao vivo)

## Como rodar e ver (deixar sempre funcionando)
- `npm install` uma vez.
- `npm run dev` para subir o servidor local — **me passe a URL**.
- Eu abro no navegador; a tela recarrega sozinha a cada alteração que você fizer.

## Scripts de sincronização (rodar nesta ordem ao atualizar a planilha)
1. `python sync_firebase.py` — envia lançamentos e proventos do Excel para o Firestore
2. `python sync_historico.py` — recalcula o histórico mensal (patrimônio, cota, CDI, IBOV) e grava no Firestore

Python path: `C:\Users\Cliente\AppData\Local\Programs\Python\Python311\python.exe`

## Referência visual
- O arquivo **`carteira-dashboard-dark.html`** (protótipo, colocado na raiz do projeto) é a **referência de aparência e comportamento**. Replique o visual dele (tema escuro), adaptando para React.
- São **duas páginas**: "Carteira" e "Mercado".

## Autenticação
- A primeira coisa funcional é a **tela de Login com e-mail e senha** (Firebase Auth).
- Todo o resto fica **atrás do login** (rota protegida). Sem login, não se vê nenhum dado.
- **Nunca** me peça para colar senha ou credencial no chat. As chaves do Firebase vão em variáveis de ambiente (`.env`), nunca no código versionado.

## Dados (resumo — detalhe em @HANDOFF.md)
- Minha planilha Excel (`Carteira_Investimentos.xlsx`) é o **banco de dados de origem**.
- `sync_firebase.py` lê a planilha e envia para o Firestore (incremental, sem duplicar).
- `sync_historico.py` calcula o histórico mensal e benchmarks a partir dos dados do Firestore.
- O site lê do Firestore **em tempo real** (`onSnapshot`): quando atualizo a planilha e rodo os syncs, **a tela atualiza sozinha**.

@HANDOFF.md
