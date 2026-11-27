import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.js';

const KPIS = [['users', 'admin.users'], ['posts', 'admin.posts'], ['comments', 'admin.comments'], ['messages', 'admin.messages']];

export default function Admin() {
  const t = useT();
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/admin/stats').then(setStats).catch((e) => setError(e.message));
    api('/admin/audit').then((d) => setAudit(d.items)).catch(() => {});
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!stats) return <p className="muted">{t('app.loading')}</p>;
  const max = Math.max(1, ...stats.postsPerDay.map((d) => d.count));

  return (
    <section className="admin">
      <div className="kpis">
        {KPIS.map(([k, label]) => (
          <div key={k} className="card kpi"><span className="muted">{t(label)}</span><strong>{stats[k]}</strong></div>
        ))}
      </div>
      <div className="card">
        <h3>{t('admin.postsWeek')}</h3>
        <div className="bars">
          {stats.postsPerDay.map((d) => (
            <div key={d.day} title={`${d.day} : ${d.count}`}>
              <span style={{ height: `${(d.count / max) * 100}%` }} />
              <small>{d.day.slice(5)}</small>
            </div>
          ))}
          {stats.postsPerDay.length === 0 && <p className="muted">{t('admin.noData')}</p>}
        </div>
      </div>
      <div className="card">
        <h3>{t('admin.audit')}</h3>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t('admin.date')}</th><th>{t('admin.actor')}</th><th>{t('admin.action')}</th><th>{t('admin.target')}</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{t.date(a.createdAt)}</td>
                  <td>{a.actor?.username ?? '—'}</td>
                  <td><code>{a.action}</code></td>
                  <td>{a.target ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
