# NYCPS menu fixtures

Downloaded October 28, 2026, from the CSV paths used by the next-month controls
on these public pages:

- https://www.schools.nyc.gov/school-life/school-meals/menus/breakfast-meals?value=s4
- https://www.schools.nyc.gov/school-life/school-meals/menus/school-lunch-meals?value=s8

CSV sources:

- https://www.schools.nyc.gov/docs/default-source/school-menus/2026-2027/october/pre-k---8-breakfast-menu.csv
- https://www.schools.nyc.gov/docs/default-source/school-menus/2026-2027/november/pre-k---8-breakfast-menu.csv
- https://www.schools.nyc.gov/docs/default-source/school-menus/2026-2027/october/pre-k---8-lunch-menu.csv
- https://www.schools.nyc.gov/docs/default-source/school-menus/2026-2027/november/pre-k---8-lunch-menu.csv

Each October CSV has 22 dated rows, each November CSV has 21. Undated Daily
Offerings rows are intentionally present so the tests verify their exclusion.
Line endings and trailing whitespace are normalized. Fixtures are snapshots
for regression testing; production always fetches the current page-defined files.
