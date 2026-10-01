import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadFromServer, login, useSyncStore } from '../storage'
import { Button } from './Button'
import { Input } from './Input'

export function LoginScreen() {
  const { t } = useTranslation('common')
  const status = useSyncStore((s) => s.status)
  const error = useSyncStore((s) => s.error)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (status === 'loading') {
    return (
      <div className="gate">
        <div className="gate__card card muted">{t('login.loading')}</div>
      </div>
    )
  }

  if (status !== 'login') {
    return (
      <div className="gate">
        <div className="gate__card card">
          <div className="gate__title">{t('login.offlineTitle')}</div>
          <p className="muted">{t('login.offlineText')}{error ? ` ${error}` : ''}</p>
          <Button variant="primary" onClick={() => void loadFromServer(true)}>
            {t('login.retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="gate">
      <form
        className="gate__card card"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!password || busy) return
          setBusy(true)
          setMessage(await login(password))
          setBusy(false)
        }}
      >
        <span className="header__logo" aria-hidden />
        <div className="gate__title">{t('login.password')}</div>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          invalid={!!message}
          onChange={(e) => {
            setPassword(e.target.value)
            setMessage(null)
          }}
        />
        {message && <div className="gate__error">{message}</div>}
        <Button type="submit" variant="primary" disabled={busy || !password}>
          {busy ? t('login.checking') : t('login.signIn')}
        </Button>
      </form>
    </div>
  )
}
