var source = {
    name: "Softkomik",
    baseUrl: "https://softkomik.co",
    apiUrl: "https://v2.softdevices.my.id",
    coverBaseUrl: "https://cover.softdevices.my.id/softkomik-cover",
    language: "id",
    version: "1.0.0",
    description: "Softkomik Indonesian extension. Note: Softkomik uses aggressive anti-scraping with rotating session APIs.",
    author: "DesktopKomik",
    iconBackground: "#111111",
    iconForeground: "#ffffff",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 24,
    
    // Fallback known session endpoints (they might change)
    sessionListUrl: "https://softkomik.co/api/session/amsnuy",
    sessionImageUrl: "https://softkomik.co/api/session/chapter",

    extractNextData: function(html) {
        let match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (match && match.length > 1) {
            try {
                return JSON.parse(match[1]);
            } catch(e) {}
        }
        return null;
    },

    getHtml: function(url, options) {
        try {
            let response = fetch(url, options);
            if (response && response.status >= 200 && response.status < 300) {
                return response.body;
            }
        } catch(e) {}
        return "";
    },

    parseMangaList: function(html) {
        let data = this.extractNextData(html);
        if (!data || !data.props || !data.props.pageProps || !data.props.pageProps.libData) {
            return { items: [], totalPages: 1 };
        }
        let libData = data.props.pageProps.libData;
        if (!libData.data) {
            return { items: [], totalPages: 1 };
        }
        
        let items = libData.data.map(m => {
            let cover = m.gambar;
            if (cover && cover.startsWith("/")) cover = cover.substring(1);
            return {
                id: "/" + m.title_slug,
                title: m.title,
                thumbnailUrl: this.coverBaseUrl + "/" + cover,
                url: this.baseUrl + "/" + m.title_slug
            };
        });
        
        return { items: items, totalPages: libData.maxPage || 1 };
    },

    getPopularManga: function(page) {
        return this.getMangaList(page);
    },

    getLatestUpdates: function(page) {
        if (page === 1) {
            let hp = this.getHtml(this.baseUrl);
            let hData = this.extractNextData(hp);
            if (hData && hData.props && hData.props.pageProps && hData.props.pageProps.updateNonProject) {
                let items = hData.props.pageProps.updateNonProject.map(m => {
                    let cover = m.gambar;
                    if (cover && cover.startsWith("/")) cover = cover.substring(1);
                    return {
                        id: "/" + m.title_slug,
                        title: m.title,
                        thumbnailUrl: this.coverBaseUrl + "/" + cover,
                        url: this.baseUrl + "/" + m.title_slug
                    };
                });
                return { items: items, totalPages: 1 };
            }
        }
        
        let sessionHeaders = this.getApiSession(false) || {};
        let url = this.apiUrl + "/komik?page=" + page + "&limit=" + this.pageSize + "&sortBy=newKomik";
        let html = this.getHtml(url, { headers: sessionHeaders });
        
        let items = [];
        let totalPages = 1;
        
        if (html) {
            try {
                let json = JSON.parse(html);
                if (json.data && Array.isArray(json.data)) {
                    items = json.data.map(m => {
                        let cover = m.gambar || "";
                        if (cover && cover.startsWith("/")) cover = cover.substring(1);
                        return {
                            id: "/" + m.title_slug,
                            title: m.title,
                            thumbnailUrl: this.coverBaseUrl + "/" + cover,
                            url: this.baseUrl + "/" + m.title_slug
                        };
                    });
                }
                totalPages = json.maxPage || 1;
            } catch(e) {}
        }
        
        return { items: items, totalPages: totalPages };
    },

    getMangaList: function(page, status, genre, type) {
        let sessionHeaders = this.getApiSession(false) || {};
        let url = this.apiUrl + "/komik?page=" + page + "&limit=" + this.pageSize + "&sortBy=popular";
        
        if (status === 1) {
            url += "&status=ongoing";
        } else if (status === 2) {
            url += "&status=tamat";
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
            if (arr.length > 0) {
                url += "&genre=" + encodeURIComponent(arr.join(","));
            }
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
            if (arr.length > 0) {
                url += "&type=" + encodeURIComponent(arr[0].toLowerCase());
            }
        }

        let html = this.getHtml(url, { headers: sessionHeaders });
        
        let items = [];
        let totalPages = 1;
        
        if (html) {
            try {
                let json = JSON.parse(html);
                if (json.data && Array.isArray(json.data)) {
                    items = json.data.map(m => {
                        let cover = m.gambar || "";
                        if (cover && cover.startsWith("/")) cover = cover.substring(1);
                        return {
                            id: "/" + m.title_slug,
                            title: m.title,
                            thumbnailUrl: this.coverBaseUrl + "/" + cover,
                            url: this.baseUrl + "/" + m.title_slug
                        };
                    });
                }
                totalPages = json.maxPage || 1;
            } catch(e) {}
        }
        
        return { items: items, totalPages: totalPages };
    },

    getSearchManga: function(query, page) {
        query = (query || "").trim();
        let remainingQuery = query;
        let selectedGenres = [];
        let selectedType = "";
        let selectedStatus = "";

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

        let sortedFormats = this.formats.slice().sort((a, b) => b.length - a.length);
        for (let i = 0; i < sortedFormats.length; i++) {
            let f = sortedFormats[i];
            let lowerF = f.toLowerCase();
            let patterns = ["type:" + lowerF, "format:" + lowerF, "#" + lowerF];

            for (let p = 0; p < patterns.length; p++) {
                let pat = patterns[p];
                let idx = lowerQuery.indexOf(pat);
                if (idx !== -1) {
                    selectedType = f;
                    remainingQuery = remainingQuery.substring(0, idx) + " " + remainingQuery.substring(idx + pat.length);
                    lowerQuery = lowerQuery.substring(0, idx) + " " + lowerQuery.substring(idx + pat.length);
                }
            }
        }

        let statuses = ["ongoing", "completed", "tamat"];
        for (let i = 0; i < statuses.length; i++) {
            let s = statuses[i];
            let patterns = ["status:" + s, "#" + s];

            for (let p = 0; p < patterns.length; p++) {
                let pat = patterns[p];
                let idx = lowerQuery.indexOf(pat);
                if (idx !== -1) {
                    selectedStatus = (s === "completed" || s === "tamat") ? "tamat" : s;
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

        let sessionHeaders = this.getApiSession(false) || {};
        let url = this.apiUrl + "/komik?page=" + page + "&limit=" + this.pageSize + "&sortBy=newKomik";
        
        if (remainingQuery) {
            url += "&name=" + encodeURIComponent(remainingQuery);
        }
        if (selectedGenres.length > 0) {
            url += "&genre=" + encodeURIComponent(selectedGenres.join(","));
        }
        if (selectedType) {
            url += "&type=" + encodeURIComponent(selectedType.toLowerCase());
        }
        if (selectedStatus) {
            url += "&status=" + encodeURIComponent(selectedStatus);
        }

        let html = this.getHtml(url, { headers: sessionHeaders });
        
        let items = [];
        let totalPages = 1;
        
        if (html) {
            try {
                let json = JSON.parse(html);
                if (json.data && Array.isArray(json.data)) {
                    items = json.data.map(m => {
                        let cover = m.gambar || "";
                        if (cover && cover.startsWith("/")) cover = cover.substring(1);
                        return {
                            id: "/" + m.title_slug,
                            title: m.title,
                            thumbnailUrl: this.coverBaseUrl + "/" + cover,
                            url: this.baseUrl + "/" + m.title_slug
                        };
                    });
                }
                totalPages = json.maxPage || 1;
            } catch(e) {}
        }
        
        return { items: items, totalPages: totalPages };
    },
    
    cleanB64: function(str) {
        let cleanStr = str.split('=')[0];
        let padding = (4 - (cleanStr.length % 4)) % 4;
        for(let i = 0; i < padding; i++) cleanStr += "=";
        return cleanStr;
    },
    
    authToken: null,

    autoLogin: function() {
        if (this.authToken) return this.authToken;
        
        let url = "https://softkomik.co/api/login";
        let payload = JSON.stringify({ email: "yomic12@gmail.com", password: "arisa123!" });
        let html = this.getHtml(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: payload
        });
        
        if (html) {
            try {
                let json = JSON.parse(html);
                if (json.token) {
                    this.authToken = "Bearer " + json.token;
                    if (typeof log === 'function') log("AutoLogin Success");
                    return this.authToken;
                }
            } catch(e) {}
        }
        return null;
    },

    getApiSession: function(isChapterImage) {
        let token = this.autoLogin();
        
        let url = isChapterImage ? this.sessionImageUrl : this.sessionListUrl;
        let html = this.getHtml(url, {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        // If failed (e.g. no cookies yet), load /komik/list first to populate the correct cookies and retry
        if (!html || !html.includes("token")) {
            this.getHtml(this.baseUrl + "/komik/list");
            html = this.getHtml(url, {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });
        }
        
        if (html) {
            try {
                let json = JSON.parse(html);
                if (json.token && json.sign) {
                    let headers = {
                        "X-Token": this.cleanB64(json.token),
                        "X-Sign": json.sign.substring(0, 64)
                    };
                    if (token) {
                        headers["Authorization"] = token;
                        if (token.startsWith("Bearer ")) {
                            headers["Cookie"] = "tokkey=" + token.substring(7);
                        }
                    }
                    return headers;
                }
            } catch(e) {}
        }
        
        if (token) {
            let fallbackHeaders = { "Authorization": token };
            if (token.startsWith("Bearer ")) {
                fallbackHeaders["Cookie"] = "tokkey=" + token.substring(7);
            }
            return fallbackHeaders;
        }
        return null; // fallback to unauthenticated or cache
    },

    getMangaDetails: function(url) {
        let mangaId = url;
        if (mangaId.startsWith(this.baseUrl)) {
            mangaId = mangaId.substring(this.baseUrl.length);
        }
        if (!mangaId.startsWith("/")) mangaId = "/" + mangaId;
        
        let html = this.getHtml(url);
        let data = this.extractNextData(html);
        
        let manga = { url: url, id: mangaId };
        
        if (!data || !data.props || !data.props.pageProps) {
            return manga;
        }
        
        let m = data.props.pageProps.data;
        if (!m) return manga; // Softkomik API changed
        
        let cover = m.gambar;
        if (cover && cover.startsWith("/")) cover = cover.substring(1);
        
        let rawStatus = (m.status || "").toLowerCase().trim();
        let status = 0; // Unknown
        if (rawStatus === "ongoing" || rawStatus === "on going") {
            status = 1;
        } else if (rawStatus === "completed" || rawStatus === "complete" || rawStatus === "tamat") {
            status = 2;
        }
        
        manga.title = m.title;
        manga.author = m.author || "";
        manga.description = m.sinopsis || "";
        manga.status = status;
        manga.thumbnailUrl = this.coverBaseUrl + "/" + cover;
        
        if (m.Genre && Array.isArray(m.Genre)) {
            manga.genres = m.Genre.map(g => {
                if (typeof g === 'object' && g !== null) {
                    return g.value || g.label || g.name || "";
                }
                return String(g || "");
            }).filter(g => g !== "");
        }
        return manga;
    },

    getChapterList: function(url) {
        let mangaId = url;
        if (mangaId.startsWith(this.baseUrl)) {
            mangaId = mangaId.substring(this.baseUrl.length);
        }
        if (!mangaId.startsWith("/")) mangaId = "/" + mangaId;
        
        let sessionHeaders = this.getApiSession(false) || {};
        let chapterUrl = this.apiUrl + "/komik" + mangaId + "/chapter?limit=9999999";
        
        let chHtml = this.getHtml(chapterUrl, { headers: sessionHeaders });
        
        let chapters = [];
        if (chHtml) {
            try {
                let chData = JSON.parse(chHtml);
                if (chData && chData.chapter && Array.isArray(chData.chapter)) {
                    for (let i = 0; i < chData.chapter.length; i++) {
                        let c = chData.chapter[i];
                        let chNumStr = c.chapter.toString();
                        let chNum = parseFloat(chNumStr) || -1;
                        let chUrl = mangaId + "/chapter/" + chNumStr;
                        let formattedName = chNumStr.replace(/^0+(?=\d)/, '');
                        chapters.push({
                            id: chUrl,
                            url: this.baseUrl + chUrl,
                            name: "Chapter " + formattedName,
                            chapterNumber: chNum,
                            dateUploaded: c.created_at || ""
                        });
                    }
                }
            } catch(e) {}
        }
        chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
        return chapters;
    },

    getPageList: function(chapterUrl) {
        if (typeof log === 'function') log("getPageList started for: " + chapterUrl);
        let html = this.getHtml(chapterUrl);
        if (typeof log === 'function') log("getPageList html length: " + (html ? html.length : 0));
        let data = this.extractNextData(html);
        if (typeof log === 'function') log("getPageList nextData: " + (data ? "found" : "null"));
        
        if (!data || !data.props || !data.props.pageProps) {
            throw new Error("No pages found");
        }
        
        let pageData = data.props.pageProps.data;
        let cData = pageData ? pageData.data : null;
        if (typeof log === 'function') log("getPageList cData: " + (cData ? "found" : "null"));
        if (!cData) {
            throw new Error("No chapter data found");
        }
        
        let imageSrc = cData.imageSrc || [];
        if (typeof log === 'function') log("getPageList initial imageSrc count: " + imageSrc.length);
        
        // If imageSrc is empty, it needs to be fetched via API
        if (imageSrc.length === 0) {
            let sessionHeaders = this.getApiSession(true) || {};
            if (typeof log === 'function') log("getPageList sessionHeaders: " + JSON.stringify(sessionHeaders));
            
            // Parse slug and chapter number from chapterUrl
            let match = chapterUrl.match(/\/([^/]+)\/chapter\/(?:old\/)?([^/]+)/);
            if (!match) {
                throw new Error("Invalid chapter URL format");
            }
            let slug = match[1];
            let chNum = match[2];
            let imgApiUrl = this.apiUrl + "/komik/" + slug + "/chapter/" + chNum + "/img/" + cData._id;
            if (typeof log === 'function') log("getPageList fetching images from API: " + imgApiUrl);
            
            let imgHtml = this.getHtml(imgApiUrl, { headers: sessionHeaders });
            if (typeof log === 'function') log("getPageList imgHtml length: " + (imgHtml ? imgHtml.length : 0));
            if (imgHtml) {
                try {
                    let imgData = JSON.parse(imgHtml);
                    if (imgData && imgData.imageSrc) {
                        imageSrc = imgData.imageSrc;
                    }
                } catch(e) {
                    if (typeof log === 'function') log("getPageList JSON parse error: " + e.message);
                }
            }
        }
        
        if (!imageSrc || imageSrc.length === 0) {
            throw new Error("No pages found or requires login.");
        }
        
        if (typeof log === 'function') log("getPageList storageInter2: " + cData.storageInter2);
        let imageBaseUrl = cData.storageInter2 === true ? "https://cdn1.softkomik.org/softkomik" : "https://psy1.komik.im";
        if (typeof log === 'function') log("getPageList imageBaseUrl: " + imageBaseUrl);
        
        let pages = [];
        for (let i = 0; i < imageSrc.length; i++) {
            let img = imageSrc[i];
            if (img.startsWith("/")) img = img.substring(1);
            let imgUrl = imageBaseUrl + "/" + img;
            pages.push(imgUrl + "|Referer=" + this.baseUrl + "/");
        }
        
        if (typeof log === 'function') log("getPageList final pages count: " + pages.length);
        return pages;
    },

    genres: [
        "Action", "Adult", "Adventure", "Comedy", "Cooking", "Demon", "Drama", "Ecchi", 
        "Fantasy", "Game", "Gender Bender", "Gore", "Isekai", "Mature", "Mecha", "Medical", 
        "Military", "Musyc", "Mystery", "Parody", "Police", "Psychological", "Reincarnation", 
        "Reverse Harem", "Rofan", "Romance", "School", "School Life", "Sci-fi", "Seinen", 
        "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Sports", 
        "Super Power", "Supernatural", "Thriler", "Tragedy", "Yaoi", "Yuri", "Webtoons", "zombies"
    ],

    formats: [
        "Manga", "Manhwa", "Manhua"
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
