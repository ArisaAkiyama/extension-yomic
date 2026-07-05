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
    pageSize: 20,
    
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
        let url = this.baseUrl + "/komik/library?sortBy=popular&page=" + page;
        let html = this.getHtml(url);
        return this.parseMangaList(html);
    },

    getLatestUpdates: function(page) {
        let url = this.baseUrl + "/komik/library?sortBy=newKomik&page=" + page;
        let html = this.getHtml(url);
        return this.parseMangaList(html);
    },

    getMangaList: function(page, status, genre, type) {
        let url = this.baseUrl + "/komik/library?page=" + page;
        
        let sortBy = "popular";
        url += "&sortBy=" + sortBy;

        if (status === 1) {
            url += "&status=ongoing";
        } else if (status === 2) {
            url += "&status=completed";
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

        let html = this.getHtml(url);
        return this.parseMangaList(html);
    },

    getSearchManga: function(query, page) {
        if (!query) {
            return this.getPopularManga(page);
        }
        
        let sessionHeaders = this.getApiSession(false) || {};
        let url = this.apiUrl + "/komik?page=" + page + "&limit=" + this.pageSize + "&sortBy=newKomik&name=" + encodeURIComponent(query);
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
    
    getApiSession: function(isChapterImage) {
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
                    return {
                        "X-Token": this.cleanB64(json.token),
                        "X-Sign": json.sign.substring(0, 64)
                    };
                }
            } catch(e) {}
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
        
        manga.title = m.title;
        manga.author = m.author || "";
        manga.description = m.sinopsis || "";
        manga.status = (m.status || "").toLowerCase() === "ongoing" ? "Ongoing" : "Completed";
        manga.thumbnailUrl = this.coverBaseUrl + "/" + cover;
        
        if (m.Genre && Array.isArray(m.Genre)) {
            manga.genres = m.Genre.map(g => g.value || g.label);
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
    }
};
