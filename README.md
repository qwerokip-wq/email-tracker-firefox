# Email Tracker for Gmail

Firefox-расширение для отслеживания открытий и кликов в Gmail. Работает через невидимый 1×1 пиксель и замену ссылок в исходящих письмах.

## Возможности

- **Автоматический трекинг** — пиксель и переходы добавляются в каждое отправляемое письмо
- **Статус-значки** — в списке писем Gmail показывает статус (открыто, кликнуто)
- **Дашборд** — статистика в попапе: отправлено, открыто, кликов, уникальных
- **Локальное хранение** — все данные сохраняются в IndexedDB, сервер только для статистики
- **Конфиденциальность** — можно отключить трекинг в настройках
- **Локализация** — русский и английский язык
- **Open Source** — полный исходный код, минимум зависимостей

## Скриншоты

*(добавьте скриншоты после публикации)*

## Установка из AMO

Расширение опубликовано в [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/email-tracker-gmail/).

1. Перейдите на страницу расширения в магазине Firefox
2. Нажмите «Добавить в Firefox»
3. Откройте `mail.google.com` — расширение готово к работе

## Установка вручную (для разработки)

1. Откройте `about:debugging#/runtime/this-firefox`
2. Нажмите **Load Temporary Add-on**
3. Выберите файл `extension/manifest.json`

## Как это работает

```
┌─ Firefox ──────────────────────┐     ┌─ Cloudflare Worker ──────┐
│                                │     │                          │
│  Gmail ← content.js → IndexedDB│────▶│  /pixel → KV store      │
│    ↑          ↓                │     │  /click → redirect + KV  │
│    └── sync каждые 30 сек. ────│     │  /api/* → JSON + KV      │
│                                │     │                          │
│  popup → читает данные из DB   │     │  https://your.workers.dev│
└────────────────────────────────┘     └──────────────────────────┘
```

### Отслеживание открытий

При отправке письма content.js вставляет невидимый `<img>` с ссылкой на `/pixel/:id/:recipient`. Когда получатель открывает письмо, его почтовый клиент загружает это изображение, и Cloudflare Worker логирует событие.

### Отслеживание кликов

Все ссылки в теле письма заменяются на `/click/:id/:recipient?url=...`. При клике Worker делает 302 редирект на исходный URL и логирует событие.

### Синхронизация

Content script синхронизируется с сервером каждые 30 секунд: отправляет ID отслеживаемых писем, получает статистику и обновляет локальное хранилище и значки в Gmail.

## Структура проекта

```
email-tracker/
├── extension/                 # Firefox-расширение
│   ├── manifest.json          # Манифест MV3
│   ├── content.js             # Интеграция с Gmail DOM
│   ├── background.js          # Фоновые события
│   ├── lib/
│   │   ├── tracker.js         # Генерация ID, вставка пикселя, замена ссылок
│   │   ├── storage.js         # IndexedDB: письма + события
│   │   └── api.js             # HTTP-клиент для Cloudflare Worker
│   ├── popup/                 # Дашборд (popup.html/js/css)
│   ├── options/               # Страница настроек
│   ├── _locales/en/           # Английская локализация
│   ├── _locales/ru/           # Русская локализация
│   └── icons/                 # Иконки расширения
│
├── deploy-worker/             # Cloudflare Worker (для деплоя)
│   ├── src/index.js           # Обработчики всех маршрутов
│   ├── src/utils.js           # 1×1 GIF, CORS, утилиты
│   ├── wrangler.toml          # Конфиг Wrangler
│   ├── deploy.ps1            # Скрипт автоматического деплоя
│   └── README.md              # Инструкция по деплою
│
├── dist/                      # Готовые к установке пакеты
│   ├── email-tracker-1.0.2.zip
│   └── email-tracker-1.0.2.xpi
│
├── worker/                    # Развёрнутый экземпляр Worker
│
└── README.md
```

## Развёртывание своего Worker

Каждый пользователь может развернуть свой Cloudflare Worker для полного контроля над данными.

### Вариант 1: Кнопка Deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/email-tracker-worker)

### Вариант 2: Скрипт deploy.ps1

```powershell
cd deploy-worker
.\deploy.ps1
```

Скрипт запросит email, API-ключ и Account ID Cloudflare, создаст KV Namespace и развернёт Worker.

### Вариант 3: Вручную

```bash
cd deploy-worker
npm install
npx wrangler login
npx wrangler kv:namespace create TRACKER_KV
# Вставьте ID в wrangler.toml
npx wrangler deploy
```

После деплоя укажите URL вашего Worker в настройках расширения (иконка → шестерёнка).

## API Cloudflare Worker

| Маршрут | Метод | Описание |
|---|---|---|
| `/` | GET | Health check |
| `/pixel/:id/:recipient` | GET | 1×1 tracking GIF, логирует открытие |
| `/click/:id/:recipient?url=...` | GET | 302 редирект, логирует клик |
| `/api/register` | POST | Регистрация отправленного письма |
| `/api/batch-opens` | POST | Статистика по массиву ID |
| `/api/all-stats` | GET | Все отслеживаемые письма |
| `/api/events/:id` | GET | События одного письма |

## Настройки расширения

Нажмите на иконку расширения → шестерёнка:

- **Worker URL** — адрес вашего Cloudflare Worker (заполнен по умолчанию)
- **Enable Tracking** — вкл/выкл трекинг
- **Display Count** — сколько писем показывать в попапе (по умолчанию 5)
- **Clear Local Data** — очистить локальную статистику

## Разработка

### Требования

- Node.js 18+
- Firefox 109+

### Локальный тест

1. Загрузите расширение через `about:debugging`
2. Откройте Инструменты разработчика → Консоль на `mail.google.com`
3. Фильтр: `[EmailTracker]`

### Сборка пакета

```powershell
# Упаковка .zip
Compress-Archive -Path extension\* -DestinationPath dist\email-tracker-1.0.2.zip

# Копия .xpi (для Firefox)
Copy-Item dist\email-tracker-1.0.2.zip dist\email-tracker-1.0.2.xpi
```

## Публикация на AMO

1. Подготовьте .zip пакет (лежит в `dist/`)
2. Загрузите на https://addons.mozilla.org/developers/addon/submit/
3. Заполните описание, категории, скриншоты
4. Отправьте на проверку

## Лицензия

MIT

## Благодарности

- [Cloudflare Workers](https://workers.cloudflare.com/) — бесплатный хостинг API
- Firefox Extension SDK — API для расширений
