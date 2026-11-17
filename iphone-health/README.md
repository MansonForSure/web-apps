# Checkup — iPhone health check

Checkup is a private, in-browser health check for iPhone. Open it in Safari and it walks you through the hardware a web page can test directly, then shows you where to look in Settings for the things it can't measure. Results are saved only in your browser, and nothing is uploaded.

**Live:** https://mansonforsure.github.io/web-apps/iphone-health/

## What it checks

| Group | Test | How it works |
| --- | --- | --- |
| Hardware | Display | Full-screen white, black, red, green, blue, grey, dark grey and gradient screens for dead pixels, tint, banding and burn-in |
| | Touchscreen | Paint a grid of squares with one finger. It passes automatically at 100%, and a map shows any squares you missed |
| | Multi-touch | Shows a circle per finger and passes automatically at five touches |
| | Speakers | Left, right and both-channel chimes, plus a 100 Hz–12 kHz sweep for rattles. It plays in Silent mode on iOS 17+ through `navigator.audioSession` |
| | Microphone | Live level meter (auto-detects your voice) and a five-second record-and-playback |
| | Cameras & flash | Live preview of every lens Safari exposes, front/back flip, and a flash toggle where the torch is supported |
| | Motion sensors | Level, compass and live readings. The accelerometer, gyroscope and compass each pass automatically |
| | Haptics | Uses the iOS 18+ `<input type="checkbox" switch>`, which gives Taptic Engine feedback on tap |
| | Location | High-accuracy fix with time to first fix. Passes automatically at ±50 m or better, and coordinates are never shown or stored |
| | Performance | Frame-rate smoothness plus a five-round processor benchmark in a Web Worker that flags slowdowns |
| | Connection | Six timed requests for online status and response time |
| On your iPhone | Battery health | Enter Maximum Capacity and Cycle Count from Settings to see how they compare with Apple's 80% design targets (1000 cycles for iPhone 15 and later, 500 for earlier models) |
| | Buttons, Face ID, calls, charging, radios, parts history, software | Guided checklists that say where to look |

The device card estimates the model from screen points and pixel ratio, because Safari doesn't expose the exact model. On Safari 26 it reads the real iOS version from Safari's own version, since the OS token in the user agent is frozen at 18.6.

When you finish, **Share report** creates a plain-text summary you can send to a repair shop or a buyer.

## Tips

- Use **Safari**. In-app browsers (Instagram, Facebook and others) often block the camera, microphone and motion prompts.
- For the cleanest display test, add Checkup to your Home Screen (Share › Add to Home Screen) so it opens without Safari's toolbars.
- Turn off Low Power Mode before the performance test, because it caps web animation at 30 fps.

## Development

Plain HTML, CSS and ES modules with no build step and no dependencies.

```bash
npm test        # unit tests (Node 20+)
npm run check   # syntax check every module
python3 -m http.server   # then open http://localhost:8000/
```

Camera, microphone, motion and location need a secure context: `https://` or `localhost`.

```
index.html, style.css, app.js   app shell, sheet, results and report
lib/                            pure logic (catalog, device, battery, report, grid, store, bench) and browser helpers
panels/                         one module per interactive test
tests/                          node:test unit tests
```
