var cachedApiSession = null;

var source = {
    name: "Softkomik",
    baseUrl: "https://softkomik.co",
    apiUrl: "https://v2.softdevices.my.id",
    coverBaseUrl: "https://cover.softdevices.my.id/softkomik-cover",
    language: "id",
    version: "1.6.0",
    description: "Softkomik Indonesian extension.",
    author: "DesktopKomik",
    iconBackground: "#111111",
    iconForeground: "#ffffff",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 20,

    extractNextData: function(html) {
        if (!html) return null;
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
            let opts = options || {};
            let response = fetch(url, opts);
            if (response && response.status >= 200 && response.status < 300) {
                return response.body;
            }
        } catch(e) {}
        return "";
    },

    parseMangaCards: function(html) {
        if (!html) return [];
        let items = [];
        let blocks = html.split('item-komik');

        for (let i = 1; i < blocks.length; i++) {
            let b = blocks[i];
            let slugMatch = b.match(/href="\/([a-z0-9-]+-bahasa-indonesia)"/i) || b.match(/href="\/([a-z0-9-]+)"/i);
            let altMatch = b.match(/alt="([^"]+)"/i);
            let coverMatch = b.match(/url\(&quot;(https:[^&]+)&quot;\)/i) || b.match(/url=(https%3A%2F%2F[^&"]+)/i);

            if (slugMatch && altMatch) {
                let slug = slugMatch[1];
                let title = altMatch[1].trim();
                let cover = coverMatch ? (coverMatch[1].startsWith('http') ? coverMatch[1] : decodeURIComponent(coverMatch[1])) : "";
                
                if (!cover) {
                    cover = this.coverBaseUrl + "/image-cover/" + slug + ".jpeg";
                }

                items.push({
                    id: "/" + slug,
                    title: title,
                    thumbnailUrl: cover,
                    url: this.baseUrl + "/" + slug
                });
            }
        }
        return items;
    },

    cleanSessionData: function(rawToken, rawSign) {
        if (!rawToken || !rawSign) return null;
        let cleanToken = rawToken.split('=')[0];
        cleanToken = cleanToken + '='.repeat((4 - (cleanToken.length % 4)) % 4);
        let cleanSig = rawSign.indexOf('|') !== -1 ? rawSign.substring(0, rawSign.indexOf('|')) : rawSign.substring(0, 64);
        return { token: cleanToken, sign: cleanSig };
    },

    // Retrieve a session token for the v2 API with 1-hour cache
    getApiSession: function(forceRefresh) {
        if (!forceRefresh && cachedApiSession && Date.now() < cachedApiSession.ex) {
            return cachedApiSession;
        }

        let ref = this.baseUrl + '/komik/list';
        // Seed cookies via GET to list page
        this.getHtml(ref);

        let apiHeaders = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': ref,
            'Origin': this.baseUrl
        };

        let sessionEndpoints = [
            this.baseUrl + '/api/session/iuiuiwqw',
            this.baseUrl + '/api/session/chapter/oioa',
            this.baseUrl + '/api/session/amsnuy',
            this.baseUrl + '/api/session/chapter'
        ];

        for (let i = 0; i < sessionEndpoints.length; i++) {
            let ep = sessionEndpoints[i];
            let sessBody = this.getHtml(ep, { headers: apiHeaders });
            if (sessBody) {
                try {
                    let s = JSON.parse(sessBody);
                    if (s && s.token) {
                        let cleaned = this.cleanSessionData(s.token, s.sig || s.sign);
                        if (cleaned) {
                            cachedApiSession = {
                                token: cleaned.token,
                                sign: cleaned.sign,
                                ex: Date.now() + (60 * 60 * 1000) // 1 hour
                            };
                            return cachedApiSession;
                        }
                    }
                } catch(e) {}
            }
        }

        return null;
    },

    // Parse manga list from v2.softdevices.my.id API response
    parseApiResponse: function(body) {
        if (!body) return null;
        try {
            let json = JSON.parse(body);
            let list = json.data || [];
            if (!Array.isArray(list)) return null;
            let maxPage = json.maxPage || 1;
            let items = list.map(m => {
                let slug = m.title_slug || '';
                let cover = m.gambar || '';
                if (cover && !cover.startsWith('http')) {
                    cover = this.coverBaseUrl + '/' + cover.replace(/^\//, '');
                }
                return {
                    id: '/' + slug,
                    title: m.title || slug,
                    thumbnailUrl: cover,
                    url: this.baseUrl + '/' + slug
                };
            }).filter(m => m.id !== '/');
            return { items: items, totalPages: maxPage };
        } catch(e) {
            return null;
        }
    },

    // Fetch from v2 API with session token. Returns parsed result or null.
    fetchApi: function(params) {
        let apiUrl = this.apiUrl + '/komik?' + params;

        // Try 1: with cached/existing session
        let sess = this.getApiSession(false);
        if (sess) {
            let body = this.getHtml(apiUrl, {
                headers: {
                    'X-Token': sess.token,
                    'X-Sign': sess.sign,
                    'Referer': this.baseUrl + '/',
                    'Origin': this.baseUrl
                }
            });
            let result = this.parseApiResponse(body);
            if (result) return result;
        }

        // Try 2: force refresh session if cached session was stale/invalid
        sess = this.getApiSession(true);
        if (sess) {
            let body = this.getHtml(apiUrl, {
                headers: {
                    'X-Token': sess.token,
                    'X-Sign': sess.sign,
                    'Referer': this.baseUrl + '/',
                    'Origin': this.baseUrl
                }
            });
            let result = this.parseApiResponse(body);
            if (result) return result;
        }

        return null;
    },

    getPopularManga: function(page) {
        let result = this.fetchApi('page=' + page + '&limit=20&sortBy=popular&showAdult=false');
        if (result && result.items.length > 0) return result;
        return this.getMangaList(page, 0, null, null);
    },

    getLatestUpdates: function(page) {
        let result = this.fetchApi('page=' + page + '&limit=20&sortBy=newKomik&showAdult=false');
        if (result && result.items.length > 0) return result;
        let url = this.baseUrl + "/komik/library?sortBy=newKomik&page=" + page;
        let html = this.getHtml(url);
        let items = this.parseMangaCards(html);
        return { items: items, totalPages: 100 };
    },

    getMangaList: function(page, status, genre, type) {
        let url = this.baseUrl + "/komik/library?page=" + page;

        if (status === 1) {
            url += "&status=ongoing";
        } else if (status === 2) {
            url += "&status=tamat";
        } else {
            url += "&sortBy=popular";
        }

        if (type) {
            let tStr = Array.isArray(type) ? type[0] : String(type);
            url += "&type=" + encodeURIComponent(tStr.toLowerCase());
        }

        if (genre) {
            let gStr = Array.isArray(genre) ? genre.join(",") : String(genre);
            url += "&genre=" + encodeURIComponent(gStr);
        }

        let html = this.getHtml(url);
        let items = this.parseMangaCards(html);

        return { items: items, totalPages: 100 };
    },

    searchManga: function(query, page) {
        if (!query) return this.getPopularManga(page);

        // Keiyoushi search API format: name=query&search=true&limit=20&page=1
        let params = 'name=' + encodeURIComponent(query) + '&search=true&limit=20&page=' + page;
        let result = this.fetchApi(params);
        if (result && result.items.length > 0) return result;

        // Fallback: try without search=true parameter
        let paramsAlt = 'page=' + page + '&limit=20&sortBy=newKomik&name=' + encodeURIComponent(query) + '&showAdult=false';
        let resultAlt = this.fetchApi(paramsAlt);
        if (resultAlt && resultAlt.items.length > 0) return resultAlt;

        return { items: [], totalPages: 1 };
    },

    getMangaDetails: function(url) {
        let mangaId = url;
        if (mangaId.startsWith(this.baseUrl)) {
            mangaId = mangaId.substring(this.baseUrl.length);
        }
        if (!mangaId.startsWith("/")) mangaId = "/" + mangaId;

        // No headers — uses Cloudflare bypass path
        let html = this.getHtml(this.baseUrl + mangaId);
        let data = this.extractNextData(html);

        let manga = { url: this.baseUrl + mangaId, id: mangaId };

        if (!data || !data.props || !data.props.pageProps) {
            return manga;
        }

        let m = data.props.pageProps.data;
        if (!m) return manga;

        let cover = m.gambar || "";
        if (cover && cover.startsWith("/")) cover = cover.substring(1);

        let rawStatus = (m.status || "").toLowerCase().trim();
        let status = 0;
        if (rawStatus === "ongoing" || rawStatus === "on going") {
            status = 1;
        } else if (rawStatus === "completed" || rawStatus === "complete" || rawStatus === "tamat") {
            status = 2;
        }

        manga.title = m.title;
        manga.author = m.author || "";
        manga.description = m.sinopsis || "";
        manga.status = status;
        manga.thumbnailUrl = cover.startsWith("http") ? cover : (this.coverBaseUrl + "/" + cover);

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

        // No headers — uses Cloudflare bypass path
        let html = this.getHtml(this.baseUrl + mangaId);
        let data = this.extractNextData(html);

        let chapters = [];
        if (data && data.props && data.props.pageProps && data.props.pageProps.data) {
            let m = data.props.pageProps.data;
            let latestStr = m.latest_chapter || "0";
            let latestNum = parseInt(latestStr, 10) || 0;

            if (latestNum > 0) {
                for (let i = latestNum; i >= 1; i--) {
                    let chNumStr = i < 10 ? "00" + i : (i < 100 ? "0" + i : "" + i);
                    let chUrl = mangaId + "/chapter/" + chNumStr;
                    chapters.push({
                        id: chUrl,
                        url: this.baseUrl + chUrl,
                        name: "Chapter " + i,
                        chapterNumber: i,
                        dateUploaded: m.updated_at || ""
                    });
                }
            }
        }
        return chapters;
    },

    getPageList: function(chapterUrl) {
        let fullUrl = chapterUrl;
        if (!fullUrl.startsWith("http")) {
            if (!fullUrl.startsWith("/")) fullUrl = "/" + fullUrl;
            fullUrl = this.baseUrl + fullUrl;
        }

        // Step 1: Load chapter HTML — no headers, uses Cloudflare bypass
        // This also seeds the cookies needed for the session API below
        let html = this.getHtml(fullUrl);
        let data = this.extractNextData(html);

        if (!data || !data.props || !data.props.pageProps) {
            throw new Error("Gagal memuat halaman chapter Softkomik.");
        }

        let pageData = data.props.pageProps.data;
        let cData = pageData ? pageData.data : null;
        let imageSrc = cData ? (cData.imageSrc || []) : [];

        // Step 2: If imageSrc is empty, fetch from API using session token
        if (!imageSrc || imageSrc.length === 0) {
            if (!cData || !cData._id) {
                throw new Error("Tidak ada data chapter yang ditemukan.");
            }

            // Session endpoint — fetch WITHOUT headers so Cloudflare bypass is active
            // The homepage visit in Step 1 already set Cloudflare cookies
            let sessionUrl = this.baseUrl + "/api/session/chapter/oioa";
            let sessBody = this.getHtml(sessionUrl);
            
            if (!sessBody) {
                throw new Error("Gagal mendapat session token dari Softkomik. Coba beberapa saat lagi.");
            }

            let sessJson = null;
            try {
                sessJson = JSON.parse(sessBody);
            } catch(e) {
                throw new Error("Response session Softkomik tidak valid.");
            }

            if (!sessJson || !sessJson.token || !sessJson.sign) {
                throw new Error("Session token Softkomik kosong. Server mungkin sedang bermasalah.");
            }

            // Extract slug and chapter from URL
            let urlMatch = fullUrl.match(/\/([^/]+)\/chapter\/([^/]+)/);
            if (!urlMatch) {
                throw new Error("Format URL chapter tidak valid.");
            }
            let slug = urlMatch[1];
            let chNum = urlMatch[2];

            // Clean token/sign as Tachiyomi does
            let cleanToken = sessJson.token;
            let rawSign = sessJson.sign;
            let cleanSign = rawSign.indexOf('|') !== -1 ? rawSign.substring(0, rawSign.indexOf('|')) : rawSign.substring(0, 64);

            // Image API call — with X-Token and X-Sign headers
            // NOTE: endpoint is /imgs/ (plural) not /img/
            let imgApiUrl = this.apiUrl + "/komik/" + slug + "/chapter/" + chNum + "/imgs/" + cData._id;
            let imgBody = this.getHtml(imgApiUrl, {
                headers: {
                    "X-Token": cleanToken,
                    "X-Sign": cleanSign,
                    "Referer": this.baseUrl + "/"
                }
            });

            if (!imgBody) {
                throw new Error("Gagal memuat daftar gambar dari server Softkomik.");
            }

            try {
                let imgJson = JSON.parse(imgBody);
                // Response wraps data in _doc.imageSrc (Mongoose document structure)
                if (imgJson && imgJson._doc && imgJson._doc.imageSrc) {
                    imageSrc = imgJson._doc.imageSrc;
                } else if (imgJson && imgJson.imageSrc) {
                    imageSrc = imgJson.imageSrc;
                }
            } catch(e) {}
        }

        if (!imageSrc || imageSrc.length === 0) {
            throw new Error("Gambar tidak tersedia untuk chapter ini di Softkomik.");
        }

        // CDN selection based on storageInter2 flag:
        // storageInter2 = true  → cdn1.softkomik.org/softkomik/
        // storageInter2 = false → psy1.komik.im/
        let cdnBase = (cData && cData.storageInter2 === true)
            ? "https://cdn1.softkomik.org/softkomik/"
            : "https://psy1.komik.im/";

        let pages = [];
        for (let i = 0; i < imageSrc.length; i++) {
            let img = imageSrc[i];
            if (img.startsWith("/")) img = img.substring(1);
            // If it's already a full URL
            if (img.startsWith("http")) {
                pages.push(img + "|Referer=" + this.baseUrl + "/");
            } else {
                // Relative path — prefix with selected CDN
                pages.push(cdnBase + img + "|Referer=" + this.baseUrl + "/");
            }
        }

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
    ]
};
