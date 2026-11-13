'use client';

// Notifications push du site (Firebase Cloud Messaging) : chaque navigateur qui les accepte enregistre son
// jeton pour le compte connecté ; l'API y envoie les mêmes notifications que sous la cloche, affichées par
// public/firebase-messaging-sw.js même onglet fermé. Sans les variables NEXT_PUBLIC_FIREBASE_* (Vercel),
// tout cela reste inactif et la cloche suffit.

import { api } from './api';

const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const VAPID = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const CLE_JETON = 'cetic-push-jeton';
const CLE_PLUS_TARD = 'cetic-push-plus-tard';

function lire(cle: string) {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // stockage indisponible : le jeton sera simplement redemandé
  }
}

/** Configuration présente et navigateur capable (Chrome, Edge, Firefox ; Safari seulement en application installée). */
export function pushPossible() {
  return (
    typeof window !== 'undefined' &&
    Boolean(CONFIG.apiKey && CONFIG.projectId && CONFIG.appId && CONFIG.messagingSenderId && VAPID) &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** Proposer d'activer : possible, jamais décidé dans ce navigateur, et pas de « Plus tard » depuis 30 jours. */
export function aProposer() {
  if (!pushPossible() || Notification.permission !== 'default') return false;
  const plusTard = Number(lire(CLE_PLUS_TARD) ?? 0);
  return Date.now() - plusTard > 30 * 24 * 3600 * 1000;
}

export function plusTard() {
  ecrire(CLE_PLUS_TARD, String(Date.now()));
}

function navigateur() {
  const ua = navigator.userAgent;
  const nom = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const systeme = /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return systeme ? `${nom} sur ${systeme}` : nom;
}

/**
 * Notifications déjà acceptées : enregistre (ou rafraîchit) le jeton de ce navigateur pour le compte
 * connecté. Appelé à chaque ouverture du site ; un échec est sans conséquence.
 */
export async function abonner(): Promise<boolean> {
  if (!pushPossible() || Notification.permission !== 'granted') return false;
  try {
    const [{ initializeApp, getApps }, m] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
    if (!(await m.isSupported())) return false;
    const app = getApps()[0] ?? initializeApp(CONFIG as Record<string, string>);
    const enregistrement = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const jeton = await m.getToken(m.getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: enregistrement });
    if (!jeton) return false;
    await api('/push/web', { methode: 'POST', corps: { jeton, navigateur: navigateur() }, annee: false });
    ecrire(CLE_JETON, jeton);
    return true;
  } catch {
    return false;
  }
}

/** Sur un clic (le navigateur l'exige) : demande l'autorisation, puis enregistre le jeton. */
export async function activer(): Promise<boolean> {
  if (!pushPossible()) return false;
  const reponse = await Notification.requestPermission();
  return reponse === 'granted' && abonner();
}

/**
 * À la déconnexion, avant d'effacer la session : ce navigateur ne recevra plus les notifications du
 * compte. La requête part tout de suite, avec la session encore valable ; on n'attend pas sa réponse.
 */
export function desabonner() {
  const jeton = lire(CLE_JETON);
  if (!jeton) return;
  ecrire(CLE_JETON, null);
  api('/push/web/retirer', { methode: 'POST', corps: { jeton }, annee: false }).catch(() => {});
}

/** Notification reçue pendant que le site est ouvert : prévenu par le service worker (la cloche se recharge). */
export function surNotificationRecue(f: () => void) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const ecoute = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === 'cetic-push') f();
  };
  navigator.serviceWorker.addEventListener('message', ecoute);
  return () => navigator.serviceWorker.removeEventListener('message', ecoute);
}
