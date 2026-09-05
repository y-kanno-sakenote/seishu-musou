// 担当: ✅ 検証係（マンガー×ファインマン）— 酵母技 y6/y14 入れ替えのスタブ実走
const fs = require('fs'), vm = require('vm');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const src = m[1] + "\n;globalThis.__X = { ferment, META, G, YEASTS, playerMaxHp, yeastCost };";
// 構文チェック
new vm.Script(src, { filename: file });
console.log('[parse] OK', file, 'script lines=', src.split('\n').length);
// なんでも飲み込むスタブ
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
try { vm.runInContext(src, ctx, { filename: file }); } catch (e) { console.log('[load] ERROR', e.stack.split('\n').slice(0,4).join('\n')); }
const { ferment, META, G, YEASTS, playerMaxHp, yeastCost } = ctx.__X;
console.log('[YEASTS] y6 cost=%d ult=%s | y14 cost=%d ult=%s', YEASTS.y6.cost, YEASTS.y6.ult, YEASTS.y14.cost, YEASTS.y14.ult);
function setup(y) {
  META.yeast = y; META.yeasts = ['y7','y6','y14']; META.rice = null; META.weapon = null;
  G.player = G.player || {}; Object.assign(G.player, { x: 100, y: 100, hp: 2 });
  G.freezeT = 0; G.flash = null; G.texts = []; G.glucose = 100; G.buffT = 0; G.enemies = G.enemies || []; G.waves = G.waves || []; G.particles = G.particles || [];
}
const res = {};
for (const y of ['y6', 'y14', 'y7', 'y18']) {
  setup(y);
  const cost = yeastCost();
  const hp0 = G.player.hp;
  try { ferment(); } catch (e) { console.log('[ferment ' + y + '] ERROR', e.stack.split('\n').slice(0,3).join('\n')); }
  res[y] = { cost, freezeT: G.freezeT, hp: hp0 + '->' + G.player.hp, maxHp: playerMaxHp(), flash: G.flash && G.flash.rgb, banner: G.banner && G.banner.str, texts: G.texts.map(t => t.str).join(''), buffT: G.buffT, glucose: G.glucose };
}
console.log(JSON.stringify(res, null, 1));
// 満タン時に上限を超えないか
setup('y6'); G.player.hp = playerMaxHp(); ferment(); console.log('[y6 at max] hp=', G.player.hp, 'max=', playerMaxHp());
// 凍結中の櫂入れ倍率（attack内の式を直接評価：G.freezeT>0 ? 1.5 : 1）
setup('y14'); ferment(); console.log('[y14 mult] freezeT=', G.freezeT, 'mul=', (G.freezeT > 0 ? 1.5 : 1));
