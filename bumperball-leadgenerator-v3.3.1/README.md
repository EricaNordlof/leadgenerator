# Bumperball Leadgenerator Pro v3.3

Produktionsversion för **Offroad Bumpis**, en del av enskilda firman **Nordlöf Nordic**.

- E-post: kontakt@offroadbumpis.se
- Telefon: 0793442520
- Webb: https://offroadbumpis.se

## Produkter

- **Barnbollar:** 7–12 år, max 60 kg.
- **Vuxenbollar:** från 12 år, max 90 kg, bokningsbara från 1 september 2026.

## Vad v3.3 gör

1. Gemensam PostgreSQL-pipeline på mobil och dator.
2. Inloggning med administratörskonto.
3. Daglig och manuell insamling från tillåtna offentliga källor.
4. Skolverkets aktuella `data.attributes`-format stöds.
5. Skolverket granskas stegvis med sparad markör, så hela registret täcks över tid utan tusentals detaljanrop samtidigt.
6. OpenStreetMap delas i mindre geografiska frågor och växlar mellan flera offentliga Overpass-servrar vid fel.
7. Källor kan bli **Klar**, **Delvis klar** eller **Misslyckad**, med diagnostik i gränssnittet.
8. Dubbletter stoppas även när samma organisation hittas i olika källor.
9. Gmail skapar endast utkast. Ett särskilt testutkast kan skapas under Integrationer.
10. Vunnen lead kan omvandlas till offert- eller bokningsunderlag.

## Viktiga v3.3-fixar

- Rättar att inloggningsvyn kunde ligga kvar ovanpå dashboarden.
- Rättar Skolverkets lista som nu ligger i `data.attributes`.
- Hämtar detaljer för ett begränsat, roterande urval aktiva skolenheter per körning.
- Delar OpenStreetMap-frågan i mindre delar och använder reservservrar.
- Visar felorsak, antal hittade poster, körtid och teknisk diagnostik.
- Hindrar två leadinsamlingar från att köras samtidigt.
- Ökar klientens timeout för en manuell insamling.
- Lägger till Gmail-testutkast.

## Daglig körning

Render Cron kör normalt 05:00 UTC. Körningen:

1. granskar upp till 360 aktiva skolenheter från Skolverket,
2. söker relevanta fotbollsklubbar, föreningar, eventlokaler och företag i Skåne via OpenStreetMap,
3. prioriterar kontaktbara och högt poängsatta leads,
4. lägger till högst 80 nya leads totalt,
5. uppdaterar redan kända leads,
6. skapar ett sammanfattningsutkast i Gmail när nya leads hittats och Gmail är anslutet.

Inga mejl skickas automatiskt.

## Kommandon

```bash
npm install
npm test
npm run check
npm start
```

## Miljövariabler

Se `.env.example`. Hemligheter ska endast finnas i Render, aldrig i GitHub:

- `ADMIN_PASSWORD`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `SESSION_SECRET`
- `APP_ENCRYPTION_KEY`
- `CRON_SECRET`
- `BOOKING_WEBHOOK_SECRET`

## Tester

V3.3 innehåller tester för bland annat:

- Skolverkets aktuella `data.attributes`-format,
- äldre JSON:API- och HAL-format,
- skolenhetsdetaljer,
- uppdelning av Skåne i mindre Overpass-områden,
- roterande detaljgranskning,
- leadscore, paketstorlek och bokningsunderlag.

## Version 3.3.1

- Ämnesrad och meddelande är redigerbara och stöder inklistring.
- Gmail-utkastet använder exakt texten som visas i formuläret.
- Tomma fält kan fortfarande fyllas automatiskt från kontaktmallen.
- Anpassad text valideras och sparas tillsammans med Gmail-utkastet.
