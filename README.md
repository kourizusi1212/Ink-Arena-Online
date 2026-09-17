# INK ARENA ONLINE - LOBBY FIXED

## Render
GitHubリポジトリのルートに次の構成で置いてください。

server.js
package.json
public/index.html
public/game.js
public/style.css

Renderの **Root Directory は空欄** にしてください。

Build Command:
npm install

Start Command:
npm start

環境変数 PORT は設定不要です。Renderが割り当てたPORTを自動使用します。

## 修正内容
- 部屋作成をサーバー側で確実に処理
- 部屋一覧の更新ボタンを追加
- Quick Match用の部屋を常設
- 部屋参加時の「存在しない・満員・試合中」を明確に表示
- WebSocket切断時に自動再接続
- ロビーからバトル開始できるように状態を整理
- リザルトからロビーへ戻れる
- 「もう一度バトル」で同じ部屋を再開
- RenderのRoot Directoryに依存しない構成
