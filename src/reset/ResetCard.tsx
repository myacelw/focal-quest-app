import { useState } from 'react'
import { resetTrainingData } from './reset'
import { useT } from '../i18n'

/**
 * 设置页危险区：清空训练数据。
 * 双闸防误删——①必须原样输入确认词按钮才启用；②再弹一次最终确认。
 * 只清训练数据，保留屏幕标定与设置。
 */
export function ResetCard() {
  const t = useT()
  const [word, setWord] = useState('')
  const armed = word.trim() === t('reset.confirmWord')

  async function onReset() {
    if (!armed) return
    if (!window.confirm(t('reset.finalConfirm'))) return
    await resetTrainingData()
    window.alert(t('reset.done'))
    window.location.reload()
  }

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>{t('reset.hint')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder={t('reset.confirmLabel')}
          style={{ flex: '1 1 160px', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line)' }}
        />
        <button
          className="fq-btn"
          disabled={!armed}
          onClick={() => void onReset()}
          style={{
            opacity: armed ? 1 : 0.5,
            background: armed ? '#ff5c86' : undefined,
            color: armed ? '#fff' : undefined,
            borderColor: armed ? '#ff5c86' : undefined,
          }}
        >
          {t('reset.button')}
        </button>
      </div>
    </>
  )
}
