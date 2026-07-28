var source = {
    name: "MangaFire",
    baseUrl: "https://mangafire.to",
    language: "en",
    version: "1.2.0",
    description: "MangaFire English extension with VRF signed API architecture",
    author: "DesktopKomik",
    iconBackground: "#0b0c0f",
    iconForeground: "#ff7c2a",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 50,

    genres: [
        "Action", "Adventure", "Avant Garde", "Boys Love", "Comedy", "Demons", "Drama", "Ecchi",
        "Fantasy", "Girls Love", "Gourmet", "Harem", "Historical", "Horror", "Isekai", "Iyashikei",
        "Josei", "Martial Arts", "Mecha", "Medical", "Military", "Music", "Mystery", "Parody",
        "Psychological", "Reverse Harem", "Romance", "School", "Sci-Fi", "Seinen", "Shoujo",
        "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Space", "Sports", "Super Power",
        "Supernatural", "Suspense", "Thriller", "Vampire", "Video Games", "Villainess"
    ],

    formats: ["Manga", "Manhwa", "Manhua"],

    // ── VRF Encryption Stages ────────────────────────────────────────────────

    TABLE_1_B64: "yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==",
    KEY_1_B64: "0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=",

    TABLE_2_B64: "IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==",
    KEY_2_B64: "AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==",

    TABLE_3_B64: "NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==",
    KEY_3_B64: "DELOJgPsVaCcblDtTGMdHzM=",

    _stages: null,

    initStages: function() {
        if (this._stages) return;
        this._stages = [
            { table: this.base64ToBytes(this.TABLE_1_B64), key: this.base64ToBytes(this.KEY_1_B64), iv: 0x5A },
            { table: this.base64ToBytes(this.TABLE_2_B64), key: this.base64ToBytes(this.KEY_2_B64), iv: 0x35 },
            { table: this.base64ToBytes(this.TABLE_3_B64), key: this.base64ToBytes(this.KEY_3_B64), iv: 0xBA }
        ];
    },

    encryptStage: function(data, table, key, iv) {
        let out = new Uint8Array(data.length);
        let prev = iv;
        let keySize = key.length;
        for (let i = 0; i < data.length; i++) {
            let val = (data[i] ^ key[i % keySize] ^ prev) & 0xFF;
            prev = table[val] & 0xFF;
            out[i] = prev;
        }
        return out;
    },

    signVrf: function(path) {
        this.initStages();
        let data = this.stringToUtf8Bytes(path);
        for (let i = 0; i < this._stages.length; i++) {
            let s = this._stages[i];
            data = this.encryptStage(data, s.table, s.key, s.iv);
        }
        return this.bytesToBase64Url(data);
    },

    // ── Helper Utilities for Encoding ────────────────────────────────────────

    stringToUtf8Bytes: function(str) {
        let bytes = [];
        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i);
            if (code < 0x80) bytes.push(code);
            else if (code < 0x800) {
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else if (code < 0xd800 || code >= 0xe000) {
                bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            } else {
                i++;
                code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
                bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            }
        }
        return new Uint8Array(bytes);
    },

    base64ToBytes: function(b64) {
        let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let str = b64.replace(/[^A-Za-z0-9\+\/]/g, "");
        let len = str.length;
        let bytes = [];
        for (let i = 0; i < len; i += 4) {
            let b1 = chars.indexOf(str.charAt(i));
            let b2 = chars.indexOf(str.charAt(i + 1));
            let b3 = chars.indexOf(str.charAt(i + 2));
            let b4 = chars.indexOf(str.charAt(i + 3));
            let num = (b1 << 18) | (b2 << 12) | ((b3 & 63) << 6) | (b4 & 63);
            bytes.push((num >> 16) & 255);
            if (b3 !== -1 && str.charAt(i + 2) !== "=") bytes.push((num >> 8) & 255);
            if (b4 !== -1 && str.charAt(i + 3) !== "=") bytes.push(num & 255);
        }
        return new Uint8Array(bytes);
    },

    bytesToBase64Url: function(bytes) {
        let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let str = "";
        for (let i = 0; i < bytes.length; i += 3) {
            let b1 = bytes[i];
            let b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
            let b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
            let num = (b1 << 16) | (b2 << 8) | b3;
            str += chars.charAt((num >> 18) & 63);
            str += chars.charAt((num >> 12) & 63);
            if (i + 1 < bytes.length) str += chars.charAt((num >> 6) & 63);
            if (i + 2 < bytes.length) str += chars.charAt(num & 63);
        }
        return str.replace(/\+/g, "-").replace(/\//g, "_");
    },

    // ── HTTP Fetch Helper with VRF ────────────────────────────────────────────

    fetchApi: function(path, params) {
        params = params || {};

        // Sort keys alphabetically for VRF path signing
        let paramKeys = Object.keys(params).sort();
        let queryParts = [];
        for (let i = 0; i < paramKeys.length; i++) {
            let k = paramKeys[i];
            queryParts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
        }

        let signPath = path;
        if (queryParts.length > 0) signPath += "?" + queryParts.join("&");

        let vrf = this.signVrf(signPath);

        let finalUrl = this.baseUrl + "/api" + path;
        queryParts.push("vrf=" + encodeURIComponent(vrf));
        finalUrl += "?" + queryParts.join("&");

        try {
            let response = fetch(finalUrl, {
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
            if (!response || response.status !== 200) return null;
            return JSON.parse(response.body);
        } catch(e) {
            return null;
        }
    },

    // ── Public API Entry Points ───────────────────────────────────────────────

    getPopularManga: function(page) {
        page = Math.max(1, page || 1);
        let data = this.fetchApi("/titles", {
            "limit": "50",
            "order[views_30d]": "desc",
            "page": String(page)
        });
        return this.parseMangaList(data, page);
    },

    getLatestUpdates: function(page) {
        page = Math.max(1, page || 1);
        let data = this.fetchApi("/titles", {
            "limit": "50",
            "order[chapter_updated_at]": "desc",
            "page": String(page)
        });
        return this.parseMangaList(data, page);
    },

    getSearchManga: function(query, page) {
        page = Math.max(1, page || 1);
        query = (query || "").trim();
        if (!query) return this.getPopularManga(page);

        let data = this.fetchApi("/titles", {
            "keyword": query,
            "limit": "50",
            "page": String(page)
        });
        return this.parseMangaList(data, page);
    },

    getMangaList: function(page, status, genre, type) {
        return this.getPopularManga(page);
    },

    parseMangaList: function(data, page) {
        if (!data || !data.items) return { items: [], totalPages: page };

        let items = [];
        let list = data.items;
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let hid = item.hid || "";
            let slug = item.slug || "";
            let url = "/title/" + hid + (slug ? "-" + slug : "");

            let poster = item.poster || {};
            let thumb = poster.large || poster.medium || poster.small || "";

            items.push({
                title: item.title || "",
                url: url,
                thumbnailUrl: thumb,
                status: item.status === "releasing" ? 1 : (item.status === "finished" ? 2 : 0)
            });
        }

        let hasNext = data.meta && data.meta.hasNext;
        let totalPages = (hasNext || items.length >= this.pageSize) ? page + 1 : page;

        return { items: items, totalPages: totalPages };
    },

    // ── Details ───────────────────────────────────────────────────────────────

    getMangaDetails: function(url) {
        let hid = this.extractHid(url);
        if (!hid) return {};

        let data = this.fetchApi("/titles/" + hid);
        if (!data || !data.data) return {};

        let info = data.data;
        let poster = info.poster || {};
        let thumb = poster.large || poster.medium || poster.small || "";

        let authors = info.authors || [];
        let authorNames = [];
        for (let i = 0; i < authors.length; i++) authorNames.push(authors[i].title);

        let genres = info.genres || [];
        let genreNames = [];
        if (info.type) genreNames.push(info.type.charAt(0).toUpperCase() + info.type.slice(1));
        for (let i = 0; i < genres.length; i++) genreNames.push(genres[i].title);

        let status = 0;
        let st = (info.status || "").toLowerCase();
        if (st === "releasing") status = 1;
        else if (st === "finished") status = 2;
        else if (st === "on_hiatus") status = 3;

        let desc = info.synopsisHtml ? info.synopsisHtml.replace(/<[^>]*>/g, "").trim() : "";

        return {
            title: info.title || "",
            url: url,
            thumbnailUrl: thumb,
            author: authorNames.join(", "),
            status: status,
            description: desc,
            genre: genreNames
        };
    },

    // ── Chapter List ──────────────────────────────────────────────────────────

    getChapterList: function(mangaUrl) {
        let hid = this.extractHid(mangaUrl);
        if (!hid) return [];

        let data = this.fetchApi("/titles/" + hid + "/chapters", {
            "language": "en",
            "limit": "200",
            "order": "desc",
            "page": "1",
            "sort": "number"
        });

        if (!data || !data.items) return [];

        let chapters = [];
        let items = data.items;
        for (let i = 0; i < items.length; i++) {
            let ch = items[i];
            let num = ch.number != null ? String(ch.number).replace(/\.0$/, "") : "";
            let name = "Ch. " + num + (ch.name ? " - " + ch.name : "");

            // URL format: /title/hid-slug/chId-chapter-num-en
            let chUrl = mangaUrl + "/" + ch.id + "-chapter-" + num + "-en";

            let dateUpload = ch.createdAt ? ch.createdAt * 1000 : 0;
            chapters.push({ name: name, url: chUrl, dateUpload: dateUpload });
        }

        return chapters;
    },

    // ── Page List ─────────────────────────────────────────────────────────────

    getPageList: function(chapterUrl) {
        // Extract chapter ID from URL
        let parts = chapterUrl.split("/");
        let lastPart = parts[parts.length - 1] || parts[parts.length - 2] || "";
        let chId = lastPart.split("-")[0];

        if (!chId) return [];

        let data = this.fetchApi("/chapters/" + chId);
        if (!data || !data.data || !data.data.pages) return [];

        let pages = [];
        let list = data.data.pages;
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].url) {
                pages.push(list[i].url);
            }
        }

        return pages;
    },

    // ── Utilities ─────────────────────────────────────────────────────────────

    extractHid: function(url) {
        if (!url) return "";
        let clean = url.replace(/\/$/, "");
        let lastPart = clean.substring(clean.lastIndexOf("/") + 1);
        if (lastPart.includes("-")) return lastPart.substring(0, lastPart.indexOf("-"));
        return lastPart;
    }
};
