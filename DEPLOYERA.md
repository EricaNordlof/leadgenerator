# Publicera Bumperball Leadgenerator Pro v3

V3 är inte längre en statisk sida. Den behöver tre Render-resurser:

1. Node Web Service
2. PostgreSQL-databas
3. Daglig Cron Job

## 1. Säkerhetskopiera nuvarande leads

Öppna den publicerade v2-sidan och välj **Exportera CSV**. Spara filen innan du byter version.

## 2. Ersätt GitHub-repots innehåll

Ladda upp samtliga filer och mappar från v3-paketet till `EricaNordlof/leadgenerator`.

Viktigt: mapparna `public`, `src`, `sql`, `scripts` och `tests` ska ligga kvar som mappar i repot.

Commitförslag:

```text
Upgrade to Bumperball Leadgenerator Pro v3
```

## 3. Skapa Blueprint i Render

1. Öppna Render Dashboard.
2. Välj **New → Blueprint**.
3. Välj GitHub-repot `EricaNordlof/leadgenerator`.
4. Render hittar `render.yaml`.
5. Godkänn resurserna.
6. Ange ett starkt `ADMIN_PASSWORD` när Render frågar.

Blueprinten skapar:

- `bumperball-leadgenerator-v3`
- `bumperball-leads-db`
- `bumperball-daily-leads`

Den gamla Static Site-tjänsten kan stängas av efter att v3 fungerar.

## 4. Logga in

- E-post: `kontakt@offroadbumpis.se`
- Lösenord: värdet du angav som `ADMIN_PASSWORD`

## 5. Importera gamla leads

Öppna **Integrationer** i v3. Importera CSV-filen från steg 1 eller använd migreringsknappen på samma enhet där v2 användes.

## 6. Anslut Gmail

Skapa Google OAuth-uppgifter enligt README och lägg in:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`

Callback:

```text
https://DIN-V3-ADRESS.onrender.com/api/integrations/gmail/callback
```

Anslut sedan `kontakt@offroadbumpis.se` från appens integrationssida.

Appen skapar endast Gmail-utkast. Den skickar inte mejl automatiskt.

## 7. Kontrollera den dagliga insamlingen

Kör **Hämta nya leads nu** en gång i appen. Kontrollera:

- att nya poster visas i **Dagens nya**
- att källan är dokumenterad
- att dubbletter inte läggs in igen
- att Gmail får ett sammanfattningsutkast när nya leads hittas

Cron Job kör därefter automatiskt varje dag kl. 05:00 UTC.

## 8. Bokningskoppling

Standardläget öppnar bokningsappen med förifyllda uppgifter. För direkt API-koppling lägger du senare in:

- `BOOKING_WEBHOOK_URL`
- `BOOKING_WEBHOOK_SECRET`

Tills webhooken finns sparas offert- eller bokningsunderlaget ändå i leadgeneratorns databas.
