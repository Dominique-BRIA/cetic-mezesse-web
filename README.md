# Site web du CETIC de Mezesse

Application web de gestion scolaire pour le Proviseur, le Surveillant Général et les professeurs : élèves, notes, bulletins, cartes scolaires, statistiques et journal des décisions.

Next.js 16 (App Router), React 19, TanStack Query, Tailwind CSS.

L'API est dans le dépôt [cetic-mezesse-backend](https://github.com/Dominique-BRIA/cetic-mezesse-backend) et l'application mobile dans [cetic-mezesse-mobile](https://github.com/Dominique-BRIA/cetic-mezesse-mobile).

## Organisation

```text
src/app/         une page par adresse (/eleves, /eleves/[id], /notes…), avec les rôles autorisés
src/ecrans/      contenu des écrans
src/components/  mise en page (menu, notifications), éléments d'interface, graphiques
src/lib/         accès à l'API, session et année choisie, formats, navigation
```

Le site s'affiche dans le navigateur. Le jeton de connexion et l'année consultée restent dans le stockage du navigateur, et toutes les données viennent de l'API. Sans session, toute adresse affiche l'écran de connexion. Une page réservée à d'autres rôles renvoie au tableau de bord, comme une adresse inconnue.

## Lancer en local

```bash
npm install
cp .env.example .env    # NEXT_PUBLIC_API_URL : adresse de l'API, terminée par /api
npm run dev             # http://localhost:5173
npm run build           # version de production (dossier .next/)
npm start               # sert la version de production
```

## Déploiement

Le site est hébergé sur Vercel et redéployé à chaque push sur `main`.

Réglages du projet Vercel :

- framework : Next.js (détecté automatiquement) ;
- dossier racine : la racine du dépôt ;
- variable d'environnement `NEXT_PUBLIC_API_URL` : l'adresse de l'API en production. L'ancienne variable `VITE_API_URL` est aussi acceptée.
