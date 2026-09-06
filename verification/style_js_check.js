// 担当: ✅ 検証係（マンガー×ファインマン）— 仕込み方（純米／本醸造系）JS移植のスタブ実走
// 使い方: node verification/style_js_check.js index.html
// 見るもの: (a)未指定/honjozoで従来どおりの戦闘値 (b)純米の×0.95のみ (c)本醸造系のドロップ+1のみ・純度上限は不変 (d)名前8通り
// 2026-09-06: デメリット（純米の糖化-10%・本醸造系の純度上限-1）を撤去。ここでは「変化しないこと」を確かめる
const fs = require('fs'), vm = require('vm');
const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const src0 = m[1];
const src = m[1] + "\n;globalThis.__X = { META, G, BREW, BREW_DEFAULT, RARITY, rarityLabel, styleOf, brewDmgTaken, brewDropCount, playerMaxHp, rollDrop, riceText, equipBrewToggle, bagPush, drawEquip, joso: (typeof joso === 'function' ? joso : null), clearKura: (typeof clearKura === 'function' ? clearKura : null) };";
new vm.Script(src, { filename: file }); // 構文チェック
console.log('[parse] OK', file, 'script lines=', src.split('\n').length);

const anyStub = () => new Proxy(function(){}, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : (k === 'length' ? 0 : anyStub()), apply: () => anyStub(), construct: () => anyStub() });
const store = {};
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
try { vm.runInContext(src, ctx, { filename: file }); } catch (e) { console.log('[load] ERROR', e.stack.split('\n').slice(0,4).join('\n')); process.exit(1); }
const X = ctx.__X, { META, G } = X;

let fails = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + ' = ' + JSON.stringify(got) + (ok ? '' : ' （期待 ' + JSON.stringify(want) + '）'));
}
function rice(style, name) { const r = { name: name || '山田錦の魂', rarity: 3, subs: {} }; if (style !== undefined) r.style = style; return r; }
function wear(style, name) { META.rice = rice(style, name); }

// ---- (a) 未指定（styleを持たない旧セーブ）＝従来と完全に同じ ----
console.log('\n[a] style未指定（旧セーブ）＝従来の値');
wear(undefined);
eq('被ダメ倍率', X.brewDmgTaken(), 1);
eq('上槽ドロップ数', X.brewDropCount(), 1);
eq('純度上限', X.playerMaxHp(), 5);
wear(undefined, '雄町の魂');
eq('純度上限（雄町）', X.playerMaxHp(), 6);

// ---- (a') 本醸造系＝戦闘の値は従来のまま（ダメージ・糖化に手を入れない） ----
console.log("\n[a'] 本醸造系＝戦闘の値は従来のまま");
wear('honjozo');
eq('被ダメ倍率', X.brewDmgTaken(), 1);

// ---- (b) 純米＝×0.95 のみ。糖化・ドロップ数・純度上限は据え置き ----
console.log('\n[b] 純米（メリットのみ）');
wear('junmai');
eq('被ダメ倍率', X.brewDmgTaken(), 0.95);
eq('上槽ドロップ数', X.brewDropCount(), 1);
eq('純度上限', X.playerMaxHp(), 5);
wear('junmai', '雄町の魂');
eq('純度上限（雄町）', X.playerMaxHp(), 6);

// ---- (c) 本醸造系＝ドロップ+1 のみ。純度上限は減らさない ----
console.log('\n[c] 本醸造系（メリットのみ）');
wear('honjozo');
eq('上槽ドロップ数', X.brewDropCount(), 2);
eq('純度上限（未指定と同じ）', X.playerMaxHp(), 5);
wear('honjozo', '雄町の魂');
eq('純度上限（雄町・未指定と同じ）', X.playerMaxHp(), 6);

// ---- (c') デメリットが本当に消えているか：BREWの持ち物と、糖化倍率・純度上限が仕込み方で動かないこと ----
console.log("\n[c'] デメリット撤去の確認（2026-09-06）");
eq('BREW.junmai のキー', Object.keys(X.BREW.junmai).sort(), ['desc', 'dmgTaken', 'dropBonus', 'label']);
eq('BREW.honjozo のキー', Object.keys(X.BREW.honjozo).sort(), ['desc', 'dmgTaken', 'dropBonus', 'label']);
eq('brewGlucoseMul は存在しない', typeof ctx.brewGlucoseMul, 'undefined');
eq('brewPurityCap は存在しない', typeof ctx.brewPurityCap, 'undefined');
eq('糖化の式に仕込み方が入らない', /brewGlucoseMul/.test(src0), false);
{
  const caps = [];
  for (const st of [undefined, 'junmai', 'honjozo']) { wear(st); caps.push(X.playerMaxHp()); }
  eq('純度上限は3通りとも同じ', caps, [5, 5, 5]);
  const capsO = [];
  for (const st of [undefined, 'junmai', 'honjozo']) { wear(st, '雄町の魂'); capsO.push(X.playerMaxHp()); }
  eq('純度上限（雄町）も3通りとも同じ', capsO, [6, 6, 6]);
}

// ---- 新しいドロップの既定は本醸造系。style以外はrollDropの出力が変わらない ----
console.log('\n[既定] 新規ドロップの仕込み方');
const d = X.rollDrop(3);
eq('rollDropの既定style', d.style, X.BREW_DEFAULT);
eq('BREW_DEFAULT', X.BREW_DEFAULT, 'honjozo');
eq('rollDropのキー', Object.keys(d).sort(), ['name', 'rarity', 'style', 'subs']);

// ---- (d) 名前8通り（原料軸×精米歩合軸） ----
console.log('\n[d] 名前8通り');
const wantJun = ['普通酒', '特別純米', '純米吟醸', '純米大吟醸'];
const wantHon = ['普通酒', '本醸造', '吟醸', '大吟醸'];
for (let ra = 0; ra < 4; ra++) {
  eq('純米×レア度' + ra, X.rarityLabel({ rarity: ra, style: 'junmai' }), wantJun[ra]);
  eq('本醸造×レア度' + ra, X.rarityLabel({ rarity: ra, style: 'honjozo' }), wantHon[ra]);
}
eq('未指定は本醸造系と同じ表記', [0,1,2,3].map(ra => X.rarityLabel({ rarity: ra })), wantHon);
eq('riceTextにも乗る', X.riceText({ name: '山田錦の魂', rarity: 3, subs: {}, style: 'junmai' }).slice(0, 11), '純米大吟醸・山田錦の魂');

// ---- 装備画面の切り替え（酒米の欄だけ・蔵の外だけ） ----
console.log('\n[切替] 装備画面の仕込み方トグル');
META.bagRice = []; wear('honjozo');
G.mode = 'equip'; G.eqCol = 1; G.eqIdx = 0;
X.equipBrewToggle(); eq('本醸造→純米', X.styleOf(META.rice), 'junmai');
X.equipBrewToggle(); eq('純米→本醸造', X.styleOf(META.rice), 'honjozo');
wear(undefined);
X.equipBrewToggle(); eq('未指定→純米（旧セーブの拾い上げ）', X.styleOf(META.rice), 'junmai');
G.eqCol = 0; const before = X.styleOf(META.rice);
X.equipBrewToggle(); eq('武器の欄では変わらない', X.styleOf(META.rice), before);
G.eqCol = 1; G.mode = 'play'; // 蔵の中＝装備画面ではない
X.equipBrewToggle(); eq('戦闘中は変わらない', X.styleOf(META.rice), before);
G.mode = 'equip';

// ---- 被ダメ×0.95の写像：5%で受け流す（Math.randomを差し替えて境界を見る） ----
console.log('\n[写像] 被ダメ×0.95＝5%で受け流す');
wear('junmai');
eq('受け流す（乱数0.96 >= 0.95）', 0.96 >= X.brewDmgTaken(), true);
eq('受ける（乱数0.94 >= 0.95）', 0.94 >= X.brewDmgTaken(), false);
wear('honjozo');
eq('本醸造は必ず受ける（乱数0.999）', 0.999 >= X.brewDmgTaken(), false);
wear(undefined);
eq('未指定も必ず受ける（乱数0.999）', 0.999 >= X.brewDmgTaken(), false);

// ---- 上槽の実走：本当に袋へ+1個入るか（倍率だけでなく経路を通す） ----
console.log('\n[実走] 上槽のドロップ数');
function josoRun(style) {
  META.bagRice = []; META.yeasts = ['y7']; META.yeast = 'y7'; META.regionClear = {}; META.weapon = META.weapon || null;
  wear(style);
  G.diff = 0; G.rank = 0; G.regionIdx = 0; G.kills = 0; G.regionGauge = 0; G.pendingWeapon = null;
  G.riceBossDone = false; G.hiochiDone = false; G.runLoot = [];
  if (X.joso) { // index.html：選択待ちの1個は袋に入らず、追加ぶんだけ袋へ
    G.node = { boss: false, hasBoss: false };
    X.joso();
    return { bag: META.bagRice.length, extra: (G.result.extraDrops || []).length };
  }
  // moto.html：シームレスなので全部その場で袋へ（1個目は装備が空なら装備される）
  const k = { name: '試験の蔵', rank: 0, x: 0, y: 0, r: 100, state: 'active', node: { boss: false }, riceBossDone: false, hiochiDone: false, riceBoss: null, hiochi: null };
  G.kuras = [k]; G.activeKura = k; G.player = { x: 0, y: 0, hp: 3 };
  X.clearKura(k);
  return { bag: META.bagRice.length, loot: G.runLoot.filter(l => l.type === 'rice').length };
}
const runHon = josoRun('honjozo'), runJun = josoRun('junmai'), runNone = josoRun(undefined);
if (X.joso) {
  eq('本醸造系：袋へ+1・選択待ち1', [runHon.bag, runHon.extra], [1, 1]);
  eq('純米：従来どおり（袋0・追加なし）', [runJun.bag, runJun.extra], [0, 0]);
  eq('未指定：従来どおり（袋0・追加なし）', [runNone.bag, runNone.extra], [0, 0]);
} else {
  eq('本醸造系：酒米2個ぶんの獲得', runHon.loot, 2);
  eq('純米：従来どおり1個', runJun.loot, 1);
  eq('未指定：従来どおり1個', runNone.loot, 1);
}

// ---- 描画経路：装備画面を実際に1フレーム描く（ボタン定義や文言の取りこぼしを拾う） ----
console.log('\n[描画] 装備画面');
for (const [style, col, idx] of [['honjozo', 1, 0], ['junmai', 1, 0], [undefined, 1, 0], ['junmai', 0, 0], ['junmai', 2, 0]]) {
  wear(style); G.mode = 'equip'; G.eqCol = col; G.eqIdx = idx; G.eqMsg = { str: 'テスト', t: 1 };
  let err = null;
  try { X.drawEquip(); } catch (e) { err = e.message; }
  eq('drawEquip(' + style + '・欄' + col + ')', err, null);
}

console.log('\n' + (fails ? '[結果] FAIL ' + fails + '件 — ' + file : '[結果] PASS — ' + file));
process.exit(fails ? 1 : 0);
