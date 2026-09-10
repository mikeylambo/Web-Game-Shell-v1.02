# Companion Dungeon Reference

A runnable real-device certification consumer for the `companion-adventure` frame.

## Run it

```bash
npm run demo:companion-dungeon
```

Open `http://localhost:4173` on the laptop/TV host. The host screen and terminal print a LAN phone URL such as `http://192.168.x.x:4173/phone?room=ABCD`. Open that URL on phones connected to the same local network. The room code is prefilled when players use the printed join URL.

If macOS asks whether Node may accept incoming network connections, allow it for LAN phone testing.

The demo supports 1-4 players so one device can certify the loop during development. Use four phones to exercise all four private interaction types.

## Playable loop

1. Phones join the room and ready up.
2. The shared host begins in the communal courtyard.
3. The host enters the Sigil Vault and the party splits.
4. Each player receives a different private chamber interaction: sequence, choice, slider or code.
5. The shared display sees completion progress but never receives private task state.
6. When all private chambers are solved, the party automatically regroups.
7. Phones become shared combat action surfaces against the Vault Warden.
8. Defeating the Warden reaches results.

Player identity and reconnect tokens persist in phone `localStorage`, so refreshing a phone reclaims the same companion slot while the server process is still running.

## Transport status

This reference intentionally uses a zero-dependency development relay: server-sent events for server -> browser updates and JSON POST actions for browser -> server input. It proves actual cross-device joining without choosing a production networking vendor in the Shell core.

Treat it as a LAN certification transport, not the final internet relay. Production work still needs authenticated host control, HTTPS, relay/service selection, rate limiting, stronger session/token handling, QR presentation, network degradation handling and multi-room scaling.
