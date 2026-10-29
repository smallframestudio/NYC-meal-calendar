# NYC School Meals

This project is independently developed and is not affiliated with or endorsed by NYC Public Schools. Meal information is sourced from NYC Public Schools and may change without notice.

## NYCPS sources

- Breakfast: https://www.schools.nyc.gov/school-life/school-meals/menus/breakfast-meals?value=s4
- Lunch: https://www.schools.nyc.gov/school-life/school-meals/menus/school-lunch-meals?value=s8

Menus may vary by school and can change without notice.

The feed contains every published dated meal in the current and next calendar
months, including earlier dates in the current month. It omits the entire
undated Daily Offerings / Available Every Day rows. Breakfast and lunch remain
separate all-day events, with the complete dated menu in each description.

## How next month works

The NYCPS pages use a JavaScript control (`#changeMonth`), not a separate page URL.
For breakfast `s4`, it switches from `schoolMenu4` to `schoolNext4`; lunch `s8`
switches from `schoolMenu8` to `schoolNext8`. The page's `d3Table` function loads
the selected path with `.csv` appended.

The scraper reads those same page-defined paths with Playwright and downloads
both CSVs. It does not guess a month query parameter or hardcode October or
November. Dates and paths are validated against the current and next months in
America/New_York, including the December/January year change. Reading the CSV
also avoids the page's default behavior of hiding past days in the current month.

A next-month 404 or 410 produces a warning and publishes the available current
month for that meal. Missing current-month data, other HTTP errors, malformed
CSVs, stale dates, or empty dated menus fail the build before writing the feed.
The existing deployment stays live if a build fails. July/August summer menus
are outside this project's two school-year menu sources; unavailable summer
data fails validation rather than publishing incorrectly dated meals.

Events are deduplicated by meal type, menu code, and date. Existing event UIDs,
the embedded calendar name (`NYC School Meals`), and `public/meals.ics` stay
unchanged, so the existing Google Calendar subscription continues to work.

## Build and test

Requires Node.js 22 or later:

```sh
npm install
npm test
npx playwright install chromium
npm run build
```

The generated feed is `public/meals.ics`. If using an existing local Chrome
installation instead of downloaded Chromium, set `CHROMIUM_EXECUTABLE_PATH` to
its executable path. GitHub Actions installs Chromium automatically.

The workflow runs tests before building and publishes the feed daily at
10:20 UTC, or when manually run from Actions → Update school meals calendar.
Google Calendar determines subscription refresh timing.

## Apply this update

Copy the updated project files into the existing repository, preserving the
hidden `.github/workflows/publish.yml` path, then commit and push. Keep GitHub
Pages configured to deploy from GitHub Actions and run the existing workflow.
Alternatively, apply the accompanying patch at the repository root with
`git apply nycmealcalendar-next-month.patch` before committing.

The included generated calendar is a local sample, not a deployed update.

## Validation on October 28, 2026

- 17 automated tests passed, using captured NYCPS CSV fixtures plus error and
  rollover cases.
- Live build: 22 October dates and 21 November dates for each meal, 86 events
  total, with unique UIDs.
- Every extracted date and food was compared with NYCPS's rendered menu cards.
- No daily-offerings rows were included. See `test/fixtures/README.md` for fixture
  sources.

## Subscribe

1. Open Google Calendar on a computer.
2. Under Other calendars, click +.
3. Select From URL.
4. Paste this address:
https://smallframestudio.github.io/nycmealcalendar/meals.ics
