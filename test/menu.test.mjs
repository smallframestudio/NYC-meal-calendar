import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { targetMonths, csvRows, parseDate, menuItems, parseMenuCsv, mergeEvents } from '../menu.mjs';
import { SOURCES, calendar, extract, discoverMenus } from '../scrape.mjs';

const breakfast = SOURCES[0];
const months = ['2026-10', '2026-11'];
const csv = (month, food = 'Pancakes (V)') => `Date,Menu\nDaily Offerings,{DO NOT INCLUDE MILK}\n${month} 1; 2026?Monday,{${food}}\n`;

for (const source of SOURCES) {
  for (const [month, count, first, last] of [
    ['2026-10', 22, '2026-10-01', '2026-10-30'],
    ['2026-11', 21, '2026-11-02', '2026-11-30'],
  ]) {
    test(`published ${source.type} ${month}: every dated row, no daily offerings`, async () => {
      const text = await fs.readFile(new URL(`fixtures/${source.type.toLowerCase()}-${month}.csv`, import.meta.url), 'utf8');
      const events = parseMenuCsv(text, source, month);
      assert.equal(events.length, count);
      assert.equal(events[0].date, first);
      assert.equal(events.at(-1).date, last);
      assert.equal(new Set(events.map(e => e.date)).size, count);
      assert.ok(events.every(e => e.items.length && e.items.every(item =>
        !/\bMilk\b|Daily Offerings|Daily Lunch Specials|Options may vary/i.test(item))));
      if (month === '2026-11') assert.ok(events.some(e => e.date === '2026-11-03'), 'weekday annotations remain dates');
    });
  }
}

test('NYC month boundaries and December/January rollover', () => {
  assert.deepEqual(targetMonths(new Date('2027-01-01T04:59:00Z')), ['2026-12', '2027-01']);
  assert.deepEqual(targetMonths(new Date('2027-01-01T05:00:00Z')), ['2027-01', '2027-02']);
  assert.deepEqual(targetMonths(new Date('2026-09-01T03:59:00Z')), ['2026-08', '2026-09']);
});

test('date parsing validates actual days without timezone shifts', () => {
  assert.equal(parseDate('November 3; 2026?Tuesday (Election Day)'), '2026-11-03');
  assert.equal(parseDate('February 29; 2028?Tuesday'), '2028-02-29');
  assert.equal(parseDate('February 29; 2027?Monday'), null);
  assert.equal(parseDate('November 31; 2026'), null);
  assert.equal(parseDate('Available Every Day'), null);
});

test('quoted CSV fields preserve commas, quotes, BOM, and line breaks', () => {
  assert.deepEqual(csvRows('\uFEFFDate,Menu\r\n"November 1, 2026","A, B\nC ""special"""\r\n'),
    [['Date', 'Menu'], ['November 1, 2026', 'A, B\nC "special"']]);
  assert.throws(() => csvRows('Date,Menu\n"unclosed'), /Unterminated/);
});

test('food separators preserve and/or and consecutive diet tags', () => {
  assert.deepEqual(menuItems('{A (VE)   (H) B (V)|Peanut and/or Sunflower Butter (VE)|Ketchup (VE)/ Mustard (VE)|and|A (VE) (H)}'),
    ['A (VE) (H)', 'B (V)', 'Peanut and/or Sunflower Butter (VE)', 'Ketchup (VE)', 'Mustard (VE)']);
});

test('everyday foods are removed as a row, including Available Every Day', () => {
  const events = parseMenuCsv(csv('October') + 'Available Every Day,{MILK AND CEREAL}\n', breakfast, months[0]);
  assert.deepEqual(events[0].items, ['Pancakes (V)']);
});

test('reject stale months, invalid CSV, undated rows, and empty dated meals', () => {
  for (const text of ['<html>error</html>', 'Date,Menu\n', csv('September'),
    'Date,Menu\nBad date,{Food}', csv('October', '')]) {
    assert.throws(() => parseMenuCsv(text, breakfast, months[0]));
  }
});

test('overlapping data merges items into one event per meal/date', () => {
  const one = parseMenuCsv(csv('October'), breakfast, months[0])[0];
  const all = mergeEvents([one, { ...one, items: ['Pancakes (V)', 'Eggs (V)'] },
    { ...one, code: 's8', type: 'Lunch' }]);
  assert.equal(all.length, 2);
  assert.deepEqual(all[0].items, ['Pancakes (V)', 'Eggs (V)']);
});

function fakePage(statuses = [200, 200], bodies = [csv('October'), csv('November')]) {
  const links = months.map((month, i) => `/docs/default-source/school-menus/2026-2027/${['october', 'november'][i]}/pre-k---8-breakfast-menu`);
  const calls = [], disposed = [];
  return { calls, disposed, goto: async () => {}, waitForFunction: async () => {},
    evaluate: async () => links,
    request: { get: async url => {
      const i = calls.push(url) - 1;
      return { status: () => statuses[i], ok: () => statuses[i] === 200,
        text: async () => bodies[i], dispose: async () => { disposed.push(i); } };
    } },
  };
}

test('fetch both page-defined CSVs and preserve source URLs', async () => {
  const page = fakePage();
  const events = await extract(page, breakfast, months);
  assert.deepEqual(events.map(e => e.date), ['2026-10-01', '2026-11-01']);
  assert.ok(events.every(e => e.url === breakfast.url));
  assert.equal(page.calls.length, 2);
  assert.match(page.calls[1], /\/november\/pre-k---8-breakfast-menu.csv$/);
  assert.deepEqual(page.disposed, [0, 1]);
});

for (const status of [404, 410]) {
  test(`unpublished next month (${status}) keeps current meals and warns`, async () => {
    const warnings = [], page = fakePage([200, status]);
    const events = await extract(page, breakfast, months, message => warnings.push(message));
    assert.equal(events.length, 1);
    assert.match(warnings[0], /not published yet/);
    assert.deepEqual(page.disposed, [0, 1]);
  });
}

test('missing current month, transient errors, and malformed next month fail', async () => {
  for (const statuses of [[404, 200], [200, 500], [200, 403]]) {
    await assert.rejects(extract(fakePage(statuses), breakfast, months), /HTTP/);
  }
  await assert.rejects(extract(fakePage([200, 200], [csv('October'), '<html>error</html>']), breakfast, months), /expected Date,Menu/);
});

test('discovery rejects stale or unexpected paths', async () => {
  await assert.rejects(discoverMenus(fakePage(), breakfast, ['2026-11', '2026-12']), /does not match/);
  const page = fakePage();
  page.evaluate = async () => ['https://example.org/unexpected', 'https://example.org/unexpected'];
  await assert.rejects(discoverMenus(page, breakfast, months), /does not match/);
});

test('ICS retains subscription name and stable UIDs across month rollover', () => {
  const event = parseMenuCsv(csv('November', 'A, B; C \\ D (V)'), breakfast, months[1])[0];
  const ics = calendar([event]);
  assert.match(ics, /X-WR-CALNAME:NYC School Meals\r\n/);
  assert.match(ics, /UID:breakfast-s4-20261101@nyc-school-menu\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261102\r\n/);
  assert.match(ics, /A\\, B\\; C \\\\ D/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
});
