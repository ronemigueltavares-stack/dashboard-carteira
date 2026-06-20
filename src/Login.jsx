import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from './firebase'

const provider = new GoogleAuthProvider()

export default function Login() {
  async function handleGoogle() {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{
      background: '#0e1117',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#161b27',
        border: '1px solid #1f2937',
        borderRadius: 16,
        padding: '48px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        width: 340,
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #1d9e75, #4d94e8)',
        }} />

        <div style={{ textAlign: 'center' }}>
          <h1 style={{ color: '#e8eaed', fontSize: 20, fontWeight: 700, margin: 0 }}>
            Carteira de Investimentos
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 6 }}>
            Seu dashboard pessoal da B3
          </p>
        </div>

        <button
          onClick={handleGoogle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#ffffff',
            color: '#1f2937',
            border: 'none',
            borderRadius: 10,
            padding: '12px 24px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Entrar com Google
        </button>

        <p style={{ color: '#374151', fontSize: 12, textAlign: 'center', margin: 0 }}>
          Acesso restrito ao proprietário da conta
        </p>
      </div>
    </div>
  )
}
