# Site web du CETIC de Mezesse

Application web de gestion scolaire : élèves, notes, bulletins, cartes scolaires, statistiques et journal des décisions. Elle s'adresse au Proviseur, au Surveillant Général et aux professeurs.

React 18, Vite, TanStack Query, Tailwind CSS.

L'API est dans le dépôt [cetic-mezesse-backend](https://github.com/Dominique-BRIA/cetic-mezesse-backend) et l'application mobile dans [cetic-mezesse](https://github.com/Dominique-BRIA/cetic-mezesse).

## Lancer en local

```bash
npm install
cp .env.example .env    # VITE_API_URL : adresse de l'API, terminée par /api
npm run dev             # http://localhost:5173
npm run build           # dossier dist/
```

## Déploiement

Le site est hébergé sur Vercel et redéployé à chaque push sur `main`.

Réglages du projet Vercel :

- dossier racine : la racine du dépôt ;
- variable d'environnement `VITE_API_URL` : l'adresse de l'API en production.

Le fichier `vercel.json` renvoie toutes les adresses vers `index.html`, pour que les pages s'ouvrent directement.
