import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const SOURCES = [
  { type: 'Breakfast', code: 's4', url: 'https://www.schools.nyc.gov/school-life/school-meals/menus/breakfast-meals?value=s4' },
  { type: 'Lunch', code: 's8', url: 'https://www.schools.nyc.gov/school-life/school-meals/menus/school-lunch-meals?value=s8' },
];
const dateRE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/g;
const weekdayRE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;
const excludeRE = /^(Available Every Day|Offered Daily|Daily Offerings|Daily Menu Options|Notes|All menus are subject to change|Vegetarian Item|Vegan Item)$/i;
const normalize = s => s.replace(/\s+/g,' ').trim();
const escapeIcs = s => s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const fold = line => { const chunks=[]; let segment=''; for (const ch of line) { if(Buffer.byteLength(segment+ch,'utf8')>73){chunks.push(segment);segment=' '+ch;} else segment+=ch;} chunks.push(segment);return chunks.join('\r\n');};
function calendar(events){
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
function parseDate(str){ const d=new Date(str+' 12:00:00 GMT-0400');return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10); }
async function extract(page, source){
  await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(3500);
  const raw=await page.evaluate(({dateSource})=>{
    const re=new RegExp(dateSource,'g');
    const normalize=s=>(s||'').replace(/\s+/g,' ').trim();
    const texts=[...document.querySelectorAll('body *')].filter(e=> e.children.length===0 && re.test(normalize(e.textContent))).slice(0,150);
    const found=[];
    for(const e of texts){
      const match=normalize(e.textContent).match(new RegExp(dateSource));
      if(!match)continue;
      // Find the smallest ancestor that contains the date and multiple menu entries,
      // but does not contain the next day's card.
      let node=e, chosen=null;
      for(let depth=0;node&&depth<8;node=node.parentElement,depth++){
        const text=normalize(node.innerText);
        const dates=text.match(new RegExp(dateSource,'g'))||[];
        if(dates.length!==1)break;
        const lines=(node.innerText||'').split(/\n+/).map(normalize).filter(Boolean);
        if(lines.length>=4 && lines.length<=35){ chosen=node; }
      }
      if(!chosen)continue;
      const lines=(chosen.innerText||'').split(/\n+/).map(normalize).filter(Boolean);
      found.push({date:match[0],lines});
    }
    return [...new Map(found.map(x=>[x.date,x])).values()];
  },{dateSource:dateRE.source});
  if(!raw.length){
    await fs.mkdir('debug',{recursive:true});
    await fs.writeFile(`debug/${source.code}.html`,await page.content());
    await page.screenshot({path:`debug/${source.code}.png`,fullPage:true}).catch(()=>{});
    throw new Error(`No dated menu cards found for ${source.type}. Inspect debug/${source.code}.html and update selector if NYC changed the page.`);
  }
  return raw.map(({date,lines})=>{
    const iso=parseDate(date);
    const items=lines.filter(s=>s!==date&&!weekdayRE.test(s)&&!excludeRE.test(s)&&!/^(V|VE)$/.test(s)).map(s=>s.replace(/\s+(VE|V)$/,' ($1)'));
    return {date:iso,items:[...new Set(items)],type:source.type,code:source.code,url:source.url};
  }).filter(x=>x.date&&x.items.length>0);
}
const browser=await chromium.launch({headless:true});
let all=[];
try{
  for(const source of SOURCES){
    const page=await browser.newPage({viewport:{width:1440,height:1200}});
    const list=await extract(page,source);
    console.log(source.type, list.length,'days:',list.slice(0,2));
    all.push(...list);
    await page.close();
  }
}finally{await browser.close();}
if(!all.some(x=>x.type==='Breakfast')||!all.some(x=>x.type==='Lunch'))throw new Error('Missing breakfast or lunch; refusing to publish an incomplete feed.');
await fs.mkdir('public',{recursive:true});
await fs.writeFile('public/meals.ics',calendar(all));
await fs.writeFile('public/index.html','<h1>NYC School Meals</h1><p><a href="./meals.ics">Calendar feed (ICS)</a></p><p>Menu source: NYC Public Schools. Not affiliated with NYCPS.</p>');
console.log(`Wrote ${all.length} calendar events`);
