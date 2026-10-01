import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fmtDateTime, lang, setLang, type Lang } from '../i18n'
import {
  listSnapshots,
  listVersions,
  previewRevision,
  previewSnapshot,
  restorePreview,
  restoreVersion,
  saveSnapshot,
  type SnapshotInfo,
  type VersionInfo,
} from '../storage'
import { useViewOnly } from '../store/viewOnly'
import { Button } from './Button'
import { Input } from './Input'
import { Segmented } from './Segmented'
import { usePlanStore } from '../store/planStore'
import { IconButton } from './IconButton'
import { Menu, MenuItem, MenuSection } from './Menu'
import { downloadPlan, readPlanFile } from './planFile'

const when = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : fmtDateTime(d, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

type Tab = 'saved' | 'all'

function Versions({ close }: { close: () => void }) {
  const { t } = useTranslation('common')
  const viewOnly = useViewOnly()
  const [tab, setTab] = useState<Tab>('saved')
  const [revs, setRevs] = useState<VersionInfo[] | null>(null)
  const [snaps, setSnaps] = useState<SnapshotInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setError(null)
    listSnapshots()
      .then(setSnaps)
      .catch((e) => {
        setSnaps([])
        setError((e as Error).message)
      })
    listVersions()
      .then((r) => setRevs(r.items))
      .catch((e) => setError((e as Error).message))
  }

  useEffect(load, [])

  const run = async (fn: () => Promise<unknown>, done = true) => {
    try {
      await fn()
      if (done) close()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const today = fmtDateTime(new Date(), { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <MenuSection>
      <div className="versions__head">
        <Segmented
          size="sm"
          value={tab}
          options={[
            { value: 'saved', label: t('versions.saved') },
            { value: 'all', label: t('versions.all') },
          ]}
          onChange={setTab}
        />
      </div>
      {!viewOnly &&
        (naming === null ? (
          <MenuItem onClick={() => setNaming(t('versions.defaultName', { date: today }))} hint={t('versions.snapshot')}>
            {t('versions.saveVersion')}
          </MenuItem>
        ) : (
          <form
            className="versions__save"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!naming.trim() || busy) return
              setBusy(true)
              await run(() => saveSnapshot(naming.trim()), false)
              setBusy(false)
              setNaming(null)
              setTab('saved')
              load()
            }}
          >
            <Input size="sm" autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="primary" type="submit" disabled={busy}>
              {t('versions.save')}
            </Button>
          </form>
        ))}
      {error && <div className="menu__note menu__note--error">{error}</div>}
      <div className="menu__scroll">
        {tab === 'saved' && (
          <>
            {!snaps && <div className="menu__note">{t('versions.loading')}</div>}
            {snaps && snaps.length === 0 && !error && <div className="menu__note">{t('versions.empty')}</div>}
            {snaps?.map((v) => (
              <div key={v.id} className="versions__row">
                <div className="versions__info">
                  <div className="versions__name">{v.name}</div>
                  <div className="muted">
                    {when(v.createdAt)}
                    {v.rev !== undefined ? ` · rev ${v.rev}` : ''}
                  </div>
                </div>
                <div className="versions__actions">
                  <Button size="sm" variant="ghost" onClick={() => void run(() => previewSnapshot(v.id, t('versions.quoted', { name: v.name })))}>
                    {t('versions.open')}
                  </Button>
                  {!viewOnly && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (window.confirm(t('versions.confirmSnapshot', { name: v.name })))
                          void run(async () => {
                            await previewSnapshot(v.id, v.name)
                            restorePreview()
                          })
                      }}
                    >
                      {t('versions.restore')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'all' && (
          <>
            {!revs && !error && <div className="menu__note">{t('versions.loading')}</div>}
            {revs?.slice(0, 80).map((v, i) => (
              <div key={v.rev} className="versions__row">
                <div className="versions__info">
                  <div className="versions__name">
                    #{v.rev} · {when(v.updatedAt)}
                  </div>
                  <div className="muted">
                    {i === 0 ? t('versions.current') : [v.author, v.walls !== undefined ? t('versions.walls', { count: v.walls }) : ''].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {i > 0 && (
                  <div className="versions__actions">
                    <Button size="sm" variant="ghost" onClick={() => void run(() => previewRevision(v.rev))}>
                      {t('versions.open')}
                    </Button>
                    {!viewOnly && (
                      <Button
                        size="sm"
                        onClick={() => {
                          if (window.confirm(t('versions.confirmRevision', { rev: v.rev })))
                            void run(() => restoreVersion(v.rev))
                        }}
                      >
                        {t('versions.restore')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </MenuSection>
  )
}

export function HeaderMenu() {
  const { t } = useTranslation('common')
  const plan = usePlanStore((s) => s.plan)
  const commit = usePlanStore((s) => s.commit)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showVersions, setShowVersions] = useState(false)

  const onImport = async (file: File | undefined) => {
    if (!file) return
    const result = await readPlanFile(file)
    if (result.ok) commit(result.plan)
    else window.alert(t('menu.importInvalid', { error: result.error }))
  }

  return (
    <>
      <Menu
        width={400}
        trigger={({ open, toggle }) => (
          <IconButton
            label={t('menu.more')}
            active={open}
            onClick={() => {
              if (!open) setShowVersions(false)
              toggle()
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </IconButton>
        )}
      >
        {(close) => (
          <>
            <MenuSection title={t('menu.plan')}>
              <MenuItem disabled={!plan} onClick={() => { if (plan) downloadPlan(plan); close() }} hint=".json">
                {t('menu.exportJson')}
              </MenuItem>
              <MenuItem onClick={() => { fileRef.current?.click(); close() }} hint=".json">
                {t('menu.importJson')}
              </MenuItem>
              <MenuItem onClick={() => setShowVersions((v) => !v)} hint={showVersions ? '▴' : '▾'}>
                {t('menu.versions')}
              </MenuItem>
            </MenuSection>
            {showVersions && <Versions close={close} />}
            <MenuSection title={t('language.label')}>
              <div className="versions__head">
                <Segmented<Lang>
                  size="sm"
                  value={lang()}
                  options={[
                    { value: 'en', label: t('language.en') },
                    { value: 'ru', label: t('language.ru') },
                  ]}
                  onChange={(l) => {
                    close()
                    void setLang(l)
                  }}
                />
              </div>
            </MenuSection>
          </>
        )}
      </Menu>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void onImport(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
