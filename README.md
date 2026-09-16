# WBS TC

Vue 3 + TypeScript + Vite + SQLite で作成した、WBS管理・日報登録・週報出力を一体化した管理アプリです。

## 主な機能

### WBS管理
- セクション単位の大日程表示
- セクションごとの開始日・期限設定
- 親タスク・子タスクの階層管理
- 親タスクは複数担当者を設定可能
- 子タスクは担当者1名のみ
- タスクごとの開始日・期限・進捗率管理
- セクション進捗の自動集計・可視化
- タスク追加・編集・削除

### 日報
- 日付、勤務区分、出勤時刻、退勤時刻、休憩、残業、備考の登録
- 通常勤務は 09:00〜18:00 を初期値として設定
- 時刻は手動変更可能
- 1日の日報に複数タスクを登録可能
- 各タスクの作業時間を登録
- タスク名・カテゴリ・IDで検索してWBSタスクを選択
- 実労働時間、タスク工数合計、未割当時間／超過入力を自動計算
- 日付単位で日報を保存・再編集

### 週報出力
画面右上の「週報を出力」ボタンから、上層部共有用の文章を自動生成します。

```text
先週の残業時間および実績、今週の予定についてご報告いたします。

先週の残業時間：0時間
先週の主な実績：
・タスク名（80%）
・タスク名（100%）

今週の主な予定：
・タスク名（60%）
・タスク名（0%）
```

- 先週の残業時間: 先週（月〜日）の日報に登録された残業時間の合計
- 先週の主な実績: 先週の日報で作業実績が登録されたタスク
- 今週の主な予定: 今週（月〜日）の期間に重なる未完了タスク
- 出力後にテキストを手修正可能
- 「テキストをコピー」ボタンでクリップボードへコピー可能

## SQLite

アプリの永続化先は SQLite です。

```text
data/wbs-tc.sqlite3
```

DBファイルは初回起動時に自動作成され、Git管理対象外です。

主なテーブル:

- `sections`
- `tasks`
- `task_assignees`
- `daily_reports`
- `daily_entries`

ブラウザ側の `localStorage` は表示用キャッシュとして残し、起動時はSQLiteのデータを優先して読み込みます。画面で変更した内容はAPI経由でSQLiteへ同期されます。

## セットアップ

```bash
npm install
npm run dev
```

開発時は以下が同時に起動します。

- Vue / Vite: `http://localhost:5173`
- API / SQLite: `http://localhost:3001`

### 本番相当

```bash
npm run build
npm start
```

`npm start` では Express が `dist` を配信し、同じプロセスでSQLite APIも提供します。

SQLiteファイルの保存先を変更したい場合:

```bash
SQLITE_PATH=/path/to/wbs.sqlite3 npm start
```

## 構成

```text
server/
  index.ts             # Express API / SQLiteスキーマ・永続化
src/
  App.vue              # WBS管理・日報登録ロジックと画面
  Root.vue             # アプリ全体のルート
  WeeklyReportTool.vue # 週報自動生成・コピー
  dbSync.ts            # localStorageとSQLite APIの同期
  main.ts              # Vueエントリポイント
  style.css            # UIスタイル
```

## 今後の拡張候補
- ログイン・ユーザー管理
- 担当者マスタ
- 権限管理
- 日報承認フロー
- 月次工数集計
- CSV / Excel出力
