import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store/auth.js';

export default function Settings() {
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
    setMsg('Préférences enregistrées');
  };

  const deleteAccount = async () => {
    if (prompt('Cette action est définitive. Tapez SUPPRIMER pour confirmer.') !== 'SUPPRIMER') return;
    await api('/me', { method: 'DELETE' });
    useAuth.getState().clear();
  };

  return (
    <section className="card settings">
      <h2>Mon compte</h2>
      <p><strong>{user.username}</strong> · {user.email} · rôle : {user.role}</p>

      <h3>Consentements</h3>
      <p className="muted">Conditions acceptées le {new Date(user.consents.terms).toLocaleDateString('fr-FR')}</p>
      <label className="check">
        <input type="checkbox" checked={user.consents.marketing} onChange={toggleMarketing} /> Recevoir les actualités de Nexora
      </label>
      {msg && <p className="muted">{msg}</p>}

      <h3>Mes données (RGPD)</h3>
      <div className="row">
        <button onClick={exportData}>Exporter mes données</button>
        <button className="danger" onClick={deleteAccount}>Supprimer mon compte</button>
      </div>
    </section>
  );
}
