# HANDOFF — Especificação do App Carteira

Documento técnico, importado pelo CLAUDE.md. Use junto com o protótipo `carteira-dashboard-dark.html`.

## 1. O que é o app
Dashboard pessoal de carteira de investimentos na B3 (Ações, FIIs, ETFs, BDRs). Mostra patrimônio, composição, evolução, rentabilidade vs. benchmarks, proventos e uma visão de mercado. Tema escuro. Web primeiro, Android depois (Capacitor).

## 2. Fluxo de dados (importante)
**Origem:** planilha Excel (`Carteira_Investimentos.xlsx`), preenchida manualmente.
- Aba **Lançamentos**: `A=DATA, B=ATIVO, C=QTD, D=VALOR, E=TOTAL, F=TIPO` (Compra/Venda/BONIF).
- **Proventos** (mesma aba): `H=DATA, I=ATIVO, J=VALOR, K=TIPO` (Dividendo/JCP/Rendimento).

**Sincronização — dois scripts Python, rodar nesta ordem:**
1. `sync_firebase.py` — lê o Excel e grava `lancamentos` + `proventos` no Firestore. Incremental via hash MD5; não duplica.
2. `sync_historico.py` — lê `lancamentos` e `proventos` do Firestore, busca preços históricos (yfinance), CDI (BCB) e IBOV, calcula o histórico mensal e grava na coleção `historico`. Rodar após o sync_firebase.

**Python path:** `C:\Users\Cliente\AppData\Local\Programs\Python\Python311\python.exe`

**No app:** ler do Firestore com `onSnapshot` (tempo real). Atualizei a planilha + rodei os dois syncs → a tela atualiza sozinha.

**Três fontes distintas de dado (não confundir):**
1. **Excel → Firestore:** lançamentos e proventos (fatos históricos).
2. **Calculado no app** a partir dos lançamentos: posição por ativo (quantidade, preço médio/PM, custo) e patrimônio.
3. **Preços e benchmarks históricos** — buscados pelo `sync_historico.py` e gravados no Firestore:
   - **yfinance** (gratuito, sem token): preços mensais de fechamento de todos os ativos (`auto_adjust=False`), IBOV (`^BVSP`).
   - **Banco Central — API SGS** (pública, sem token): CDI diário → acumulado mensal. Código 12. URL: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=DD/MM/YYYY&dataFinal=DD/MM/YYYY`
   - Tickers deslistados sem dados (ex: ENBR3, SQIA3): excluídos automaticamente pelo sync.

## 3. Schema do Firestore (implementado)
Os dados são **por usuário**: caminho `users/{uid}/...`.

- `users/{uid}/lancamentos/{id}`
  `{ data: timestamp, ativo: string, qtd: number, valor: number, total: number, tipo: 'COMPRA'|'VENDA'|'BONIF', hash: string }`
- `users/{uid}/proventos/{id}`
  `{ data: timestamp, ativo: string, valor: number, tipo: 'DIV'|'JCP'|'RENDIMENTO', hash: string }`
- `users/{uid}/posicoes/{ticker}`
  `{ ticker, qtd, pm, custo, patrimonio, rentabilidadePct, rentabilidadeRS, proventos, yieldOnCost, classe }`
- `users/{uid}/resumo/carteira`
  `{ patrimonio, custo, proventos, rentabilidadePct, rentabilidadeRS, yieldOnCost }`
- `users/{uid}/historico/{YYYY-MM}`
  `{ mes: string, patrimonio: number, custo: number, custo_bruto: number, custo_rastreavel: number, proventos_acum: number, cota: number, ibov: number, cdi_fator: number }`

## 4. Metodologia do benchmark (Carteira vs. CDI vs. IBOV)

**Curva de cota — retorno total encadeado**, gravada no campo `cota` de cada documento `historico`:

```
R[t] = (Σ(qtd[t-1] × preço[t]) + dividendos_recebidos[t]) / patrimônio[t-1] − 1
cota[t] = cota[t-1] × (1 + R[t])
```

- `qtd[t-1]` = posições no fim do mês anterior (novos aportes do mês atual excluídos)
- `preço[t]` = fechamento do mês atual (fallback: fechamento do mês anterior)
- `dividendos_recebidos[t]` = soma de DIV + JCP + RENDIMENTO recebidos no mês t
- Denominador = só valor das ações (`patrimônio[t-1]`), sem acumular dividendos passados
- Equivale a reinvestimento imediato — justo para comparar com CDI e IBOV (retorno total)

**No frontend** (`GraficoBenchmark` e `rentPeriodo` em `Carteira.jsx`):
- Qualquer período = `cota[fim] / cota[início] − 1`, rebaseado para 100 no início do período
- CDI acumulado via `cdi_fator` (produto dos fatores mensais)
- IBOV via `ibov` (preço do índice), rebaseado para 100

**Referência original:** metodologia de base extraída de `C:\Users\Cliente\Desktop\Valuation\PopularHistorico.ps1` (planilha do usuário), estendida para retorno total com proventos.

## 5. Ordem de construção — estado atual

✅ **0. Setup:** Vite + React rodando no localhost.
✅ **1. Login:** Firebase Auth (e-mail/senha) + rota protegida.
✅ **2. Layout base:** cabeçalho, abas Carteira/Mercado, tema escuro.
✅ **3. Ligação Firestore:** `lancamentos` e `proventos` em tempo real.
✅ **4. Posições:** qtd, PM, custo por ativo (com BONIF e abate de DIV/JCP).
✅ **5. KPIs + Patrimônio:** faixa de indicadores no topo da página Carteira.
✅ **6. Período + Composição:** botões 6M/1A/2A/3A/5A/Máx + rosca de 2 níveis (classe interna, ativo externo) com rentabilidade do período no centro.
✅ **7. Evolução patrimonial:** área (patrimônio vs. custo aportado), reagindo ao período.
✅ **8. Carteira vs. Benchmark:** linhas base 100 (carteira retorno total, CDI, IBOV), reagindo ao período.
✅ **9. Agenda de proventos:** 12 meses (5 recebidos, mês atual, 6 a receber estimados).
✅ **10. Rankings:** rentabilidade e dividendos (yield on cost).
✅ **11. Evolução dos dividendos:** barras anuais + média móvel 12m.
✅ **12. Mapa de calor de dividendos:** ativo × mês, intensidade = valor recebido.
✅ **13. Página Mercado — barra de índices:** cards de Ibovespa, S&P 500, IFIX, BTC, Dólar, Brent, Minério, Ouro.

⏳ **14. Treemap de variação do dia:** agrupado por setor; tamanho = valor de mercado (`qtd × cotação`); cor = variação do dia.
⏳ **15. Lista estilo Google Finance:** Ativo · Setor · Segmento · PM · Cotação · Rentabilidade · sparkline do mês.
⏳ **16. (Depois)** Empacotar para Android com Capacitor.

## 6. Componentes que migram do protótipo quase como estão
- **Treemap (squarify), mapa de calor (grade) e sparkline (SVG):** o protótipo já tem em JS/SVG/CSS puro — reaproveite a lógica, só adapte para componente React.
- **Rosca, linhas e barras:** feitos com Recharts.

## 7. Segurança e segredos
- Chaves do Firebase em `.env` (`VITE_...`), nunca no código versionado nem no chat.
- `firebase-key.json` — chave de serviço do Firebase Admin (usada pelos scripts Python). **Nunca commitar.**
- Regras do Firestore: cada usuário só lê/escreve os próprios dados.
- Login obrigatório para qualquer dado.
- USER_UID do usuário: `3zESUj8nuPN1ViGpyCxnkJGIJYL2`

## 8. Hospedagem (gratuita)
- **Firebase Hosting** (recomendado — mesmo ecossistema do Auth/Firestore, plano grátis). Deploy com `firebase deploy`.
- Alternativas grátis: **Netlify** (deploy automático a cada `git push`, ok para uso pessoal e comercial) e **Vercel** (Hobby grátis, uso pessoal/não-comercial).
- O plano gratuito do Firebase (Spark) cobre hosting + Firestore para uso pessoal, com limites diários de leitura/escrita folgados para um único usuário.
