var source = {
    name: "KomikCast",
    baseUrl: "https://v2.komikcast.fit",
    apiUrl: "https://be.komikcast.cc",
    language: "id",
    version: "1.0.0",
    description: "KomikCast Indonesian extension implemented in JavaScript using the KomikCast API",
    author: "DesktopKomik",
    iconBackground: "#0f172a",
    iconForeground: "#38bdf8",
    isNsfw: false,
    isHasMorePages: true,

    pageSize: 14,

    getPopularManga: function(page) {
        return this.getSeriesPage(page, {
            includeMeta: "true",
            sort: "popularity",
            sortOrder: "desc"
        });
    },

    getLatestUpdates: function(page) {
        return this.getSeriesPage(page, {
            includeMeta: "true",
            sort: "latest",
            sortOrder: "desc"
        });
    },

    getSearchManga: function(query, page) {
        let params = {
            includeMeta: "true",
            sort: "popular",
            sortOrder: "desc"
        };

        query = (query || "").trim();
        let remainingQuery = query;
        let selectedGenres = [];

        let lowerQuery = query.toLowerCase();
        let sortedGenres = this.genres.slice().sort((a, b) => b.length - a.length);

        for (let i = 0; i < sortedGenres.length; i++) {
            let g = sortedGenres[i];
            let lowerG = g.toLowerCase();
            let patterns = ["genre:" + lowerG, "#" + lowerG];

            for (let p = 0; p < patterns.length; p++) {
                let pat = patterns[p];
                let idx = lowerQuery.indexOf(pat);
                if (idx !== -1) {
                    selectedGenres.push(g);
                    remainingQuery = remainingQuery.substring(0, idx) + " " + remainingQuery.substring(idx + pat.length);
                    lowerQuery = lowerQuery.substring(0, idx) + " " + lowerQuery.substring(idx + pat.length);
                }
            }
        }

        remainingQuery = remainingQuery.replace(/\s+/g, " ").trim();

        if (selectedGenres.length === 0 && remainingQuery) {
            let g = this.findGenre(remainingQuery);
            if (g) {
                selectedGenres.push(g);
                remainingQuery = "";
            }
        }

        if (selectedGenres.length > 0) {
            params.genreIds = selectedGenres;
        }

        if (remainingQuery) {
            params.filter = "title=like=\"" + remainingQuery + "\",nativeTitle=like=\"" + remainingQuery + "\"";
        }

        return this.getSeriesPage(page, params);
    },

    getMangaList: function(page, status, genre, type) {
        let params = {
            includeMeta: "true",
            sort: "popularity",
            sortOrder: "desc"
        };

        if (status === 1) {
            params.status = "ongoing";
        } else if (status === 2) {
            params.status = "completed";
        } else if (status === 3) {
            params.status = "hiatus";
        } else if (status === 4) {
            params.status = "cancelled";
        }

        if (genre) {
            let arr = [];
            if (Array.isArray(genre)) {
                arr = genre;
            } else if (genre.length !== undefined && typeof genre !== 'string') {
                for (let i = 0; i < genre.length; i++) {
                    arr.push(genre[i]);
                }
            } else {
                arr = [genre];
            }
            params.genreIds = arr;
        }

        if (type) {
            let arr = [];
            if (Array.isArray(type)) {
                arr = type;
            } else if (type.length !== undefined && typeof type !== 'string') {
                for (let i = 0; i < type.length; i++) {
                    arr.push(type[i]);
                }
            } else {
                arr = [type];
            }
            // map formats to lowercase for KomikCast API
            params.format = arr.map(f => f.toLowerCase());
        }

        return this.getSeriesPage(page, params);
    },

    getSeriesPage: function(page, extraParams) {
        let currentPage = Math.max(1, page || 1);
        let params = {
            take: this.pageSize,
            page: currentPage
        };

        for (let key in extraParams) {
            params[key] = extraParams[key];
        }

        let json = this.getJson(this.apiUrl + "/series" + this.toQuery(params));
        if (!json || !json.data) {
            return { items: [], totalPages: currentPage };
        }

        let totalPages = currentPage;
        if (json.meta) {
            if (typeof json.meta.lastPage === "number") {
                totalPages = json.meta.lastPage;
            } else if (typeof json.meta.total === "number") {
                totalPages = Math.ceil(json.meta.total / this.pageSize);
            }
        }

        return {
            items: json.data.map(item => this.parseSeriesItem(item)),
            totalPages: Math.max(1, totalPages)
        };
    },

    getMangaDetails: function(url) {
        let slug = this.extractSeriesSlug(url);
        if (!slug) return {};

        let json = this.getJson(this.apiUrl + "/series/" + encodeURIComponent(slug));
        if (!json || !json.data) return {};

        let manga = this.parseSeriesItem(json.data);
        let data = (json.data && json.data.data) || {};
        let description = data.synopsis || "";
        if (data.nativeTitle) {
            description = description ? description + "\n\nJudul lain: " + data.nativeTitle : "Judul lain: " + data.nativeTitle;
        }
        if (data.rating) {
            description = description + "\n\nRating: " + data.rating;
        }

        manga.author = data.author || "";
        manga.description = description;
        return manga;
    },

    getChapterList: function(mangaUrl) {
        let slug = this.extractSeriesSlug(mangaUrl);
        if (!slug) return [];

        let json = this.getJson(this.apiUrl + "/series/" + encodeURIComponent(slug) + "/chapters");
        if (!json || !json.data) return [];

        let chapters = [];
        for (let i = 0; i < json.data.length; i++) {
            let item = json.data[i];
            let data = item.data || {};
            let index = data.index !== undefined && data.index !== null ? data.index : item.chapterIndex;
            if (index === undefined || index === null) continue;

            let formattedIndex = this.formatChapterIndex(index);
            let title = (data.title || "").trim();
            let name = "Chapter " + formattedIndex;
            if (title) name += ": " + title;

            chapters.push({
                name: name,
                url: "/series/" + slug + "/chapter/" + formattedIndex,
                dateUpload: this.parseDate(item.createdAt || item.updatedAt || "")
            });
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let parts = this.extractChapterParts(chapterUrl);
        if (!parts.slug || !parts.chapterIndex) return [];

        let json = this.getJson(this.apiUrl + "/series/" + encodeURIComponent(parts.slug) + "/chapters/" + encodeURIComponent(parts.chapterIndex));
        if (!json || !json.data || !json.data.data || !json.data.data.images) return [];

        let images = json.data.data.images;
        let pages = [];
        for (let i = 0; i < images.length; i++) {
            let imageUrl = images[i];
            if (imageUrl) {
                pages.push(imageUrl + "|Referer=" + this.baseUrl + "/&Origin=" + this.baseUrl);
            }
        }
        return pages;
    },

    parseSeriesItem: function(item) {
        let data = (item && item.data) || {};
        let slug = data.slug || (item && item.id ? String(item.id) : "");
        let description = data.synopsis || "";
        if (data.rating) {
            description = description + "\n\nRating: " + data.rating;
        }

        let title = data.title || data.nativeTitle || this.titleFromSlug(slug);
        let formatFromTitle = null;
        let match = title.match(/\s*(?:[\[\(]|-)\s*(Manga|Manhwa|Manhua|Webtoon|Mangatoon)\s*[\]\)]?$/i);
        if (match) {
            formatFromTitle = match[1].toLowerCase();
            title = title.replace(/\s*(?:[\[\(]|-)\s*(Manga|Manhwa|Manhua|Webtoon|Mangatoon)\s*[\]\)]?$/i, "").trim();
        }

        let formatVal = formatFromTitle || data.format || "";
        formatVal = formatVal.toLowerCase();
        let formatLabel = "";
        if (formatVal === "manga") {
            formatLabel = "Manga";
        } else if (formatVal === "manhwa") {
            formatLabel = "Manhwa";
        } else if (formatVal === "manhua") {
            formatLabel = "Manhua";
        } else if (formatVal === "webtoon" || formatVal === "mangatoon") {
            formatLabel = "Mangatoon";
        }

        let genres = this.extractGenres(data.genres);

        return {
            title: title,
            url: "/series/" + slug,
            thumbnailUrl: data.coverImage || "",
            author: data.author || "",
            status: this.mapStatus(data.status),
            description: description,
            genre: genres,
            source: this.id
        };
    },

    extractGenres: function(genres) {
        let result = [];
        genres = genres || [];
        for (let i = 0; i < genres.length; i++) {
            let genre = genres[i];
            let name = genre && genre.data ? genre.data.name : "";
            if (name) result.push(name);
        }
        return result;
    },

    extractSeriesSlug: function(url) {
        if (!url) return "";
        let clean = url.split("?")[0].replace(this.baseUrl, "");
        let parts = clean.split("/").filter(x => x && x.trim() !== "");
        if (parts.length >= 2 && parts[0] === "series") return parts[1];
        return parts.length > 0 ? parts[parts.length - 1] : "";
    },

    extractChapterParts: function(url) {
        let clean = (url || "").split("?")[0].replace(this.baseUrl, "");
        let parts = clean.split("/").filter(x => x && x.trim() !== "");
        if (parts.length >= 4 && parts[0] === "series" && parts[2] === "chapter") {
            return { slug: parts[1], chapterIndex: parts[3] };
        }
        return { slug: "", chapterIndex: "" };
    },

    formatChapterIndex: function(value) {
        let number = Number(value);
        if (isNaN(number)) return String(value);
        if (Math.floor(number) === number) return String(number);
        return String(Math.round(number * 100) / 100);
    },

    mapStatus: function(status) {
        status = (status || "").toLowerCase();
        if (status === "ongoing" || status === "on going") return 1;
        if (status === "completed" || status === "complete") return 2;
        if (status === "hiatus") return 3;
        if (status === "cancelled" || status === "canceled") return 4;
        return 0;
    },

    titleFromSlug: function(slug) {
        return (slug || "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
    },

    parseDate: function(value) {
        if (!value) return 0;
        let time = Date.parse(value);
        return isNaN(time) ? 0 : time;
    },

    getJson: function(url) {
        let response = fetch(url, {
            headers: {
                "Accept": "application/json",
                "Referer": this.baseUrl + "/",
                "Origin": this.baseUrl,
                "Accept-Language": "en-US,en;q=0.9,id;q=0.8"
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
    },

    genres: [
        "4-Koma", "Action", "Adult", "Adventure", "Comedy", "Cooking", "Demons", "Drama",
        "Ecchi", "Fantasy", "Game", "Gender Bender", "Gore", "Harem", "Historical", "Horror",
        "Isekai", "Josei", "Magic", "Martial Arts", "Mature", "Mecha", "Medical", "Military",
        "Music", "Mystery", "One-Shot", "Police", "Psychological", "Reincarnation", "Romance",
        "School", "School Life", "Sci-Fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen",
        "Shounen Ai", "Slice of Life", "Sports", "Super Power", "Supernatural", "Thriller",
        "Tragedy", "Vampire", "Webtoons", "Yuri"
    ],

    formats: [
        "Manga", "Manhwa", "Manhua", "Webtoon"
    ],

    findGenre: function(name) {
        if (!name) return null;
        let lower = name.toLowerCase().trim();
        for (let i = 0; i < this.genres.length; i++) {
            if (this.genres[i].toLowerCase() === lower) {
                return this.genres[i];
            }
        }
        return null;
    }
};
