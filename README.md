# Vidya Academy of Science and Technology – SDG Activities

Static site. No build step.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000
(The site loads JSON, so opening the files directly will not work.)

## Add an activity
Edit `data/activities.json` and add an object:

    {
      "title": "Activity name",
      "date": "2026-09-01",
      "sdgs": [4, 10],
      "department": "NSS",
      "description": "Short summary.",
      "outcomes": "What was achieved.",
      "beneficiaries": 120,
      "hours": 40,
      "image": "images/my-photo.jpg"
    }

Put photos in `images/` (leave `image` empty for a coloured placeholder). The first SDG in `sdgs` sets the placeholder colour. Impact numbers and the per-goal chart update automatically.

## Add a report
Put the PDF in `reports/` and add an entry to `data/reports.json`.

## Deploy
Upload the folder to GitHub Pages, Netlify or any static host.

`data/activities.json` and `data/reports.json` are empty; add real entries (or use the admin page once Firebase is configured).

## Logo and official SDG icons
- Save the college logo as `images/logo.png` (shown in the header; a "V" mark appears if missing).
- Download the official icons from https://www.un.org/sustainabledevelopment/news/communications-material/ (follow the UN usage guidelines) and save them as `images/sdg/1.png` … `images/sdg/17.png` (square, English). Goal tiles and goal pages use them automatically; coloured tiles are the fallback.

## Admin page with Firebase (admin.html)
Until Firebase is configured, the public site shows the sample JSON data and admin.html shows a notice.

1. Go to https://console.firebase.google.com → create a project.
2. **Build → Authentication → Sign-in method**: enable *Email/Password*, then **Users → Add user** for each admin.
3. **Build → Firestore Database**: create a database (production mode). Open **Rules** and paste `firestore.rules`.
4. **Build → Storage**: get started (needs the Blaze plan on newer projects; usage within the free quota costs nothing). Open **Rules** and paste `storage.rules`.
5. In both rules files replace `admin@yourcollege.edu` with your admins' lowercase e-mails (comma separated). Only they can write; everyone can read.
6. **Project settings → Your apps → Web app**: copy the config into `firebase-config.js`.
7. In **Authentication → Settings → Authorized domains** add the domain you deploy to.
8. Open `admin.html`, sign in, and add activities/reports. The public pages update immediately.

Photos are resized to 1600px in the browser before upload. Once Firebase is on, `data/*.json` is no longer used.

## Solar statistics page (solar.html)
Plants, ratings and settings are in `data/solar.json` (`plants`, `config`). Monthly readings (`readings`) come from that file until Firebase is configured; then they come from the Firestore `solar` collection.
1. After Firebase is set up, open `admin.html` → **Solar data** → **Import readings from data/solar.json** (loads the 99 months from the college data sheet).
2. Each month, use **+ Add / edit month** to enter the three plants' generation, KSEB import (zone 1) and export, as in the college electricity data sheet.
3. Paste the updated `firestore.rules` into the Firebase console (it now includes the `solar` collection).

## Gallery (gallery.html)
Put photos in `images/gallery/` (JPEG, ideally under 400 KB each) and list them in `data/gallery.json`:

    { "file": "images/gallery/solar-roof.jpg", "caption": "100 kWp rooftop array", "facility": "solar", "year": "2018", "credit": "VAST" }

`facility` is one of `solar`, `sewage`, `rainwater`, `biogas` or `campus`. The first photo for a facility also appears on that facility's page. Only use photos the college owns or has permission to publish.

## Solar page sections
`solar.html` has four tabs (Overview, Analytics, Impact, Data) driven by one period filter. Plant names, capacities, meters and commissioning dates are in `data/solar.json` (`plants`). CUF, specific yield, seasonal figures and the impact equivalents are computed in `solar.js`; the illustrative conversion factors are in the `F` constant at the top and are disclosed on the page.

## Campus photos
- `images/campus-front.jpg` is the home-page banner and a gallery photo.
- Save the aerial campus photo as `images/campus-aerial.jpg` and it appears behind the solar page header automatically (the green gradient shows until then). Add it to `data/gallery.json` too if you want it in the gallery.
