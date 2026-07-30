# Publicera v3.3 på Render

## Enkelt versionsmappsflöde

Repots rot ska innehålla:

```text
leadgenerator/
├── render.yaml
├── bumperball-leadgenerator-v3.2-login-fallback/
└── bumperball-leadgenerator-v3.3/
```

Du behöver inte ersätta filer inne i den gamla mappen.

## Uppladdning

1. Ladda upp hela mappen `bumperball-leadgenerator-v3.3` direkt i repots rot.
2. Ersätt filen `render.yaml` i repots rot med v3.3-versionen som följer med distributionspaketet.
3. Commit:

```text
Deploy Bumperball Leadgenerator v3.3
```

4. Öppna Render:

```text
Blueprints → offroad-bumpis-production → Manual sync
```

Blueprinten ska peka både webbtjänsten och cron-jobbet mot:

```text
bumperball-leadgenerator-v3.3
```

## Hemligheter

Kontrollera efter Blueprint-sync att följande värden fortfarande finns direkt på webbtjänsten:

- `ADMIN_PASSWORD`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`

De ska inte skrivas i `render.yaml` eller visas i skärmbilder.

`ADMIN_PASSWORD` ska inte ligga i den delade miljögruppen. Behåll det endast direkt på webbtjänsten.

## Kontroll efter deploy

1. Öppna `/api/health`. Svaret ska innehålla version `3.3.0`.
2. Inloggningssidan ska visa `Version 3.3`.
3. Logga in. Inloggningsrutan ska försvinna helt.
4. Öppna **Integrationer**.
5. Gmail ska fortfarande vara anslutet.
6. Klicka **Skapa testutkast** och kontrollera Gmail-mappen Utkast.
7. Klicka **Kör insamling nu**.
8. Under **Senaste leadkörningar** ska varje källa visa Klar, Delvis klar eller Misslyckad med diagnostik.
9. Öppna Render Cron `bumperball-daily-leads` och kör **Trigger Run**.

## Första Skolverket-körningen

Skolverkets list-API innehåller bara grunduppgifter. V3.3 hämtar därför detaljer för ett roterande urval aktiva skolor per körning. Det innebär:

- första körningen behöver inte hitta alla Skånes skolor,
- nya skolor kan fyllas på över flera dagliga körningar,
- markören sparas i PostgreSQL och fortsätter där förra körningen slutade.

## Rollback

Om v3.3 får problem ändrar du två rader i `render.yaml` tillbaka till den gamla mappen:

```yaml
rootDir: bumperball-leadgenerator-v3.2-login-fallback
```

Kör sedan Manual sync igen. Databasen och Gmail-kopplingen ligger kvar.
