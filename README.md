# Sira Équilibre

Application indépendante de bien-être et de soutien émotionnel, développée séparément de Sira AI.

## État actuel

- Interface autonome : conversation temporaire, respiration guidée, ancrage 5–4–3–2–1 et check-in émotionnel local avec consentement.
- Les messages ne sont pas enregistrés dans un historique personnel par cette interface.
- L'application ne pose pas de diagnostic et ne remplace pas un professionnel de santé.
- Le moteur conversationnel nécessite le raccordement sécurisé au serveur Sira.

## Raccordement API prévu

Le navigateur attend une variable globale définie avant le chargement de `accompagnement.js` :

```html
<script>window.SIRA_API_BASE_URL = "https://API-SIRA-A-CONFIGURER";</script>
```

Le serveur partagé devra autoriser explicitement l'origine de cette application (CORS), vérifier le JWT Supabase, appliquer les limites d'usage et n'exposer aucune clé fournisseur au navigateur. Les clés restent exclusivement côté serveur dans Sira AI.

Endpoints attendus :
- `GET /api/config`
- `POST /api/chat` avec `assistantType: "wellbeing"`

**Important :** le raccordement API n'est pas encore activé. Ne publie pas l'application comme service conversationnel tant que l'API partagée et les contrôles de sécurité ne sont pas vérifiés.

## Lancement local

Ouvre `accompagnement.html` via un serveur statique local (pas directement en `file://` pour les fonctionnalités web dépendantes du navigateur).
