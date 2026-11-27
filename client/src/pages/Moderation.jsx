import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../i18n.js';

export default function Moderation() {
  const t = useT();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api('/moderation/queue').then((d) => setItems(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (item, action) => {
    try {
      await api(`/moderation/${item.kind}/${item.id}`, { method: 'POST', body: { action } });
      setItems((xs) => xs.filter((x) => !(x.id === item.id && x.kind === item.kind)));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <section className="moderation">
      <h2>{t('mod.title')}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {items === null && <p className="muted">{t('app.loading')}</p>}
      {items?.length === 0 && <p className="card muted">{t('mod.empty')}</p>}
      {items?.map((item) => (
        <article key={`${item.kind}-${item.id}`} className="card post">
          <header>
            <span><strong>{t(`mod.${item.kind}`)}</strong> · {t('mod.by', { name: item.author?.username ?? '—' })}</span>
            <time>{t.date(item.createdAt)}</time>
          </header>
          {item.content && <p className="content">{item.content}</p>}
          {item.images?.length > 0 && (
            <div className={`images n${item.images.length}`}>
              {item.images.map((img) => <img key={img.url} src={img.url} alt={t('feed.image')} loading="lazy" />)}
            </div>
          )}
          {item.moderation?.reason && (
            <p className="muted">
              {t('mod.reason', { reason: item.moderation.reason })}
              {item.moderation.categories?.length > 0 && <> · <code>{item.moderation.categories.join(', ')}</code></>}
            </p>
          )}
          <footer className="row">
            <button onClick={() => act(item, 'approve')}>{t('mod.approve')}</button>
            <button className="danger" onClick={() => act(item, 'remove')}>{t('mod.remove')}</button>
          </footer>
        </article>
      ))}
    </section>
  );
}
