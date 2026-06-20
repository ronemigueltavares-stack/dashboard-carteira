import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import { AuthProvider, useAuth } from './AuthContext'
import Login from './Login'

function Dashboard() {
  const user = useAuth()
  return (
    <div style={{
      background: '#0e1117',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e8eaed',
      fontFamily: 'Inter, system-ui, sans-serif',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        background: 'linear-gradient(135deg, #1d9e75, #4d94e8)',
      }} />
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Carteira de Investimentos</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>
        Bem-vindo, {user.displayName}
      </p>
      <button
        onClick={() => signOut(auth)}
        style={{
          marginTop: 8,
          background: 'transparent',
          border: '1px solid #374151',
          color: '#9ca3af',
          borderRadius: 8,
          padding: '8px 20px',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Sair
      </button>
    </div>
  )
}

function AppRoutes() {
  const user = useAuth()
  return user ? <Dashboard /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
