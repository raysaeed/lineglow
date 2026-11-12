# LineGlow

A clean, simple teleprompter for creators. Paste your script, set the speed, and read along to a glowing line while you record.

LineGlow is a static web app with no backend and no account. Your scripts are saved on your device and never leave it. It is designed for phones in portrait mode first, for recording vertical videos, and also works on tablets and desktop.

## Features

- **Script library.** Save as many scripts as you like. They are stored in your browser on the device and saved automatically as you type.
- **Smooth auto-scroll** with adjustable speed and font size. You can change both while the text is moving.
- **Glowing reading line** near the top of the screen, close to the camera, so your eyes stay up. It can be turned off.
- **Mirror mode** flips the text horizontally for use with a teleprompter glass.
- **Countdown** of 3, 5 or 10 seconds before scrolling starts from the top, or no countdown.
- **Large touch controls** that hide while the text scrolls and come back when you tap the screen.
- **Drag to reposition.** Drag the text up or down (or use the mouse wheel) to find your place.
- **Screen stays awake** while the prompter is open, using the Screen Wake Lock API.
- **Fullscreen mode.**
- **Installable and offline.** LineGlow is a PWA: add it to your home screen and it works without a connection.
- **Dark, high-contrast design.**

### Keyboard controls (desktop)

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `↑` or `→` | Faster |
| `↓` or `←` | Slower |
| `+` / `-` | Larger / smaller text |
| `M` | Mirror on / off |
| `L` | Reading line on / off |
| `F` | Fullscreen on / off |
| `Home` | Back to the start |
| `Esc` | Back to editing |
| `Ctrl` + `Enter` | Start prompting from the editor |

In fullscreen, the browser uses the first `Esc` to leave fullscreen. Press it again to go back to editing.

## Install on Android

Open the site in Chrome, open the menu and choose **Add to Home screen** (or **Install app**). LineGlow then opens like a normal app and works offline.

## Run it locally

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open the address shown in the terminal (usually http://localhost:5173).

To build the production site and preview it, including the service worker and offline support:

```bash
npm run build
```

```bash
npm run preview
```

## Deploy to Cloudflare Pages

Connect this repository in Cloudflare Pages and use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |

The Node.js version is taken from `.nvmrc`. `public/_headers` sets caching headers for Cloudflare Pages.

## Tech

[Vite](https://vite.dev/), TypeScript with no UI framework, and [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for the service worker and web app manifest. Scripts and settings are kept in `localStorage`.

## License

[MIT](LICENSE)
