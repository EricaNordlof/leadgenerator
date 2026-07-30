# Leadgenerator – Nordlöf Nordic

En fristående, mobilvänlig leadgenerator som körs direkt i webbläsaren.

## Funktioner

- Lägg till och prioritera potentiella kunder
- Automatisk leadscore 0–100
- Matchar leadens behov mot Ericas befintliga projekt
- Statuspipeline: ny, kvalificerad, kontaktad, uppföljning, vunnen och förlorad
- Sökning, filtrering och sortering
- Personligt kontaktutkast för varje lead
- CSV-import och export
- Lokal lagring i webbläsaren utan databas eller API-nycklar

## Starta

Öppna `index.html` direkt i webbläsaren. För publicering kan hela mappen läggas på GitHub Pages, Netlify eller Render Static Site.

## CSV-kolumner

Minimikrav: `company`.

Rekommenderade kolumner:

```text
company,industry,city,website,contactName,email,need,status,followup,notes
```

## Nästa produktionssteg

1. Backend med inloggning och PostgreSQL/MongoDB.
2. Automatisk företagsinsamling från tillåtna datakällor.
3. E-postintegration med utkast, inte automatisk massutskick.
4. Webbplatsanalys med kontroller för mobilvänlighet, SSL, laddtid och tydlig CTA.
5. Dubblettkontroll och GDPR-fält för källa, rättslig grund och radering.
