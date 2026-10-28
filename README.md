# NYC Public School Meals → Google Calendar

**Prototype — extractor needs validation against the live NYCPS browser page.**

A daily-updated, subscription-friendly ICS for the **s4 breakfast** and **s8 lunch** menu pages. It attempts to read every item on each dated menu card (rather than the separate “Available Every Day” offerings). It creates a separate all-day event per meal, with the entire menu card in the description. The project is independent of NYC Public Schools.

## Deploy using GitHub Pages

1. Create a **public** GitHub repository and upload this folder's contents, including the hidden `.github/workflows/publish.yml`.
2. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Under **Actions → Update school meals calendar**, select **Run workflow**.
4. Check that the action succeeds and inspect the generated ICS and entries. **If it fails**, GitHub Actions shows the error; inspect debug output locally (the source page may have changed).
5. The subscription URL will be `https://YOUR-USERNAME.github.io/YOUR-REPO/meals.ics` (replace placeholders; use your actual Pages URL).
6. In Google Calendar on the web, choose **Other calendars → + → From URL**, paste the HTTPS URL, then **Add calendar**.

GitHub Actions updates the public feed daily around 10:20 UTC. Google Calendar controls how frequently it refreshes subscribed calendars, so updates may not appear immediately. Google Calendar generally requires publicly accessible ICS feeds; keep this menu calendar public, not personal information.

## Test locally

Requires Node 22 or later:

```sh
npm install
npx playwright install chromium
npm run build
```

Inspect `public/meals.ics` before deploying. If the NYC page uses a different JavaScript format, scraping may need adjustment. Never replace a known-good feed with empty data. Currently the script refuses to publish if it finds no cards for either meal type.

## NYCPS sources

- Breakfast: https://www.schools.nyc.gov/school-life/school-meals/menus/breakfast-meals?value=s4
- Lunch: https://www.schools.nyc.gov/school-life/school-meals/menus/school-lunch-meals?value=s8

Menus may vary by school and can change without notice.
