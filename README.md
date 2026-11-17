# MusicNoteClick

A pop-and-funk rhythm game PWA: choose a track, listen to its iTunes 30-second preview, and tap four falling lanes on the beat. Built as a lightweight static site for deployment on Vercel.

## Run locally

Serve the repository root with any static HTTP server, for example:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. The iTunes Search API and preview audio require an internet connection. Beat tempo is estimated from the preview audio when the browser permits analysis; the game falls back to 112 BPM otherwise.

## Deploy to Vercel

Import this repository in Vercel. No build command or framework preset is required; the root directory is the static site. The included `vercel.json` supports clean static hosting and PWA assets.

## Notes

- Song search and 30-second preview URLs come from Apple's public iTunes Search API.
- Preview availability and playback are controlled by Apple; the catalog may return no sample for some tracks.
- This is a fan-made rhythm game and is not affiliated with or endorsed by the creators of Magic Tiles 3.
