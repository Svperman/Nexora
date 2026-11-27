import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store/auth.js';

export default function AuthPage() {
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
        <h1>Nexora</h1>
        <p className="muted">{isRegister ? 'Créer un compte' : 'Se connecter'}</p>
        <label>E-mail<input name="email" type="email" autoComplete="email" required value={form.email} onChange={update} /></label>
        {isRegister && (
          <label>Nom d'utilisateur<input name="username" required minLength={3} maxLength={30} value={form.username} onChange={update} /></label>
        )}
        <label>Mot de passe
          <input name="password" type="password" required minLength={isRegister ? 10 : 1}
            autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={update} />
        </label>
        {isRegister && (
          <>
            <label className="check"><input type="checkbox" name="acceptTerms" checked={form.acceptTerms} onChange={update} required />
              J'accepte les conditions d'utilisation et la politique de confidentialité</label>
            <label className="check"><input type="checkbox" name="marketing" checked={form.marketing} onChange={update} />
              Recevoir les actualités de Nexora (facultatif)</label>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? '…' : isRegister ? "S'inscrire" : 'Connexion'}</button>
        <button type="button" className="link" onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(null); }}>
          {isRegister ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? Créer un compte'}
        </button>
      </form>
    </div>
  );
}
