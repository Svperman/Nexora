import { create } from 'zustand';

const fr = {
  'app.loading': 'Chargement…',
  'server.down': 'Le serveur ne répond pas. Il démarre peut-être (jusqu’à 1 minute).', 'server.retry': 'Réessayer', 'server.retrying': 'Connexion…',
  'nav.feed': 'Fil', 'nav.messages': 'Messages', 'nav.account': 'Compte', 'nav.moderation': 'Modération', 'nav.admin': 'Admin',
  'nav.logout': 'Déconnexion',
  'notif.title': 'Notifications ({n} non lues)', 'notif.empty': 'Aucune notification', 'notif.someone': "Quelqu'un",
  'notif.like': 'a aimé votre post', 'notif.comment': 'a commenté votre post', 'notif.message': 'vous a envoyé un message',
  'auth.register': 'Créer un compte', 'auth.login': 'Se connecter', 'auth.email': 'E-mail', 'auth.username': "Nom d'utilisateur",
  'auth.password': 'Mot de passe', 'auth.terms': "J'accepte les conditions d'utilisation et la politique de confidentialité",
  'auth.marketing': 'Recevoir les actualités de Nexora (facultatif)', 'auth.submitRegister': "S'inscrire", 'auth.submitLogin': 'Connexion',
  'auth.toLogin': 'Déjà un compte ? Se connecter', 'auth.toRegister': 'Pas de compte ? Créer un compte',
  'feed.placeholder': 'Quoi de neuf ?', 'feed.publish': 'Publier', 'feed.addImage': 'Ajouter une image', 'feed.removeImage': "Retirer l'image",
  'feed.uploading': 'Envoi…', 'feed.maxImages': '4 images maximum', 'feed.upToDate': 'Vous êtes à jour ✨', 'feed.empty': 'Aucun post pour le moment.',
  'feed.retry': 'Réessayer', 'feed.deleted': 'Compte supprimé', 'feed.delete': 'Supprimer', 'feed.confirmDelete': 'Supprimer ce post ?',
  'feed.pending': 'En attente de revue — visible par vous seul', 'feed.rejected': 'Refusé par la modération : {reason}',
  'feed.commentPlaceholder': 'Écrire un commentaire…', 'feed.send': 'Envoyer', 'feed.image': 'Image jointe au post',
  'chat.search': 'Nouveau message : rechercher…', 'chat.empty': 'Aucune conversation', 'chat.choose': 'Choisissez une conversation',
  'chat.typing': 'écrit…', 'chat.placeholder': 'Votre message…', 'chat.audioCall': 'Appel audio', 'chat.videoCall': 'Appel vidéo',
  'call.incoming': 'Appel {kind} de {name}', 'call.outgoing': 'Appel de {name}…', 'call.connecting': 'Connexion…',
  'call.video': 'vidéo', 'call.audio': 'audio', 'call.accept': 'Répondre', 'call.decline': 'Refuser', 'call.hangup': 'Raccrocher',
  'call.mute': 'Couper le micro', 'call.unmute': 'Activer le micro', 'call.cameraOff': 'Couper la caméra', 'call.cameraOn': 'Activer la caméra',
  'call.ended': 'Appel terminé', 'call.declined': "{name} n'a pas répondu", 'call.busy': '{name} est déjà en ligne',
  'call.failed': 'Connexion impossible', 'call.noMedia': 'Accès au micro ou à la caméra refusé', 'call.offline': '{name} est hors ligne',
  'settings.title': 'Mon compte', 'settings.role': 'rôle', 'settings.language': 'Langue', 'settings.consents': 'Consentements',
  'settings.termsOn': 'Conditions acceptées le {date}', 'settings.marketing': 'Recevoir les actualités de Nexora',
  'settings.saved': 'Préférences enregistrées', 'settings.data': 'Mes données (RGPD)', 'settings.export': 'Exporter mes données',
  'settings.delete': 'Supprimer mon compte', 'settings.confirmDelete': 'Cette action est définitive. Tapez SUPPRIMER pour confirmer.',
  'settings.confirmWord': 'SUPPRIMER',
  'mod.title': 'File de modération', 'mod.empty': 'Rien à revoir 🎉', 'mod.post': 'Post', 'mod.comment': 'Commentaire',
  'mod.approve': 'Approuver', 'mod.remove': 'Supprimer', 'mod.by': 'par {name}', 'mod.reason': 'Motif IA : {reason}',
  'admin.users': 'Utilisateurs', 'admin.posts': 'Posts', 'admin.comments': 'Commentaires', 'admin.messages': 'Messages',
  'admin.postsWeek': 'Posts sur 7 jours', 'admin.noData': 'Pas encore de données', 'admin.audit': "Journal d'audit",
  'admin.date': 'Date', 'admin.actor': 'Acteur', 'admin.action': 'Action', 'admin.target': 'Cible',
};

const en = {
  'app.loading': 'Loading…',
  'server.down': 'The server is not responding. It may be starting up (up to 1 minute).', 'server.retry': 'Retry', 'server.retrying': 'Connecting…',
  'nav.feed': 'Feed', 'nav.messages': 'Messages', 'nav.account': 'Account', 'nav.moderation': 'Moderation', 'nav.admin': 'Admin',
  'nav.logout': 'Log out',
  'notif.title': 'Notifications ({n} unread)', 'notif.empty': 'No notifications', 'notif.someone': 'Someone',
  'notif.like': 'liked your post', 'notif.comment': 'commented on your post', 'notif.message': 'sent you a message',
  'auth.register': 'Create an account', 'auth.login': 'Log in', 'auth.email': 'Email', 'auth.username': 'Username',
  'auth.password': 'Password', 'auth.terms': 'I accept the terms of use and the privacy policy',
  'auth.marketing': 'Receive Nexora news (optional)', 'auth.submitRegister': 'Sign up', 'auth.submitLogin': 'Log in',
  'auth.toLogin': 'Already have an account? Log in', 'auth.toRegister': 'No account? Create one',
  'feed.placeholder': "What's new?", 'feed.publish': 'Post', 'feed.addImage': 'Add an image', 'feed.removeImage': 'Remove image',
  'feed.uploading': 'Uploading…', 'feed.maxImages': '4 images max', 'feed.upToDate': "You're all caught up ✨", 'feed.empty': 'No posts yet.',
  'feed.retry': 'Retry', 'feed.deleted': 'Deleted account', 'feed.delete': 'Delete', 'feed.confirmDelete': 'Delete this post?',
  'feed.pending': 'Pending review — only visible to you', 'feed.rejected': 'Rejected by moderation: {reason}',
  'feed.commentPlaceholder': 'Write a comment…', 'feed.send': 'Send', 'feed.image': 'Image attached to the post',
  'chat.search': 'New message: search…', 'chat.empty': 'No conversations', 'chat.choose': 'Pick a conversation',
  'chat.typing': 'is typing…', 'chat.placeholder': 'Your message…', 'chat.audioCall': 'Audio call', 'chat.videoCall': 'Video call',
  'call.incoming': '{kind} call from {name}', 'call.outgoing': 'Calling {name}…', 'call.connecting': 'Connecting…',
  'call.video': 'Video', 'call.audio': 'Audio', 'call.accept': 'Answer', 'call.decline': 'Decline', 'call.hangup': 'Hang up',
  'call.mute': 'Mute', 'call.unmute': 'Unmute', 'call.cameraOff': 'Turn camera off', 'call.cameraOn': 'Turn camera on',
  'call.ended': 'Call ended', 'call.declined': "{name} didn't answer", 'call.busy': '{name} is on another call',
  'call.failed': 'Could not connect', 'call.noMedia': 'Microphone or camera access denied', 'call.offline': '{name} is offline',
  'settings.title': 'My account', 'settings.role': 'role', 'settings.language': 'Language', 'settings.consents': 'Consents',
  'settings.termsOn': 'Terms accepted on {date}', 'settings.marketing': 'Receive Nexora news',
  'settings.saved': 'Preferences saved', 'settings.data': 'My data (GDPR)', 'settings.export': 'Export my data',
  'settings.delete': 'Delete my account', 'settings.confirmDelete': 'This cannot be undone. Type DELETE to confirm.',
  'settings.confirmWord': 'DELETE',
  'mod.title': 'Moderation queue', 'mod.empty': 'Nothing to review 🎉', 'mod.post': 'Post', 'mod.comment': 'Comment',
  'mod.approve': 'Approve', 'mod.remove': 'Remove', 'mod.by': 'by {name}', 'mod.reason': 'AI reason: {reason}',
  'admin.users': 'Users', 'admin.posts': 'Posts', 'admin.comments': 'Comments', 'admin.messages': 'Messages',
  'admin.postsWeek': 'Posts over 7 days', 'admin.noData': 'No data yet', 'admin.audit': 'Audit log',
  'admin.date': 'Date', 'admin.actor': 'Actor', 'admin.action': 'Action', 'admin.target': 'Target',
};

export const LANGUAGES = { fr: 'Français', en: 'English' };
const DICTS = { fr, en };
const LOCALES = { fr: 'fr-FR', en: 'en-GB' };

function initialLang() {
  try {
    const saved = localStorage.getItem('nexora.lang');
    if (saved && DICTS[saved]) return saved;
  } catch { /* stockage indisponible */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const useLang = create((set) => ({
  lang: initialLang(),
  setLang(lang) {
    if (!DICTS[lang]) return;
    try { localStorage.setItem('nexora.lang', lang); } catch { /* ignoré */ }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));
document.documentElement.lang = useLang.getState().lang;

/** t('call.busy', { name }) — remplace {clé} par la valeur ; retombe sur le français puis sur la clé. */
export function translate(lang, key, vars = {}) {
  const template = DICTS[lang]?.[key] ?? fr[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function useT() {
  const lang = useLang((s) => s.lang);
  const t = (key, vars) => translate(lang, key, vars);
  t.lang = lang;
  t.date = (d) => new Date(d).toLocaleString(LOCALES[lang]);
  t.day = (d) => new Date(d).toLocaleDateString(LOCALES[lang]);
  return t;
}

// Clés identiques dans les deux langues (vérifié au chargement en dev).
if (import.meta.env?.DEV) {
  const missing = Object.keys(fr).filter((k) => !(k in en)).concat(Object.keys(en).filter((k) => !(k in fr)));
  if (missing.length) console.warn('[i18n] clés manquantes :', missing);
}
