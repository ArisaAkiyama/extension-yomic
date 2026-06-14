# Extension Yomic

Collection of JavaScript source extensions for [Yomic Application](https://github.com/ArisaAkiyama/yomic).

Repository: [ArisaAkiyama/extension-yomic](https://github.com/ArisaAkiyama/extension-yomic)

## Available Extensions

| Extension | File | Language | Version | Description |
|-----------|------|----------|---------|-------------|
| **Aarlas** | `aarlas.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari Aarlas |
| **KomikCast** | `komikcast.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari KomikCast |
| **Komiku** | `komiku.js` | ID | Latest | Baca komik Bahasa Indonesia dari Komiku |
| **Mangabat** | `mangabat.js` | EN | 1.0.0 | Read English manga from Mangabat |
| **MangaDex** | `mangadex.js` | EN/ID | 1.0.2 | Read manga from MangaDex with English and Indonesian language switching |
| **WeebCentral** | `weebcentral.js` | EN | 1.0.3 | Read English manga from WeebCentral |
| **WestManga** | `westmanga.js` | ID | Latest | Baca komik Bahasa Indonesia dari WestManga |

## Notes

- Yomic now focuses on JavaScript extensions.
- DLL/plugin assembly loading is no longer used by the app.
- Install only `.js` source files into the Yomic plugin folder.

## Development

Each extension exports a global `source` object and is executed by Yomic's JavaScript source engine.
