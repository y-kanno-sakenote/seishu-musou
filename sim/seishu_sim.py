# -*- coding: utf-8 -*-
"""清酒無双 数値層シミュレータ（Python正典）

概念対応（docs/concept.md が正）:
- 並行複発酵 = 通常攻撃で糖化（ブドウ糖）を稼ぎ、消費して発酵（酵母技）を放つ
- 精米歩合   = 武器強化。%を下げるほど攻撃力倍率が上がる
- 酒米       = 防具。固定メインスキル＋ランダムサブスキル
- 酵母       = ブドウ糖を消費する固有チャージ技
- 火落ち菌   = 呂布枠。ボス戦終盤に乱入し、倒すまでボス（蔵の制圧）に手を出せない
- 上槽       = クリア時の防具ドロップ判定。特定名称（純米/吟醸/大吟醸）がレア度

数値はすべて叩き台。このファイルで大量ロールして確定させ、確定値だけJS（手触り層）へ移植する。
"""
import random
from dataclasses import dataclass, field
from enum import Enum, auto


# ---------------- 列挙 ----------------

class Difficulty(Enum):
    EASY = auto()
    NORMAL = auto()
    HARD = auto()
    NIGHTMARE = auto()


class Koji(Enum):
    YELLOW = auto()  # 黄麹: クリティカルダメージ+20%
    WHITE = auto()   # 白麹: クエン酸。被ダメ-20%（敵の動きを鈍らせる）
    BLACK = auto()   # 黒麹: 強クエン酸。敵防御25%無視


class Style(Enum):
    BOX = auto()  # 箱麹: 攻撃範囲1.5倍（巻き込み数+50%）
    LID = auto()  # 麹蓋: 攻撃速度アップ（総ダメージ+20%）


class Rarity(Enum):
    REGULAR = 0    # サブスキル0枠
    JUNMAI = 1     # 1-2枠
    GINJO = 2      # 2-3枠
    DAIGINJO = 3   # 4枠確定（初版はテーブル2種のため実質2枠。拡張時に4種へ）


# サブスキル（初版は2種のみ。2026-07-19決定）
SUB_SKILLS = [
    {"name": "低温長期発酵", "effect": "YEAST_DAMAGE_UP"},   # 酵母技ダメージ+30%
    {"name": "アミラーゼ活性", "effect": "GLUCOSE_BOOST"},   # ブドウ糖獲得+15%
]


# ---------------- 装備クラス ----------------

@dataclass
class Weapon:
    name: str = "大刀"
    base_atk: int = 100
    koji: Koji = Koji.BLACK
    style: Style = Style.LID
    polishing_rate: int = 70  # 精米歩合%

    def get_current_atk(self) -> float:
        """最終攻撃力 = 基礎 × (1 + (70 - 精米歩合) × 0.02)"""
        return self.base_atk * (1.0 + (70 - self.polishing_rate) * 0.02)

    def polish(self):
        """70 -> 50 -> 35（35未満なし）"""
        steps = [70, 50, 35]
        if self.polishing_rate in steps[:-1]:
            self.polishing_rate = steps[steps.index(self.polishing_rate) + 1]


@dataclass
class Rice:
    name: str = "五百万石の魂"
    hp: int = 300
    defense: int = 40
    rarity: Rarity = Rarity.REGULAR
    sub_skills: list = field(default_factory=list)

    @property
    def main_skill(self):
        # 米の種類で固定：山田錦=クリ率+25% / 五百万石=速度+20%（総ダメージ+20%）
        return {"山田錦の魂": {"CRIT_RATE": 0.25}, "五百万石の魂": {"SPEED": 0.20}}.get(self.name, {})

    def has(self, effect: str) -> bool:
        return any(s["effect"] == effect for s in self.sub_skills)


@dataclass
class Yeast:
    name: str  # きょうかい6号/7号/9号
    cost_glucose: int = 100
    power: float = 0.0  # 0なら既定倍率（7号=5.0 / 9号=10.0）


# ---------------- 戦闘モデル ----------------
# 手触り層（アクション）を1秒1tickに抽象化した近似モデル。
# 比較のための土俵であり、絶対値ではなく「構成間の差」を読む。

@dataclass
class Tuning:
    """バランス叩き台（sweep実験でここを振る）"""
    glucose_rate: float = 0.10   # 与ダメの何割が糖になるか（依頼文原案=10%）
    player_hp: int = 1100
    avoid: float = 0.50          # 手触り層の回避を近似（被弾50%カット）
    minion_cap: int = 25
    minion_hp: int = 100
    minion_dmg: int = 4
    boss_hp: int = 6000
    boss_def: int = 50
    boss_dmg: int = 60
    hiochi_hp: int = 3000
    hiochi_regen: int = 40       # 毎tick自己再生
    hiochi_dmg: int = 100
    hiochi_at: float = 0.30      # ボス残HPがこの割合を切ると乱入
    sweep_targets: int = 6       # 一振りの巻き込み数
    crit_rate: float = 0.10
    crit_dmg: float = 1.5
    max_ticks: int = 120


@dataclass
class Result:
    win: bool
    ticks: int
    hp_left: float
    ferments: int


def simulate_battle(weapon: Weapon, rice: Rice, yeast: Yeast, tn: Tuning, rng: random.Random) -> Result:
    atk = weapon.get_current_atk()
    if weapon.style == Style.LID:
        atk *= 1.20
    if "SPEED" in rice.main_skill:
        atk *= 1.0 + rice.main_skill["SPEED"]
    crit_rate = tn.crit_rate + rice.main_skill.get("CRIT_RATE", 0.0)
    crit_dmg = tn.crit_dmg + (0.20 if weapon.koji == Koji.YELLOW else 0.0)
    sweep = int(tn.sweep_targets * (1.5 if weapon.style == Style.BOX else 1.0))
    yeast_mult = 1.30 if rice.has("YEAST_DAMAGE_UP") else 1.0
    glucose_rate = tn.glucose_rate * (1.15 if rice.has("GLUCOSE_BOOST") else 1.0)
    incoming_cut = 0.20 if weapon.koji == Koji.WHITE else 0.0

    def vs_def(dmg, df, ignore=False):
        eff = df * (0.75 if weapon.koji == Koji.BLACK else 1.0)
        if ignore:
            eff = 0
        return dmg * 100.0 / (100.0 + eff)

    hp = tn.player_hp + rice.hp
    glucose = 0.0
    boss = tn.boss_hp
    hiochi = None  # 乱入後はHP値
    hiochi_done = False
    minions = tn.minion_cap
    freeze = 0    # 6号: 敵全体行動不能tick
    stun = 0      # 9号: 主目標スタンtick
    ferments = 0

    for t in range(1, tn.max_ticks + 1):
        # --- プレイヤー攻撃 ---
        dealt = 0.0
        base = atk * rng.uniform(0.85, 1.15) * (crit_dmg if rng.random() < crit_rate else 1.0)
        hits = min(sweep, minions)
        kill = min(hits, minions)  # 雑菌はatk>=hpなので当たれば死ぬ
        dealt += kill * tn.minion_hp
        minions -= kill
        primary = "hiochi" if hiochi is not None else "boss"
        if primary == "hiochi":
            d = vs_def(base, 0)
            hiochi -= d
            dealt += d
        else:
            d = vs_def(base, tn.boss_def)
            boss -= d
            dealt += d
        glucose = min(glucose + dealt * glucose_rate, 100.0)

        # --- 発酵（酵母技）---
        if glucose >= yeast.cost_glucose:
            glucose -= yeast.cost_glucose
            ferments += 1
            if yeast.name == "きょうかい6号":
                freeze = 3  # 敵全体3秒凍結
            elif yeast.name == "きょうかい7号":
                burst = atk * (yeast.power or 5.0) * yeast_mult  # 全体500%
                minions = 0
                if hiochi is not None:
                    hiochi -= vs_def(burst, 0)
                else:
                    boss -= vs_def(burst, tn.boss_def)
            elif yeast.name == "きょうかい9号":
                burst = atk * (yeast.power or 10.0) * yeast_mult  # 単体1000%防御無視
                if hiochi is not None:
                    hiochi -= burst
                else:
                    boss -= burst
                stun = 2

        # --- 火落ち菌乱入（呂布枠）：倒すまで上槽（クリア）不可 ---
        if not hiochi_done and hiochi is None and boss <= tn.boss_hp * tn.hiochi_at:
            hiochi = tn.hiochi_hp
            boss = max(boss, 1.0)  # 一撃で閾値を飛び越えても乱入はスキップできない
        if hiochi is not None and hiochi <= 0:
            hiochi = None
            hiochi_done = True  # 殺菌完了。ボスへの攻撃が解禁される
        if hiochi is None and boss <= 0:
            return Result(True, t, hp, ferments)
        # 火落ち菌の自己再生（凍結中は再生しない）
        if hiochi is not None and freeze == 0:
            hiochi = min(hiochi + tn.hiochi_regen, tn.hiochi_hp)

        # --- 敵の攻撃 ---
        if freeze > 0:
            freeze -= 1
        else:
            raw = minions * tn.minion_dmg + tn.boss_dmg
            if hiochi is not None:
                raw += tn.hiochi_dmg
            if stun > 0:
                stun -= 1
                raw -= tn.hiochi_dmg if hiochi is not None else tn.boss_dmg
            dmg = raw * rng.uniform(0.7, 1.3) * (1.0 - tn.avoid) * (1.0 - incoming_cut)
            dmg *= 100.0 / (100.0 + rice.defense)
            hp -= dmg
            if hp <= 0:
                return Result(False, t, 0, ferments)

        # --- 雑菌の湧き ---
        minions = min(minions + rng.randint(2, 4), tn.minion_cap)

    return Result(False, tn.max_ticks, hp, ferments)  # 時間切れ=腐造


# ---------------- 上槽（ドロップ）----------------

class JosoSystem:
    RARITY_TABLE = {
        Difficulty.EASY:      [(Rarity.REGULAR, 0.60), (Rarity.JUNMAI, 0.30), (Rarity.GINJO, 0.09), (Rarity.DAIGINJO, 0.01)],
        Difficulty.NORMAL:    [(Rarity.REGULAR, 0.35), (Rarity.JUNMAI, 0.40), (Rarity.GINJO, 0.20), (Rarity.DAIGINJO, 0.05)],
        Difficulty.HARD:      [(Rarity.REGULAR, 0.10), (Rarity.JUNMAI, 0.35), (Rarity.GINJO, 0.40), (Rarity.DAIGINJO, 0.15)],
        Difficulty.NIGHTMARE: [(Rarity.DAIGINJO, 1.00)],  # 大吟醸確定
    }
    SLOT_COUNT = {Rarity.REGULAR: (0, 0), Rarity.JUNMAI: (1, 2), Rarity.GINJO: (2, 3), Rarity.DAIGINJO: (4, 4)}

    @classmethod
    def drop(cls, difficulty: Difficulty, rng: random.Random) -> Rice:
        r = rng.random()
        acc = 0.0
        rarity = Rarity.REGULAR
        for ra, p in cls.RARITY_TABLE[difficulty]:
            acc += p
            if r < acc:
                rarity = ra
                break
        lo, hi = cls.SLOT_COUNT[rarity]
        n = min(rng.randint(lo, hi), len(SUB_SKILLS))  # 重複なし・初版はテーブル2種が上限
        subs = rng.sample(SUB_SKILLS, n)
        name = rng.choice(["山田錦の魂", "五百万石の魂"])
        prefix = {Rarity.REGULAR: "", Rarity.JUNMAI: "純米・", Rarity.GINJO: "吟醸・", Rarity.DAIGINJO: "大吟醸・"}[rarity]
        return Rice(name=prefix + name, rarity=rarity, sub_skills=subs)


# ---------------- 実験 ----------------

def pct(x):
    return f"{x*100:5.1f}%"


def run_matrix(label: str, tn: Tuning, n: int, rng: random.Random):
    print(f"\n=== {label}（各{n}回 / 勝率・平均tick・平均発酵回数）===")
    print(f"{'酵母':<10}", end="")
    for pol in (70, 50, 35):
        print(f"精米{pol}%              ", end="")
    print()
    for yname in ("きょうかい6号", "きょうかい7号", "きょうかい9号"):
        print(f"{yname:<10}", end="")
        for pol in (70, 50, 35):
            wins = ticks = fers = 0
            for _ in range(n):
                w = Weapon(polishing_rate=pol)
                r = simulate_battle(w, Rice(), Yeast(yname), tn, rng)
                wins += r.win
                ticks += r.ticks
                fers += r.ferments
            print(f"{pct(wins/n)} {ticks/n:5.1f}t {fers/n:4.1f}発  ", end="")
        print()


def main():
    rng = random.Random(20260719)

    print("【清酒無双 数値層シミュレータ】数値はすべて叩き台。差の傾向を読む。")

    # 実験1: 糖チャージ率（依頼文原案の10%は成立するか）
    for rate in (0.10, 0.02):
        tn = Tuning(glucose_rate=rate)
        run_matrix(f"実験1: 糖チャージ率={int(rate*100)}%", tn, 500, rng)

    # 実験1b: 6号のコスト調整（凍結の持ち味はコスト割引で出るか）
    print("\n=== 実験1b: きょうかい6号のコスト（精米50%・各1000回）===")
    tn = Tuning(glucose_rate=0.02)
    for cost in (100, 80, 60):
        wins = ticks = 0
        for _ in range(1000):
            r = simulate_battle(Weapon(polishing_rate=50), Rice(), Yeast("きょうかい6号", cost_glucose=cost), tn, rng)
            wins += r.win
            ticks += r.ticks
        print(f"  コスト{cost:>3} 勝率{pct(wins/1000)} 平均{ticks/1000:5.1f}t")

    # 実験1c: 三すくみなしで酵母3種を並べるための調整幅（精米50%・各1000回）
    print("\n=== 実験1c: 酵母バランス調整（精米50%・各1000回）===")
    tn = Tuning(glucose_rate=0.02)
    candidates = [
        Yeast("きょうかい6号", cost_glucose=80),
        Yeast("きょうかい7号", power=6.0),
        Yeast("きょうかい9号", power=10.0),
        Yeast("きょうかい9号", power=8.0),
        Yeast("きょうかい9号", power=7.0),
    ]
    for y in candidates:
        wins = ticks = 0
        for _ in range(1000):
            r = simulate_battle(Weapon(polishing_rate=50), Rice(), y, tn, rng)
            wins += r.win
            ticks += r.ticks
        extra = f"コスト{y.cost_glucose}" + (f" 倍率{int((y.power or 0)*100)}%" if y.power else "")
        print(f"  {y.name} {extra:<16} 勝率{pct(wins/1000)} 平均{ticks/1000:5.1f}t")

    # 実験2: サブスキルの寄与（大吟醸フル装備 vs 素の五百万石、7号・50%固定）
    print("\n=== 実験2: サブスキル寄与（きょうかい7号・精米50%・各1000回）===")
    tn = Tuning(glucose_rate=0.02)
    for label, rice in (
        ("素の五百万石(REGULAR)", Rice()),
        ("大吟醸・五百万石(サブ2種)", Rice(rarity=Rarity.DAIGINJO, sub_skills=list(SUB_SKILLS))),
        ("大吟醸・山田錦(サブ2種)", Rice(name="山田錦の魂", rarity=Rarity.DAIGINJO, sub_skills=list(SUB_SKILLS))),
    ):
        wins = ticks = 0
        for _ in range(1000):
            r = simulate_battle(Weapon(polishing_rate=50), rice, Yeast("きょうかい7号"), tn, rng)
            wins += r.win
            ticks += r.ticks
        print(f"  {label:<24} 勝率{pct(wins/1000)} 平均{ticks/1000:5.1f}t")

    # 実験3: 麹×仕込みパーツ（7号・50%・素の五百万石）
    print("\n=== 実験3: 麹×仕込みパーツ（きょうかい7号・精米50%・各1000回）===")
    for koji in Koji:
        for style in Style:
            wins = ticks = 0
            for _ in range(1000):
                w = Weapon(koji=koji, style=style, polishing_rate=50)
                r = simulate_battle(w, Rice(), Yeast("きょうかい7号"), tn, rng)
                wins += r.win
                ticks += r.ticks
            print(f"  {koji.name:<7}×{style.name:<4} 勝率{pct(wins/1000)} 平均{ticks/1000:5.1f}t")

    # 実験4: 上槽ドロップ分布（各難易度2000回）
    print("\n=== 実験4: 上槽ドロップ分布（各2000回）===")
    for diff in Difficulty:
        counts = {ra: 0 for ra in Rarity}
        for _ in range(2000):
            counts[JosoSystem.drop(diff, rng).rarity] += 1
        row = " ".join(f"{ra.name}:{pct(c/2000)}" for ra, c in counts.items())
        print(f"  {diff.name:<10} {row}")

    # 実験5: 精米のみの伸び（発酵なし相当＝コスト無限、7号だが糖0%）
    print("\n=== 実験5: 精米歩合の攻撃力（計算式の確認）===")
    w = Weapon()
    for _ in range(3):
        print(f"  精米{w.polishing_rate:>2}% → 攻撃力 {w.get_current_atk():.0f}")
        w.polish()


if __name__ == "__main__":
    main()
