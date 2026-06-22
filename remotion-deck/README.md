# FailureCloud Fullscreen Deck

Seven slides:

1. Inspiration
2. The problem
3. Why synthetic edge-case data is hard
4. What FailureCloud is and the user flow
5. Technology stack
6. High-level system architecture
7. Exports and simulator compatibility

## Present

```bash
npm install
npm run present
```

Controls:

- `Space` or `→`: next slide and animation
- `←`: previous slide
- `F`: browser fullscreen
- `Home` / `End`: first or last slide
- Double-click: toggle fullscreen

This opens a clean browser presentation without the Remotion editor.

## Optional video render

```bash
npm run render
```

The 30-second MP4 is written to `out/failurecloud-deck.mp4`.
