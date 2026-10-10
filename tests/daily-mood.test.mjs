import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DAILY_MOODS, mergeMoodDays, moodDate, moodMonthCells, nextMoodMidnight, normalizeMoodDays, shiftMoodMonth } from '../app/lib/daily-mood.ts';

test('Shanghai midnight starts a new day independently of the device time zone', () => {
  const before = Date.parse('2026-10-10T15:59:59Z');
  const midnight = Date.parse('2026-10-10T16:00:00Z');
  assert.equal(moodDate(before), '2026-10-10');
  assert.equal(moodDate(midnight), '2026-10-11');
  assert.equal(nextMoodMidnight(before), midnight);
  assert.equal(nextMoodMidnight(midnight), midnight + 86_400_000);
});

test('one entry per day, a stale device cannot undo a later choice or clear', () => {
  const old = { '2026-10-10': {value:'happy',updatedAt:1} };
  const changed = { '2026-10-10': {value:'chill',updatedAt:2} };
  const cleared = { '2026-10-10': {value:'',updatedAt:3} };
  const yesterday = { '2026-10-09': {value:'lucky',updatedAt:1} };
  assert.equal(mergeMoodDays(changed, old)['2026-10-10'].value,'chill');
  const days = mergeMoodDays(old, changed, yesterday, cleared, old);
  assert.equal(Object.keys(days).length,2);
  assert.equal(days['2026-10-10'].value,'');
  assert.equal(days['2026-10-09'].emoji,'🍀');
});

test('calendar aligns weekdays and handles leap February and year boundaries', () => {
  const cells = moodMonthCells('2024-02');
  assert.equal(cells.indexOf('2024-02-01'),4);
  assert.equal(cells.filter(Boolean).length,29);
  assert.equal(cells.length % 7,0);
  assert.equal(shiftMoodMonth('2026-12',1),'2027-01');
  assert.equal(shiftMoodMonth('2026-01',-1),'2025-12');
});

test('invalid stored dates are dropped and custom states keep a safe default face', () => {
  assert.deepEqual(normalizeMoodDays({'2026-02-30':{value:'happy',updatedAt:1}}),{});
  assert.equal(normalizeMoodDays({'2026-10-10':{value:' 自定义心情 ',updatedAt:1}})['2026-10-10'].emoji,'🙂');
  assert.equal(DAILY_MOODS.length,11);
});

const fixture = {store:{}, fail:false};
globalThis[Symbol.for('iooi.daily-mood-test')] = fixture;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if(specifier==='@/app/lib/store') return {url:'data:text/javascript,'+encodeURIComponent(`
      const f=globalThis[Symbol.for('iooi.daily-mood-test')];
      export const readStore=()=>f.store;
      export const withStore=async(fn)=>{if(f.fail)throw new Error('disk');return fn(f.store);};
    `),shortCircuit:true};
    if(specifier==='@/app/lib/daily-mood') return {url:new URL('../app/lib/daily-mood.ts',import.meta.url).href,shortCircuit:true};
    return nextResolve(specifier,context);
  },
});
const {GET,POST} = await import('../app/api/mood/route.ts');
const realNow = Date.now;
const NOW = Date.parse('2026-10-10T04:00:00Z');
test.beforeEach(()=>{fixture.store={settings:{todayState:'sleepy'},sessions:[{id:'keep'}],moods:[{id:'old'}]};fixture.fail=false;Date.now=()=>NOW;});
test.afterEach(()=>{Date.now=realNow;});
test.after(()=>{hooks.deregister();delete globalThis[Symbol.for('iooi.daily-mood-test')];});
const post = (body) => POST(new Request('https://example.test/api/mood',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));

test('the actual API saves and replaces a day while preserving other app data', async()=>{
  const first = await post({date:'2026-10-10',value:'happy',updatedAt:NOW-2});
  assert.equal(first.status,200);
  await post({date:'2026-10-10',value:'chill',updatedAt:NOW});
  await post({date:'2026-10-10',value:'happy',updatedAt:NOW-1});
  const data=await (await GET()).json();
  assert.equal(Object.keys(data.days).length,1);
  assert.equal(data.days['2026-10-10'].value,'chill');
  assert.equal(data.legacyState,'');
  assert.deepEqual(fixture.store.sessions,[{id:'keep'}]);
  assert.deepEqual(fixture.store.moods,[{id:'old'}]);
  assert.equal(fixture.store.settings.todayState,'sleepy');
});

test('delayed offline choices retain their own date after midnight', async()=>{
  const chosenAt=Date.parse('2026-10-09T15:59:59Z');
  const response=await post({date:'2026-10-09',value:'happy',updatedAt:chosenAt});
  assert.equal(response.status,200);
  const data=await (await GET()).json();
  assert.equal(data.days['2026-10-09'].value,'happy');
  assert.equal(data.days['2026-10-10'],undefined);
});

test('GET never guesses which date an undated old status belongs to', async()=>{
  const data=await (await GET()).json();
  assert.deepEqual(data.days,{});
  assert.equal(data.legacyState,'sleepy');
  assert.equal(fixture.store.dailyMoodDays,undefined);
});

test('the API rejects mismatched or invalid dates and reports save errors', async()=>{
  for(const body of [
    {date:'2026-10-09',value:'happy',updatedAt:NOW},
    {date:'2026-10-11',value:'happy',updatedAt:NOW+86_400_000},
    {date:'2026-10-10',value:'happy',updatedAt:-1e100},
    {date:'2026-10-10',value:3,updatedAt:NOW},
  ]) assert.equal((await post(body)).status,400);
  fixture.fail=true;
  assert.equal((await post({date:'2026-10-10',value:'happy',updatedAt:NOW})).status,500);
});
