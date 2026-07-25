import { useT, Rich } from './i18n'

const SECTIONS = [1, 2, 3, 4, 5, 6]

/**
 * 监护人权利的**可达渠道**。一期没有自助删号 UI，删除云端账号与记录靠人工处理，
 * 所以这一页必须给出一个真能联系到人的地方——否则"监护人权利"等于没落实。
 * 不进 i18n 字典：URL 不需要翻译，两种语言共用同一个渠道。
 * ⚠️ 与 docs/个人信息保护影响评估.md「监护人权利落实」一节必须**同一口径**。
 */
const CONTACT_URL = 'https://github.com/myacelw/focal-quest-app/issues'

/**
 * 隐私政策静态页（spec §7.1），含「儿童个人信息处理」专节。
 * 文案红线：全文不得出现"治疗 / 康复 / 恢复视力 / 降低度数"这类宣称——
 * 那会把本 App 推入二类医疗器械范畴（spec §2.6）。
 */
export function PrivacyPage({ onBack }: { onBack: () => void }) {
  const t = useT()
  return (
    <div className="fq-page fq-rise">
      <h2 className="fq-h2">{t('privacy.title')}</h2>
      <p className="fq-sub">{t('privacy.updated')}</p>
      {SECTIONS.map((n) => (
        <div className="fq-card" key={n} style={{ marginTop: 14, textAlign: 'left' }}>
          <div className="fq-card-title">{t(`privacy.s${n}.h`)}</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8, margin: 0 }}>
            <Rich text={t(`privacy.s${n}.b`)} />
          </p>
        </div>
      ))}
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.8 }}>
        {t('privacy.contact')}{' '}
        <a href={CONTACT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--violet)' }}>
          {CONTACT_URL}
        </a>
      </p>
      <div style={{ marginTop: 18 }}>
        <button className="fq-btn" onClick={onBack}>{t('privacy.back')}</button>
      </div>
    </div>
  )
}
