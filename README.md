<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0052CC,100:00AAFF&height=180&section=header&text=Yomic%20Extensions&fontSize=64&fontColor=fff&animation=fadeIn&fontAlignY=38&desc=Official%20JavaScript%20Source%20Extensions%20for%20Yomic&descAlignY=60&descSize=20" width="100%"/>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![Yomic App](https://img.shields.io/badge/Yomic-App-0066FF?style=flat-square&logo=github)](https://github.com/ArisaAkiyama/yomic)
[![Stars](https://img.shields.io/github/stars/ArisaAkiyama/extension-yomic?style=flat-square&color=EBCB8B&label=Stars&logo=github)](https://github.com/ArisaAkiyama/extension-yomic/stargazers)
[![Visitors](https://api.visitorbadge.io/api/visitors?path=ArisaAkiyama%2Fextension-yomic&label=Visitors&countColor=%230066FF&style=flat-square)](https://github.com/ArisaAkiyama/extension-yomic)

<br/>

<p align="center">
  Official collection of JavaScript source extensions for <b><a href="https://github.com/ArisaAkiyama/yomic">Yomic Desktop Application</a></b>.
</p>

<p align="center">
  <b>If you enjoy using Yomic, please give the repo a ⭐!</b>
</p>

</div>

---

## 🧩 Available Extensions

| Extension | File | Language | Version | Description |
|-----------|------|----------|---------|-------------|
| **Aarlas** | `aarlas.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari Aarlas |
| **Kiryuu** | `kiryuu.js` | ID | 1.0.3 | Baca komik Bahasa Indonesia dari Kiryuu |
| **KomikCast** | `komikcast.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari KomikCast |
| **KomikStation** | `komikstation.js` | ID | 1.0.3 | Baca komik Bahasa Indonesia dari KomikStation |
| **Komiku** | `komiku.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari Komiku |
| **Luvyaa** | `luvyaa.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari Luvyaa |
| **MaidManga** | `maidmanga.js` | ID | 1.0.5 | Baca komik Bahasa Indonesia dari MaidManga |
| **Mangabat** | `mangabat.js` | EN | 1.0.3 | Read English manga from Mangabat |
| **MangaDex** | `mangadex.js` | EN/ID | 1.0.3 | Read manga from MangaDex with English and Indonesian language switching |
| **MangaFire** | `mangafire.js` | EN | 1.1.0 | Read English manga from MangaFire |
| **NHentai.xxx** | `nhentaixxx.js` | EN/JP | 1.0.2 | Read English and Japanese doujinshi from NHentai.xxx |
| **Ryzukomik** | `ryzukomik.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari Ryzukomik |
| **Softkomik** | `softkomik.js` | ID | 1.9.0 | Baca komik Bahasa Indonesia dari Softkomik |
| **WeebCentral** | `weebcentral.js` | EN | 1.0.3 | Read English manga from WeebCentral |
| **WestManga** | `westmanga.js` | ID | 1.0.0 | Baca komik Bahasa Indonesia dari WestManga |

---

## 📌 Notes

- Yomic uses lightweight JavaScript (`.js`) extensions.
- Simply place or update `.js` extension files into the Yomic plugin directory.

---

## 🛠️ Development

Each extension exports a global `source` object and is executed by Yomic's JavaScript source engine.
```javascript
var source = {
    name: "ExampleSource",
    baseUrl: "https://example.com",
    getPopularManga: function(page) { ... },
    getMangaDetails: function(url) { ... },
    getChapterUrl: function(url) { ... }
};
```

---

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00AAFF,100:0052CC&height=120&section=footer" width="100%"/>
