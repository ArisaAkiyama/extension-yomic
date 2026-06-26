var source = {
    name: "MangaDex",
    baseUrl: "https://mangadex.org",
    apiUrl: "https://api.mangadex.org",
    uploadsUrl: "https://uploads.mangadex.org",
    language: "en",
    selectedLanguage: "en",
    version: "1.0.3",
    description: "MangaDex extension implemented in JavaScript using the official MangaDex API",
    author: "DesktopKomik",
    iconBackground: "#ff6740",
    iconForeground: "#ffffff",
    isNsfw: false,
    isHasMorePages: true,
    requiresProxy: true,

    pageSize: 14,
    chapterPageSize: 100,

    getPopularManga: function(page) {
        return this.getMangaPage(page, {
            "order[followedCount]": "desc"
        });
    },

    getLatestUpdates: function(page) {
        return this.getMangaPage(page, {
            "order[latestUploadedChapter]": "desc"
        });
    },

    getSearchManga: function(query, page) {
        let params = {
            "order[relevance]": "desc"
        };
        if (query && query.trim() !== "") {
            params.title = query.trim();
        }
        return this.getMangaPage(page, params);
    },

    getMangaPage: function(page, extraParams) {
        let currentPage = Math.max(1, page || 1);
        let params = {
            limit: this.pageSize,
            offset: (currentPage - 1) * this.pageSize,
            "availableTranslatedLanguage[]": this.getSelectedLanguage(),
            "includes[]": "cover_art",
            "contentRating[]": ["safe", "suggestive", "erotica"]
        };

        for (let key in extraParams) {
            params[key] = extraParams[key];
        }

        let json = this.getJson(this.apiUrl + "/manga" + this.toQuery(params));
        if (!json || !json.data) {
            return { items: [], totalPages: currentPage };
        }

        let total = typeof json.total === "number" ? json.total : ((currentPage - 1) * this.pageSize + json.data.length);
        return {
            items: json.data.map(manga => this.parseManga(manga)),
            totalPages: Math.max(1, Math.ceil(total / this.pageSize))
        };
    },

    getMangaDetails: function(url) {
        let id = this.extractId(url);
        if (!id) return {};

        let json = this.getJson(this.apiUrl + "/manga/" + encodeURIComponent(id) + this.toQuery({
            "includes[]": ["cover_art", "author", "artist"]
        }));
        if (!json || !json.data) return {};

        let manga = json.data;
        let attr = manga.attributes || {};
        let authors = this.getRelationshipNames(manga, "author");
        let artists = this.getRelationshipNames(manga, "artist");
        let authorText = authors.length > 0 ? authors.join(", ") : artists.join(", ");

        return {
            title: this.pickLocalized(attr.title) || this.getBestAltTitle(attr.altTitles) || "",
            url: "/title/" + manga.id,
            thumbnailUrl: this.getCoverUrl(manga),
            author: authorText,
            status: this.mapStatus(attr.status),
            description: this.pickLocalized(attr.description) || "",
            genre: this.getTags(attr.tags),
            source: this.id
        };
    },

    getChapterList: function(mangaUrl) {
        let mangaId = this.extractId(mangaUrl);
        if (!mangaId) return [];

        let offset = 0;
        let chapters = [];
        let total = 1;

        while (offset < total && offset < 10000) {
            let json = this.getJson(this.apiUrl + "/manga/" + encodeURIComponent(mangaId) + "/feed" + this.toQuery({
                limit: this.chapterPageSize,
                offset: offset,
                "translatedLanguage[]": this.getSelectedLanguage(),
                "contentRating[]": ["safe", "suggestive", "erotica"],
                "includeFutureUpdates": "0",
                "order[chapter]": "desc",
                "order[volume]": "desc"
            }));

            if (!json || !json.data) break;
            total = typeof json.total === "number" ? json.total : json.data.length;

            for (let i = 0; i < json.data.length; i++) {
                let chapter = json.data[i];
                let attr = chapter.attributes || {};
                let chapterNumber = attr.chapter || "";
                let title = attr.title || "";
                let name = chapterNumber ? "Chapter " + chapterNumber : "Chapter";
                if (title) {
                    name += " - " + title;
                }

                chapters.push({
                    name: name,
                    url: "/chapter/" + chapter.id,
                    dateUpload: this.parseDate(attr.publishAt || attr.createdAt || attr.updatedAt)
                });
            }

            if (json.data.length === 0) break;
            offset += json.data.length;
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let chapterId = this.extractId(chapterUrl);
        if (!chapterId) return [];

        let json = this.getJson(this.apiUrl + "/at-home/server/" + encodeURIComponent(chapterId));
        if (!json || !json.chapter) return [];

        let baseUrl = json.baseUrl || "";
        let hash = json.chapter.hash || "";
        let useDataSaver = json.chapter.dataSaver && json.chapter.dataSaver.length > 0;
        let qualityPath = useDataSaver ? "data-saver" : "data";
        let files = useDataSaver ? json.chapter.dataSaver : (json.chapter.data || []);
        let pages = [];

        for (let i = 0; i < files.length; i++) {
            pages.push(baseUrl + "/" + qualityPath + "/" + hash + "/" + files[i] + "|Referer=https://mangadex.org&Origin=https://mangadex.org");
        }

        return pages;
    },

    parseManga: function(manga) {
        let attr = manga.attributes || {};
        return {
            title: this.pickLocalized(attr.title) || this.getBestAltTitle(attr.altTitles) || "",
            url: "/title/" + manga.id,
            thumbnailUrl: this.getCoverUrl(manga),
            status: this.mapStatus(attr.status),
            source: this.id
        };
    },

    getCoverUrl: function(manga) {
        let coverFile = "";
        let relationships = manga.relationships || [];
        for (let i = 0; i < relationships.length; i++) {
            let rel = relationships[i];
            if (rel.type === "cover_art" && rel.attributes && rel.attributes.fileName) {
                coverFile = rel.attributes.fileName;
                break;
            }
        }

        if (!coverFile) return "";
        return this.uploadsUrl + "/covers/" + manga.id + "/" + coverFile + ".256.jpg";
    },

    getRelationshipNames: function(manga, type) {
        let names = [];
        let relationships = manga.relationships || [];
        for (let i = 0; i < relationships.length; i++) {
            let rel = relationships[i];
            if (rel.type === type && rel.attributes && rel.attributes.name) {
                names.push(rel.attributes.name);
            }
        }
        return names;
    },

    getTags: function(tags) {
        let result = [];
        tags = tags || [];
        for (let i = 0; i < tags.length; i++) {
            let name = this.pickLocalized((tags[i].attributes || {}).name);
            if (name) result.push(name);
        }
        return result;
    },

    pickLocalized: function(values) {
        if (!values) return "";
        let language = this.getSelectedLanguage();
        return values[language] || values.en || values["en-us"] || values.ja || values["ja-ro"] || values.ko || values["ko-ro"] || values.zh || values["zh-ro"] || this.firstValue(values);
    },

    getSelectedLanguage: function() {
        let language = (this.selectedLanguage || "en").toLowerCase();
        return language === "id" ? "id" : "en";
    },

    getBestAltTitle: function(altTitles) {
        altTitles = altTitles || [];
        for (let i = 0; i < altTitles.length; i++) {
            let value = this.pickLocalized(altTitles[i]);
            if (value) return value;
        }
        return "";
    },

    firstValue: function(obj) {
        for (let key in obj) {
            if (obj[key]) return obj[key];
        }
        return "";
    },

    mapStatus: function(status) {
        status = (status || "").toLowerCase();
        if (status === "ongoing") return 1;
        if (status === "completed") return 2;
        if (status === "hiatus") return 3;
        if (status === "cancelled") return 4;
        return 0;
    },

    extractId: function(url) {
        if (!url) return "";
        let clean = url.split("?")[0].replace(this.baseUrl, "");
        let parts = clean.split("/").filter(x => x && x.trim() !== "");
        if (parts.length >= 2 && (parts[0] === "title" || parts[0] === "chapter")) {
            return parts[1];
        }
        return parts.length > 0 ? parts[parts.length - 1] : "";
    },

    parseDate: function(value) {
        if (!value) return 0;
        let time = Date.parse(value);
        return isNaN(time) ? 0 : time;
    },

    getJson: function(url) {
        let response = fetch(url, {
            headers: {
                "Accept": "application/json"
            }
        });
        if (response.status < 200 || response.status >= 300) return null;
        return JSON.parse(response.body);
    },

    toQuery: function(params) {
        let parts = [];
        for (let key in params) {
            let value = params[key];
            if (value === undefined || value === null || value === "") continue;
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value[i]));
                }
            } else {
                parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
            }
        }
        return parts.length > 0 ? "?" + parts.join("&") : "";
    }
};
