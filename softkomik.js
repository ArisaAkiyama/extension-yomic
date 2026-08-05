var cachedApiSession = null;

var source = {
    name: "Softkomik",
    baseUrl: "https://softkomik.co",
    apiUrl: "https://v2.softdevices.my.id",
    coverBaseUrl: "https://cover.softdevices.my.id/softkomik-cover",
    language: "id",
    version: "1.10.5",
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
            this.baseUrl + '/api/session/chapter/oaisos',
            this.baseUrl + '/api/session/aksjkas',
            this.baseUrl + '/api/session/chapter',
            this.baseUrl + '/api/session/iuiuiwqw',
            this.baseUrl + '/api/session/chapter/oioa',
            this.baseUrl + '/api/session/amsnuy'
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

    getSearchManga: function(query, page) {
        query = (query || "").trim();
        if (!query) return this.getPopularManga(page);

        // 1. Direct search API: https://v2.softdevices.my.id/search?name=query
        let searchUrl = this.apiUrl + "/search?name=" + encodeURIComponent(query);
        let body = this.getHtml(searchUrl, {
            headers: {
                "Accept": "application/json, text/plain, */*",
                "Referer": this.baseUrl + "/",
                "Origin": this.baseUrl
            }
        });

        if (body) {
            try {
                let json = JSON.parse(body);
                let list = json.data || [];
                if (Array.isArray(list) && list.length > 0) {
                    let items = list.map(m => {
                        let slug = m.title_slug || "";
                        let cover = m.gambar || "";

                        // If search API doesn't return cover image, fetch detail page HTML to extract exact "gambar"
                        if (!cover && slug) {
                            let detailHtml = this.getHtml(this.baseUrl + "/" + slug);
                            if (detailHtml) {
                                let idx = detailHtml.indexOf('"gambar":"');
                                if (idx !== -1) {
                                    let sub = detailHtml.substring(idx + 10);
                                    let endIdx = sub.indexOf('"');
                                    if (endIdx !== -1) {
                                        cover = sub.substring(0, endIdx);
                                    }
                                }
                            }
                        }

                        let thumbnailUrl = "";
                        if (cover) {
                            thumbnailUrl = cover.startsWith("http") ? cover : (this.coverBaseUrl + "/" + cover.replace(/^\//, ""));
                        }

                        return {
                            id: "/" + slug,
                            title: m.title || slug,
                            thumbnailUrl: thumbnailUrl,
                            url: this.baseUrl + "/" + slug
                        };
                    }).filter(m => m.id !== "/");

                    if (items.length > 0) {
                        return { items: items, totalPages: 1 };
                    }
                }
            } catch(e) {}
        }

        // 2. Fallback to /komik endpoint with session token
        let params = 'name=' + encodeURIComponent(query) + '&search=true&limit=20&page=' + page;
        let result = this.fetchApi(params);
        if (result && result.items.length > 0) return result;

        // 3. Fallback to library HTML page
        let html = this.getHtml(this.baseUrl + "/komik/library?page=" + page);
        let items = this.parseMangaCards(html);
        return { items: items, totalPages: 100 };
    },

    searchManga: function(query, page) {
        return this.getSearchManga(query, page);
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

    parseChapterNumber: function(str) {
        if (!str) return 0;
        let match = String(str).match(/\d+(?:\.\d+)?/);
        return match ? parseFloat(match[0]) : 0;
    },

    formatChapterDisplay: function(str) {
        if (!str) return "";
        let parts = String(str).split(".");
        let numPart = parts[0];
        let suffix = parts.slice(1).join(".");

        let floatVal = parseFloat(numPart);
        if (isNaN(floatVal)) return String(str);

        let formatted = (floatVal === Math.floor(floatVal)) ? Math.floor(floatVal).toString() : floatVal.toString();
        return suffix ? (formatted + "." + suffix) : formatted;
    },

    parseDateToMs: function(str) {
        if (!str) return 0;
        if (typeof str === 'number') return str;
        let ms = Date.parse(str);
        return (!isNaN(ms) && ms > 0) ? ms : 0;
    },

    parseChapterArray: function(list, mangaId) {
        let chapters = [];
        let seenNumbers = new Set();
        for (let i = 0; i < list.length; i++) {
            let item = list[i];
            let chNumStr = item.chapter || item.ch || item.title || "";
            if (!chNumStr) continue;

            let chNum = this.parseChapterNumber(chNumStr);
            let displayNum = this.formatChapterDisplay(chNumStr);
            let chUrl = mangaId + "/chapter/" + chNumStr;

            if (seenNumbers.has(chNum)) continue;
            seenNumbers.add(chNum);

            chapters.push({
                id: chUrl,
                url: this.baseUrl + chUrl,
                name: "Chapter " + displayNum,
                chapterNumber: chNum,
                dateUploaded: this.parseDateToMs(item.created_at || item.updated_at)
            });
        }
        chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
        return chapters;
    },

    generateChaptersFromLatestStr: function(latestStr, mangaId, updatedAt) {
        let chapters = [];
        let seenNumbers = new Set();
        let parsedDateMs = this.parseDateToMs(updatedAt);

        let addCh = (chStr, num, date) => {
            if (seenNumbers.has(num)) return;
            seenNumbers.add(num);

            let chUrl = mangaId + "/chapter/" + chStr;
            chapters.push({
                id: chUrl,
                url: this.baseUrl + chUrl,
                name: "Chapter " + this.formatChapterDisplay(chStr),
                chapterNumber: num,
                dateUploaded: date || parsedDateMs || 0
            });
        };

        let latestNum = this.parseChapterNumber(latestStr);
        if (latestNum > 0) {
            let isRawSpecial = latestStr.includes('.') || isNaN(parseInt(latestStr, 10)) || String(parseInt(latestStr, 10)) !== latestStr;
            if (isRawSpecial) {
                addCh(latestStr, latestNum, updatedAt);
            }

            let maxInt = Math.floor(latestNum);
            for (let i = maxInt; i >= 1; i--) {
                addCh(String(i), i, updatedAt);
            }
        }
        chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
        return chapters;
    },

    getChapterList: function(url) {
        let mangaId = url;
        if (mangaId.startsWith(this.baseUrl)) {
            mangaId = mangaId.substring(this.baseUrl.length);
        }
        if (!mangaId.startsWith("/")) mangaId = "/" + mangaId;

        let slug = mangaId.replace(/^\//, '');

        // Step 1: Try fetching full chapter list via API if session token is cached
        let sess = this.getApiSession(false);
        if (sess) {
            let apiChUrl = this.apiUrl + "/komik/" + slug + "/chapter?limit=9999999";
            let body = this.getHtml(apiChUrl, {
                headers: {
                    'X-Token': sess.token,
                    'X-Sign': sess.sign,
                    'Referer': this.baseUrl + '/',
                    'Origin': this.baseUrl
                }
            });
            if (body) {
                try {
                    let json = JSON.parse(body);
                    let chapterList = json.chapter || json.data || [];
                    if (Array.isArray(chapterList) && chapterList.length > 0) {
                        return this.parseChapterArray(chapterList, mangaId);
                    }
                } catch(e) {}
            }
        }

        // Step 2: Fetch Next.js HTML page data
        let html = this.getHtml(this.baseUrl + mangaId);
        let data = this.extractNextData(html);

        if (data && data.props && data.props.pageProps && data.props.pageProps.data) {
            let m = data.props.pageProps.data;

            // Check if m has chapters array directly
            let rawList = m.chapters || m.chapter || m.chapterList || [];
            if (Array.isArray(rawList) && rawList.length > 0) {
                return this.parseChapterArray(rawList, mangaId);
            }

            let latestStr = m.latest_chapter || "0";
            return this.generateChaptersFromLatestStr(latestStr, mangaId, m.updated_at);
        }
        return [];
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

        if (!data || !data.props || !data.props.pageProps || !data.props.pageProps.data) {
            throw new Error("Chapter ini sedang rusak/bermasalah dari server Softkomik (HTTP 500 dari website Softkomik). Silakan baca chapter sebelum/sesudahnya.");
        }

        let pageData = data.props.pageProps.data;
        let cData = pageData ? pageData.data : null;
        let imageSrc = cData ? (cData.imageSrc || []) : [];

        // Step 2: If imageSrc is empty, fetch from API using session token
        if (!imageSrc || imageSrc.length === 0) {
            if (!cData || !cData._id) {
                throw new Error("Tidak ada data chapter yang ditemukan.");
            }

            let sess = this.getApiSession(true);
            if (!sess) {
                let sessionEndpoints = [
                    this.baseUrl + "/api/session/chapter/oaisos",
                    this.baseUrl + "/api/session/aksjkas",
                    this.baseUrl + "/api/session/chapter",
                    this.baseUrl + "/api/session/iuiuiwqw",
                    this.baseUrl + "/api/session/chapter/oioa"
                ];

                for (let ep of sessionEndpoints) {
                    let sessBody = this.getHtml(ep);
                    if (sessBody) {
                        try {
                            let sJson = JSON.parse(sessBody);
                            if (sJson && sJson.token && sJson.sign) {
                                let cleaned = this.cleanSessionData(sJson.token, sJson.sign);
                                if (cleaned) {
                                    sess = cleaned;
                                    break;
                                }
                            }
                        } catch(e) {}
                    }
                }
            }

            if (!sess) {
                throw new Error("Gagal mendapat session token dari Softkomik. Coba beberapa saat lagi.");
            }

            // Extract slug and chapter from URL
            let urlMatch = fullUrl.match(/\/([^/]+)\/chapter\/([^/]+)/);
            if (!urlMatch) {
                throw new Error("Format URL chapter tidak valid.");
            }
            let slug = urlMatch[1];
            let chNum = urlMatch[2];

            // Image API call 1 — Next.js /api/komik/{slug}/chapter/{chNum}/img?id={cData._id}
            let imgApiUrl = this.baseUrl + "/api/komik/" + encodeURIComponent(slug) + "/chapter/" + encodeURIComponent(chNum) + "/img?id=" + encodeURIComponent(cData._id);
            let imgBody = this.getHtml(imgApiUrl, {
                headers: {
                    "X-Token": sess.token,
                    "X-Sign": sess.sign,
                    "Referer": fullUrl,
                    "Origin": this.baseUrl
                }
            });

            if (!imgBody) {
                // Fallback to old /imgs/ endpoint
                imgApiUrl = this.apiUrl + "/komik/" + slug + "/chapter/" + chNum + "/imgs/" + cData._id;
                imgBody = this.getHtml(imgApiUrl, {
                    headers: {
                        "X-Token": sess.token,
                        "X-Sign": sess.sign,
                        "Referer": this.baseUrl + "/"
                    }
                });
            }

            if (imgBody) {
                try {
                    let imgJson = JSON.parse(imgBody);
                    if (imgJson && Array.isArray(imgJson.imageSrc)) {
                        imageSrc = imgJson.imageSrc;
                    } else if (imgJson && imgJson._doc && Array.isArray(imgJson._doc.imageSrc)) {
                        imageSrc = imgJson._doc.imageSrc;
                    }
                } catch(e) {}
            }
        }

        if (!imageSrc || imageSrc.length === 0) {
            throw new Error("Gambar tidak tersedia untuk chapter ini di Softkomik.");
        }

        // CDN selection based on storageInter2 flag:
        // storageInter2 = true  → image.komik.im/softkomik/ (Updated from deprecated cdn1.softkomik.org)
        // storageInter2 = false → psy1.komik.im/
        let cdnBase = (cData && cData.storageInter2 === true)
            ? "https://image.komik.im/softkomik/"
            : "https://psy1.komik.im/";

        let pages = [];
        for (let i = 0; i < imageSrc.length; i++) {
            let img = imageSrc[i];
            if (img.startsWith("/")) img = img.substring(1);
            
            let fullImg;
            if (img.startsWith("http")) {
                fullImg = img;
            } else {
                // Relative path — prefix with selected CDN
                fullImg = cdnBase + img;
            }

            // Append security parameter id=T4Kmwztku if not already present
            if (!fullImg.includes("id=")) {
                let delimiter = fullImg.includes("?") ? "&" : "?";
                fullImg = fullImg + delimiter + "id=T4Kmwztku";
            }

            pages.push(fullImg + "|Referer=" + this.baseUrl + "/");
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
