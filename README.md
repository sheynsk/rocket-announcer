# Rocket Announcer

Standalone web app for scheduling announcements in Rocket.Chat.

## Features

- announcement scheduling
- Rocket.Chat login and admin-only settings
- announcement grouping and filtering in the UI
- emoji upload helper for Rocket.Chat custom emoji

## Requirements

- Node.js 18+
- Rocket.Chat workspace URL
- Rocket.Chat user with `manage-emoji` permission for emoji upload

## Run the app

```bash
npm install
npm start
```

By default the app runs on port `3000`.

## Environment

The app stores Rocket.Chat connection settings inside its local database through the setup screen.

For the emoji uploader, provide these variables:

- `RC_URL`
- `RC_USER_ID`
- `RC_TOKEN`

Optional variables:

- `EMOJI_DIR` - folder with emoji images, defaults to `./emojis`
- `ALIASES_FILE` - optional aliases file
- `EMOJI_ALIASES` - comma-separated default aliases
- `DRY_RUN=1` - preview uploads without sending anything
- `RECURSIVE=0` - disable recursive folder scan

## Emoji uploader

Use `upload-emojis.js` to load emoji images from a folder into Rocket.Chat.

### Basic usage

```bash
RC_URL="https://your-rocket.chat" \
RC_USER_ID="..." \
RC_TOKEN="..." \
EMOJI_DIR="./emojis" \
npm run upload-emojis
```

### Aliases file

You can provide aliases via `ALIASES_FILE`.

```bash
ALIASES_FILE=./emoji-aliases.example.txt npm run upload-emojis
```

Supported formats:

```txt
smile: grin, happy
rocket=ship, space-rocket
```

### Behavior

- scans `EMOJI_DIR` recursively by default
- creates emoji if it does not exist
- updates emoji if the same name already exists
- skips unsupported file types

## Notes

- The uploader supports `.png`, `.gif`, `.jpg`, `.jpeg`, `.webp`, and `.svg`
- Set `DRY_RUN=1` to preview the actions before upload
