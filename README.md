# How was the WC? 🚽🏆

Meld vieze wc's op kantoor met foto, scoor punten per categorie en win wekelijks de **Gouden Borstel**.

Gratis: de website draait op **GitHub Pages**, de gedeelde gegevens (meldingen, foto's, scores) in **Supabase**.

## Wat zit erin
- Meldingen met foto, categorie, wc-locatie en beschrijving
- Categorieën: Remsporen, Vieze wc-bril, Plas naast de wc, Vieze wasbak, Schaamhaar
- Scorebord per categorie (deze week / altijd) met titels zoals *Remspoor-Rechercheur*
- Gouden Borstel: weekprijs + Hall of Fame
- "👀 Ik zag het ook"-knop, badges, profiel
- Te installeren op je telefoon als app
- Zonder Supabase-gegevens draait de app in **demomodus** (alleen op je eigen toestel)

---

## Stap 1 — Database (Supabase, ±5 min)
1. Maak een gratis account op **supabase.com** → **New project** (regio: West EU).
2. Ga naar **SQL Editor** → **New query**, plak de hele inhoud van `supabase.sql` en klik **Run**.
   - Alleen collega's toelaten? Vul bovenin het bestand jullie e-maildomein in (bijv. `'bedrijf.nl'`) vóór je op Run klikt.
3. Ga naar **Authentication → Sign In / Providers → Email** en zet **Confirm email** uit
   (dan hoeft niemand een bevestigingsmail te klikken). Mag ook aan blijven.
4. Ga naar **Project Settings → API** (of de knop **Connect**) en kopieer:
   - **Project URL**
   - **anon / publishable key**

## Stap 2 — Instellingen invullen
Open `config.js` en plak beide waarden:
```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ...",
```
Pas eventueel `LOCATIONS` (jullie wc's) en de categorieën aan.

> De anon key mag openbaar in GitHub staan: de database is beveiligd met regels
> (alleen ingelogde collega's kunnen lezen, iedereen kan alleen eigen meldingen wijzigen).
> Deel nooit de **service_role** key.

## Stap 3 — Online zetten (GitHub Pages, ±3 min)
1. Op **github.com**: **New repository** → naam `how-was-the-wc` → **Public** → Create.
2. Klik **uploading an existing file** en sleep alle bestanden en de map `icons` erin → **Commit changes**.
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, map `/ (root)` → **Save**.
4. Na ±1 minuut staat de app op `https://<jouw-gebruikersnaam>.github.io/how-was-the-wc/`.
5. Terug in Supabase: **Authentication → URL Configuration** → zet **Site URL** op dat adres.

## Stap 4 — Op je telefoon zetten
- **iPhone:** open de link in Safari → **Deel** ⬆️ → **Zet op beginscherm**
- **Android:** open in Chrome → menu ⋮ → **App installeren**

Deel de link in de kantoor-groepsapp en laat iedereen een account maken. Veel spotplezier! 🧻

---

### Aanpassen
- **Punten per categorie:** `points` in `config.js` (bijv. remsporen 2 punten)
- **Foto verplicht of niet:** `PHOTO_REQUIRED`
- **Nieuwe categorie:** voeg een regel toe in `CATEGORIES` (kies een nieuwe `id`)
- Na een wijziging: bestand opnieuw uploaden in GitHub; de app pakt het automatisch op.

### Gratis limieten (Supabase free)
500 MB database en 1 GB foto-opslag. Foto's worden verkleind tot ±150 KB, dus ruim 6.000 meldingen.
Let op: een gratis project wordt gepauzeerd na 7 dagen zonder gebruik; dan in Supabase op **Restore** klikken.
