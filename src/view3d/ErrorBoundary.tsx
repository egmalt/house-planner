import { Component, type ReactNode } from 'react'
import { t } from '../i18n'
import { Button, Card } from '../ui'

type Props = { resetKey: unknown; children: ReactNode }
type State = { error: Error | null }

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="view3d__error">
        <Card className="view3d__error-card">
          <div className="eyebrow">{t('view3d:error.eyebrow')}</div>
          <p>{t('view3d:error.text')}</p>
          <p className="muted">{this.state.error.message}</p>
          <Button size="sm" onClick={() => this.setState({ error: null })}>
            {t('view3d:error.retry')}
          </Button>
        </Card>
      </div>
    )
  }
}
