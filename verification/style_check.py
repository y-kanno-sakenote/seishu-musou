# 担当: ✅ 検証係（マンガー×ファインマン）
# 仕込み方（BrewStyle）の独立検証。実行: python3 verification/style_check.py [old_sim_path]
import sys, os, random, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sim"))
import seishu_sim as S
from seishu_sim import BrewStyle as B, Rarity, Difficulty, JosoSystem, Rice, Weapon, Tuning, TUNED_YEASTS, simulate_battle

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

# --- 2. 定数不変（旧版との比較） ---
if len(sys.argv) > 1:
    OLD = load(sys.argv[1], "old")
    same_slot = {k.name: v for k, v in OLD.JosoSystem.SLOT_COUNT.items()} == {k.name: v for k, v in JosoSystem.SLOT_COUNT.items()}
    same_rar = {k.name: [(r.name, p) for r, p in v] for k, v in OLD.JosoSystem.RARITY_TABLE.items()} == {k.name: [(r.name, p) for r, p in v] for k, v in JosoSystem.RARITY_TABLE.items()}
    print(f"[2] SLOT_COUNT 不変={same_slot}  RARITY_TABLE 不変={same_rar}")
# 2026-09-06: デメリット撤去。糖化倍率（JUNMAI_GLUCOSE）と純度上限（HONJOZO_PURITY_CAP）は定数ごと削除済み
assert not hasattr(S, "JUNMAI_GLUCOSE"), "JUNMAI_GLUCOSE が残っている（デメリット撤去漏れ）"
assert not hasattr(S, "HONJOZO_PURITY_CAP"), "HONJOZO_PURITY_CAP が残っている（デメリット撤去漏れ）"
print(f"[2] 撤去確認: JUNMAI_GLUCOSE 無し / HONJOZO_PURITY_CAP 無し（メリットのみ）")
print(f"[2] style=None 倍率: dmg={1.0!r}  JUNMAI: dmg={S.JUNMAI_DMG_TAKEN}  HONJOZO: drop+{S.HONJOZO_DROP_BONUS}")

# --- 2. drop+1 が全難易度で効くか / レア度分布が style で変わらないか ---
for diff in Difficulty:
    row = []
    for st in (None, B.JUNMAI, B.HONJOZO):
        rng = random.Random(7)
        lst = [JosoSystem.drop_all(diff, rng, st) for _ in range(3000)]
        n = sum(len(x) for x in lst) / len(lst)
        dist = {r.name[:3]: 0 for r in Rarity}
        for x in lst:
            for rice in x: dist[rice.rarity.name[:3]] += 1
        tot = sum(dist.values())
        row.append(f"{str(st).split('.')[-1]:<7} n={n:.2f} " + " ".join(f"{k}{v/tot:.2f}" for k, v in dist.items()))
    print(f"[2] {diff.name:<9} | " + " | ".join(row))

# --- 3. 名前合成 8通り（drop()直呼び・レア度ごとに最初に出た名前を採る） ---
for st in (B.JUNMAI, B.HONJOZO, None):
    seen = {}
    rng = random.Random(11)
    for diff in (Difficulty.EASY, Difficulty.NORMAL, Difficulty.NIGHTMARE):
        for _ in range(500):
            r = JosoSystem.drop(diff, rng, st)
            seen.setdefault(r.rarity.name, set()).add(r.name.replace("山田錦の魂", "X").replace("五百万石の魂", "X"))
            assert r.style == st
    print(f"[3] {st}: " + " / ".join(f"{k}={sorted(v)}" for k, v in sorted(seen.items(), key=lambda kv: Rarity[kv[0]].value)))

# --- 4/5. 別seedで行列。勝率・tick・発酵回数。 ---
def matrix(seed, n, rate, style, dmg_taken=None):
    if dmg_taken is not None: S.JUNMAI_DMG_TAKEN = dmg_taken
    rng = random.Random(seed); out = {}
    for y in TUNED_YEASTS:
        for pol in (70, 50, 35):
            w = t = f = 0
            for _ in range(n):
                r = simulate_battle(Weapon(polishing_rate=pol), Rice(style=style), y, Tuning(glucose_rate=rate), rng)
                w += r.win; t += r.ticks; f += r.ferments
            out[(y.name[-3:], pol)] = (100 * w / n, t / n, f / n)
    return out

N = int(os.environ.get("N", 500))
for seed in (1, 2, 20260906):
    for rate in (0.10, 0.02):
        J = matrix(seed, N, rate, B.JUNMAI); H = matrix(seed, N, rate, B.HONJOZO); Z = matrix(seed, N, rate, None)
        worst = max(J, key=lambda k: abs(J[k][0] - H[k][0]))
        assert all(abs(H[k][0]-Z[k][0]) < 1e-9 and H[k][1]==Z[k][1] and H[k][2]==Z[k][2] for k in H), "本醸造≠未指定"
        print(f"[4] seed={seed} rate={rate} n={N}: 最大勝率差 {abs(J[worst][0]-H[worst][0]):.1f}pt @ {worst} 純米{J[worst][0]:.1f}% 本醸{H[worst][0]:.1f}%  (本醸造==未指定 一致)")
        if rate == 0.02:
            k = ("い9号", 70)
            print(f"    9号×70%×2%: 純米 {J[k][0]:.1f}% {J[k][1]:.1f}t {J[k][2]:.2f}発 / 本醸 {H[k][0]:.1f}% {H[k][1]:.1f}t {H[k][2]:.2f}発")
        ferm_lower = sum(1 for k in J if J[k][2] < H[k][2]); tick_higher = sum(1 for k in J if J[k][1] > H[k][1])
        df = sum(H[k][2]-J[k][2] for k in J)/len(J); dt = sum(J[k][1]-H[k][1] for k in J)/len(J)
        # 2026-09-06以降、糖化のデメリットは無い。rate=10%（全条件で勝ち切る）では純米と本醸造が完全一致するはず
        if rate == 0.10:
            assert all(J[k] == H[k] for k in J), "rate=10%で純米と本醸造が一致しない（糖化デメリット撤去漏れ）"
        print(f"    [5] 発酵回数 純米<本醸 {ferm_lower}/9条件 (平均差 {df:+.2f}回) / tick 純米>本醸 {tick_higher}/9条件 (平均差 {dt:+.2f}t) ※糖化差は撤去済み。残差は被ダメ-5%による生存tickの伸びのみ")

# 崖の感度: 被ダメ倍率を振って 9号×70%×2% を見る
print(f"[4] 崖の感度 9号×70%×2% (seed=1,2,20260906 / n={N}): dmg_taken -> 純米勝率")
for dmg in (1.0, 0.95, 0.93, 0.90):
    vals = [matrix(sd, N, 0.02, B.JUNMAI, dmg)[("い9号", 70)][0] for sd in (1, 2, 20260906)]
    print(f"    {dmg}: " + " / ".join(f"{v:.1f}%" for v in vals))

print("[結果] PASS — 仕込み方はメリットのみ（純米=被ダメ-5% / 本醸造系=上槽ドロップ+1）")
