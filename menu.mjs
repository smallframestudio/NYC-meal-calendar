const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const normalize = s => s.replace(/\s+/g, ' ').trim();

export function targetMonths(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find(p => p.type === 'year').value);
  const month = Number(parts.find(p => p.type === 'month').value);
  return [0, 1].map(offset => {
    const d = new Date(Date.UTC(year, month - 1 + offset, 1));
    return d.toISOString().slice(0, 7);
  });
}

// NYCPS uses semicolons in dates, pipes between foods, and ? before weekdays.
// Still parse CSV quoting so a comma in a quoted food name stays in its field.
export function csvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field !== '') throw new Error('Malformed CSV quote');
      else quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(field); field = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      row.push(field); rows.push(row); row = []; field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else field += ch;
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(row => row.some(cell => cell.trim()));
}

export function parseDate(text) {
  const match = normalize(text.replace(/\?/g, ' ').replace(/;/g, ','))
    .match(/^([A-Za-z]+) (\d{1,2}), (\d{4})(?:\s|$)/);
  if (!match) return null;
  const month = MONTHS.findIndex(m => m.toLowerCase() === match[1].toLowerCase());
  if (month < 0) return null;
  const year = Number(match[3]), day = Number(match[2]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function menuItems(text) {
  return [...new Set(text.replace(/[?{}]/g, '').split('|').flatMap(group => {
    // Match the page's separators, preserving "and/or" and consecutive diet tags.
    const parts = group.split(/\/(?=\s|$)/);
    return parts.length > 1 ? parts : group.split(/(?<=\((?:VE|V|H)\))\s+(?!\s|\((?:VE|V|H)\))/i);
  }).map(normalize).filter(s => s && !/^and$/i.test(s)))];
}

export function parseMenuCsv(text, source, month) {
  const rows = csvRows(text);
  const header = rows.shift();
  if (!header || normalize(header[0]).toLowerCase() !== 'date' ||
      normalize(header[1] || '').toLowerCase() !== 'menu') {
    throw new Error(`${source.type} ${month}: expected Date,Menu CSV`);
  }
  const events = [];
  for (const [label, ...columns] of rows) {
    // Exclude the entire undated daily-offerings row, including all its foods.
    if (/^(?:Available Every Day|Offered Daily|Daily Offerings|Daily Menu Options|Notes)(?:\s|$)/i.test(normalize(label))) continue;
    const date = parseDate(label);
    if (!date || !date.startsWith(month + '-')) {
      throw new Error(`${source.type} ${month}: unexpected menu date ${JSON.stringify(label)}`);
    }
    const items = menuItems(columns.join(','));
    if (!items.length) throw new Error(`${source.type} ${date}: empty menu`);
    events.push({ date, items, type: source.type, code: source.code, url: source.url });
  }
  if (!events.length) throw new Error(`${source.type} ${month}: no dated meals in CSV`);
  return mergeEvents(events);
}

export function mergeEvents(events) {
  const unique = new Map();
  for (const event of events) {
    const key = `${event.type}-${event.code}-${event.date}`;
    const previous = unique.get(key);
    unique.set(key, { ...event, items: [...new Set([...(previous?.items || []), ...event.items])] });
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}
