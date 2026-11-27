import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/admin/stats').then(setStats).catch((e) => setError(e.message));
    api('/admin/audit').then((d) => setAudit(d.items)).catch(() => {});
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!stats) return <p className="muted">Chargement…</p>;
  const max = Math.max(1, ...stats.postsPerDay.map((d) => d.count));

  return (
    <section className="admin">
      <div className="kpis">
        {['users', 'posts', 'comments', 'messages'].map((k) => (
          <div key={k} className="card kpi"><span className="muted">{k}</span><strong>{stats[k]}</strong></div>
        ))}
      </div>
      <div className="card">
        <h3>Posts sur 7 jours</h3>
        <div className="bars">
          {stats.postsPerDay.map((d) => (
            <div key={d.day} title={`${d.day} : ${d.count}`}>
              <span style={{ height: `${(d.count / max) * 100}%` }} />
              <small>{d.day.slice(5)}</small>
            </div>
          ))}
          {stats.postsPerDay.length === 0 && <p className="muted">Pas encore de données</p>}
        </div>
      </div>
      <div className="card">
        <h3>Journal d'audit</h3>
        <table>
          <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Cible</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString('fr-FR')}</td>
                <td>{a.actor?.username ?? '—'}</td>
                <td><code>{a.action}</code></td>
                <td>{a.target ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
