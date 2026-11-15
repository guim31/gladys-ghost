# Ghost

[Ghost](https://ghost.org/) est une plateforme de publication libre (MIT) pour
blogs et newsletters, auto-hébergée ou sur Ghost(Pro). Cette intégration amène
les chiffres de votre blog dans Gladys : ses membres (gratuits, payants,
nouveaux), ses articles (publiés, brouillons, programmés, le dernier) et les
abonnés de chaque newsletter. Des scènes peuvent réagir à un nouveau membre ou
à un nouvel article, un widget de tableau de bord montre le blog d'un coup
d'œil, et une action de scène met ses chiffres dans un message.

Testée contre un vrai Ghost 6.77 auto-hébergé (Docker, SQLite) ; pas encore
sur Ghost(Pro), et les membres payants n'ont pas pu être testés (pas de compte
Stripe) : vos retours sont les bienvenus dans
[les issues](https://github.com/guim31/gladys-ghost/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un blog Ghost, version 5 ou 6, auto-hébergé ou sur Ghost(Pro), joignable
  depuis la machine de Gladys.
- La **clé Admin API** d'une intégration personnalisée (un propriétaire ou un
  administrateur du blog la crée). La clé lit tout le blog : l'intégration ne
  fait que lire, n'écrit jamais.

À chaque rafraîchissement, l'intégration envoie neuf requêtes à Ghost, quelle
que soit la taille du blog (les comptes viennent des totaux de l'API, un membre
ou un article par requête). Ghost ne publie aucun quota pour l'API Admin ;
toutes les 5 minutes par défaut, on reste très loin de ce que supporte un blog.

## Prise en main

### 1. Créer une intégration personnalisée dans Ghost

1. Dans l'admin de Ghost, ouvrez **Settings → Integrations** (rubrique
   « Advanced »).
2. **Add custom integration**, nommez-la « Gladys », puis **Create**.
3. Copiez la **Admin API key** (de la forme `6a1b…:9f3c…`, un identifiant,
   deux-points et un long secret). Pas la clé Content API : elle ne lit pas les
   membres.

### 2. Configurer l'intégration

1. Dans Gladys, **Intégrations → Ghost → Configuration**.
2. **Adresse du blog** : l'adresse de votre site, par exemple
   `https://blog.example.org` (une adresse copiée depuis l'admin,
   `…/ghost/#/dashboard`, fonctionne aussi). Un Ghost local :
   `http://192.168.1.10:2368`. Si l'admin de votre blog a son propre domaine,
   utilisez celui-là.
3. **Clé Admin API** : collez la clé.
4. **Intervalle de rafraîchissement** : 1, 5 (par défaut), 15 ou 30 minutes.
   C'est aussi le délai des scènes.
5. **Langue des noms** : langue des noms de fonctionnalités, des dates et des
   phrases de scène (français par défaut).
6. Enregistrez, puis **Tester la connexion** : la réponse donne la version de
   Ghost, les membres et les articles publiés.

### 3. Ajouter les appareils

Ouvrez l'onglet **Découverte** : le blog, ses membres, ses articles et chaque
newsletter active sont proposés comme appareils. Ajoutez ceux que vous voulez.

## Les appareils

Le blog (qui porte son titre) :

- **En ligne** : 1 quand Ghost répond, 0 sinon.
- **Version de Ghost** : par exemple `6.77`.

« Membres » :

- **Membres**, **Membres gratuits**, **Membres payants** (formules offertes
  comprises).
- **Nouveaux membres (24 h)** et **Nouveaux membres (7 jours)** : membres
  inscrits dans les dernières 24 heures, les 7 derniers jours.

« Articles » :

- **Articles publiés**, **Brouillons**, **Articles programmés**.
- **Dernier article** : le titre du dernier article publié, et **Date du
  dernier article** : sa date, dans le fuseau horaire de Gladys.

« Newsletter … », une par newsletter active : **Abonnés**.

Les valeurs ne sont envoyées à Gladys que lorsqu'elles changent (et au moins
toutes les 12 heures), avec historique pour les compteurs.

## Tableau de bord

Le widget **Blog Ghost** affiche quatre tuiles (membres, payants, nouveaux sur
7 jours, articles), le dernier article avec sa date, et un bouton
**Actualiser** qui relit Ghost tout de suite. Le dernier article et le bouton
peuvent être masqués dans les réglages du widget. Quand Ghost ne répond pas,
le widget dit pourquoi sous les derniers chiffres lus.

## Scènes

### Déclencheurs

- **Nouveau membre** : quelqu'un devient membre du blog. On peut le limiter à
  une formule (gratuit, payant, offert). La scène peut utiliser le nom et
  l'e-mail du membre, sa formule et le nom du blog.
- **Article publié** : un article est publié, tout de suite ou à l'heure
  programmée. La scène peut utiliser le titre et l'adresse de l'article.

Les deux sont vus à la lecture suivante de Ghost (l'intervalle de
rafraîchissement). La première lecture ne fait que noter l'existant ; ce qui
est arrivé pendant que l'intégration était arrêtée est annoncé à son
redémarrage.

### Actions

- **Lire les chiffres du blog** : relit membres et articles (si la dernière
  lecture date de plus de 15 secondes) et les donne aux actions suivantes, avec
  une phrase toute prête : « Mon blog : 132 membre(s), dont 12 payant(s), 3
  nouveau(x) en 24 h, 9 en 7 jours, dernier article « Bonjour » le 15/11/2026
  21:22. »

### Idées de scènes

- Une notification « Nouveau membre : {{name}} » sur **Nouveau membre**,
  seulement pour les payants.
- Chaque lundi à 8 h, **Lire les chiffres du blog** puis envoyer la phrase sur
  votre téléphone.
- Quand **En ligne** reste à 0 pendant 10 minutes, une notification : le blog
  est en panne.

## Dépannage

- **« Ghost ne répond pas »** : vérifiez l'adresse et que la machine de Gladys
  peut la joindre.
- **« clé Admin API refusée »** : l'intégration personnalisée a été supprimée
  ou sa clé régénérée : copiez de nouveau la clé.
- **« Ce n'est pas une clé Admin API »** : vous avez copié la clé Content API.
- **« aucun blog Ghost à cette adresse »** : vérifiez l'adresse ; un Ghost
  dans un sous-dossier (`https://example.org/blog`) en a besoin.
- **« l'adresse redirige ailleurs »** : saisissez l'adresse de l'admin Ghost
  (celle de votre navigateur quand vous vous connectez à Ghost).
- **« certificat refusé »** : un certificat auto-signé n'est pas accepté :
  utilisez l'adresse `http://` de votre réseau.
- Les logs de l'intégration (**Intégrations → Ghost**) en disent plus ; rien
  n'y est écrit pendant un cycle de lecture normal.

## Limites

- Lecture seule : l'intégration ne modifie rien dans Ghost.
- Un blog par intégration. Une newsletter archivée garde son appareil et sa
  dernière valeur : supprimez-le dans Gladys.
- « Membres payants » est le total des membres moins les gratuits : formules
  payantes et offertes ensemble.
- Un article publié avec une date passée (antidaté) ne déclenche pas **Article
  publié**. Au plus 20 nouveaux membres et 10 nouveaux articles sont annoncés
  par lecture.
- Pas encore testée sur Ghost(Pro) ni avec Stripe, et sans lien avec la Ghost
  Foundation.
