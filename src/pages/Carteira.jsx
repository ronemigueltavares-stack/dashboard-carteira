import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'

const TIPOS_RENDIMENTO = ['DIV', 'JCP', 'RENDIMENTO']

function calcularPosicoes(lancamentos, proventos) {
  const mapa = {}

  for (const l of lancamentos) {
    const tk = l.ativo
    if (!mapa[tk]) mapa[tk] = { ativo: tk, qtd: 0, custo: 0, proventos: 0 }

    if (l.tipo === 'COMPRA' || l.tipo === 'BONIF') {
      // BONIF = ações bonificadas: entra como custo e quantidade
      mapa[tk].qtd   += l.qtd   ?? 0
      mapa[tk].custo += l.total ?? 0
    } else if (l.tipo === 'VENDA') {
      const pmAtual = mapa[tk].qtd > 0 ? mapa[tk].custo / mapa[tk].qtd : 0
      mapa[tk].qtd   -= l.qtd ?? 0
      mapa[tk].custo -= pmAtual * (l.qtd ?? 0)
    }
  }

  for (const p of proventos) {
    const tk = p.ativo
    // Só abate DIV/JCP/RENDIMENTO — BONIF já entrou pelo lançamento
    if (mapa[tk] && TIPOS_RENDIMENTO.includes(p.tipo)) {
      mapa[tk].proventos += p.valor ?? 0
    }
  }

  return Object.values(mapa)
    .filter(p => p.qtd > 0.001)
    .map(p => {
      const custoAjustado = Math.max(p.custo - p.proventos, 0)
      return {
        ...p,
        custoAjustado,
        pm:        p.custo / p.qtd,
        pmAjustado: custoAjustado / p.qtd,
      }
    })
    .sort((a, b) => b.custo - a.custo)
}

function fmt(v) {
  if (v == null) return '-'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtQtd(v) {
  if (v == null) return '-'
  return Number.isInteger(v) ? v : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function Carteira() {
  const user = useAuth()
  const [posicoes, setPosicoes] = useState([])
  const [total, setTotal] = useState(0)
  const [totalProventos, setTotalProventos] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [lancamentos, setLancamentos] = useState(null)
  const [proventos, setProventos]     = useState(null)

  useEffect(() => {
    const unsubL = onSnapshot(collection(db, `users/${user.uid}/lancamentos`), snap => {
      setLancamentos(snap.docs.map(d => d.data()))
    })
    const unsubP = onSnapshot(collection(db, `users/${user.uid}/proventos`), snap => {
      setProventos(snap.docs.map(d => d.data()))
    })
    return () => { unsubL(); unsubP() }
  }, [user.uid])

  useEffect(() => {
    if (lancamentos === null || proventos === null) return
    const pos = calcularPosicoes(lancamentos, proventos)
    setPosicoes(pos)
    setTotal(pos.reduce((s, p) => s + p.custo, 0))
    setTotalProventos(pos.reduce((s, p) => s + p.proventos, 0))
    setCarregando(false)
  }, [lancamentos, proventos])

  if (carregando) {
    return (
      <div style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', padding: 40 }}>
        Calculando posições...
      </div>
    )
  }

  const custoAjustadoTotal = posicoes.reduce((s, p) => s + p.custoAjustado, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Cards de resumo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Ativos em carteira',    valor: posicoes.length,            cor: 'var(--text)' },
          { label: 'Custo total investido', valor: fmt(total),                  cor: 'var(--teal)' },
          { label: 'Proventos recebidos',   valor: fmt(totalProventos),         cor: 'var(--blue)' },
          { label: 'Custo ajustado',        valor: fmt(custoAjustadoTotal),     cor: 'var(--pos)'  },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--card)', border: '0.5px solid var(--border)',
            borderRadius: 12, padding: '14px 20px', flex: '1 1 160px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: k.cor }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela de posições */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 18px 8px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Posições atuais</div>
        <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 16 }}>
          {posicoes.length} ativos · PM ajustado = (custo − proventos) ÷ quantidade
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                {['#', 'Ativo', 'Qtd', 'PM original', 'Proventos', 'PM ajustado', 'Custo', '% Cart.'].map((h, i) => (
                  <th key={h} style={{
                    padding: '0 10px 10px',
                    textAlign: i <= 1 ? 'left' : 'right',
                    fontSize: 11, color: i === 5 ? 'var(--pos)' : 'var(--mut)',
                    fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posicoes.map((p, i) => {
                const pct = total > 0 ? (p.custo / total) * 100 : 0
                return (
                  <tr key={p.ativo} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '11px 10px', color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '11px 10px', fontWeight: 600 }}>{p.ativo}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', color: 'var(--mut)' }}>{fmtQtd(p.qtd)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', color: 'var(--mut)' }}>{fmt(p.pm)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', color: 'var(--blue)' }}>{fmt(p.proventos)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--pos)' }}>{fmt(p.pmAjustado)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(p.custo)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 2, background: 'var(--teal)' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--mut)', minWidth: 32, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
