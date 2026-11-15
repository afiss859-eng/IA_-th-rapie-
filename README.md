# Sira Équilibre

**Application indépendante de bien-être et de soutien émotionnel**, hébergée séparément de Sira AI.

## Application en ligne

- Site : https://sira-equilibre.vercel.app/
- Dépôt : https://github.com/afiss859-eng/IA_-th-rapie-
- Hébergement : projet Vercel autonome `sira-equilibre`

## Fonctionnalités

- Conversation avec Sira Équilibre en mode bien-être dédié.
- Exercices guidés de respiration et d’ancrage 5–4–3–2–1.
- Check-in émotionnel stocké localement uniquement après consentement.
- Dictée vocale et lecture des réponses lorsque le navigateur les prend en charge.
- Effacement de la conversation et des check-ins locaux.

## Architecture et sécurité

L'interface reste dans ce dépôt indépendant. Pour la conversation, elle utilise les routes publiques de l'API Sira AI :

- `GET https://faso-ai-studio.vercel.app/api/config`
- `POST https://faso-ai-studio.vercel.app/api/chat`

Le navigateur initialise Supabase avec la clé *publishable* fournie par la configuration publique, puis transmet un JWT de session à l'API. Le serveur Sira AI conserve les clés des fournisseurs IA et les secrets privés. L'API applique l'authentification Supabase, les contrôles d'accès, les protections anti-rafale et le quota partagé.

L'API autorise les origines exactes `https://faso-ai-studio.vercel.app` et `https://sira-equilibre.vercel.app`. Aucun secret fournisseur ni clé de service Supabase ne doit être placé dans ce dépôt ou dans le JavaScript client.

## Confidentialité et limites

Les messages sont transmis au moteur IA de Sira AI pour générer une réponse, mais cette interface ne sauvegarde pas la conversation dans un historique personnel. Les check-ins sont enregistrés dans le stockage local du navigateur uniquement lorsque l'utilisateur coche la case de consentement. Effacer les données du navigateur efface ces check-ins.

Sira Équilibre est un outil de bien-être général. Il ne réalise pas de diagnostic, ne prescrit aucun traitement et ne remplace pas un professionnel de santé. En cas de danger immédiat, l'aide humaine et les services d'urgence locaux priment sur le chat.

## Développement

L'application est un site HTML/CSS/JavaScript statique. Ouvre `accompagnement.html` via un serveur web local. Le simple protocole `file://` n'est pas adapté à l'authentification et aux requêtes API.
