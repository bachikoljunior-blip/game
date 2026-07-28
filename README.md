# LUMINA — ルミナ

**片手で遊べるネオン・サバイバーアクション。** ブラウザだけで動く、インストール不要のモバイルゲームです。
画像・音声・フォント・ライブラリを一切使わず、グラフィックも効果音も音楽もすべて実行時に生成しています。

> One-thumb neon survival action for the mobile web. No images, no audio files,
> no fonts, no dependencies — every pixel and every sound is generated at runtime.

---

## 遊び方 / How to play

| | |
|---|---|
| **移動** | 画面のどこでもドラッグ。指を置いた場所にスティックが出ます |
| **攻撃** | 自動。武器は勝手に撃ちます |
| **バースト** | 右下のボタン（または2本目の指で画面タップ）。周囲を吹き飛ばして一瞬無敵 |
| **成長** | 敵を倒す → 経験値を拾う → レベルアップでカードを選ぶ |
| **勝利条件** | 10分生き延びて **アビス・コア** を撃破 |

キーボードでも遊べます: <kbd>WASD</kbd> 移動 / <kbd>Space</kbd> バースト / <kbd>Esc</kbd> ポーズ

## 中身 / What's in it

- **武器8種 × 各8レベル + 進化形態8種** — 武器を最大まで育て、対応するパッシブをLv4にすると進化カードが出現します
- **パッシブ13種** — ダメージ、攻速、範囲、弾数、会心、装甲、再生、幸運 …
- **敵12種 + 3段階変化するボス** — 突進、自爆、分裂、盾持ち、召喚、弾幕
- **5つのセクター** — 2分ごとに背景・格子・星の色が変わり、10分間が「旅」になります
- **機体5種** — 万能・重装・一撃・収集・連鎖。それぞれ初期武器とステータスが違います
- **恒久強化（強化ラボ）** — シャードを稼いで14種のメタアップグレードを購入。返金もできます
- **記録（コーデックス）** — 遭遇した敵・入手した武器・進化・自己記録
- **日本語 / English** 切り替え、音量・振動・画質設定
- **PWA** — ホーム画面に追加してオフラインでプレイ可能

## 技術メモ / Technical notes

- **描画** Canvas 2D。ネオンの発光は 1/4 解像度のグローパスをぼかして加算合成する 2 パス・ブルーム。
  フル解像度でぼかすのに比べて約 1/16 のフィルコストで済みます
- **シミュレーション** 固定 1/60 秒ステップ + アキュムレータ。`timeScale` でヒットストップとスローモーを実現
- **衝突判定** 毎フレーム再構築する空間ハッシュ。敵 300 体 + 弾 + パーティクルでも描画 5ms 程度
- **メモリ** すべてのエンティティはオブジェクトプール。ホットループ内の割り当てはゼロ
- **画質** フレーム時間を監視して `high / mid / low` を自動で行き来（解像度・ブルーム・パーティクル数を調整）
- **音** WebAudio で合成。効果音はノイズ+オシレータ、BGM は A マイナー・ペンタトニックの
  4 小節ループを危険度に応じてレイヤー追加（パッド → ベース → アルペジオ → キック → ハイハット）
- **入力** Pointer Events。指を置いた位置に浮かぶスティック、最大半径を超えると土台が追従します

## 開発 / Development

```bash
npm install          # 開発用の Playwright だけ（ゲーム本体に依存なし）
npm start            # http://localhost:8080 で起動
npm test             # ロジックのユニットテスト（ブラウザ不要）
npm run playtest     # 実ブラウザで自動プレイ＋スクリーンショット＋描画コスト計測
npm run icons        # PNG アイコンを生成（依存ゼロの自作エンコーダ）
npm run verify       # ユニットテスト + 武器スイープ + 実ブラウザ通しテスト
```

補助ツール:

| コマンド | 内容 |
|---|---|
| `node tools/balance.mjs 8` | ボット AI に 8 回フルランさせて難易度曲線を出力 |
| `node tools/balance.mjs 4 --char nova` | 機体を指定してバランス確認 |
| `node tools/showcase.mjs` | 進化カード・ボス・バースト・勝利画面などの決定的瞬間を撮影 |
| `node tools/weaponsweep.mjs` | 全武器・全進化を実戦投入して DPS とエラーを検査 |
| `node tools/perfprobe.mjs` | フレームを工程別に分解して計測 |
| `node tools/playtest.mjs --long` | ボス戦・勝利画面まで含めた通し確認 |

`tools/bot.js` は「そこそこ上手いプレイヤー」を模したテスト用 AI です。群れから逃げ、
経験値を拾い、囲まれたらバーストを撃ちます。バランス調整はこのボットの生存時間を指標にしています。

### 構成

```
index.html  styles.css  sw.js  manifest.webmanifest
src/
  core/    rng pool grid util loop input audio render save i18n     ← 汎用エンジン
  data/    weapons passives enemies characters meta                 ← 純粋なデータ + 振る舞い
  game/    game waves upgrades entities enemies boss particles      ← ゲームルール
  ui/      screens hud icons                                        ← DOM UI + ベクターアイコン
tests/     run.mjs                                                  ← 2500+ アサーション
tools/     serve playtest balance showcase perfprobe bot make-icons
```

武器・敵・パッシブを追加するときは `src/data/` にオブジェクトを 1 つ足すだけです。
カードの説明文はステータス表から自動生成されるので、文章と実際の効果がズレることはありません。

## ブラウザ対応

iOS Safari 15+ / Chrome for Android 90+ / デスクトップの Chrome・Firefox・Safari。
ES modules を使うため `file://` では動きません（`npm start` かお好みの静的サーバー経由で開いてください）。

## ライセンス

MIT
