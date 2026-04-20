# ムシムシ探検隊 Shared Web App

LINEグループの観察ログを、隊員ごとに共有して管理するための Next.js + Supabase アプリです。

## 主な機能

- 隊員の簡易ログイン
- ページ上からの隊員登録
- 表示名と合言葉の変更
- Admin によるアカウント作成、削除、合言葉リセット、隊長権限の切り替え
- 観察ログの登録
- LINE 貼り付けからの自動入力
- 隊員ごとのホーム表示
- 隊長 / Admin だけが見られるランキング
- 観察ログの隊員絞り込み
- 観察ログの Excel 一括出力

## Excel出力

- `観察ログ` タブに `Excel出力` ボタンがあります
- 一般隊員は自分の観察ログだけを出力します
- 隊長 / Admin は全員分を出力でき、隊員プルダウンで絞り込んだ状態ならその隊員分だけを出力します
- 出力ファイルには `観察日時 / 隊員 / 場所 / 種名 / ポイント / 隊長メモ / 写真URL / 図鑑PDF URL` が入ります

## まだ未対応

- 写真の Supabase Storage 保存
- PDF の Supabase Storage 保存
- LINE メッセージのさらに高精度な自動解析

## セットアップ

1. Node.js を入れる
2. このフォルダで依存関係を入れる
3. `.env.example` を `.env.local` にコピーする
4. Supabase の値を `.env.local` に入れる
5. Supabase の SQL Editor で `supabase/schema.sql` を実行する
6. 必要に応じて `supabase/member-auth-migration.sql` を実行する
7. 必要に応じて `supabase/security-hardening.sql` を実行する
8. 最初の Admin を作る場合は `supabase/admin-bootstrap.sql` を実行する
9. サンプルを入れたい場合は `supabase/seed.sql` を実行する
10. `npm run dev` で起動する

## 最初のAdminアカウント

`supabase/admin-bootstrap.sql` を一度だけ実行すると、Admin がまだいない場合に最初の管理者アカウントを作れます。

- 表示名: `Admin`
- 合言葉: `0000`

ログイン後に、表示名と合言葉は変更できます。

## 必要な環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET`

`SUPABASE_SERVICE_ROLE_KEY` はサーバー専用です。Vercel にも同じ値を設定してください。

## 公開の流れ

1. GitHub に `shared-web-app` を置く
2. Vercel で読み込む
3. Environment Variables に上の 4 つを登録する
4. デプロイする
5. 公開された URL を隊員へ共有する

## 補足

- `security-hardening.sql` を実行すると、ブラウザから Supabase のテーブルへ直接アクセスできなくなります
- このアプリは Next.js のサーバー API 経由でだけ読み書きする前提です
- 本格的な認証が必要になったら、将来的に Supabase Auth へ移行できます
