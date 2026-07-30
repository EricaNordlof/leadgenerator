# Bumperball Leadgenerator Pro v3

Produktionsversion för **Offroad Bumpis**, som drivs av den enskilda firman **Nordlöf Nordic**.

- E-post: `kontakt@offroadbumpis.se`
- Telefon: `0793442520`
- Webbplats: `https://offroadbumpis.se`

## Det här är nytt

### Inloggning och gemensam databas

- Säker administratörsinloggning med hashat lösenord.
- PostgreSQL lagrar leads, pipeline, Gmail-koppling, utkast och bokningsunderlag.
- Samma information visas på mobil och dator.
- Gamla v2-leads i webbläsarens `localStorage` kan importeras från fliken **Integrationer**.

### Automatisk leadinsamling

- En Render Cron Job kör varje dag kl. **05:00 UTC**.
- Standardkällorna är Skolverkets öppna skolenhetsregister och OpenStreetMap via Overpass API.
- Skolverkets API används för grundskolor och relevanta skolenheter i Skåne. Registret uppdateras dagligen och varje post sparas med skolenhetskod som permanent käll-ID.
- OpenStreetMap-sökningen fokuserar på skolor, fritidsverksamheter, fotboll, föreningar, sportanläggningar, eventlokaler, hotell, konferensverksamheter och företag med offentlig kontaktväg i Skåne.
- Resultaten dedupliceras genom källans permanenta ID.
- Officiella kommunala eller organisatoriska JSON/CSV-feeds kan anslutas via uttrycklig domänlista.
- Ingen generell webbskrapning, Google Maps-skrapning eller automatisk insamling från källor som inte uttryckligen tillåter återanvändning.

Skolverkets data sparas med källangivelse och källicens. OpenStreetMap-data ska visas med källangivelsen **OpenStreetMap contributors** och omfattas av ODbL.

#
## Inloggning i v3.1

- `ADMIN_PASSWORD` i Render är alltid den aktuella administratörens inloggningslösenord.
- Vid omstart synkroniseras den befintliga administratörens lösenord mot miljövariabeln.
- Inloggningssidan visar nu laddningsstatus, nätverksfel och serverfel i stället för att tyst återgå till formuläret.
- Administrationsfiler skickas med `Cache-Control: no-store` för att undvika gammal JavaScript efter en deploy.

## Gmail-utkast utan massutskick

- Google OAuth ansluter Gmail eller Google Workspace.
- Appen använder endast Gmail-scope för att skapa utkast.
- Varje lead granskas manuellt innan ett utkast skapas.
- Inga meddelanden skickas automatiskt.
- Den dagliga körningen kan skapa ett eget sammanfattningsutkast till `kontakt@offroadbumpis.se`.

### Offert- och bokningskoppling

- En lead kan omvandlas till offertunderlag eller bokningsunderlag.
- Barnbollspriser och vuxenbollspriser räknas efter rekommenderat antal bollar.
- Underlaget sparas i databasen.
- En förifylld länk öppnas i bokningsappen.
- Om `BOOKING_WEBHOOK_URL` anges skickas underlaget även till bokningssystemets webhook med valfri HMAC-signatur.

## Produkter

- **Barnbollar:** 7–12 år, max 60 kg. 12 bollar bokningsbara nu.
- **Vuxenbollar:** från 12 år, max 90 kg. 12 bollar bokningsbara från 1 september 2026.

## Publicera på Render

Den gamla Static Site-tjänsten kan inte köra v3. V3 behöver en **Web Service**, PostgreSQL och en Cron Job.

### Rekommenderad metod: Render Blueprint

1. Ersätt filerna i GitHub-repot med innehållet i detta paket.
2. Öppna Render.
3. Välj **New → Blueprint**.
4. Välj repot `EricaNordlof/leadgenerator`.
5. Render läser `render.yaml` och skapar:
   - `bumperball-leadgenerator-v3` – Node Web Service
   - `bumperball-leads-db` – PostgreSQL
   - `bumperball-daily-leads` – daglig Cron Job
6. Ange ett starkt värde för `ADMIN_PASSWORD`.
7. Gmail-fälten kan lämnas tomma tills OAuth är konfigurerat.

Render Cron Jobs är en betald tjänst med låg minsta månadskostnad. Cron-scheman använder UTC.

## Gmail-konfiguration

1. Skapa eller välj ett projekt i Google Cloud.
2. Aktivera Gmail API.
3. Konfigurera OAuth consent screen.
4. Skapa OAuth Client ID av typen **Web application**.
5. Lägg till callback-URL:

```text
https://DIN-RENDER-ADRESS.onrender.com/api/integrations/gmail/callback
```

6. Lägg `GMAIL_CLIENT_ID` och `GMAIL_CLIENT_SECRET` i Render.
7. Logga in i appen och öppna **Integrationer → Anslut Gmail**.

Scope som används:

```text
https://www.googleapis.com/auth/gmail.compose
```

## Inbyggda offentliga källor

- Skolverkets skolenhetsregister v2
- OpenStreetMap via Overpass API

Båda dedupliceras med permanenta käll-ID:n. Insamlingen går igenom hela resultatmängden och lägger högst in det konfigurerade antalet nya leads per körning, så en större källa kan ge nya arbetslistor under flera dagar.

## Extra officiella feed-källor

`PUBLIC_FEED_URLS` är en kommaseparerad lista. Varje post kan anges som `namn|https://...`.

```text
PUBLIC_FEED_URLS=Malmö fritidsregister|https://example.malmo.se/data/fritids.csv,Lunds föreningsregister|https://example.lund.se/api/associations.json
PUBLIC_FEED_ALLOWED_DOMAINS=example.malmo.se,example.lund.se
```

En feed måste:

- använda HTTPS
- ligga på en uttryckligen tillåten domän
- vara JSON eller CSV
- ha minst ett organisationsnamn i `organization`, `name`, `company` eller `organisation`

Kontrollera alltid feedens licens och användningsvillkor innan den aktiveras.

## Lokal utveckling

```bash
cp .env.example .env
# Ange ADMIN_PASSWORD i .env
docker compose up --build
```

Öppna `http://localhost:3000`.

Alternativt med lokal PostgreSQL:

```bash
npm install
npm start
```

## Test

```bash
npm test
npm run check
```

## Säkerhet och dataskydd

- Lösenord lagras som bcrypt-hashar.
- Gmail refresh tokens krypteras med AES-256-GCM.
- Sessionsdata lagras i PostgreSQL.
- Skrivande API-anrop kräver en sessionsbunden CSRF-token.
- Offentlig organisationsinformation bör kontrolleras innan kontakt.
- Undvik privata personuppgifter som saknar tydlig yrkes- eller organisationskoppling.
- Dokumentera källan och respektera invändningar mot direktmarknadsföring.

## Viktiga miljövariabler

Se `.env.example`. De viktigaste är:

```text
DATABASE_URL
SESSION_SECRET
APP_ENCRYPTION_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
CRON_SECRET
BOOKING_APP_URL
BOOKING_WEBHOOK_URL
BOOKING_WEBHOOK_SECRET
```
