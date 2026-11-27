import { useState } from 'react';
import { useAuth } from '../store/auth.js';
import { refreshSession } from '../api.js';
import { useT } from '../i18n.js';

/** Bandeau affiché quand l'API ne répond pas, avec un bouton pour réessayer. */
export default function ServerStatus() {
  const t = useT();
  const serverDown = useAuth((s) => s.serverDown);
  const [retrying, setRetrying] = useState(false);
  if (!serverDown) return null;

  // Réessayer = relancer la restauration de session : réveille l'API et rétablit l'indicateur.
  const retry = async () => {
    setRetrying(true);
    await refreshSession().catch(() => {});
    setRetrying(false);
  };

  return (
    <div className="server-down" role="alert">
      <span>{t('server.down')}</span>
      <button className="ghost" onClick={retry} disabled={retrying}>{retrying ? t('server.retrying') : t('server.retry')}</button>
    </div>
  );
}
