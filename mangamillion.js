var source = {
    name: "MangaMillion",
    baseUrl: "https://mangamillion.shueisha.co.jp",
    apiUrl: "https://api.mangamillion.shueisha.co.jp",
    language: "en",
    version: "1.0.0",
    description: "Official Shueisha MANGA MILLION - 400+ titles FREE in 100+ languages",
    author: "DesktopKomik",
    iconBackground: "#e60026",
    iconForeground: "#ffffff",
    isNsfw: false,
    isHasMorePages: false,
    pageSize: 500,

    token: null,

    genres: [
        "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
        "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports",
        "Supernatural", "Thriller"
    ],

    getPopularManga: function(page) {
        return this.getMangaListInternal(page, "TOTAL_VIEW_COUNT", "");
    },

    getLatestUpdates: function(page) {
        return this.getMangaListInternal(page, "UPDATED_AT", "");
    },

    getSearchManga: function(query, page) {
        return this.getMangaListInternal(page, "", query || "");
    },

    getMangaList: function(page, status, genre, type) {
        return this.getMangaListInternal(page, "TOTAL_VIEW_COUNT", "");
    },

    getMangaListInternal: function(page, order, query) {
        let url = this.apiUrl + "/api/manga_list?service_language=en&avif_enable=false";
        if (query && query.trim()) {
            url = this.apiUrl + "/api/search?service_language=en&avif_enable=false&keyword=" + encodeURIComponent(query.trim());
        } else if (order) {
            url += "&order=" + encodeURIComponent(order);
        }

        let response = this.fetchApi(url, "GET");
        if (!response || response.status !== 200) return { items: [], totalPages: 1 };

        let body = response.body || "";
        let items = [];
        let seen = {};

        let matches = body.match(/https:\/\/img\.mangamillion\.shueisha\.co\.jp\/jpn\/image\/original_title_cover\/(\d+)\.webp[^\x00-\x1f"']*/g) || [];
        for (let i = 0; i < matches.length; i++) {
            let fullCoverUrl = matches[i];
            let idMatch = fullCoverUrl.match(/original_title_cover\/(\d+)\./);
            if (!idMatch) continue;
            let id = idMatch[1];
            if (seen[id]) continue;
            seen[id] = true;

            items.push({
                title: "Manga #" + id,
                url: "/en/title/" + id,
                thumbnailUrl: fullCoverUrl + "|Referer=" + this.baseUrl + "/",
                status: 1
            });
        }

        return { items: items, totalPages: 1 };
    },

    getMangaDetails: function(mangaUrl) {
        let titleId = this.extractTitleId(mangaUrl);
        let token = this.ensureToken();

        let url = this.apiUrl + "/api/title_detail?service_language=en&avif_enable=false&original_title_id=" + titleId;
        let response = this.fetchApi(url, "GET", token);
        if (!response || response.status !== 200) {
            return { title: "Manga #" + titleId, url: mangaUrl };
        }

        let body = response.body || "";
        let coverUrl = "";
        let coverMatch = body.match(/https:\/\/img\.mangamillion\.shueisha\.co\.jp\/jpn\/image\/original_title_cover\/[^\x00-\x1f"'\s]+/);
        if (coverMatch) coverUrl = coverMatch[0];

        let titleName = "";
        let author = "";
        let titleAuthorMatch = body.match(/original_title_cover\/[^\x00-\x1f"'\s]+\x12([\x01-\x7f])([^\x00-\x1f\x7f-\xff]+)\x1a([\x01-\x7f])([^\x00-\x1f\x7f-\xff]+)/);
        if (titleAuthorMatch) {
            titleName = titleAuthorMatch[2].trim();
            author = titleAuthorMatch[4].trim();
        }

        let description = "";
        let descMatch = body.match(/:\s*[\x80-\xff]*[\x01-\x7f]*([A-Z][^\x00-\x1f\x7f-\xff]{50,1500}?)(?=Bwhttps|\x12|\x1a|$)/);
        if (descMatch) description = descMatch[1].trim();

        let genres = [];
        for (let i = 0; i < this.genres.length; i++) {
            if (body.includes(this.genres[i])) genres.push(this.genres[i]);
        }

        return {
            title: titleName || ("Manga #" + titleId),
            url: mangaUrl,
            thumbnailUrl: coverUrl ? (coverUrl + "|Referer=" + this.baseUrl + "/") : "",
            author: author,
            status: 1,
            description: description,
            genre: genres
        };
    },

    getChapterList: function(mangaUrl) {
        let titleId = this.extractTitleId(mangaUrl);
        let token = this.ensureToken();

        let url = this.apiUrl + "/api/chapter_list?service_language=en&avif_enable=false&original_title_id=" + titleId + "&translated_language=en";
        let response = this.fetchApi(url, "GET", token);
        if (!response || response.status !== 200) return [];

        let body = response.body || "";
        let chapters = [];
        let seen = {};

        let strs = this.extractStrings(body);
        for (let i = 0; i < strs.length; i++) {
            let txt = strs[i];
            if (/^Chapter\s+\d+/i.test(txt) || /^#\d+/i.test(txt)) {
                if (!seen[txt]) {
                    seen[txt] = true;
                    let chapNumMatch = txt.match(/\d+/);
                    let chapNum = chapNumMatch ? chapNumMatch[0] : (chapters.length + 1);
                    chapters.push({
                        name: txt,
                        url: "/en/title/" + titleId + "/chapter/" + chapNum,
                        dateUpload: 0
                    });
                }
            }
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let chapterId = this.extractChapterId(chapterUrl);
        let token = this.ensureToken();

        let url = this.apiUrl + "/api/viewer?service_language=en&avif_enable=false&translated_chapter_id=" + chapterId + "&quality=high";
        let response = this.fetchApi(url, "GET", token);
        if (!response || response.status !== 200) return [];

        let body = response.body || "";
        let imgUrls = body.match(/https:\/\/img\.mangamillion[^\x00-\x1f"'<]+/g) || [];
        let pages = [];
        let seen = {};

        for (let i = 0; i < imgUrls.length; i++) {
            let rawUrl = imgUrls[i];
            if (!seen[rawUrl]) {
                seen[rawUrl] = true;
                pages.push(rawUrl + "|Referer=" + this.baseUrl + "/");
            }
        }

        return pages;
    },

    // ── Helper Utilities ─────────────────────────────────────────────────────

    ensureToken: function() {
        if (this.token) return this.token;
        let url = this.apiUrl + "/api/register?service_language=en";
        let response = this.fetchApi(url, "POST");
        if (response && response.status === 200) {
            let body = response.body || "";
            let match = body.match(/[A-Za-z0-9_\-]{30,}/);
            if (match) {
                this.token = match[0];
                return this.token;
            }
        }
        return "";
    },

    extractTitleId: function(url) {
        let match = (url || "").match(/\/title\/(\d+)/);
        return match ? match[1] : "1";
    },

    extractChapterId: function(url) {
        let match = (url || "").match(/\/chapter\/(\d+)/);
        return match ? match[1] : "1";
    },

    extractStrings: function(text) {
        let results = [];
        let i = 0;
        while (i < text.length - 2) {
            let code = text.charCodeAt(i);
            if ((code & 0x07) === 2) {
                let len = 0;
                let shift = 0;
                let j = i + 1;
                while (j < text.length) {
                    let b = text.charCodeAt(j++);
                    len |= (b & 0x7f) << shift;
                    if ((b & 0x80) === 0) break;
                    shift += 7;
                }
                if (len > 1 && len < 10000 && j + len <= text.length) {
                    let slice = text.substring(j, j + len);
                    let nonPrint = 0;
                    for (let k = 0; k < slice.length; k++) {
                        let c = slice.charCodeAt(k);
                        if (c < 0x20 && c !== 0x0a && c !== 0x0d) nonPrint++;
                    }
                    if (nonPrint < slice.length * 0.1) {
                        if (slice.length > 2) results.push(slice);
                    }
                }
            }
            i++;
        }
        return results;
    },

    fetchApi: function(url, method, token) {
        try {
            let headers = {
                "Origin": this.baseUrl,
                "Referer": this.baseUrl + "/",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-site",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            };
            if (token) {
                headers["Access-Token"] = token;
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
