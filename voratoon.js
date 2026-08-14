var source = {
    name: "VoraToon",
    baseUrl: "https://v1.voratoon.com",
    apiUrl: "https://api.voratoon.com",
    language: "id",
    version: "1.0.0",
    description: "Baca Komik Online Bahasa Indonesia - Manga, Manhwa, Manhua Terbaru",
    author: "DesktopKomik",
    iconBackground: "#6366f1",
    iconForeground: "#ffffff",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 24,

    genres: [
        "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Harem",
        "Historical", "Isekai", "Martial Arts", "Mecha", "Mystery", "Psychological",
        "Romance", "School Life", "Sci-Fi", "Seinen", "Shounen", "Slice of Life",
        "Sports", "Supernatural", "Thriller"
    ],

    getPopularManga: function(page) {
        let p = page && page > 0 ? page : 1;
        let url = this.apiUrl + "/popular?page=" + p + "&limit=" + this.pageSize;
        let res = this.fetchJson(url);
        if (!res || !res.data) return { items: [], totalPages: 1 };

        let items = [];
        let list = Array.isArray(res.data) ? res.data : [];
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let d = item.$attributes || item.data || item;
            let title = d.title || d.name || "";
            let slug = d.slug || "";
            let cover = d.coverImage || "";
            if (cover && !cover.startsWith("http")) cover = "https://cvr.voratoon.id/prod/" + cover;

            if (title && slug) {
                items.push({
                    title: title.trim(),
                    url: "/series/" + slug,
                    thumbnailUrl: cover,
                    status: d.status === "completed" ? 2 : 1
                });
            }
        }

        let meta = res.meta || {};
        let totalPages = meta.totalPages || 1;
        return { items: items, totalPages: totalPages };
    },

    getLatestUpdates: function(page) {
        let p = page && page > 0 ? page : 1;
        let url = this.apiUrl + "/series?page=" + p + "&limit=" + this.pageSize;
        let res = this.fetchJson(url);
        if (!res || !res.data) return { items: [], totalPages: 1 };

        let items = [];
        let list = Array.isArray(res.data) ? res.data : [];
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let d = item.data || item.$attributes || item;
            let title = d.title || d.name || "";
            let slug = d.slug || "";
            let cover = d.coverImage || "";
            if (cover && !cover.startsWith("http")) cover = "https://cvr.voratoon.id/prod/" + cover;

            if (title && slug) {
                items.push({
                    title: title.trim(),
                    url: "/series/" + slug,
                    thumbnailUrl: cover,
                    status: d.status === "completed" ? 2 : 1
                });
            }
        }

        let meta = res.meta || {};
        let totalPages = meta.totalPages || 1;
        return { items: items, totalPages: totalPages };
    },

    getSearchManga: function(query, page) {
        let p = page && page > 0 ? page : 1;
        let q = (query || "").trim();
        let url = this.apiUrl + "/series?page=" + p + "&limit=" + this.pageSize;
        if (q) url += "&title=" + encodeURIComponent(q);

        let res = this.fetchJson(url);
        if (!res || !res.data) return { items: [], totalPages: 1 };

        let items = [];
        let list = Array.isArray(res.data) ? res.data : [];
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let d = item.data || item.$attributes || item;
            let title = d.title || d.name || "";
            let slug = d.slug || "";
            let cover = d.coverImage || "";
            if (cover && !cover.startsWith("http")) cover = "https://cvr.voratoon.id/prod/" + cover;

            if (title && slug) {
                items.push({
                    title: title.trim(),
                    url: "/series/" + slug,
                    thumbnailUrl: cover,
                    status: d.status === "completed" ? 2 : 1
                });
            }
        }

        let meta = res.meta || {};
        let totalPages = meta.totalPages || 1;
        return { items: items, totalPages: totalPages };
    },

    getMangaList: function(page, status, genre, type) {
        return this.getLatestUpdates(page);
    },

    getMangaDetails: function(mangaUrl) {
        let slug = this.extractSlug(mangaUrl);
        let url = this.apiUrl + "/series/" + slug;
        let res = this.fetchJson(url);
        if (!res || !res.data) return { title: "Unknown", url: mangaUrl, status: 1 };

        let d = res.data.data || res.data;
        let title = d.title || "Unknown";
        let cover = d.coverImage || "";
        if (cover && !cover.startsWith("http")) cover = "https://cvr.voratoon.id/prod/" + cover;
        let author = d.author || "Unknown";
        let status = d.status === "completed" ? 2 : 1;
        let description = d.synopsis || "";
        let genres = (d.genres || []).map(g => g.data?.name || g.name || "").filter(Boolean);
        if (d.format) genres.unshift(d.format.toUpperCase());

        return {
            title: title.trim(),
            url: mangaUrl,
            thumbnailUrl: cover,
            author: author,
            status: status,
            description: description,
            genre: genres
        };
    },

    getChapterList: function(mangaUrl) {
        let slug = this.extractSlug(mangaUrl);
        let url = this.apiUrl + "/series/" + slug + "/chapters";
        let res = this.fetchJson(url);
        if (!res || !res.data || !Array.isArray(res.data)) return [];

        let chapters = [];
        let list = res.data;
        for (let i = 0; i < list.length; i++) {
            let ch = list[i];
            let cd = ch.data || {};
            let index = cd.index || (i + 1);
            let name = cd.title ? ("Chapter " + index + ": " + cd.title) : ("Chapter " + index);
            let dateUpload = ch.createdAt ? new Date(ch.createdAt).getTime() : 0;

            chapters.push({
                name: name,
                url: "/series/" + slug + "/chapter/" + index,
                dateUpload: dateUpload,
                chapterNumber: typeof index === 'number' ? index : (i + 1)
            });
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let fullUrl = chapterUrl.startsWith("http") ? chapterUrl : (this.baseUrl + chapterUrl);
        let response = this.fetchApi(fullUrl, "GET");
        if (!response || response.status !== 200) return [];

        let html = response.body || (typeof response.text === 'function' ? response.text() : "");
        let re = /https?:\/\/(?:cdn\.voratoon\.com|cdn\.uqni\.net|cvr\.voratoon\.id)\/[^\x00-\x1f"'<>\s\\]+\.(?:jpg|jpeg|png|webp)/gi;
        let matches = html.match(re) || [];

        let pages = [];
        let seen = {};
        let firstDir = "";

        for (let i = 0; i < matches.length; i++) {
            let url = matches[i].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
            if (url.includes('/logo/') || url.includes('/icons/') || url.includes('/ads/') || url.includes('/cover/') || url.includes('/background/')) continue;

            let lastSlash = url.lastIndexOf('/');
            let dir = url.substring(0, lastSlash + 1);
            if (!firstDir) firstDir = dir;

            if (dir === firstDir) {
                if (!seen[url]) {
                    seen[url] = true;
                    pages.push(url);
                }
            } else if (pages.length > 0) {
                break;
            }
        }

        return pages;
    },

    extractSlug: function(url) {
        let clean = url.replace(/\/+$/, "");
        let parts = clean.split("/");
        if (parts.length > 0) {
            let last = parts[parts.length - 1];
            if (last === "chapter" && parts.length > 2) {
                return parts[parts.length - 3];
            }
            return last;
        }
        return url;
    },

    fetchJson: function(url) {
        let res = this.fetchApi(url, "GET");
        if (res && res.status === 200) {
            let body = res.body || (typeof res.text === 'function' ? res.text() : "");
            if (body) {
                try { return JSON.parse(body); } catch (e) {}
            }
        }
        return null;
    },

    fetchApi: function(url, method) {
        try {
            let headers = {
                "Origin": this.baseUrl,
                "Referer": this.baseUrl + "/",
                "Accept": "application/json, text/plain, */*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            };
            return fetch(url, {
                method: method || "GET",
                headers: headers
            });
        } catch (e) {
            return null;
        }
    }
};
