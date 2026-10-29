import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { targetMonths, parseMenuCsv, mergeEvents } from './menu.mjs';

export const SOURCES = [
  { type: 'Breakfast', code: 's4', url: 'https://www.schools.nyc.gov/school-life/school-meals/menus/breakfast-meals?value=s4' },
  { type: 'Lunch', code: 's8', url: 'https://www.schools.nyc.gov/school-life/school-meals/menus/school-lunch-meals?value=s8' },
];
const escapeIcs = s => s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const fold = line => { const chunks=[]; let segment=''; for (const ch of line) { if(Buffer.byteLength(segment+ch,'utf8')>73){chunks.push(segment);segment=' '+ch;} else segment+=ch;} chunks.push(segment);return chunks.join('\r\n');};
export function calendar(events){
  const now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NYC School Meals//Menu Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:NYC School Meals','X-WR-TIMEZONE:America/New_York','REFRESH-INTERVAL;VALUE=DURATION:P1D'];
  for(const ev of events){
    const day=ev.date.replaceAll('-','');
    const next=new Date(ev.date+'T12:00:00Z'); next.setUTCDate(next.getUTCDate()+1);
    const nextDay=next.toISOString().slice(0,10).replaceAll('-','');
    lines.push('BEGIN:VEVENT',`UID:${ev.type.toLowerCase()}-${ev.code}-${day}@nyc-school-menu`,`DTSTAMP:${now}`,`DTSTART;VALUE=DATE:${day}`,`DTEND;VALUE=DATE:${nextDay}`,`SUMMARY:${escapeIcs('🍽 '+ev.type+' — '+ev.items.slice(0,2).join(' / '))}`,`DESCRIPTION:${escapeIcs(ev.items.map(x=>'• '+x).join('\n')+'\n\nSource: '+ev.url+'\nMenu subject to change.')}`,`URL:${ev.url}`,'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n')+'\r\n';
}
// The changeMonth click handler calls d3Table(schoolNextN, "Next"). Read
// those same page-defined paths rather than guessing a ?month= URL or filename.
export async function discoverMenus(page, source, months) {
  await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const number = Number(source.code.slice(1));
  await page.waitForFunction(n => typeof window['schoolMenu' + n] === 'string' &&
    typeof window['schoolNext' + n] === 'string', number, { timeout: 30000 });
  const links = await page.evaluate(n => [window['schoolMenu' + n], window['schoolNext' + n]], number);
  return links.map((link, index) => {
    const url = new URL(link + '.csv', source.url);
    const [year, month] = months[index].split('-').map(Number);
    const schoolYear = month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1))).toLowerCase();
    if (url.origin !== new URL(source.url).origin ||
        !url.pathname.startsWith(`/docs/default-source/school-menus/${schoolYear}/${monthName}/`)) {
      throw new Error(`${source.type}: page menu path does not match ${months[index]}: ${url}`);
    }
    return { url: url.href, month: months[index], optional: index === 1 };
  });
}

export async function extract(page, source, months = targetMonths(), warn = console.warn) {
  const menus = await discoverMenus(page, source, months);
  const events = [];
  for (const menu of menus) {
    const response = await page.request.get(menu.url, { timeout: 60000 });
    try {
      // Future menus are sometimes not posted yet. Other HTTP errors, invalid
      // CSVs, or stale dates fail the build, preserving the last deployed feed.
      if (menu.optional && [404, 410].includes(response.status())) {
        warn(`${source.type} ${menu.month}: next month's menu is not published yet (${response.status()}).`);
        continue;
      }
      if (!response.ok()) throw new Error(`${source.type} ${menu.month}: HTTP ${response.status()} fetching ${menu.url}`);
      const list = parseMenuCsv(await response.text(), source, menu.month);
      console.log(`${source.type} ${menu.month}: ${list.length} days`);
      events.push(...list);
    } finally {
      await response.dispose();
    }
  }
  return mergeEvents(events);
}

export async function build() {
  // Pin NYC time for both browser paths and the month validation, even on UTC CI.
  const months = targetMonths();
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  let all = [];
  try {
    const context = await browser.newContext({ timezoneId: 'America/New_York' });
    for (const source of SOURCES) {
      const page = await context.newPage();
      try { all.push(...await extract(page, source, months)); }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
  all = mergeEvents(all);
  for (const source of SOURCES) {
    if (!all.some(x => x.code === source.code && x.date.startsWith(months[0] + '-'))) {
      throw new Error(`Missing current-month ${source.type}; refusing to publish an incomplete feed.`);
    }
  }
  await fs.mkdir('public', { recursive: true });
  await fs.writeFile('public/meals.ics', calendar(all));
  await fs.writeFile('public/index.html', '<h1>NYC School Meals</h1><p><a href="./meals.ics">Calendar feed (ICS)</a></p><p>Menu source: NYC Public Schools. Not affiliated with NYCPS.</p>');
  console.log(`Wrote ${all.length} calendar events`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
}
