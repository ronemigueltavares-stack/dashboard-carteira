# HANDOFF — Especificação do App Carteira

Documento técnico, importado pelo CLAUDE.md. Use junto com o protótipo `carteira-dashboard-dark.html`.

## 1. O que é o app
Dashboard pessoal de carteira de investimentos na B3 (Ações, FIIs, ETFs, BDRs). Mostra patrimônio, composição, evolução, rentabilidade vs. benchmarks, proventos e uma visão de mercado. Tema escuro. Web primeiro, Android depois (Capacitor).

## 2. Fluxo de dados (importante)
**Origem:** planilha Excel (`Carteira_Investimentos.xlsx`), preenchida manualmente.
- Aba **Lançamentos**: `A=DATA, B=ATIVO, C=QTD, D=VALOR, E=TOTAL, F=TIPO` (Compra/Venda).
- **Proventos** (mesma aba): `H=DATA, I=ATIVO, J=VALOR, K=TIPO` (Dividendo/JCP/Rendimento).

**Sincronização:** `sync_firebase.py` lê o Excel e grava no Firestore. Incremental — cada linha gera um **hash MD5**; só grava o que é novo (não duplica).

**No app:** ler do Firestore com `onSnapshot` (tempo real). Atualizei a planilha + rodei o sync → a tela atualiza sozinha.

**Três fontes distintas de dado (não confundir):**
1. **Excel → Firestore:** lançamentos e proventos (fatos históricos).
2. **Calculado no app** a partir dos lançamentos: posição por ativo (quantidade, preço médio/PM, custo) e patrimônio.
3. **API de cotações e índices** (gratuitas): cotação atual, variação do dia e séries históricas de benchmarks. A planilha **não** tem cotações nem benchmarks — tudo isso vem de API:
   - **BRAPI** (brapi.dev): ações, FIIs, ETFs, BDRs, índices (IBOV, IFIX), cripto (BTC) e históricos (parâmetros `range`/`interval`). Grátis até 15.000 req/mês com token; 4 ações de teste sem token. Token em `.env`.
   - **Banco Central — API SGS** (pública, sem token, JSON): `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados?formato=json&dataInicial=..&dataFinal=..`. Códigos: **12 = CDI**, 11 = Selic, 7 = Bovespa, 1 = dólar, 4/5 = ouro. (Desde 2025 exige filtro de data; janela máx. 10 anos.)
   - Rentabilidade = (cotação − PM) / PM. Benchmark (carteira vs CDI/IBOV) usa as séries históricas rebaseadas em 100 no início do período.
   - Sugestão: cachear as séries em `cotacoes`/uma coleção `benchmarks` no Firestore para não estourar o limite de requisições.

## 3. Schema do Firestore (proposta)
Os dados são **por usuário**: use o caminho `users/{uid}/...` para cada coleção, com regras de segurança que limitam o acesso ao dono.

- `users/{uid}/lancamentos/{id}`
  `{ data: timestamp, ativo: string, qtd: number, valor: number, total: number, tipo: 'Compra'|'Venda', hash: string }`
- `users/{uid}/proventos/{id}`
  `{ data: timestamp, ativo: string, valor: number, tipo: 'Dividendo'|'JCP'|'Rendimento', hash: string }`
- `ativos/{ticker}` (cadastro compartilhado — alimenta setor/segmento da página Mercado)
  `{ ticker: string, nome: string, classe: 'Ação'|'FII'|'ETF'|'BDR'|'RF', setor: string, segmento: string }`
- `cotacoes/{ticker}` (opcional, preenchida pela API de cotações)
  `{ preco: number, variacaoDia: number, atualizadoEm: timestamp }`

## 4. Contrato de dados (o que cada tela consome)
- **Posições:** agrupar `lancamentos` por ativo → `qtd = Σ compras − Σ vendas`; `custo` = total líquido comprado; `PM = custo / qtd`.
- **Proventos por mês/ano:** agrupar `proventos` por ano e mês (alimenta mapa de calor, agenda, evolução e média móvel 12m).
- **Composição:** somar valor de mercado (`qtd × cotação`) por classe e por ativo.
- **Variação do dia (treemap e lista):** vem de `cotacoes`.

## 5. Ordem de construção (um por vez — PERGUNTE antes de cada)
**Pré-requisito (antes do passo 0):** ter o **Git** instalado (git-scm.com) e uma **conta no GitHub** (github.com), com `git config` de nome/e-mail feito. Serve para commits a cada componente, backup e deploy automático.

0. **Setup:** criar projeto Vite + React; deixar `npm run dev` abrindo uma tela simples no navegador. *(Marco: vejo "funcionando" no localhost.)*
1. **Login:** tela de e-mail/senha (Firebase Auth) + rota protegida. *(Marco: faço login e entro.)*
2. **Layout base:** cabeçalho com Patrimônio + abas "Carteira" e "Mercado" (ainda vazias), tema escuro do protótipo.
3. **Ligação Firestore:** ler `lancamentos` e `proventos` e mostrar numa tabela simples (confirmar que os dados chegam em tempo real).
4. **Posições:** calcular qtd, PM e custo por ativo a partir dos lançamentos; mostrar em lista simples.
5. **KPIs + Patrimônio:** faixa de indicadores no topo da página Carteira.
6. **Período + Composição:** botões 6M/1A/2A/3A/5A/Máx + rosca de 2 níveis (classe interna, ativo externo).
7. **Evolução patrimonial:** área (patrimônio vs. custo), reagindo ao período.
8. **Carteira vs. Benchmark:** linhas em base 100 (carteira, CDI, IBOV), reagindo ao período.
9. **Agenda de proventos:** 12 meses (5 recebidos, mês atual, 6 a receber).
10. **Rankings:** rentabilidade e dividendos (yield on cost).
11. **Evolução dos dividendos:** barras anuais + acumulado + média móvel 12m.
12. **Mapa de calor de dividendos:** mensal, ano a ano; maior recebimento = cor mais escura.
13. **Página Mercado — barra de índices:** Ibovespa, S&P 500, IFIX, BTC, Dólar, Brent, Minério de Ferro, Ouro.
14. **Treemap de variação do dia:** agrupado por setor; tamanho = valor de mercado da posição (`qtd × cotação`); cor = variação do dia.
15. **Lista estilo Google Finance:** Ativo · Setor · Segmento · PM · Cotação · Rentabilidade · mini-gráfico do mês (sparkline).
16. **(Depois)** Empacotar para Android com Capacitor.

## 6. Componentes que migram do protótipo quase como estão
- **Treemap (squarify), mapa de calor (grade) e sparkline (SVG):** o protótipo já tem em JS/SVG/CSS puro — reaproveite a lógica, só adapte para componente React.
- **Rosca, linhas e barras:** refazer com Recharts.

## 7. Segurança e segredos
- Chaves do Firebase em `.env` (`VITE_...`), nunca no código versionado nem no chat.
- Regras do Firestore: cada usuário só lê/escreve os próprios dados.
- Login obrigatório para qualquer dado.

## 8. Hospedagem (gratuita)
- **Firebase Hosting** (recomendado — mesmo ecossistema do Auth/Firestore, plano grátis). Deploy com `firebase deploy`.
- Alternativas grátis: **Netlify** (deploy automático a cada `git push`, ok para uso pessoal e comercial) e **Vercel** (Hobby grátis, uso pessoal/não-comercial).
- O plano gratuito do Firebase (Spark) cobre hosting + Firestore para uso pessoal, com limites diários de leitura/escrita folgados para um único usuário.
