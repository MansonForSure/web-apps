# Duet Chess

Two-device chess that runs entirely from static files. Live at https://mansonforsure.github.io/web-apps/chess/.

GitHub Pages only serves files; it cannot relay messages. Duet Chess uses **WebRTC data channels**, so once two browsers are paired every move travels directly from one device to the other. The only problem a static site cannot solve by itself is the first introduction (“signaling”): each browser has to learn how to reach the other. The app offers two ways to do that.

## Option A · Online link (easiest)

Tap **Create online game**. You get a QR code, a share link and a six-letter code such as `K7Q F2M`. The other device scans the QR code, opens the link, or types the code into **Join**.

The free public [PeerJS](https://peerjs.com/) cloud server only passes the two short connection descriptions between the devices. The game itself then runs over a direct, encrypted WebRTC channel. If a strict network blocks direct connections, PeerJS’s public TURN relay can carry the (end-to-end DTLS-encrypted) traffic instead; the status line under the board shows which route is in use.

Reloading either page reconnects to the same game. Moves made while the other device is briefly offline are delivered when it returns. A third device that opens the link is turned away.

## Option B · Swap QR codes (zero server)

No signaling server is involved at all:

1. Device 1 taps **Create QR invite** and shows its QR code.
2. Device 2 scans it with the camera app (or **Scan an invite**). It opens the game and shows a **reply** QR code.
3. Device 1 taps **Scan reply QR** and scans it. The devices connect.

If device 2 scanned with the iPhone Camera app, the reply can also be opened as a link on device 1; it is handed to the waiting tab automatically. **Copy / Share / Paste** buttons cover cases without a camera.

To make the QR codes small (about 170 characters, version 9), the app does not send the full SDP. It packs only what WebRTC needs (ICE username and password, the DTLS certificate fingerprint and up to eight UDP candidates) into a binary token and rebuilds a standard data-channel SDP on arrival. Unusual SDPs fall back to a compressed full SDP.

By default each device asks Google’s public STUN server (`stun.l.google.com`) for its own public address, which helps across different networks. Tick **Strict local** to contact no server at all; that works when both devices are on the same Wi-Fi and the network allows device-to-device traffic. Option B has no relay, so some mobile and corporate networks cannot connect this way; use Option A there.

## Playing

Tap a piece then a highlighted square, or drag. Promotion asks for the piece. Draw offers, resignation (tap twice to confirm), rematch with swapped colours and sound are built in. Both devices validate every move with the same rules ([chess.js](https://github.com/jhlywa/chess.js)); the device that created the game is authoritative if the two ever disagree. The game is saved in `localStorage`, so a reload continues where you left off.

## Run locally

Serve the repository with any HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000/chess/`. WebRTC and the camera need a secure context: `localhost` counts, but a phone opening your computer’s LAN IP does not, so test two phones against the HTTPS Pages URL. There is no build step.

```bash
npm test         # codec and protocol unit tests (Node 20+)
npm run check    # syntax check of every module
```

## Files

| File | Role |
| --- | --- |
| `index.html`, `style.css` | Lobby, pairing screens, scanner and board |
| `app.js` | Screens, game flow, persistence and sync |
| `net.js` | PeerJS rooms, manual WebRTC pairing, reconnects, route detection |
| `codec.js` | Compact offer/answer tokens and room codes |
| `protocol.js` | Move validation, outcomes and host-authoritative merging |
| `board.js` | Board rendering, tap and drag input, animation |
| `qr.js` | QR rendering and camera scanning |

## Third-party code and assets

All runtime code is vendored in `vendor/`; nothing is loaded from a CDN. License texts are in `vendor/licenses/`.

| Component | Version | License |
| --- | --- | --- |
| [chess.js](https://github.com/jhlywa/chess.js) | 1.4.0 | BSD-2-Clause |
| [PeerJS](https://github.com/peers/peerjs) client | 1.5.5 | MIT |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.0.4 | MIT |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 |
| Chess pieces “cburnett” by Colin M.L. Burnett, via [lichess](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett) | — | GPL-2.0-or-later |

The PeerJS cloud server and Google STUN server are free public services with no uptime guarantee. No analytics, accounts or uploads; camera frames are decoded locally and never leave the device.
