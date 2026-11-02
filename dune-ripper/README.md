# Dune Ripper

Balaj's personal assistant on Telegram. Only the owner's Telegram account can use it. Modo is its first connection.

## How it works
- A free Groq AI decides whether a message is for Modo or a normal chat.
- Messages for Modo go word for word to `/api/dune-ripper`, so Modo's YES check still applies.
- Modo's replies never go back to the AI.
- YES and NO skip the AI completely.

## Settings on Render
| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_OWNER_ID` | Your numeric Telegram ID. Leave it blank at first and the bot tells you |
| `GROQ_API_KEY` | From console.groq.com/keys |
| `DUNE_RIPPER_KEY` | Render makes this. Copy the same value to Netlify |
| `WEBHOOK_SECRET` | Render makes this |
| `MODO_URL` | Modo's live address |

## Test
`npm test` runs the bot against fake Telegram, Modo and AI servers.

## Adding a project
Give the project its own protected route, then add a route in `server.js` beside Modo's.
