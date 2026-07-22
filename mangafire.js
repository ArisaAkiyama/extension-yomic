var source = {
    name: "MangaFire",
    baseUrl: "https://mangafire.to",
    language: "en",
    version: "1.1.0",
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
        "Manga", "Manhwa", "Manhua"
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

    searchManga: function(query, page) {
        return this.getSearchManga(query, page);
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
            params.push("statuses[]=releasing");
        } else if (status === 2) {
            params.push("statuses[]=finished");
        } else if (status === 3) {
            params.push("statuses[]=on_hiatus");
        } else if (status === 4) {
            params.push("statuses[]=discontinued");
        }

        let genreIds = {
            "action": { type: "genre", id: 1 },
            "adult": { type: "genre", id: 268929 },
            "adventure": { type: "genre", id: 78 },
            "avant garde": { type: "genre", id: 3 },
            "boys love": { type: "genre", id: 4 },
            "comedy": { type: "genre", id: 5 },
            "crime": { type: "genre", id: 268921 },
            "demons": { type: "genre", id: 77 },
            "drama": { type: "genre", id: 6 },
            "ecchi": { type: "genre", id: 7 },
            "fantasy": { type: "genre", id: 79 },
            "girls love": { type: "genre", id: 9 },
            "gourmet": { type: "genre", id: 10 },
            "harem": { type: "genre", id: 11 },
            "historical": { type: "genre", id: 268922 },
            "horror": { type: "genre", id: 530 },
            "isekai": { type: "genre", id: 13 },
            "iyashikei": { type: "genre", id: 531 },
            "josei": { type: "genre", id: 15 },
            "kids": { type: "genre", id: 532 },
            "magic": { type: "genre", id: 539 },
            "magical girls": { type: "genre", id: 268923 },
            "mahou shoujo": { type: "genre", id: 533 },
            "martial arts": { type: "genre", id: 534 },
            "mature": { type: "genre", id: 268931 },
            "mecha": { type: "genre", id: 19 },
            "medical": { type: "genre", id: 268924 },
            "military": { type: "genre", id: 535 },
            "music": { type: "genre", id: 21 },
            "mystery": { type: "genre", id: 22 },
            "parody": { type: "genre", id: 23 },
            "philosophical": { type: "genre", id: 268925 },
            "psychological": { type: "genre", id: 536 },
            "reverse harem": { type: "genre", id: 25 },
            "romance": { type: "genre", id: 26 },
            "school": { type: "genre", id: 73 },
            "sci-fi": { type: "genre", id: 28 },
            "seinen": { type: "genre", id: 537 },
            "shoujo": { type: "genre", id: 30 },
            "shoujo ai": { type: "genre", id: 9 },
            "shounen": { type: "genre", id: 31 },
            "shounen ai": { type: "genre", id: 4 },
            "slice of life": { type: "genre", id: 538 },
            "smut": { type: "genre", id: 268932 },
            "space": { type: "genre", id: 33 },
            "sports": { type: "genre", id: 34 },
            "super power": { type: "genre", id: 75 },
            "superhero": { type: "genre", id: 268926 },
            "supernatural": { type: "genre", id: 76 },
            "suspense": { type: "genre", id: 37 },
            "thriller": { type: "genre", id: 38 },
            "tragedy": { type: "genre", id: 268927 },
            "vampire": { type: "genre", id: 39 },
            "wuxia": { type: "genre", id: 268928 },
            "aliens": { type: "theme", id: 268933 },
            "animals": { type: "theme", id: 268934 },
            "cooking": { type: "theme", id: 268935 },
            "crossdressing": { type: "theme", id: 268936 },
            "delinquents": { type: "theme", id: 268937 },
            "genderswap": { type: "theme", id: 268939 },
            "ghosts": { type: "theme", id: 268940 },
            "gyaru": { type: "theme", id: 268941 },
            "incest": { type: "theme", id: 268943 },
            "loli": { type: "theme", id: 268944 },
            "mafia": { type: "theme", id: 268945 },
            "monster girls": { type: "theme", id: 268949 },
            "monsters": { type: "theme", id: 268950 },
            "ninja": { type: "theme", id: 268952 },
            "office workers": { type: "theme", id: 268953 },
            "police": { type: "theme", id: 268954 },
            "post-apocalyptic": { type: "theme", id: 268955 },
            "reincarnation": { type: "theme", id: 268956 },
            "samurai": { type: "theme", id: 268958 },
            "school life": { type: "theme", id: 268959 },
            "shota": { type: "theme", id: 268960 },
            "survival": { type: "theme", id: 268962 },
            "time travel": { type: "theme", id: 268963 },
            "vampires": { type: "theme", id: 268965 },
            "video games": { type: "theme", id: 268966 },
            "villainess": { type: "theme", id: 268967 },
            "virtual reality": { type: "theme", id: 268968 },
            "zombies": { type: "theme", id: 268969 }
        };

        let genreArr = this.toSafeArray(genre);
        for (let i = 0; i < genreArr.length; i++) {
            let item = genreArr[i];
            if (item && item !== "undefined") {
                let nameLower = item.trim().toLowerCase();
                let gInfo = genreIds[nameLower];
                if (gInfo) {
                    if (gInfo.type === "theme") {
                        params.push("theme_ids[]=" + gInfo.id);
                    } else {
                        params.push("genres_in[]=" + gInfo.id);
                    }
                }
            }
        }

        let typeArr = this.toSafeArray(type);
        for (let i = 0; i < typeArr.length; i++) {
            let item = typeArr[i];
            if (item && item !== "undefined") {
                let t = item.trim().toLowerCase().replace(/\s+/g, "-");
                if (t) {
                    params.push("types[]=" + encodeURIComponent(t));
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
        try {
            let response = fetch(url, {
                headers: {
                    "Accept": "application/json",
                    "Referer": this.baseUrl + "/"
                }
            });
            if (response && response.status >= 200 && response.status < 300) {
                return JSON.parse(response.body);
            }
        } catch(e) {}
        return null;
    }
};
