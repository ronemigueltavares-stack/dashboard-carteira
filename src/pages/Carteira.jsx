import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'

export default function Carteira() {
  const user = useAuth()
  const [lancamentos, setLancamentos] = useState([])
  const [proventos, setProventos] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const qLanc = query(
      collection(db, `users/${user.uid}/lancamentos`),
      orderBy('data', 'desc'),
      limit(10)
    )
    const qProv = query(
      collection(db, `users/${user.uid}/proventos`),
      orderBy('data', 'desc'),
      limit(10)
    )

    const unsubLanc = onSnapshot(qLanc, snap => {
      setLancamentos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCarregando(false)
    })

    const unsubProv = onSnapshot(qProv, snap => {
      setProventos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => { unsubLanc(); unsubProv() }
  }, [user.uid])

  function formatData(ts) {
    if (!ts) return '-'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function formatValor(v) {
    if (v == null) return '-'
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  if (carregando) {
    return (
      <div style={{ color: 'var(--dim)', fontSize: 14, textAlign: 'center', padding: 40 }}>
        Carregando dados...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Lançamentos sincronizados', valor: '519', cor: 'var(--teal)' },
          { label: 'Proventos sincronizados', valor: '598', cor: 'var(--blue)' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--card)', border: '0.5px solid var(--border)',
            borderRadius: 12, padding: '14px 20px', flex: '1 1 160px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: k.cor }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela de Lançamentos */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 18px 12px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Lançamentos recentes</div>
        <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 14 }}>Últimos 10 · dados em tempo real do Firestore</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                {['Data', 'Ativo', 'Tipo', 'Qtd', 'Valor unit.', 'Total'].map(h => (
                  <th key={h} style={{ padding: '0 8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--mut)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lancamentos.map(l => (
                <tr key={l.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--mut)', whiteSpace: 'nowrap' }}>{formatData(l.data)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{l.ativo}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: l.tipo === 'COMPRA' ? 'rgba(61,207,142,0.12)' : 'rgba(240,104,107,0.12)',
                      color: l.tipo === 'COMPRA' ? 'var(--pos)' : 'var(--neg)',
                    }}>{l.tipo}</span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{l.qtd}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--mut)' }}>{formatValor(l.valor)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{formatValor(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela de Proventos */}
      <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: '18px 18px 12px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Proventos recentes</div>
        <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 14 }}>Últimos 10</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                {['Data', 'Ativo', 'Tipo', 'Valor'].map(h => (
                  <th key={h} style={{ padding: '0 8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--mut)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proventos.map(p => (
                <tr key={p.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--mut)', whiteSpace: 'nowrap' }}>{formatData(p.data)}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{p.ativo}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--blue)', fontSize: 12, fontWeight: 600 }}>{p.tipo}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--pos)' }}>{formatValor(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
