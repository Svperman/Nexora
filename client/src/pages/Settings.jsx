import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store/auth.js';
import { LANGUAGES, useLang, useT } from '../i18n.js';

export default function Settings() {
  const t = useT();
  const { lang, setLang } = useLang();
  const user = useAuth((s) => s.user);
  const [msg, setMsg] = useState(null);

  const exportData = async () => {
    const data = await api('/me/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'nexora-export.json' });
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleMarketing = async (e) => {
    const { user: updated } = await api('/me/consents', { method: 'PATCH', body: { marketing: e.target.checked } });
    useAuth.setState({ user: updated });
    setMsg(t('settings.saved'));
  };

  const deleteAccount = async () => {
    if (prompt(t('settings.confirmDelete')) !== t('settings.confirmWord')) return;
    await api('/me', { method: 'DELETE' });
    useAuth.getState().clear();
  };

  return (
    <section className="card settings">
      <h2>{t('settings.title')}</h2>
      <p><strong>{user.username}</strong> · {user.email} · {t('settings.role')} : {user.role}</p>

      <h3>{t('settings.language')}</h3>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('settings.language')}>
        {Object.entries(LANGUAGES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>

      <h3>{t('settings.consents')}</h3>
      <p className="muted">{t('settings.termsOn', { date: t.day(user.consents.terms) })}</p>
      <label className="check">
        <input type="checkbox" checked={user.consents.marketing} onChange={toggleMarketing} /> {t('settings.marketing')}
      </label>
      {msg && <p className="muted">{msg}</p>}

      <h3>{t('settings.data')}</h3>
      <div className="row">
        <button onClick={exportData}>{t('settings.export')}</button>
        <button className="danger" onClick={deleteAccount}>{t('settings.delete')}</button>
      </div>
    </section>
  );
}
