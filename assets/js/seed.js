/* ==========================================================================
   ENCLAVE® — Coffre de démonstration
   Toutes les personnes, entreprises et coordonnées ci-dessous sont FICTIVES,
   générées aléatoirement à partir de listes. Toute ressemblance est fortuite.
   ========================================================================== */
(function () {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DAY = 86400000;

  const PRENOMS_F = ['Camille', 'Léa', 'Inès', 'Manon', 'Sarah', 'Élise', 'Jeanne', 'Nora', 'Amandine', 'Yasmine', 'Clara', 'Margaux', 'Salomé', 'Lina', 'Agathe', 'Maëlle'];
  const PRENOMS_M = ['Thomas', 'Hugo', 'Julien', 'Antoine', 'Mehdi', 'Lucas', 'Bastien', 'Karim', 'Romain', 'Nicolas', 'Adrien', 'Samuel', 'Victor', 'Malik', 'Théo', 'Gaspard'];
  const NOMS = ['Moreau', 'Lefèvre', 'Garnier', 'Rousseau', 'Fontaine', 'Chevalier', 'Bertrand', 'Lambert', 'Benali', 'Girard', 'Mercier', 'Dupuis', 'Faure', 'Roussel', 'Blanchard', 'Guérin', 'Morel', 'Haddad', 'Perrin', 'Marchand', 'Aubert', 'Colin', 'Vidal', 'Renaud', 'Lemaire', 'Carpentier', 'Bouvier', 'Leroux'];

  const ENTREPRISES = [
    ['Maison Orsel', 'Luxe'], ['Atelier Vauclair', 'Artisanat d\'art'], ['Nordlys Capital', 'Finance'], ['Groupe Halden', 'Industrie'],
    ['Céleste Biotech', 'Santé'], ['Studio Ferrand', 'Architecture'], ['Valmont Logistique', 'Logistique'], ['Opaline Hôtels', 'Hôtellerie'],
    ['Kerlann Énergie', 'Énergie'], ['Banque Arceau', 'Finance'], ['Lumen Santé', 'Santé'], ['Brisa Mobilité', 'Mobilité'],
    ['Collectif Tessier', 'Conseil'], ['Aurore Immobilier', 'Immobilier'], ['Palatine Conseil', 'Conseil'], ['Sylve & Co', 'Agroalimentaire'],
    ['Ondine Cosmétiques', 'Cosmétique'], ['Verdier Industries', 'Industrie'], ['Altess Assurances', 'Assurance'], ['Quartz Avocats', 'Juridique'],
    ['Helix Data', 'Technologie'], ['Atrium Patrimoine', 'Gestion de patrimoine'], ['Lignes Marines', 'Transport maritime'], ['Domaine Varenne', 'Vins & spiritueux'],
    ['Noctis Studio', 'Technologie'], ['Fabrique Ambre', 'Mode'], ['Orbe Médical', 'Santé'], ['Cendre & Sel', 'Restauration'],
  ];
  // Intitulés accordés au genre (mêmes positions dans les deux listes)
  const POSTES_F = ['Directrice financière', 'Directrice générale', 'Directrice juridique', 'Responsable achats', 'Directrice des opérations', 'Fondatrice', 'Associée gérante', 'Directrice des partenariats', 'Secrétaire générale', 'CTO', 'Directrice générale déléguée', 'Cofondatrice', 'Responsable administrative', 'Directrice commerciale'];
  const POSTES_M = ['Directeur financier', 'Directeur général', 'Directeur juridique', 'Responsable achats', 'Directeur des opérations', 'Fondateur', 'Associé gérant', 'Directeur des partenariats', 'Secrétaire général', 'CTO', 'Directeur général délégué', 'Cofondateur', 'Responsable administratif', 'Directeur commercial'];
  const VILLES = [
    ['Paris', '75008', 'France'], ['Paris', '75003', 'France'], ['Lyon', '69002', 'France'], ['Bordeaux', '33000', 'France'],
    ['Lille', '59000', 'France'], ['Nantes', '44000', 'France'], ['Marseille', '13006', 'France'], ['Toulouse', '31000', 'France'],
    ['Strasbourg', '67000', 'France'], ['Nice', '06000', 'France'], ['Rennes', '35000', 'France'], ['Annecy', '74000', 'France'],
    ['Genève', '1204', 'Suisse'], ['Bruxelles', '1050', 'Belgique'], ['Luxembourg', '2449', 'Luxembourg'], ['Montpellier', '34000', 'France'],
  ];
  const RUES = ['rue des Archives', 'avenue Montaigne', 'quai des Chartrons', 'rue de la République', 'boulevard Haussmann', 'rue Sainte-Catherine', 'cours Mirabeau', 'rue du Faubourg Saint-Honoré', 'place Bellecour', 'rue Nationale', 'allée des Tilleuls', 'rue de la Paix', 'quai Saint-Antoine', 'rue Lafayette', 'avenue Jean Médecin'];
  const LIEUX_NAISSANCE = ['Paris', 'Lyon', 'Marseille', 'Lille', 'Nantes', 'Toulouse', 'Bordeaux', 'Casablanca', 'Bruxelles', 'Genève', 'Rennes', 'Milan', 'Porto', 'Beyrouth', 'Tunis', 'Strasbourg'];
  const NATIONALITES = ['Française', 'Française', 'Française', 'Française', 'Belge', 'Suisse', 'Marocaine', 'Italienne', 'Portugaise', 'Franco-libanaise'];
  const SOURCES = ['Recommandation', 'Salon professionnel', 'Site web', 'Réseau personnel', 'LinkedIn', 'Appel d\'offres'];
  const CANAUX = ['E-mail', 'Téléphone', 'Rendez-vous', 'Messagerie sécurisée'];
  const LANGUES = ['Français', 'Français', 'Français', 'Anglais', 'Français · Anglais', 'Français · Arabe', 'Italien'];
  const MODES = ['Virement', 'Virement', 'Prélèvement SEPA', 'Carte'];
  const CONDITIONS = ['À réception', '30 jours', '30 jours fin de mois', '45 jours', '60 jours'];
  const BICS = ['ARCEFRPPXXX', 'HLDNFRP1XXX', 'NRDLFR21XXX', 'VALMFRPPXXX', 'ORSLFR2AXXX'];
  const TAGS = ['VIP', 'Contrat cadre', 'Renouvellement T1', 'International', 'Partenaire', 'Ambassadeur', 'Signature 2026', 'Litige clos', 'Multi-sites', 'Recommandé'];
  const RESPONSABLES = ['E. Arti', 'E. Arti', 'S. Morel', 'L. Vidal'];

  const NOTES = [
    'Préfère être contacté(e) le matin. Très attaché(e) à la discrétion : jamais de mention publique de la collaboration.',
    'Décisionnaire final sur les budgets supérieurs à 50 k€. Point trimestriel prévu, ordre du jour envoyé 48 h avant.',
    'Sensible aux délais. Envoyer systématiquement un récapitulatif écrit après chaque réunion.',
    'Relation historique. A recommandé deux nouveaux clients en 2025. Invitation au dîner annuel à confirmer.',
    'Exige la signature électronique pour tous les documents. Copie au service juridique obligatoire.',
    'Négociation tarifaire en cours sur le renouvellement. Ne pas descendre sous la remise de 8 %.',
    'Souhaite centraliser les échanges via la messagerie sécurisée uniquement. Pas d\'appels non planifiés.',
    'Prospect qualifié. Budget validé pour le prochain exercice, attente du feu vert du comité.',
  ];

  const HISTO = {
    'Appel': ['Point d\'avancement sur le projet en cours', 'Appel de courtoisie, satisfaction confirmée', 'Discussion sur le renouvellement du contrat', 'Échange sur les nouveaux besoins pour le T1'],
    'Réunion': ['Comité de pilotage trimestriel', 'Présentation de la nouvelle offre', 'Atelier de cadrage avec l\'équipe', 'Déjeuner de suivi'],
    'E-mail': ['Envoi de la proposition commerciale', 'Relance concernant la facture en attente', 'Transmission du compte rendu', 'Confirmation du rendez-vous'],
    'Contrat': ['Signature de l\'avenant n°2', 'Signature du contrat cadre', 'Renouvellement annuel signé'],
    'Note': ['Changement d\'interlocuteur côté achats', 'Nouvelle adresse de facturation communiquée', 'Préférences de contact mises à jour'],
  };

  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  function build(now) {
    const r = rng(2024);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const int = (a, b) => a + Math.floor(r() * (b - a + 1));
    const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
    const weighted = (pairs) => {
      const x = r();
      let acc = 0;
      for (const [v, w] of pairs) { acc += w; if (x < acc) return v; }
      return pairs[pairs.length - 1][0];
    };

    const usedNames = new Set();
    const clients = [];
    const companies = ENTREPRISES.slice().sort(() => r() - 0.5);

    for (let i = 0; i < 32; i++) {
      const feminin = r() < 0.5;
      let prenom, nom;
      do {
        prenom = pick(feminin ? PRENOMS_F : PRENOMS_M);
        nom = pick(NOMS);
      } while (usedNames.has(prenom + nom));
      usedNames.add(prenom + nom);

      const segment = weighted([['Grand compte', 0.3], ['PME', 0.38], ['Startup', 0.17], ['Particulier', 0.15]]);
      const particulier = segment === 'Particulier';
      const [entreprise, secteur] = particulier ? ['', ''] : companies[i % companies.length];
      const [ville, cp, pays] = pick(VILLES);
      const statut = weighted([['Actif', 0.6], ['Prospect', 0.2], ['En pause', 0.12], ['Archivé', 0.08]]);
      const niveau = weighted([['Standard', 0.52], ['Restreint', 0.33], ['Secret', 0.15]]);
      const range = { 'Grand compte': [90, 420], 'PME': [18, 85], 'Startup': [8, 45], 'Particulier': [2, 25] }[segment];
      const valeur = statut === 'Prospect' ? 0 : Math.round(int(range[0] * 1000, range[1] * 1000) / 500) * 500;

      // 60 % des clients arrivés au cours des 12 derniers mois
      const ageDays = r() < 0.6 ? int(2, 360) : int(370, 1400);
      const createdAt = now - ageDays * DAY - int(0, 36000) * 1000;

      const naissance = new Date(int(1958, 1999), int(0, 11), int(1, 28));
      const domain = particulier ? pick(['gmail.com', 'outlook.fr', 'proton.me', 'icloud.com']) : strip(entreprise) + '.fr';
      const email = particulier
        ? `${strip(prenom)}.${strip(nom)}${int(1, 99)}@${domain}`
        : `${strip(prenom)[0]}.${strip(nom)}@${domain}`;

      const pieceType = pick(['Passeport', 'Carte d\'identité', 'Carte d\'identité', 'Titre de séjour']);
      const pieceNum = pieceType === 'Passeport'
        ? `${digits(2)}${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}${digits(5)}`
        : `${String.fromCharCode(65 + int(0, 25))}${digits(2)}${String.fromCharCode(65 + int(0, 25))}${digits(5)}${String.fromCharCode(65 + int(0, 25))}`;

      // Historique
      const histo = [];
      const n = statut === 'Prospect' ? int(1, 3) : int(3, 7);
      const recent = statut === 'Archivé' || statut === 'En pause' ? int(45, 200) : int(0, 60);
      for (let k = 0; k < n; k++) {
        const type = k === n - 1 && statut !== 'Prospect' ? 'Contrat' : pick(['Appel', 'Réunion', 'E-mail', 'E-mail', 'Note', 'Appel']);
        const span = Math.max(1, ageDays - recent);
        const at = now - (recent + Math.floor((span * k) / n)) * DAY - int(8, 18) * 3600000;
        histo.push({ id: `h${i}-${k}`, date: Math.max(createdAt, at), type, texte: pick(HISTO[type]), auteur: pick(RESPONSABLES) });
      }
      histo.sort((a, b) => b.date - a.date);

      const tags = [];
      const tagCount = int(0, 3);
      while (tags.length < tagCount) { const t = pick(TAGS); if (!tags.includes(t)) tags.push(t); }
      if (niveau === 'Secret' && !tags.includes('VIP') && r() < 0.6) tags.unshift('VIP');

      clients.push({
        id: 'CL-' + String(i + 1).padStart(4, '0'),
        createdAt,
        updatedAt: histo[0] ? histo[0].date : createdAt,
        civilite: feminin ? 'Mme' : 'M.',
        prenom,
        nom,
        dateNaissance: naissance.toISOString().slice(0, 10),
        lieuNaissance: pick(LIEUX_NAISSANCE),
        nationalite: pick(NATIONALITES),
        langue: pick(LANGUES),
        email,
        telephone: `+33 6 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`,
        telephone2: r() < 0.4 ? `+33 1 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}` : '',
        adresse: { ligne: `${int(1, 148)} ${pick(RUES)}`, cp, ville, pays },
        canal: pick(CANAUX),
        entreprise,
        poste: particulier ? '' : pick(feminin ? POSTES_F : POSTES_M),
        secteur,
        siret: particulier ? '' : `${digits(3)} ${digits(3)} ${digits(3)} ${digits(5)}`,
        tva: particulier ? '' : `FR${digits(2)} ${digits(9)}`,
        site: particulier ? '' : `www.${domain}`,
        segment,
        statut,
        niveau,
        valeur,
        responsable: pick(RESPONSABLES),
        source: pick(SOURCES),
        tags,
        iban: `FR76 ${digits(4)} ${digits(4)} ${digits(4)} ${digits(4)} ${digits(4)} ${digits(3)}`,
        bic: pick(BICS),
        modePaiement: pick(MODES),
        conditions: pick(CONDITIONS),
        piece: { type: pieceType, numero: pieceNum, expiration: new Date(now + int(120, 3200) * DAY).toISOString().slice(0, 10) },
        rgpd: { consentement: true, date: new Date(createdAt).toISOString().slice(0, 10), marketing: r() < 0.45 },
        notes: pick(NOTES),
        historique: histo,
        hue: int(0, 359),
      });
    }

    // Deux arrivées très récentes pour que le mois en cours ne soit jamais vide
    [[5, 3], [21, 9]].forEach(([idx, days]) => {
      const c = clients[idx];
      if (!c) return;
      c.createdAt = now - days * DAY - 5 * 3600000;
      c.statut = 'Actif';
      c.historique = [
        { id: `h${idx}-r1`, date: now - Math.max(1, days - 2) * DAY, type: 'Contrat', texte: 'Signature du contrat cadre', auteur: 'E. Arti' },
        { id: `h${idx}-r0`, date: c.createdAt + 2 * 3600000, type: 'Réunion', texte: 'Présentation de la nouvelle offre', auteur: 'E. Arti' },
      ];
      c.updatedAt = c.historique[0].date;
      c.rgpd.date = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!c.valeur) c.valeur = 24000;
    });

    return clients;
  }

  /** Journal fictif des deux dernières semaines, chaîné par SHA-256. */
  async function buildLog(clients, now, sha) {
    const r = rng(1789);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const sessions = Array.from({ length: 9 }, () => Math.floor(r() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0').replace(/(.{4})/, '$1-'));
    const raw = [];
    let t = now - 14 * DAY;
    let s = 0;
    while (t < now - 30 * 3600000) {
      const session = sessions[s % sessions.length];
      raw.push({ ts: t, action: 'Connexion', target: 'Session', detail: 'Clé valide', session });
      const actions = 2 + Math.floor(r() * 6);
      for (let k = 0; k < actions; k++) {
        t += (2 + Math.floor(r() * 9)) * 60000;
        const c = pick(clients);
        const label = `${c.prenom} ${c.nom}`;
        const kind = r();
        if (kind < 0.55) raw.push({ ts: t, action: 'Consultation', target: c.id, detail: label, session });
        else if (kind < 0.72) raw.push({ ts: t, action: 'Révélation', target: c.id, detail: `${label} · ${pick(['IBAN', 'Pièce d\'identité', 'Date de naissance', 'BIC'])}`, session });
        else if (kind < 0.86) raw.push({ ts: t, action: 'Modification', target: c.id, detail: `${label} · ${pick(['Coordonnées', 'Notes', 'Statut', 'Valeur annuelle'])}`, session });
        else if (kind < 0.93) raw.push({ ts: t, action: 'Copie', target: c.id, detail: `${label} · ${pick(['E-mail', 'Téléphone'])}`, session });
        else raw.push({ ts: t, action: 'Interaction', target: c.id, detail: `${label} · Appel`, session });
      }
      t += (4 + Math.floor(r() * 7)) * 60000;
      raw.push({ ts: t, action: 'Verrouillage', target: 'Session', detail: r() < 0.6 ? 'Inactivité' : 'Manuel', session });
      if (r() < 0.18) {
        t += 3 * 3600000;
        raw.push({ ts: t, action: 'Échec de connexion', target: 'Session', detail: 'Clé incorrecte', session: '—' });
      }
      t += (5 + Math.floor(r() * 26)) * 3600000;
      s++;
    }

    // Session récente (moins de 24 h) pour que le tableau de bord soit vivant
    {
      const session = sessions[sessions.length - 1];
      let tr = now - 5 * 3600000;
      raw.push({ ts: tr, action: 'Connexion', target: 'Session', detail: 'Clé valide', session });
      for (let k = 0; k < 7; k++) {
        tr += (4 + Math.floor(r() * 12)) * 60000;
        const c = pick(clients);
        const label = `${c.prenom} ${c.nom}`;
        if (k === 3) raw.push({ ts: tr, action: 'Révélation', target: c.id, detail: `${label} · IBAN`, session });
        else if (k === 5) raw.push({ ts: tr, action: 'Modification', target: c.id, detail: `${label} · Notes`, session });
        else raw.push({ ts: tr, action: 'Consultation', target: c.id, detail: label, session });
      }
      raw.push({ ts: tr + 6 * 60000, action: 'Verrouillage', target: 'Session', detail: 'Inactivité', session });
    }

    const log = [];
    let prev = 'GENESIS';
    for (let i = 0; i < raw.length; i++) {
      const e = Object.assign({ id: i + 1, user: raw[i].session === '—' ? 'Inconnu' : 'E. Arti', prev }, raw[i]);
      e.hash = await sha(entryString(e));
      prev = e.hash;
      log.push(e);
    }
    return log;
  }

  function entryString(e) {
    return [e.prev, e.id, e.ts, e.action, e.target, e.detail, e.session, e.user].join('|');
  }

  async function createDemo(sha) {
    const now = Date.now();
    const clients = build(now);
    const log = await buildLog(clients, now, sha);
    return {
      version: 1,
      owner: { prenom: 'Ebubekir', nom: 'Arti', role: 'Administrateur' },
      createdAt: now,
      lastAccess: now - 4.4 * 3600000,
      settings: { autoLock: 5, veil: true, autoMask: true, theme: 'dark' },
      clients,
      log,
    };
  }

  window.EnclaveSeed = { createDemo, entryString };
})();
