import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'

/* ── helpers ──────────────────────────────────────────────────────────── */
const fmt   = v => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK  = v => { if (v == null) return '—'; return v >= 1000 ? `R$ ${(v/1000).toFixed(0)}k` : fmt(v) }
const fmtKx = v => { if (!v) return ''; return v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v.toFixed(0)}` }
const fmtP  = (v, c=1) => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v*100).toFixed(c)}%`
const fmtP2 = (v, c=1) => v == null ? '—' : `${(v*100).toFixed(c)}%`
const CORES = { Acao:'#4d94e8', FII:'#1d9e75', ETF:'#7f77dd', BDR:'#e07a52', RF:'#888780' }
const NOMES = { Acao:'Ações', FII:'FIIs', ETF:'ETFs', BDR:'BDRs', RF:'Renda Fixa' }
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const TT_STYLE = { background:'#1c212b', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:12 }
const TIPOS_REND = new Set(['DIV', 'JCP', 'RENDIMENTO', 'RENDIMENTOS'])
const PERIODOS = ['6M', '1A', '2A', '3A', '5A', 'Max']
const MESES_ATRAS = { '6M': 6, '1A': 12, '2A': 24, '3A': 36, '5A': 60, 'Max': null }

function mesLabel(mes) {
  const m = parseInt(mes.slice(5, 7)) - 1
  return `${MESES[m]}/${mes.slice(2, 4)}`
}
function filtrarHist(historico, periodo) {
  const sorted = [...historico].sort((a, b) => a.mes.localeCompare(b.mes))
  const n = MESES_ATRAS[periodo]
  return n == null ? sorted : sorted.slice(-n)
}

/* ── Rosca ────────────────────────────────────────────────────────────── */
function RoscaComposicao({ posicoes, rentPeriodo }) {
  const porClasse = {}
  posicoes.forEach(p => {
    const c = p.classe || 'Acao'
    if (!porClasse[c]) porClasse[c] = { total: 0, ativos: [] }
    porClasse[c].total += p.patrimonio || 0
    porClasse[c].ativos.push(p)
  })
  const totalGeral = Object.values(porClasse).reduce((s, c) => s + c.total, 0)

  const interno = Object.entries(porClasse)
    .filter(([, c]) => c.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cls, c]) => ({ name: NOMES[cls] || cls, value: c.total, cls, cor: CORES[cls] || '#888' }))

  const externo = interno.flatMap(({ cls }) =>
    (porClasse[cls]?.ativos || [])
      .filter(p => p.patrimonio > 0)
      .sort((a, b) => b.patrimonio - a.patrimonio)
      .map(p => ({ name: p.ticker, value: p.patrimonio, cor: CORES[cls] || '#888' }))
  )

  const TooltipRosca = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    const pct = (d.value / totalGeral * 100).toFixed(1)
    return (
      <div style={{ ...TT_STYLE, padding: '8px 12px' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
        <div>{fmt(d.value)}</div>
        <div style={{ color: 'var(--mut)' }}>{pct}% do patrimônio</div>
      </div>
    )
  }

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 12px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>Composição da carteira</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:12 }}>composição atual · rentabilidade no período</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:12 }}>
        {interno.map(d => (
          <span key={d.name} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--mut)' }}>
            <span style={{ width:10, height:10, borderRadius:2, background:d.cor, display:'inline-block' }} />
            {d.name} {(d.value/totalGeral*100).toFixed(1)}%
          </span>
        ))}
      </div>
      <div style={{ position:'relative', height:270 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={interno} cx="50%" cy="50%" innerRadius={54} outerRadius={80}
              dataKey="value" stroke="#161a22" strokeWidth={2} label={false} labelLine={false}>
              {interno.map(d => <Cell key={d.name} fill={d.cor} />)}
            </Pie>
            <Pie data={externo} cx="50%" cy="50%" innerRadius={86} outerRadius={115}
              dataKey="value" stroke="#161a22" strokeWidth={1} label={false} labelLine={false}>
              {externo.map(d => <Cell key={d.name} fill={d.cor} opacity={0.65} />)}
            </Pie>
            <Tooltip content={<TooltipRosca />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
          <div style={{ fontSize:11, color:'var(--mut)' }}>Patrimônio</div>
          <div style={{ fontSize:18, fontWeight:600 }}>{fmtK(totalGeral)}</div>
          {rentPeriodo != null && (
            <div style={{ fontSize:13, fontWeight:600, color: rentPeriodo >= 0 ? 'var(--pos)' : 'var(--neg)', marginTop:3 }}>
              {fmtP(rentPeriodo)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Evolução Patrimonial ─────────────────────────────────────────────── */
function GraficoPatrimonio({ dados }) {
  const data = dados.map(d => ({
    label:      mesLabel(d.mes),
    patrimonio: d.patrimonio  || 0,
    custo:      d.custo_bruto || 0,
  }))
  const maxVal      = Math.max(...data.map(d => d.patrimonio), 1)
  const tickInterval = Math.max(0, Math.ceil(data.length / 6) - 1)

  const TooltipPat = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const pat = payload.find(p => p.dataKey === 'patrimonio')
    const cst = payload.find(p => p.dataKey === 'custo')
    return (
      <div style={{ ...TT_STYLE, padding:'8px 12px' }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
        {pat && <div style={{ color:'#4d94e8' }}>Patrimônio: <b>{fmt(pat.value)}</b></div>}
        {cst && <div style={{ color:'#9aa0aa' }}>Custo: <b>{fmt(cst.value)}</b></div>}
      </div>
    )
  }

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 12px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>Evolução patrimonial</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:12 }}>custo aportado vs. patrimônio a mercado</div>
      <div style={{ display:'flex', gap:16, marginBottom:10, fontSize:12, color:'var(--mut)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:10, height:10, borderRadius:2, background:'#4d94e8', display:'inline-block' }}/>Patrimônio
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:16, borderTop:'2px dashed #888780', display:'inline-block' }}/>Custo
        </span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top:8, right:8, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9aa0aa' }} axisLine={false} tickLine={false} interval={tickInterval} />
          <YAxis
            domain={[0, Math.ceil(maxVal * 1.12 / 10000) * 10000]}
            tickFormatter={v => `R$${Math.round(v/1000)}k`}
            tick={{ fontSize:10, fill:'#9aa0aa' }} axisLine={false} tickLine={false} width={60}
          />
          <Tooltip content={<TooltipPat />} />
          <Area type="monotone" dataKey="patrimonio" stroke="#4d94e8" strokeWidth={2}   fill="#4d94e8" fillOpacity={0.10} />
          <Area type="monotone" dataKey="custo"      stroke="#888780" strokeWidth={1.5} fill="#888780" fillOpacity={0.05} strokeDasharray="5 4" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── Carteira vs. Benchmark ───────────────────────────────────────────── */
function GraficoBenchmark({ dados }) {
  if (!dados.length) return null

  // usa cota (TWR com base em custo_rastreavel): imune a vendas parciais/totais
  // e a tickers sem dados de preço (ENBR3, SQIA3 excluídos do denominador no sync)
  const startIdx = Math.max(0, dados.findIndex(d => d.cota > 0 && d.ibov > 0 && d.patrimonio > 0))
  const cotaBase = dados[startIdx].cota
  const ibovBase = dados[startIdx].ibov

  let cdiAcum = 1.0
  const data = dados.map((d, i) => {
    const antes = i < startIdx
    if (!antes && i > startIdx) cdiAcum *= (d.cdi_fator || 1)
    const carteira = (!antes && cotaBase > 0 && d.cota != null) ? +((d.cota / cotaBase) * 100).toFixed(2) : null
    return {
      label:    mesLabel(d.mes),
      carteira,
      cdi:  antes ? null : +(cdiAcum * 100).toFixed(2),
      ibov: (!antes && d.ibov) ? +((d.ibov / ibovBase) * 100).toFixed(2) : null,
    }
  })
  const tickInterval = Math.max(0, Math.ceil(data.length / 6) - 1)
  const allVals = data.flatMap(d => [d.carteira, d.cdi, d.ibov]).filter(v => v != null)
  const minVal  = Math.min(...allVals, 90)
  const maxVal  = Math.max(...allVals, 110)

  const TooltipBench = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const get = key => payload.find(p => p.dataKey === key)
    const pct = v => v != null ? `${v >= 100 ? '+' : ''}${(v - 100).toFixed(1)}%` : '—'
    return (
      <div style={{ ...TT_STYLE, padding:'8px 12px' }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
        {get('carteira') && <div style={{ color:'#7f77dd' }}>Carteira: <b>{pct(get('carteira').value)}</b></div>}
        {get('cdi')      && <div style={{ color:'#888780' }}>CDI: <b>{pct(get('cdi').value)}</b></div>}
        {get('ibov')     && <div style={{ color:'#e07a52' }}>IBOV: <b>{pct(get('ibov').value)}</b></div>}
      </div>
    )
  }

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 12px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>Carteira vs. benchmark</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:12 }}>base 100 · rentabilidade acumulada</div>
      <div style={{ display:'flex', gap:16, marginBottom:10, fontSize:12, color:'var(--mut)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:16, borderTop:'2px solid #7f77dd', display:'inline-block' }}/>Carteira
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:16, borderTop:'2px dashed #888780', display:'inline-block' }}/>CDI
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:16, borderTop:'2px dotted #e07a52', display:'inline-block' }}/>IBOV
        </span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top:8, right:8, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9aa0aa' }} axisLine={false} tickLine={false} interval={tickInterval} />
          <YAxis
            domain={[Math.floor(minVal * 0.97), Math.ceil(maxVal * 1.03)]}
            tickFormatter={v => v.toFixed(0)}
            tick={{ fontSize:10, fill:'#9aa0aa' }} axisLine={false} tickLine={false} width={40}
          />
          <Tooltip content={<TooltipBench />} />
          <Line type="monotone" dataKey="carteira" stroke="#7f77dd" strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="cdi"      stroke="#888780" strokeWidth={2}   strokeDasharray="6 4" dot={false} />
          <Line type="monotone" dataKey="ibov"     stroke="#e07a52" strokeWidth={2}   strokeDasharray="2 3" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── Ranking ──────────────────────────────────────────────────────────── */
function Ranking({ titulo, subtitulo, itens }) {
  const max = Math.max(...itens.map(i => Math.abs(i.valor)), 1)
  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 8px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>{titulo}</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:14 }}>{subtitulo}</div>
      {itens.map((it, i) => (
        <div key={it.ticker} style={{ display:'grid', gridTemplateColumns:'18px 56px 1fr auto', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < itens.length-1 ? '0.5px solid var(--border)' : 'none' }}>
          <span style={{ fontSize:11, color:'var(--dim)', textAlign:'center' }}>{i+1}</span>
          <span style={{ fontSize:12, fontWeight:600 }}>{it.ticker}</span>
          <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
            <div style={{ width:`${Math.min(Math.abs(it.valor)/max*100,100)}%`, height:'100%', borderRadius:3, background:it.cor||'var(--teal)' }} />
          </div>
          <span style={{ fontSize:12, fontWeight:600, textAlign:'right', whiteSpace:'nowrap', color:it.cor }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Evolução Dividendos ──────────────────────────────────────────────── */
function EvolucaoDividendos({ proventos }) {
  const porAno = {}
  proventos.filter(p => TIPOS_REND.has(p.tipo)).forEach(p => {
    const d = p.data?.toDate ? p.data.toDate() : new Date(p.data)
    const ano = d.getUTCFullYear()
    if (!porAno[ano]) porAno[ano] = { total: 0, meses: new Set() }
    porAno[ano].total += p.valor || 0
    porAno[ano].meses.add(d.getUTCMonth())
  })

  const anoAtual = new Date().getFullYear()
  const dados = Object.entries(porAno)
    .filter(([a]) => Number(a) >= 2019 && Number(a) <= anoAtual + 1)
    .sort(([a],[b]) => Number(a)-Number(b))
    .map(([ano, v]) => ({
      ano: String(ano),
      total: v.total,
      media: v.total / 12,
      parcial: Number(ano) === anoAtual || Number(ano) === 2019,
    }))

  const maxVal = Math.max(...dados.map(d => d.total), 1)
  const TooltipDiv = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const bar  = payload.find(p => p.dataKey === 'total')
    const line = payload.find(p => p.dataKey === 'media')
    return (
      <div style={{ ...TT_STYLE, padding:'8px 12px' }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
        {bar  && <div>Total: <b>{fmt(bar.value)}</b></div>}
        {line && <div style={{ color:'#e07a52' }}>Média mensal: <b>{fmt(line.value)}</b></div>}
      </div>
    )
  }

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 12px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>Evolução dos dividendos</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:16 }}>total por ano · linha = média mensal</div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={dados} margin={{ top:8, right:8, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="ano" tick={{ fontSize:11, fill:'#9aa0aa' }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, Math.ceil(maxVal * 1.15 / 1000) * 1000]}
            tickFormatter={fmtKx}
            tick={{ fontSize:11, fill:'#9aa0aa' }} axisLine={false} tickLine={false} width={56}
          />
          <Tooltip content={<TooltipDiv />} />
          <Bar dataKey="total" radius={[4,4,0,0]}>
            {dados.map(d => <Cell key={d.ano} fill={d.parcial ? '#9fe1cb' : '#1d9e75'} />)}
          </Bar>
          <Line dataKey="media" type="monotone" stroke="#e07a52" strokeWidth={2} strokeDasharray="4 3" dot={{ r:3, fill:'#e07a52', strokeWidth:0 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display:'flex', gap:16, marginTop:10, fontSize:12, color:'var(--mut)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#1d9e75', display:'inline-block' }}/>Recebido no ano</span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#9fe1cb', display:'inline-block' }}/>Ano parcial</span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:16, borderTop:'2px dashed #e07a52', display:'inline-block' }}/>Média mensal</span>
      </div>
    </div>
  )
}

/* ── Agenda de Proventos ──────────────────────────────────────────────── */
function AgendaProventos({ proventos }) {
  const hoje     = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth()

  const janelas = []
  for (let i = -5; i <= 6; i++) {
    const d = new Date(anoAtual, mesAtual + i, 1)
    janelas.push({ ano: d.getFullYear(), mes: d.getMonth(), tipo: i < 0 ? 'recebido' : i === 0 ? 'atual' : 'futuro' })
  }

  const porAnoMes = {}
  proventos.filter(p => TIPOS_REND.has(p.tipo)).forEach(p => {
    const d = p.data?.toDate ? p.data.toDate() : new Date(p.data)
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    porAnoMes[key] = (porAnoMes[key] || 0) + (p.valor || 0)
  })

  const histMes = {}
  proventos.filter(p => TIPOS_REND.has(p.tipo)).forEach(p => {
    const d = p.data?.toDate ? p.data.toDate() : new Date(p.data)
    const ano = d.getUTCFullYear(), mes = d.getUTCMonth()
    if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) {
      if (!histMes[mes]) histMes[mes] = {}
      histMes[mes][ano] = (histMes[mes][ano] || 0) + (p.valor || 0)
    }
  })

  function estimar(mes) {
    const h = histMes[mes]
    if (!h) return 0
    const anos = Object.keys(h).map(Number).sort((a,b) => b-a).slice(0, 3)
    return anos.reduce((s, a) => s + h[a], 0) / anos.length
  }

  const dados = janelas.map(({ ano, mes, tipo }) => {
    const valor = (tipo === 'recebido' || tipo === 'atual')
      ? (porAnoMes[`${ano}-${mes}`] || 0)
      : estimar(mes)
    return { label: `${MESES[mes]}/${String(ano).slice(2)}`, valor: Math.round(valor), tipo }
  })

  const maxVal = Math.max(...dados.map(d => d.valor), 1)
  const corBarra = tipo => tipo === 'recebido' ? '#1d9e75' : tipo === 'atual' ? '#4d94e8' : '#9fe1cb'

  const totalRecebido = dados.filter(d => d.tipo !== 'futuro').reduce((s,d) => s+d.valor, 0)
  const totalEstimado = dados.filter(d => d.tipo === 'futuro').reduce((s,d) => s+d.valor, 0)

  const TooltipAgenda = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    const label = d.tipo === 'recebido' ? 'Recebido' : d.tipo === 'atual' ? 'Mês atual' : 'Estimado'
    return (
      <div style={{ ...TT_STYLE, padding:'8px 12px' }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>{d.label}</div>
        <div style={{ color: corBarra(d.tipo) }}>{label}: <b>{fmt(d.valor)}</b></div>
      </div>
    )
  }

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 12px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>Agenda de proventos</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:14 }}>12 meses · 5 recebidos · mês atual · 6 a receber (estimativa pela média histórica)</div>

      <div style={{ display:'flex', gap:24, marginBottom:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:11, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Últimos 6 meses</div>
          <div style={{ fontSize:20, fontWeight:600, color:'var(--teal)' }}>{fmt(totalRecebido)}</div>
        </div>
        <div>
          <div style={{ fontSize:11, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Próximos 6 meses (est.)</div>
          <div style={{ fontSize:20, fontWeight:600, color:'#9fe1cb' }}>{fmt(totalEstimado)}</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={dados} margin={{ top:8, right:8, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9aa0aa' }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, Math.ceil(maxVal * 1.2 / 500) * 500]}
            tickFormatter={fmtKx}
            tick={{ fontSize:11, fill:'#9aa0aa' }} axisLine={false} tickLine={false} width={56}
          />
          <Tooltip content={<TooltipAgenda />} />
          <Bar dataKey="valor" radius={[4,4,0,0]}>
            {dados.map(d => <Cell key={d.label} fill={corBarra(d.tipo)} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ display:'flex', gap:16, marginTop:10, fontSize:12, color:'var(--mut)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#1d9e75', display:'inline-block' }}/>Recebido</span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#4d94e8', display:'inline-block' }}/>Mês atual</span>
        <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#9fe1cb', display:'inline-block' }}/>A receber (estimado)</span>
      </div>
    </div>
  )
}

/* ── Mapa de Calor por Ativo ──────────────────────────────────────────── */
function MapaCalor({ proventos }) {
  const porAno = {}
  proventos.filter(p => TIPOS_REND.has(p.tipo)).forEach(p => {
    const d = p.data?.toDate ? p.data.toDate() : new Date(p.data)
    const ano = d.getUTCFullYear(), mes = d.getUTCMonth()
    const ativo = p.ativo
    if (!porAno[ano]) porAno[ano] = {}
    if (!porAno[ano][ativo]) porAno[ano][ativo] = Array(12).fill(0)
    porAno[ano][ativo][mes] += p.valor || 0
  })

  const anoAtualHM = new Date().getFullYear()
  const anos = Object.keys(porAno)
    .filter(a => Number(a) >= 2019 && Number(a) <= anoAtualHM + 1)
    .filter(a => Object.values(porAno[a]).some(meses => meses.some(v => v > 0)))
    .sort()
  const [anoSel, setAnoSel] = useState(anos[anos.length - 1])
  const dadosAno = porAno[anoSel] || {}

  const ativos = Object.entries(dadosAno)
    .map(([tk, meses]) => ({ tk, meses, total: meses.reduce((s,v)=>s+v,0) }))
    .filter(a => a.total > 0)
    .sort((a,b) => b.total - a.total)

  const totaisMes = Array(12).fill(0)
  ativos.forEach(a => a.meses.forEach((v,i) => { totaisMes[i] += v }))
  const totalGeral = ativos.reduce((s,a)=>s+a.total,0)

  const maxVal = Math.max(...ativos.flatMap(a => a.meses), 1)
  function cor(v) {
    if (!v || v <= 0) return 'rgba(255,255,255,0.04)'
    const t = Math.pow(v / maxVal, 0.55)
    const opacity = 0.22 + 0.78 * t
    return `rgba(29,158,117,${opacity.toFixed(2)})`
  }
  function corTexto(v) {
    if (!v || v <= 0) return 'transparent'
    const t = Math.pow(v / maxVal, 0.55)
    return t > 0.45 ? '#fff' : 'rgba(255,255,255,0.7)'
  }
  function fmtCelula(v) {
    if (!v || v <= 0) return ''
    if (v >= 1000) return `R$${(v/1000).toFixed(1)}k`
    return `R$${Math.round(v)}`
  }

  const [hover, setHover] = useState(null)

  return (
    <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'18px 18px 16px' }}>
      <div style={{ fontSize:14, fontWeight:600 }}>Mapa de calor de dividendos</div>
      <div style={{ fontSize:12, color:'var(--mut)', marginBottom:12 }}>ativo × mês · intensidade = valor recebido · {anoSel}</div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
        {anos.map(a => (
          <button key={a} onClick={() => setAnoSel(a)} style={{
            padding:'5px 12px', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'inherit',
            background: anoSel===a ? 'var(--card2)' : 'transparent',
            border:`0.5px solid ${anoSel===a ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}`,
            color: anoSel===a ? 'var(--text)' : 'var(--mut)', fontWeight: anoSel===a ? 600 : 400,
          }}>{a}</button>
        ))}
      </div>

      <div style={{ fontSize:24, fontWeight:600, marginBottom:14 }}>
        {fmt(totalGeral)} <span style={{ fontSize:13, color:'var(--mut)', fontWeight:400 }}>recebido em {anoSel}</span>
      </div>

      <div style={{ overflowX:'auto' }}>
        <div style={{ minWidth:620 }}>
          <div style={{ display:'grid', gridTemplateColumns:'72px repeat(12, 1fr) 72px', gap:3, marginBottom:3 }}>
            <div />
            {MESES.map(m => <div key={m} style={{ fontSize:10, fontWeight:500, color:'var(--mut)', textAlign:'center' }}>{m}</div>)}
            <div style={{ fontSize:10, color:'var(--mut)', textAlign:'right' }}>Total</div>
          </div>

          {ativos.map(({ tk, meses, total }) => (
            <div key={tk} style={{ display:'grid', gridTemplateColumns:'72px repeat(12, 1fr) 72px', gap:3, marginBottom:3 }}>
              <div style={{ fontSize:11, fontWeight:600, display:'flex', alignItems:'center', paddingRight:4 }}>{tk}</div>
              {meses.map((v, i) => (
                <div key={i}
                  onMouseEnter={() => setHover({ tk, mes: MESES[i], val: v })}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    height:32, borderRadius:4, background:cor(v),
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:9, fontWeight:600, color:corTexto(v),
                    cursor: v > 0 ? 'default' : undefined,
                  }}
                  title={v > 0 ? `${tk} · ${MESES[i]}/${anoSel}: ${fmt(v)}` : ''}
                >
                  {fmtCelula(v)}
                </div>
              ))}
              <div style={{ fontSize:11, fontWeight:600, textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', color:'var(--mut)' }}>{fmt(total)}</div>
            </div>
          ))}

          <div style={{ display:'grid', gridTemplateColumns:'72px repeat(12, 1fr) 72px', gap:3, marginTop:6, borderTop:'0.5px solid var(--border)', paddingTop:6 }}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--mut)', display:'flex', alignItems:'center' }}>Total</div>
            {totaisMes.map((v, i) => (
              <div key={i} style={{ fontSize:10, fontWeight:600, textAlign:'center', color: v>0 ? 'var(--text)' : 'var(--dim)' }}>
                {v > 0 ? fmtKx(v) : '—'}
              </div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, textAlign:'right', color:'var(--teal)' }}>{fmt(totalGeral)}</div>
          </div>
        </div>
      </div>

      {hover && hover.val > 0 && (
        <div style={{ marginTop:10, fontSize:12, color:'var(--mut)' }}>
          <b style={{ color:'var(--text)' }}>{hover.tk}</b> em {hover.mes}/{anoSel}: <b style={{ color:'var(--teal)' }}>{fmt(hover.val)}</b>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:14, fontSize:11, color:'var(--mut)' }}>
        <span>Menor</span>
        <div style={{ display:'flex', gap:2 }}>
          {[0.08, 0.2, 0.38, 0.55, 0.75, 1].map(t => (
            <span key={t} style={{ width:20, height:12, borderRadius:2, background:cor(t*maxVal), display:'inline-block' }} />
          ))}
        </div>
        <span>Maior</span>
      </div>
    </div>
  )
}

/* ── página principal ─────────────────────────────────────────────────── */
export default function Carteira() {
  const user = useAuth()
  const [posicoes,   setPosicoes]   = useState([])
  const [resumo,     setResumo]     = useState(null)
  const [proventos,  setProventos]  = useState([])
  const [historico,  setHistorico]  = useState([])
  const [periodo,    setPeriodo]    = useState('1A')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const u1 = onSnapshot(collection(db, `users/${user.uid}/posicoes`), snap => {
      setPosicoes(snap.docs.map(d => d.data()).filter(p => p.qtd > 0).sort((a,b) => (b.patrimonio||0)-(a.patrimonio||0)))
      setCarregando(false)
    })
    const u2 = onSnapshot(doc(db, `users/${user.uid}/resumo/carteira`), snap => {
      if (snap.exists()) setResumo(snap.data())
    })
    const u3 = onSnapshot(collection(db, `users/${user.uid}/proventos`), snap => {
      setProventos(snap.docs.map(d => d.data()))
    })
    const u4 = onSnapshot(collection(db, `users/${user.uid}/historico`), snap => {
      setHistorico(snap.docs.map(d => d.data()))
    })
    return () => { u1(); u2(); u3(); u4() }
  }, [user.uid])

  if (carregando) return <div style={{ color:'var(--dim)', textAlign:'center', padding:40 }}>Carregando...</div>

  const dadosFiltrados = filtrarHist(historico, periodo)
  const rentPeriodo = (() => {
    const first = dadosFiltrados.find(d => d.cota > 0 && d.patrimonio > 0)
    const last  = dadosFiltrados[dadosFiltrados.length - 1]
    if (!first || !last || !last.cota) return null
    return last.cota / first.cota - 1
  })()

  const rankRent = [...posicoes]
    .filter(p => p.rentabilidadePct != null)
    .sort((a,b) => b.rentabilidadePct - a.rentabilidadePct)
    .slice(0, 8)
    .map(p => ({ ticker:p.ticker, valor:p.rentabilidadePct, label:fmtP(p.rentabilidadePct), cor: p.rentabilidadePct >= 0 ? 'var(--pos)' : 'var(--neg)' }))

  const rankDiv = [...posicoes]
    .filter(p => p.proventos > 0)
    .sort((a,b) => b.proventos - a.proventos)
    .slice(0, 8)
    .map(p => ({ ticker:p.ticker, valor:p.proventos, label:`${fmt(p.proventos)} · YoC ${fmtP2(p.yieldOnCost,1)}`, cor:'var(--blue)' }))

  /* ── botão de período ─────────────────────────────────────────────── */
  const btnPeriodo = p => (
    <button key={p} onClick={() => setPeriodo(p)} style={{
      minWidth:46, padding:'6px 12px', fontFamily:'inherit', fontSize:13, cursor:'pointer', borderRadius:8,
      border:  `0.5px solid ${periodo === p ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'}`,
      background: periodo === p ? 'var(--card2)' : 'transparent',
      color:      periodo === p ? 'var(--text)'  : 'var(--mut)',
      fontWeight: periodo === p ? 500 : 400,
    }}>{p}</button>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Patrimônio + botões de período */}
      {resumo && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:14 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--mut)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Patrimônio</div>
            <div style={{ fontSize:32, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1.2 }}>{fmt(resumo.patrimonio)}</div>
            <div style={{ fontSize:13, color: resumo.rentabilidadeRS >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight:500, marginTop:2 }}>
              {fmtP(resumo.rentabilidadePct)} · {fmt(resumo.rentabilidadeRS)}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingBottom:4 }}>
            {PERIODOS.map(btnPeriodo)}
          </div>
        </div>
      )}

      {/* KPIs */}
      {resumo && (
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {[
            { k:'Custo investido',  v:fmt(resumo.custo),          cor:'var(--text)' },
            { k:'Proventos totais', v:fmt(resumo.proventos),      cor:'var(--teal)' },
            { k:'Yield on cost',    v:fmtP2(resumo.yieldOnCost),  cor:'var(--teal)' },
            { k:'Ativos',          v:posicoes.length,             cor:'var(--text)' },
          ].map(k => (
            <div key={k.k} style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding:'12px 18px', flex:'1 1 140px' }}>
              <div style={{ fontSize:11, color:'var(--mut)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.k}</div>
              <div style={{ fontSize:18, fontWeight:600, color:k.cor }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Gráficos em grade — reagem ao período */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px,1fr))', gap:16 }}>
        <RoscaComposicao posicoes={posicoes} rentPeriodo={rentPeriodo} />
        <GraficoPatrimonio dados={dadosFiltrados} />
        <GraficoBenchmark  dados={dadosFiltrados} />
        <AgendaProventos   proventos={proventos} />
        <Ranking titulo="Ranking de rentabilidade" subtitulo="retorno total por ativo" itens={rankRent} />
        <Ranking titulo="Ranking de dividendos"    subtitulo="proventos recebidos · yield on cost" itens={rankDiv} />
      </div>

      <EvolucaoDividendos proventos={proventos} />
      <MapaCalor proventos={proventos} />
    </div>
  )
}
