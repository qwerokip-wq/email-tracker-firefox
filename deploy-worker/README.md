# Email Tracker Worker

Cloudflare Worker для Email Tracker — Firefox расширения отслеживания писем Gmail.

## Быстрый деплой (1 клик)

1. Создайте fork этого репозитория на GitHub
2. Нажмите кнопку ниже:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/qwerokip-wq/email-tracker-firefox)

3. В настройках extension вставьте полученный URL

## Через скрипт (Windows)

1. Установите [Node.js](https://nodejs.org) (18+)
2. Откройте Cloudflare Dashboard → раздел Workers
3. Справа найдите **Account ID** — скопируйте
4. Там же **API Tokens** → **Global API Key** — скопируйте
5. Запустите `deploy.ps1` → введите email, API Key, Account ID

## Вручную

```bash
npx wrangler login
npx wrangler kv:namespace create TRACKER_KV
# Вставьте полученный ID в wrangler.toml
npx wrangler deploy
```

## API

| Route | Description |
|---|---|
| `GET /` | Health check |
| `GET /pixel/:id/:recipient` | 1×1 tracking GIF |
| `GET /click/:id/:recipient?url=...` | Click redirect |
| `POST /api/register` | Register email |
| `POST /api/batch-opens` | Get opens/clicks stats |
| `GET /api/all-stats` | All emails |
| `GET /api/events/:id` | Single email events |
