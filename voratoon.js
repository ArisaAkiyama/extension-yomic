var source = {
    name: "VoraToon",
    baseUrl: "https://13.voratoon.com",
    apiUrl: "https://13.voratoon.com",
    iconUrl: "https://13.voratoon.com/logo/voratoon-icon-512.png",
    language: "id",
    version: "1.1.0",
    description: "Baca Komik Online Bahasa Indonesia - Manga, Manhwa, Manhua Terbaru",
    author: "DesktopKomik",
    iconBackground: "#ea580c",
    iconForeground: "#ffffff",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 30,

    genres: [
        "Action", "Adult", "Adventure", "Comedy", "Cooking", "Crime", "Demons", "Drama", "Ecchi",
        "Fantasy", "Game", "Gender Bender", "Gore", "Harem", "Historical", "Horror",
        "Isekai", "Josei", "Magic", "Martial Arts", "Mature", "Mecha", "Military",
        "Music", "Mystery", "One Shot", "Overpowered", "Parody", "Police", "Psychological",
        "Reincarnation", "Romance", "Samurai", "School Life", "Sci-Fi", "Seinen",
        "Shoujo", "Shounen", "Slice of Life", "Sports", "Super Power", "Supernatural",
        "Survival", "Suspense", "Thriller", "Time Travel", "Tragedy", "Vampire", "Webtoon"
    ],

    parseSeriesList: function(text, page) {
        if (!text) return { items: [], totalPages: page || 1 };

        let seriesIdx = text.indexOf('"series":');
        let isEscaped = false;
        if (seriesIdx === -1) {
            seriesIdx = text.indexOf('\\"series\\":');
            isEscaped = true;
        }

        let items = [];
        let totalPages = page || 1;

        if (seriesIdx !== -1) {
            let start = text.indexOf('[', seriesIdx);
            if (start !== -1) {
                let metaKey = isEscaped ? '\\"seriesMeta\\":' : '"seriesMeta":';
                let metaIdx = text.indexOf(metaKey, start);
                let end = -1;

                if (metaIdx !== -1) {
                    end = text.lastIndexOf(']', metaIdx) + 1;
                } else {
                    let closeIdx = text.indexOf('],', start);
                    if (closeIdx === -1) closeIdx = text.indexOf(']}', start);
                    if (closeIdx !== -1) end = closeIdx + 1;
                }

                if (end > start) {
                    let raw = text.substring(start, end);
                    if (isEscaped) {
                        raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    }
                    try {
                        let seriesArr = JSON.parse(raw);
                        for (let i = 0; i < seriesArr.length; i++) {
                            let item = seriesArr[i];
                            let d = item.data || item.$attributes || item;
                            let title = d.title || d.name || "";
                            let slug = d.slug || "";
                            let cover = d.coverImage || "";
                            if (cover && !cover.startsWith("http")) {
                                cover = "https://cvr.voratoon.id/prod/" + cover;
                            }
                            if (title && slug) {
                                items.push({
                                    title: title.trim(),
                                    url: "/series/" + slug,
                                    thumbnailUrl: cover ? (cover + "|Referer=" + this.baseUrl + "/") : "",
                                    status: d.status === "completed" ? 2 : 1
                                });
                            }
                        }
                    } catch (e) {}
                }

                // Extract totalPages from seriesMeta
                if (metaIdx !== -1) {
                    let mStart = text.indexOf('{', metaIdx);
                    let mEnd = text.indexOf('}', mStart);
                    if (mStart !== -1 && mEnd !== -1) {
                        let mRaw = text.substring(mStart, mEnd + 1);
                        if (isEscaped) mRaw = mRaw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        try {
                            let meta = JSON.parse(mRaw);
                            if (meta.lastPage) {
                                totalPages = meta.lastPage;
                            } else if (meta.total) {
                                totalPages = Math.ceil(meta.total / 30);
                            }
                        } catch (e) {}
                    }
                }
            }
        }

        // Fallback: If RSC parsing found nothing, fallback to HTML regex
        if (items.length === 0) {
            let re = /<a[^>]+href=["'](\/series\/[^"'\/]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            let m;
            let seen = {};
            while ((m = re.exec(text)) !== null) {
                let href = m[1];
                let inner = m[2];
                if (seen[href]) continue;

                let titleMatch = inner.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/i) || inner.match(/alt="([^"]+)"/i);
                let title = titleMatch ? titleMatch[1].trim() : "";
                let imgMatch = inner.match(/src="([^"]+)"/i) || inner.match(/data-src="([^"]+)"/i);
                let cover = imgMatch ? imgMatch[1] : "";

                if (title && href) {
                    seen[href] = true;
                    items.push({
                        title: title.replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
                        url: href,
                        thumbnailUrl: cover ? (cover + "|Referer=" + this.baseUrl + "/") : "",
                        status: 1
                    });
                }
            }
            if (items.length > 0) {
                totalPages = items.length >= 20 ? page + 1 : page;
            }
        }

        return {
            items: items,
            totalPages: Math.max(1, totalPages)
        };
    },

    getPopularManga: function(page) {
        page = Math.max(1, page || 1);
        let url = this.baseUrl + "/browse?sort=popular&page=" + page;
        let res = this.fetchRsc(url);
        if (!res || res.status !== 200) {
            res = this.fetchApi(url, "GET");
        }
        if (res && res.status === 200) {
            return this.parseSeriesList(res.body, page);
        }
        return { items: [], totalPages: page };
    },

    getLatestUpdates: function(page) {
        page = Math.max(1, page || 1);
        let url = this.baseUrl + "/browse?sort=latest&page=" + page;
        let res = this.fetchRsc(url);
        if (!res || res.status !== 200) {
            res = this.fetchApi(url, "GET");
        }
        if (res && res.status === 200) {
            return this.parseSeriesList(res.body, page);
        }
        return { items: [], totalPages: page };
    },

    getSearchManga: function(query, page) {
        page = Math.max(1, page || 1);
        let q = (query || "").trim();
        let url = this.baseUrl + "/browse?page=" + page;
        if (q) {
            url += "&q=" + encodeURIComponent(q);
        }
        let res = this.fetchRsc(url);
        if (!res || res.status !== 200) {
            res = this.fetchApi(url, "GET");
        }
        if (res && res.status === 200) {
            return this.parseSeriesList(res.body, page);
        }
        return { items: [], totalPages: page };
    },

    getMangaList: function(page, status, genre, type) {
        page = Math.max(1, page || 1);
        let url = this.baseUrl + "/browse?page=" + page;

        if (status === 2 || status === "Completed" || status === "completed") {
            url += "&status=completed";
        } else if (status === 1 || status === "Ongoing" || status === "ongoing") {
            url += "&status=ongoing";
        }

        if (genre && Array.isArray(genre) && genre.length > 0) {
            url += "&genre=" + encodeURIComponent(genre.join(","));
        } else if (typeof genre === "string" && genre.trim()) {
            url += "&genre=" + encodeURIComponent(genre.trim());
        }

        if (type && Array.isArray(type) && type.length > 0) {
            url += "&format=" + encodeURIComponent(type.join(",").toLowerCase());
        } else if (typeof type === "string" && type.trim()) {
            url += "&format=" + encodeURIComponent(type.trim().toLowerCase());
        }

        let res = this.fetchRsc(url);
        if (!res || res.status !== 200) {
            res = this.fetchApi(url, "GET");
        }
        if (res && res.status === 200) {
            return this.parseSeriesList(res.body, page);
        }
        return { items: [], totalPages: page };
    },

    getMangaDetails: function(mangaUrl) {
        let absUrl = mangaUrl.startsWith("http") ? mangaUrl : (this.baseUrl + (mangaUrl.startsWith("/") ? "" : "/") + mangaUrl);
        let res = this.fetchApi(absUrl, "GET");
        if (!res || res.status !== 200) {
            return { title: "Unknown", url: mangaUrl, status: 1 };
        }

        let html = res.body || "";

        // 1. Try ld+json
        let ldRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
        let m;
        while ((m = ldRegex.exec(html)) !== null) {
            try {
                let data = JSON.parse(m[1]);
                let items = Array.isArray(data) ? data : [data];
                for (let i = 0; i < items.length; i++) {
                    let it = items[i];
                    if (it["@type"] === "ComicSeries") {
                        let title = it.name || "Unknown";
                        let cover = it.image || "";
                        let author = (it.author && (it.author.name || it.author)) || "Unknown";
                        let desc = it.description || "";
                        let genres = Array.isArray(it.genre) ? it.genre : (it.genre ? [it.genre] : []);
                        return {
                            title: title.trim(),
                            url: mangaUrl,
                            thumbnailUrl: cover ? (cover + "|Referer=" + this.baseUrl + "/") : "",
                            author: author,
                            status: 1,
                            description: desc,
                            genre: genres
                        };
                    }
                }
            } catch (e) {}
        }

        // 2. Try RSC data in HTML
        let seriesIdx = html.indexOf('"series":');
        let isEscaped = false;
        if (seriesIdx === -1) {
            seriesIdx = html.indexOf('\\"series\\":');
            isEscaped = true;
        }
        if (seriesIdx !== -1) {
            let start = html.indexOf('{', seriesIdx);
            let end = html.indexOf('}', start);
            if (start !== -1 && end !== -1) {
                let raw = html.substring(start, end + 1);
                if (isEscaped) raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                try {
                    let obj = JSON.parse(raw);
                    let d = obj.data || obj;
                    let title = d.title || d.name || "Unknown";
                    let cover = d.coverImage || "";
                    if (cover && !cover.startsWith("http")) cover = "https://cvr.voratoon.id/prod/" + cover;
                    let author = d.author || "Unknown";
                    let status = d.status === "completed" ? 2 : 1;
                    let desc = d.synopsis || "";
                    let genres = (d.genres || []).map(function(g) { return (g.data && g.data.name) || g.name || ""; }).filter(Boolean);
                    return {
                        title: title.trim(),
                        url: mangaUrl,
                        thumbnailUrl: cover ? (cover + "|Referer=" + this.baseUrl + "/") : "",
                        author: author,
                        status: status,
                        description: desc,
                        genre: genres
                    };
                } catch (e) {}
            }
        }

        return { title: "Unknown", url: mangaUrl, status: 1 };
    },

    getChapterList: function(mangaUrl) {
        let absUrl = mangaUrl.startsWith("http") ? mangaUrl : (this.baseUrl + (mangaUrl.startsWith("/") ? "" : "/") + mangaUrl);
        let res = this.fetchApi(absUrl, "GET");
        if (!res || res.status !== 200) return [];

        let html = res.body || "";
        let slug = this.extractSlug(mangaUrl);

        let escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let chRegex = new RegExp('<a[^>]+href=["\'](/series/' + escapedSlug + '/chapter/([0-9]+(?:\\.[0-9]+)?))["\'][^>]*>([\\s\\S]*?)</a>', 'gi');

        let chapters = [];
        let seen = {};
        let m;

        while ((m = chRegex.exec(html)) !== null) {
            let chUrl = m[1];
            let chNum = parseFloat(m[2]);
            let inner = m[3] || "";

            if (seen[chUrl]) continue;
            seen[chUrl] = true;

            let titleMatch = inner.match(/class="[^"]*chapter-number[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            let name = "";
            if (titleMatch) {
                name = titleMatch[1].replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").trim();
            }
            if (!name) {
                name = "Chapter " + chNum;
            }

            chapters.push({
                name: name,
                url: chUrl,
                chapterNumber: isNaN(chNum) ? 0 : chNum,
                dateUpload: 0
            });
        }

        if (chapters.length > 1 && chapters[0].chapterNumber < chapters[1].chapterNumber) {
            chapters.sort(function(a, b) {
                return b.chapterNumber - a.chapterNumber;
            });
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let absUrl = chapterUrl.startsWith("http") ? chapterUrl : (this.baseUrl + (chapterUrl.startsWith("/") ? "" : "/") + chapterUrl);
        let res = this.fetchApi(absUrl, "GET");
        if (!res || res.status !== 200) return [];

        let html = res.body || "";

        // 1. Try extracting data-chapter-page attributes (exact reader page order)
        let pageRegex = /data-chapter-page=["'](https?:\/\/[^"']+)["']/gi;
        let pages = [];
        let seen = {};
        let m;

        while ((m = pageRegex.exec(html)) !== null) {
            let url = m[1].replace(/&amp;/g, "&");
            if (!seen[url]) {
                seen[url] = true;
                pages.push(url + "|Referer=" + this.baseUrl + "/");
            }
        }

        if (pages.length > 0) return pages;

        // 2. Fallback: match cdn.voratoon.com image URLs
        let cdnRegex = /https?:\/\/(?:cdn\.voratoon\.com|cdn\.uqni\.net)\/[^\x00-\x1f"'<>\s\\]+\.(?:jpg|jpeg|png|webp)/gi;
        let matches = html.match(cdnRegex) || [];

        for (let i = 0; i < matches.length; i++) {
            let u = matches[i].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
            if (u.includes("/logo/") || u.includes("/icons/") || u.includes("/ads/") || u.includes("/cover/") || u.includes("/background/")) continue;
            if (!seen[u]) {
                seen[u] = true;
                pages.push(u + "|Referer=" + this.baseUrl + "/");
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
            if (parts.length > 2 && parts[parts.length - 2] === "chapter") {
                return parts[parts.length - 3];
            }
            return last;
        }
        return url;
    },

    fetchRsc: function(url) {
        return this.fetchApi(url, "GET", { "RSC": "1" });
    },

    fetchApi: function(url, method, extraHeaders) {
        try {
            let headers = {
                "Origin": this.baseUrl,
                "Referer": this.baseUrl + "/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            };
            if (extraHeaders) {
                for (let k in extraHeaders) {
                    headers[k] = extraHeaders[k];
                }
            }
            return fetch(url, {
                method: method || "GET",
                headers: headers
            });
        } catch (e) {
            return null;
        }
    }
};
