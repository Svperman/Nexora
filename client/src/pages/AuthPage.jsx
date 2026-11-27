import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store/auth.js';
import { LANGUAGES, useLang, useT } from '../i18n.js';

export default function AuthPage() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', username: '', password: '', acceptTerms: false, marketing: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  const update = (e) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = isRegister ? form : { email: form.email, password: form.password };
      const data = await api(`/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body });
      useAuth.getState().setSession(data);
    } catch (err) {
      const details = err.details ? Object.values(err.details).flat().join(' · ') : '';
      setError(details ? `${err.message} : ${details}` : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <div className="row between">
          <h1>Nexora</h1>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Langue / Language">
            {Object.entries(LANGUAGES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <p className="muted">{isRegister ? t('auth.register') : t('auth.login')}</p>
        <label>{t('auth.email')}<input name="email" type="email" autoComplete="email" required value={form.email} onChange={update} /></label>
        {isRegister && (
          <label>{t('auth.username')}<input name="username" required minLength={3} maxLength={30} value={form.username} onChange={update} /></label>
        )}
        <label>{t('auth.password')}
          <input name="password" type="password" required minLength={isRegister ? 10 : 1}
            autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={update} />
        </label>
        {isRegister && (
          <>
            <label className="check"><input type="checkbox" name="acceptTerms" checked={form.acceptTerms} onChange={update} required />
              {t('auth.terms')}</label>
            <label className="check"><input type="checkbox" name="marketing" checked={form.marketing} onChange={update} />
              {t('auth.marketing')}</label>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? '…' : isRegister ? t('auth.submitRegister') : t('auth.submitLogin')}</button>
        <button type="button" className="link" onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(null); }}>
          {isRegister ? t('auth.toLogin') : t('auth.toRegister')}
        </button>
      </form>
    </div>
  );
}
