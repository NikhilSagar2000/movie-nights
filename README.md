# Our Little Theater 🧸💗

A private movie-night + games website for two. One of you shares a Chrome tab with the movie, the other watches live, you see each other in cam bubbles, send floating hearts, and play little games after.

Runs entirely on Cloudflare's free plan: one Worker (site + API) and one Durable Object (realtime room + storage). Video goes peer-to-peer, so movie bytes never touch a server.

## Run it locally

```sh
npm install
cp .dev.vars.example .dev.vars   # then edit the two passcodes
npm run dev
```

Open the printed URL in two browser windows (one normal, one guest/incognito) and log in with each passcode.

## Put it online (free)

1. Log in to Cloudflare once (opens your browser; the free account needs no card):
   ```sh
   npx wrangler login
   ```
2. Set the secrets. Nothing is stored in the code:
   ```sh
   npx wrangler secret put USERS            # paste: {"a":"your long passphrase","b":"her long passphrase"}
   npx wrangler secret put SESSION_SECRET   # paste the output of: openssl rand -base64 32
   ```
   Optional TURN relay, for networks where a direct connection fails (e.g. some mobile hotspots): make a free account at metered.ca → Open Relay, then
   ```sh
   npx wrangler secret put TURN_URL         # paste: https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=<key>
   ```
3. Deploy:
   ```sh
   npm run deploy
   ```
   You get a link like `https://movie-nights.<your-subdomain>.workers.dev`. Share it with her, along with her passcode.

Whoever logs in with passcode `a` or `b` doesn't matter. On first login, each of you names the *other* person.

## Movie night tips

- **Sharing:** Theater → "Share a tab" → pick the **Chrome tab** with the movie and tick **"Also share tab audio"**. You stay on the site and watch it there with her; the movie tab plays in the background.
- **Pause:** use your keyboard's ⏯ key or Chrome's media button in the toolbar. No tab switching needed.
- **No sound?** Some downloaded `.mkv` files use AC3/DTS audio, which Chrome can't play. Fix it in about a minute (the video isn't re-encoded):
  `ffmpeg -i movie.mkv -c:v copy -c:a aac movie.mp4`
- **Quality:** each of you picks "My picture" (Auto / 1440p / 1080p / 720p / 480p). The sharer's laptop sends exactly what the other person picked. 1440p needs about 8–10 Mbps upload from the sharer.
- **Echo:** mics auto-mute while a movie is shared. Hold <kbd>Space</kbd> to talk. Headphones are best.
- **Layout:** drag the cam bubbles anywhere, resize them from the corner, resize the stage, or hide anything from the 👁 View menu. Each laptop remembers its own layout.

## Tests

```sh
npm test        # game rules + login/cookie checks
npx tsc -b      # types
```
