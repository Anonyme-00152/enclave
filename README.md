# ENCLAVE® — Gestion client confidentielle

Projet de portfolio réalisé par **Ebubekir ARTI** : un site vitrine et une application web pour gérer
les informations clients d'une entreprise dans un espace confidentiel, chiffré et tracé.

> Toutes les personnes, entreprises et coordonnées présentes dans la démo sont fictives.

## Le concept

1. **Avertissement de confidentialité.** À chaque ouverture, l'utilisateur doit lire et accepter un engagement :
   tout est confidentiel, rien ne sort (captures, copies, groupes de messagerie…), chaque accès est tracé et
   toute divulgation engage la responsabilité de son auteur.
2. **Clé d'accès personnelle.** Un code à 6 chiffres. Il n'est jamais enregistré : il sert uniquement à
   produire la clé qui déchiffre le coffre.
3. **Fiches clients complètes.** Identité, coordonnées, entreprise, relation commerciale, finances, pièce
   d'identité, consentement RGPD, notes et historique des échanges.
4. **Traçabilité.** Consultations, révélations de données sensibles, copies et modifications sont inscrites
   dans un journal chaîné (chaque entrée contient l'empreinte SHA-256 de la précédente).

## Sécurité (côté navigateur)

- Chiffrement **AES-256-GCM** (Web Crypto), clé dérivée par **PBKDF2-SHA-256, 310 000 itérations**.
- Seul le texte chiffré est stocké (`localStorage`). Les données déchiffrées restent en mémoire et sont
  effacées au verrouillage.
- Champs sensibles masqués par défaut, re-masqués automatiquement après 20 s.
- Verrouillage automatique après inactivité, voile de confidentialité au changement d'onglet,
  filigrane nominatif de session, impression bloquée.
- Blocage temporaire après 5 essais de code ; les échecs sont ajoutés au journal à la connexion suivante.
- En-têtes HTTP stricts (CSP, `X-Frame-Options`, HSTS…) dans `vercel.json`.

## Démo

- Site : `index.html`
- Application : `app.html` (code de démonstration : **240 617**)
- Paramètres → « Réinitialiser la démonstration » recrée le coffre fictif.

## Technique

HTML, CSS et JavaScript sans framework ni étape de build.

| Fichier | Rôle |
|---|---|
| `assets/js/gl.js` | Hero 3D en WebGL (raymarching) |
| `assets/js/site.js` | Animations du site (GSAP, ScrollTrigger, Lenis) |
| `assets/js/vault.js` | Coffre chiffré (PBKDF2 + AES-GCM) |
| `assets/js/seed.js` | Génération des clients fictifs et du journal |
| `assets/js/app.js` | Application (écrans, fiches, journal, paramètres) |

Lancer en local : double-cliquer sur `lancer-enclave.bat` (Windows), qui ouvre http://localhost:8080, ou :

```bash
python -m http.server 8080
```

Le chiffrement nécessite un contexte sécurisé : `localhost` ou HTTPS.

## Limites

C'est une démonstration côté client : une vraie mise en production demanderait un serveur, des comptes
individuels, une authentification forte et un hébergement conforme au RGPD.
