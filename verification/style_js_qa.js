// 担当: ✅ 検証係（マンガー×ファインマン）— 仕込み方JS移植（8222766）の独立検証
// 使い方: node verification/style_js_qa.js index.html   /   node verification/style_js_qa.js moto.html
// 見るもの: (1)旧セーブ（style無し）読み込みで例外なし (2)新規ドロップ=honjozo (3)Bトグルが equip 以外の全モードで拒否
//          (4)update()を実走して接触ダメージ経路に受け流しが本当に効くか (5)新規プレイヤーの既定経路で純度上限が変わらないか
// 2026-09-06: デメリット撤去（純米の糖化-10%・本醸造系の純度上限-1）に追随。純度上限は仕込み方で動かないことを確かめる
const fs = require('fs'), vm = require('vm');
const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const src0 = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const EXPORTS = "\n;globalThis.__X = { META, G, BREW_DEFAULT: (typeof BREW_DEFAULT==='undefined'?null:BREW_DEFAULT), styleOf: (typeof styleOf==='function'?styleOf:null), brewDmgTaken: (typeof brewDmgTaken==='function'?brewDmgTaken:null), brewDropCount: (typeof brewDropCount==='function'?brewDropCount:null), playerMaxHp, rollDrop, riceText, itemDetail, equipBrewToggle: (typeof equipBrewToggle==='function'?equipBrewToggle:null), update, spawnEnemy, enterRegion, draw, drawEquip, kojiIs, startKura: (typeof startKura==='function'?startKura:null), newRun: (typeof newRun==='function'?newRun:null), enterKura: (typeof enterKura==='function'?enterKura:null) };";
const src = src0 + EXPORTS;

const anyStub = () => new Proxy(function(){}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : (k === 'length' ? 0 : anyStub()), apply: () => anyStub(), construct: () => anyStub() });
function load(preSave, srcOverride) {
  const store = {};
  if (preSave) store['moromi_meta'] = JSON.stringify(preSave);
  const ctx = {
    console, Math, JSON, Object, Array, Number, String, Date, Symbol, Error, Proxy, parseInt, parseFloat, isFinite, Set, Map, Promise,
    innerWidth: 960, innerHeight: 640,
    document: { getElementById: () => ({ getContext: () => anyStub(), style: {}, width: 0, height: 0, addEventListener(){}, }), body: { addEventListener(){} }, addEventListener(){}, querySelector: () => anyStub(), createElement: () => anyStub() },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    addEventListener(){}, removeEventListener(){}, requestAnimationFrame(){}, setTimeout(){}, setInterval(){}, clearTimeout(){}, cancelAnimationFrame(){},
    navigator: { vibrate(){} }, performance: { now: () => 0 }, location: { search: '' }, Image: function(){},
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(srcOverride || src, ctx, { filename: file });
  return { X: ctx.__X, store };
}
let fails = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + ' = ' + JSON.stringify(got) + (ok ? '' : ' （期待 ' + JSON.stringify(want) + '）'));
}
const realRandom = Math.random;

// ---- (1) 旧セーブ（style 無し・v1 形式そのまま）を localStorage に置いてから読み込む ----
console.log('\n[1] 旧セーブ（style無し）の読み込み');
const oldSave = { v: 1, polish: 70, koku: 120, best: 40, regionClear: { 0: true }, gokui: ['kai'], mute: false,
  rice: { name: '雄町の魂', rarity: 1, subs: { amylase: true } },
  bagRice: [{ name: '山田錦の魂', rarity: 3, subs: { teion: true, hiire: true } }, { name: '五百万石の魂', rarity: 0, subs: {} }],
  weapon: { type: 'daito', koji: 'white', style: 'lid' }, bagWeapons: [], yeasts: ['y7'], yeast: 'y7' };
let L;
try { L = load(oldSave); console.log('  ok   例外なしで読み込めた'); } catch (e) { fails++; console.log('  FAIL 読み込みで例外: ' + e.message); process.exit(1); }
{
  const { X } = L; const { META, G } = X;
  eq('META.rice.style は undefined のまま', META.rice.style, undefined);
  eq('styleOf(旧rice)=null', X.styleOf(META.rice), null);
  eq('旧セーブ 被ダメ倍率', X.brewDmgTaken(), 1);
  eq('旧セーブ ドロップ数', X.brewDropCount(), 1);
  eq('旧セーブ 純度上限（雄町）', X.playerMaxHp(), 6);
  let err = null; let txt = '';
  try { txt = X.riceText(META.rice) + ' | ' + X.itemDetail({ r: META.bagRice[0] }) + ' | ' + X.itemDetail({ r: META.bagRice[1] }); } catch (e) { err = e.message; }
  eq('riceText/itemDetail 例外なし', err, null);
  console.log('       表示: ' + txt);
  err = null;
  try { G.mode = 'equip'; G.eqCol = 1; G.eqIdx = 2; X.drawEquip(); } catch (e) { err = e.message; }
  eq('drawEquip（旧セーブ・袋の普通酒を選択）例外なし', err, null);
  // 旧セーブの表示名は本醸造系と同じなのに効果は本醸造系ではない → 名前と仕込み方欄の食い違いを記録
  console.log('       【観察】旧riceの表示名=' + X.riceText(META.rice).split('・')[0] + ' / 仕込み方欄=未設定 / ドロップ数=' + X.brewDropCount() + ' / 上限=' + X.playerMaxHp());
}

// ---- (2) 新規プレイヤーの既定経路：セーブ無し → 最初のドロップ → 装備 → 純度上限 ----
console.log('\n[2] 新規プレイヤーの既定経路（セーブ無し）');
{
  const { X } = load(null); const { META, G } = X;
  eq('開始時 META.rice=null → 純度上限', X.playerMaxHp(), 5);
  Math.random = realRandom;
  const styles = new Set(); let keysOk = true;
  for (let i = 0; i < 200; i++) { const d = X.rollDrop(i % 4); styles.add(d.style); if (!('style' in d)) keysOk = false; }
  eq('rollDrop 200回の style 集合', [...styles], ['honjozo']);
  eq('rollDrop 200回すべて style キーあり', keysOk, true);
  META.rice = X.rollDrop(0, '山田錦の魂');
  eq('最初のドロップ（山田錦・既定honjozo）を装備した直後の純度上限（従来と同じ5）', X.playerMaxHp(), 5);
  const capsByStyle = [undefined, 'junmai', 'honjozo'].map(st => { META.rice = { name: '山田錦の魂', rarity: 0, subs: {} }; if (st) META.rice.style = st; return X.playerMaxHp(); });
  eq('仕込み方3通りで純度上限が動かない', capsByStyle, [5, 5, 5]);
  console.log('       【観察】既定ドロップ=honjozo でも純度上限は5のまま（2026-09-06に本醸造系のデメリットを撤去）');
}

// ---- (3) Bトグルの拒否：equip 以外の全モード ----
console.log('\n[3] Bトグルの拒否（equip以外）');
{
  const { X } = load(null); const { META, G } = X;
  META.rice = { name: '山田錦の魂', rarity: 2, subs: {}, style: 'honjozo' }; META.bagRice = [];
  G.eqCol = 1; G.eqIdx = 0;
  for (const mode of ['title', 'world', 'diffsel', 'map', 'battle', 'result', 'regionclear', 'over']) {
    G.mode = mode; X.equipBrewToggle();
    eq('mode=' + mode + ' で style 不変', X.styleOf(META.rice), 'honjozo');
  }
  G.mode = 'equip'; X.equipBrewToggle(); eq('mode=equip でだけ切り替わる', X.styleOf(META.rice), 'junmai');
  // 袋の中の酒米にも効く（装備していない米の style を変えても戦闘値は装備中の米で決まる）
  META.bagRice = [{ name: '五百万石の魂', rarity: 1, subs: {}, style: 'honjozo' }];
  G.eqIdx = 1; X.equipBrewToggle();
  eq('袋の1個目が切り替わる', X.styleOf(META.bagRice[0]), 'junmai');
  eq('装備中は junmai のまま', X.styleOf(META.rice), 'junmai');
}

// ---- (4) update() 実走：接触ダメージ経路 ----
console.log('\n[4] update() 実走：敵接触→純度減少の経路に受け流しが効くか');
function contactRun(X, style, rnd, weapon) {
  const { META, G } = X;
  META.rice = { name: '山田錦の魂', rarity: 2, subs: {}, style }; META.weapon = weapon || null; META.gokui = []; META.yeasts = ['y7']; META.yeast = 'y7';
  Math.random = realRandom;
  if (X.startKura) { X.enterRegion(0, 0); X.startKura({ name: '試験蔵', boss: false, hasBoss: false, rank: 0, mod: {} }); }
  else { X.enterRegion(0, 0); } // moto: シームレスで直接 battle
  const p = G.player;
  G.enemies = []; X.spawnEnemy(false, true);
  const e = G.enemies[0]; e.x = p.x + 5; e.y = p.y; e.kx = 0; e.ky = 0; e.sp = 0;
  p.inv = 0; const hp0 = p.hp;
  Math.random = () => rnd;
  let err = null;
  try { X.update(1 / 60); } catch (er) { err = er.message; }
  Math.random = realRandom;
  return { err, hpDelta: p.hp - hp0, inv: +p.inv.toFixed(2), mode: G.mode };
}
{
  const { X } = load(null);
  let r;
  r = contactRun(X, 'junmai', 0.999);  eq('純米・乱数0.999 → 受け流し（hp±0, inv0.5）', [r.err, r.hpDelta, r.inv], [null, 0, 0.5]);
  r = contactRun(X, 'junmai', 0.949);  eq('純米・乱数0.949 → 被弾（hp-1, inv1.1）', [r.err, r.hpDelta, r.inv], [null, -1, 1.1]);
  r = contactRun(X, 'junmai', 0.95);   eq('純米・乱数0.950 境界 → 受け流し', [r.err, r.hpDelta], [null, 0]);
  r = contactRun(X, 'honjozo', 0.999); eq('本醸造・乱数0.999 → 被弾', [r.err, r.hpDelta, r.inv], [null, -1, 1.1]);
  r = contactRun(X, undefined, 0.999); eq('未指定・乱数0.999 → 被弾', [r.err, r.hpDelta, r.inv], [null, -1, 1.1]);
  r = contactRun(X, 'honjozo', 0.1, { type: 'daito', koji: 'white', style: 'lid' }); eq('白麹・乱数0.1 → 白麹が弾く（従来どおり）', [r.err, r.hpDelta, r.inv], [null, 0, 0.5]);
  r = contactRun(X, 'junmai', 0.3, { type: 'daito', koji: 'white', style: 'lid' });  eq('白麹×純米・乱数0.3 → どちらも通らず被弾', [r.err, r.hpDelta], [null, -1]);
  // 乱数消費：旧版（8222766~1）と新版で、同じ接触1回の update() の Math.random 呼び出し回数を比べる
  function countCalls(Xc, style) {
    const { META, G } = Xc; META.rice = { name: '山田錦の魂', rarity: 2, subs: {} }; if (style) META.rice.style = style; META.weapon = null; META.gokui = []; META.yeasts = ['y7']; META.yeast = 'y7';
    Math.random = realRandom; Xc.enterRegion(0, 0); Xc.startKura && Xc.startKura({ name: '試験蔵', boss: false, hasBoss: false, rank: 0, mod: {} });
    G.enemies = []; Xc.spawnEnemy(false, true); const e = G.enemies[0]; e.x = G.player.x + 5; e.y = G.player.y; e.kx = 0; e.ky = 0; e.sp = 0; G.player.inv = 0;
    G.spawnT = -999; // 湧きの乱数を止める（接触判定だけ数える）
    let calls = 0; Math.random = () => { calls++; return 0.5; }; Xc.update(1 / 60); Math.random = realRandom; return calls;
  }
  const oldHtml = require('child_process').execSync('git show 8222766~1:' + file, { encoding: 'utf8' });
  const oldSrc = oldHtml.match(/<script>([\s\S]*?)<\/script>/)[1] + EXPORTS;
  const Xold = load(null, oldSrc).X;
  const cOld = countCalls(Xold, undefined), cNone = countCalls(load(null).X, undefined), cHon = countCalls(load(null).X, 'honjozo'), cJun = countCalls(load(null).X, 'junmai');
  console.log('       接触1回の update() の Math.random 回数: 旧版=' + cOld + ' / 新版 未指定=' + cNone + ' / 本醸造=' + cHon + ' / 純米=' + cJun + '（JSは無seed。旧版と一致しなければ乱数列は変わる）');
}

// ---- (5) 「5%で受け流す」の統計：ボス戦（被弾機会10〜20発）×1000回 ----
console.log('\n[5] 5%受け流しの統計（1000戦×被弾機会10〜20発、seed固定の擬似乱数）');
{
  let s = 20260906; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const fights = 1000; let totalOpp = 0, totalTaken = 0, zeroBlock = 0, dist = {};
  for (let f = 0; f < fights; f++) {
    const n = 10 + Math.floor(rnd() * 11); let taken = 0;
    for (let i = 0; i < n; i++) if (rnd() < 0.95) taken++;
    totalOpp += n; totalTaken += taken; const b = n - taken; if (b === 0) zeroBlock++; dist[b] = (dist[b] || 0) + 1;
  }
  const ratio = totalTaken / totalOpp;
  console.log('       被弾期待値の比（純米/本醸造）= ' + ratio.toFixed(4) + '（理論0.95）・受け流し0発の戦闘=' + (zeroBlock / fights * 100).toFixed(1) + '%・受け流し回数の分布=' + JSON.stringify(dist));
  eq('比が0.95±0.01に入る', Math.abs(ratio - 0.95) < 0.01, true);
  // 純度上限は仕込み方に関わらず5。15発被弾機会での到達HP分布は本題外。受け流し0発率だけ記録
}

console.log('\n' + (fails ? '[結果] FAIL ' + fails + '件 — ' + file : '[結果] PASS — ' + file));
process.exit(fails ? 1 : 0);
