var source = {
    name: "MangaFire",
    baseUrl: "https://mangafire.to",
    language: "en",
    version: "1.0.0",
    description: "MangaFire English extension implemented in JavaScript using their JSON API",
    author: "DesktopKomik",
    iconBackground: "#0b0c0f",
    iconForeground: "#ff7c2a",
    isNsfw: false,
    isHasMorePages: true,

    genres: [
        "Action", "Adventure", "Avant Garde", "Boys Love", "Comedy", "Demons", "Drama", "Ecchi",
        "Fantasy", "Girls Love", "Gourmet", "Harem", "Historical", "Horror", "Isekai", "Iyashikei",
        "Josei", "Martial Arts", "Mecha", "Medical", "Military", "Music", "Mystery", "Parody",
        "Psychological", "Reverse Harem", "Romance", "School", "Sci-Fi", "Seinen", "Shoujo",
        "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Space", "Sports", "Super Power",
        "Supernatural", "Suspense", "Thriller", "Vampire", "Video Games", "Villainess"
    ],

    formats: [
        "Manga", "Manhwa", "Manhua", "One-Shot"
    ],

    getPopularManga: function(page) {
        page = Math.max(1, page || 1);
        let url = this.baseUrl + "/api/titles?order[views_30d]=desc&page=" + page + "&limit=50";
        return this.getMangaPage(url);
    },

    getLatestUpdates: function(page) {
        page = Math.max(1, page || 1);
        let url = this.baseUrl + "/api/titles?order[chapter_updated_at]=desc&page=" + page + "&limit=50";
        return this.getMangaPage(url);
    },

    getSearchManga: function(query, page) {
        page = Math.max(1, page || 1);
        query = (query || "").trim();
        if (!query) return this.getPopularManga(page);
        let url = this.baseUrl + "/api/titles?keyword=" + encodeURIComponent(query) + "&page=" + page + "&limit=50";
        return this.getMangaPage(url);
    },

    toSafeArray: function(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === "object" && typeof val.length === "number") {
            let res = [];
            for (let i = 0; i < val.length; i++) {
                res.push(String(val[i]));
            }
            return res;
        }
        return [String(val)];
    },

    getMangaList: function(page, status, genre, type) {
        page = Math.max(1, page || 1);
        let params = [];
        params.push("order[views_30d]=desc");
        params.push("page=" + page);
        params.push("limit=50");

        if (status === 1) {
            params.push("status[]=releasing");
        } else if (status === 2) {
            params.push("status[]=finished");
        } else if (status === 3) {
            params.push("status[]=on_hiatus");
        } else if (status === 4) {
            params.push("status[]=discontinued");
        }

        let genreArr = this.toSafeArray(genre);
        for (let i = 0; i < genreArr.length; i++) {
            let item = genreArr[i];
            if (item && item !== "undefined") {
                let g = item.trim().toLowerCase().replace(/\s+/g, "-");
                if (g) {
                    params.push("genres[]=" + encodeURIComponent(g));
                }
            }
        }

        let typeArr = this.toSafeArray(type);
        for (let i = 0; i < typeArr.length; i++) {
            let item = typeArr[i];
            if (item && item !== "undefined") {
                let t = item.trim().toLowerCase().replace(/\s+/g, "-");
                if (t) {
                    params.push("type[]=" + encodeURIComponent(t));
                }
            }
        }

        let url = this.baseUrl + "/api/titles?" + params.join("&");
        return this.getMangaPage(url);
    },

    getMangaPage: function(url) {
        let json = this.getJson(url);
        if (!json || !json.items) return { items: [], totalPages: 1 };

        let items = [];
        for (let i = 0; i < json.items.length; i++) {
            let item = json.items[i];
            let hid = item.hid;
            let slug = item.slug || "";
            let mangaUrl = "/title/" + hid + (slug ? "-" + slug : "");
            
            let thumbnail = "";
            if (item.poster) {
                thumbnail = item.poster.large || item.poster.medium || item.poster.small || "";
            }

            items.push({
                title: item.title,
                url: mangaUrl,
                thumbnailUrl: thumbnail,
                status: 0,
                source: this.id
            });
        }

        let totalPages = 1;
        if (json.meta && json.meta.lastPage) {
            totalPages = json.meta.lastPage;
        }

        return {
            items: items,
            totalPages: totalPages
        };
    },

    getMangaDetails: function(url) {
        let hid = this.getHid(url);
        if (!hid) return {};

        let apiUrl = this.baseUrl + "/api/titles/" + hid;
        let json = this.getJson(apiUrl);
        if (!json || !json.data) return {};

        let data = json.data;
        let thumbnail = "";
        if (data.poster) {
            thumbnail = data.poster.large || data.poster.medium || data.poster.small || "";
        }

        let authorStr = "";
        if (data.authors) {
            authorStr = data.authors.map(function(x) { return x.title; }).join(", ");
        } else if (data.artists) {
            authorStr = data.artists.map(function(x) { return x.title; }).join(", ");
        }

        let genresList = [];
        if (data.type) {
            genresList.push(data.type.charAt(0).toUpperCase() + data.type.slice(1));
        }
        if (data.genres) {
            data.genres.forEach(function(x) { genresList.push(x.title); });
        }
        if (data.themes) {
            data.themes.forEach(function(x) { genresList.push(x.title); });
        }

        let statusVal = 0;
        if (data.status) {
            let s = data.status.toLowerCase();
            if (s === "releasing") {
                statusVal = 1; // Ongoing
            } else if (s === "finished") {
                statusVal = 2; // Completed
            } else if (s === "on_hiatus") {
                statusVal = 3; // On hiatus
            } else if (s === "discontinued") {
                statusVal = 4; // Cancelled
            }
        }

        let desc = "";
        if (data.synopsisHtml) {
            desc = this.cleanText(data.synopsisHtml.replace(/<[^>]+>/g, ""));
        }

        return {
            title: data.title,
            url: "/title/" + data.hid + (data.slug ? "-" + data.slug : ""),
            thumbnailUrl: thumbnail,
            author: authorStr,
            status: statusVal,
            description: desc,
            genre: genresList,
            source: this.id
        };
    },

    getChapterList: function(mangaUrl) {
        let hid = this.getHid(mangaUrl);
        if (!hid) return [];

        let page = 1;
        let lastPage = 1;
        let chapters = [];
        let langCode = "en";

        do {
            let apiUrl = this.baseUrl + "/api/titles/" + hid + "/chapters?language=" + langCode + "&sort=number&order=desc&page=" + page + "&limit=200";
            let json = this.getJson(apiUrl);
            if (!json || !json.items) break;

            for (let i = 0; i < json.items.length; i++) {
                let ch = json.items[i];
                let chNumberStr = String(ch.number).replace(/\.0$/, "");
                chapters.push({
                    name: "Ch. " + chNumberStr + (ch.name ? " - " + ch.name : ""),
                    url: mangaUrl + "/" + ch.id + "-chapter-" + chNumberStr + "-" + langCode,
                    dateUpload: ch.createdAt ? ch.createdAt * 1000 : 0
                });
            }

            lastPage = (json.meta && json.meta.lastPage) ? json.meta.lastPage : 1;
            page++;
        } while (page <= lastPage);

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let clean = chapterUrl.replace(/\/$/, "");
        let last = clean.substring(clean.lastIndexOf("/") + 1);
        
        let url = "";
        if (clean.indexOf("/volume/") !== -1) {
            url = this.baseUrl + "/api/volumes/" + last;
        } else {
            let chapterId = last.split("-")[0];
            url = this.baseUrl + "/api/chapters/" + chapterId;
        }

        let json = this.getJson(url);
        if (!json || !json.data || !json.data.pages) return [];

        let pages = [];
        for (let i = 0; i < json.data.pages.length; i++) {
            pages.push(json.data.pages[i].url + "|Referer=https://mangafire.to/&Origin=https://mangafire.to");
        }

        return pages;
    },

    getHid: function(url) {
        if (!url) return "";
        let clean = url.replace(/\/$/, "");
        let lastPart = clean.substring(clean.lastIndexOf("/") + 1);
        if (lastPart.indexOf(".") !== -1) {
            return lastPart.substring(lastPart.lastIndexOf(".") + 1);
        } else if (lastPart.indexOf("-") !== -1) {
            return lastPart.substring(0, lastPart.indexOf("-"));
        }
        return lastPart;
    },

    cleanText: function(value) {
        return (value || "")
            .replace(/\s+/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .trim();
    },

    getJson: function(url) {
        let response = fetch(url, {
            headers: {
                "Accept": "application/json",
                "Referer": this.baseUrl + "/"
            }
        });
        if (response.status < 200 || response.status >= 300) return null;
        return JSON.parse(response.body);
    }
};
