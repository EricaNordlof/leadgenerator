# Bumperball Leadgenerator – Offroad Bumpis v2.1

En fristående och mobilvänlig leadgenerator för att hitta, prioritera och kontakta målgrupper som kan boka bumperballs i Skåne.

## Fokus

- Skolor, fritids och fritidsgårdar
- Fotbollsklubbar och ungdomslag
- Föreningar
- Företag
- Eventbyråer
- Fest- och konferenslokaler
- Barnkalas, kickoff, teambuilding, möhippa, svensexa och andra gruppaktiviteter

## Produkter

- **Barnbollar:** 7–12 år, max 60 kg. 12 bollar finns bokningsbara.
- **Vuxenbollar:** från 12 år, max 90 kg. 12 bollar är bokningsbara från 1 september 2026.

## Funktioner i v2.1

- Kompakt leadpanel med infällbar poängförklaring
- Separat kontaktassistent i ett fokuserat arbetsfönster
- Kontaktutkast skapas automatiskt när assistenten öppnas
- Fullskärmsläge för kontaktassistenten på mobil
- Bumperball-anpassad leadscore 0–100
- Poängförklaring för varje lead
- Matchning mot barnbollar, vuxenbollar eller kombinationsupplägg
- Rekommenderat antal bollar utifrån uppskattad gruppstorlek
- Varning om vuxenbollar väljs till ett event före 1 september 2026
- Statuspipeline: ny, kvalificerad, kontaktad, uppföljning, offert, bokad och inte aktuell
- Statistik för heta leads, uppföljningar och bolltyp
- Färdiga kontaktutkast för första kontakt, uppföljning och planerat event
- Ämnesrad, kopieringsknappar och `mailto:`-länk
- Leadspaning med färdiga Google- och Google Maps-sökningar
- CSV-import och export
- Dubblettkontroll vid import och manuell registrering
- Migrering av egna leads från den tidigare versionen
- Lokal lagring i webbläsaren utan databas eller API-nycklar

## Publicering

Projektet består av statiska filer och kan publiceras på Render Static Site.

- Build Command: `echo "No build required"`
- Publish Directory: `.`

När filerna ersätter de nuvarande filerna i GitHub-repot publicerar Render automatiskt den nya versionen om Auto-Deploy är inställt på **On Commit**.

## CSV-kolumner

```text
organization,segment,city,contactName,email,phone,website,sourceUrl,sourceType,sourceCheckedAt,occasion,productType,participants,eventDate,intent,locationFit,recurring,opportunity,status,followup,notes
```

Minimikrav: `organization`. Äldre kolumnnamn som `company`, `industry` och `need` stöds också vid import.

## Viktigt om lagring

Leads sparas i `localStorage` i den aktuella webbläsaren. Exportera regelbundet CSV som säkerhetskopia. Data synkas inte automatiskt mellan mobil och dator.

## Nästa produktionssteg

1. Inloggning och gemensam databas.
2. Automatisk insamling från tillåtna offentliga företags- och föreningskällor.
3. Gemensam pipeline på mobil och dator.
4. E-postutkast via ansluten brevlåda, utan automatisk massutskickning.
5. Bokningskoppling som omvandlar en vunnen lead till offert eller bokning.
