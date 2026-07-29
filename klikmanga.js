var source = {
    name: "KlikManga",
    baseUrl: "https://klikmanga.org",
    language: "id",
    version: "1.2.1",
    description: "Baca Manga, Manhwa, dan Manhua Bahasa Indonesia dari KlikManga (Madara)",
    author: "DesktopKomik",
    iconBackground: "#1a1a2e",
    iconForeground: "#e94560",
    isNsfw: false,
    isHasMorePages: true,

    // ── Madara core settings ──────────────────────────────────────────────────
    mangaSubString: "daftar-komik",

    // ── Date Parsing ──────────────────────────────────────────────────────────

    parseIndonesianDate: function(dateStr) {
        if (!dateStr) return 0;
        dateStr = dateStr.trim();

        // Relative: "X days/hours/minutes ago"
        let relMatch = dateStr.match(/(\d+)\s*(menit|jam|hari|minggu|bulan|tahun|minute|hour|day|week|month|year)/i);
        if (relMatch) {
            let n = parseInt(relMatch[1]);
            let unit = relMatch[2].toLowerCase();
            let ms = 0;
            if (unit === "menit" || unit.startsWith("minute")) ms = n * 60000;
            else if (unit === "jam"  || unit.startsWith("hour"))   ms = n * 3600000;
            else if (unit === "hari" || unit.startsWith("day"))    ms = n * 86400000;
            else if (unit === "minggu"|| unit.startsWith("week"))  ms = n * 604800000;
            else if (unit === "bulan" || unit.startsWith("month")) ms = n * 2592000000;
            else if (unit === "tahun" || unit.startsWith("year"))  ms = n * 31536000000;
            return Date.now() - ms;
        }

        // Indonesian month names (KlikManga dateFormat: "MMMM dd, yyyy" Locale("id"))
        let months = {
            "januari":0,"jan":0,
            "februari":1,"feb":1,
            "maret":2,"mar":2,
            "april":3,"apr":3,
            "mei":4,
            "juni":5,"jun":5,
            "juli":6,"jul":6,
            "agustus":7,"agu":7,"aug":7,
            "september":8,"sep":8,
            "oktober":9,"okt":9,"oct":9,
            "november":10,"nov":10,
            "desember":11,"des":11,"dec":11
        };

        let m = dateStr.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
        if (m) {
            let mo = months[m[1].toLowerCase()];
            if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[2])).getTime();
        }
        m = dateStr.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
        if (m) {
            let mo = months[m[2].toLowerCase()];
            if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[1])).getTime();
        }

        let ts = Date.parse(dateStr);
        return isNaN(ts) ? 0 : ts;
    },

    // ── HTTP Helpers ──────────────────────────────────────────────────────────

    fetchHtml: function(url) {
        try {
            let res = fetch(url, { headers: { "Referer": this.baseUrl + "/" } });
            return (res && res.status === 200) ? res : null;
        } catch (e) { return null; }
    },

    postXhr: function(url, formBody) {
        try {
            let res = fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": this.baseUrl + "/"
                },
                body: formBody
            });
            return (res && res.status === 200) ? res.body : null;
        } catch (e) { return null; }
    },

    // ── Madara loadMoreRequest ────────────────────────────────────────────────

    loadMoreRequest: function(page, popular) {
        let metaKey = popular ? "_wp_manga_views" : "_latest_update";
        let body = [
            "action=madara_load_more",
            "page=" + (page - 1),
            "template=madara-core%2Fcontent%2Fcontent-archive",
            "vars%5Borderby%5D=meta_value_num",
            "vars%5Bpaged%5D=1",
            "vars%5Bmeta_query%5D%5B0%5D%5Bkey%5D=_wp_manga_chapter_type",
            "vars%5Bmeta_query%5D%5B0%5D%5Bvalue%5D=manga",
            "vars%5Bpost_type%5D=wp-manga",
            "vars%5Bpost_status%5D=publish",
            "vars%5Bmeta_key%5D=" + encodeURIComponent(metaKey),
            "vars%5Border%5D=desc",
            "vars%5Bsidebar%5D=right",
            "vars%5Bmanga_archives_item_layout%5D=big_thumbnail"
        ].join("&");

        return this.postXhr(this.baseUrl + "/wp-admin/admin-ajax.php", body);
    },

    // ── Parse Manga List ──────────────────────────────────────────────────────

    parseMangaList: function(html, page) {
        if (!html || html.trim() === "" || html.trim() === "false") {
            return { items: [], totalPages: page };
        }

        let doc = Html.parse(html, this.baseUrl);
        let cards = doc.querySelectorAll("div.page-item-detail, .manga__item, .badge-pos-1");
        let items = [];

        for (let i = 0; i < cards.length; i++) {
            let card = cards[i];

            let linkEl = card.querySelector("div.post-title a, h3.h5 a, h3 a, .item-thumb a");
            if (!linkEl) continue;
            let href = linkEl.attr("href") || linkEl.attr("abs:href") || "";
            if (!href || href === "#") continue;
            let mangaUrl = href.startsWith(this.baseUrl) ? href.substring(this.baseUrl.length) : href;

            let title = linkEl.attr("title") || linkEl.text().trim();
            if (!title) {
                let tEl = card.querySelector("div.post-title, h3");
                if (tEl) title = tEl.text().trim();
            }
            if (!title) continue;

            let thumbnailUrl = "";
            let img = card.querySelector("img");
            if (img) {
                thumbnailUrl = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
                if (thumbnailUrl && thumbnailUrl.startsWith("//")) thumbnailUrl = "https:" + thumbnailUrl;
            }

            items.push({ title: title, url: mangaUrl, thumbnailUrl: thumbnailUrl, status: 0 });
        }

        let noMore = html.includes("class=\"no-posts\"") || html.includes("no-posts") || items.length === 0;
        let totalPages = noMore ? page : page + 1;

        return { items: items, totalPages: totalPages };
    },

    // ── Public Entry Points ───────────────────────────────────────────────────

    getPopularManga: function(page) {
        page = Math.max(1, page || 1);
        // Try AJAX loadMore first
        let html = this.loadMoreRequest(page, true);
        let result = this.parseMangaList(html, page);
        if (result.items.length > 0) return result;

        // Fallback to GET page
        let pagePath = page > 1 ? "page/" + page + "/" : "";
        let url = this.baseUrl + "/" + this.mangaSubString + "/" + pagePath + "?m_orderby=views";
        let res = this.fetchHtml(url);
        if (!res) return { items: [], totalPages: page };
        return this.parseMangaList(res.body, page);
    },

    getLatestUpdates: function(page) {
        page = Math.max(1, page || 1);
        // Try AJAX loadMore first
        let html = this.loadMoreRequest(page, false);
        let result = this.parseMangaList(html, page);
        if (result.items.length > 0) return result;

        // Fallback to GET page
        let pagePath = page > 1 ? "page/" + page + "/" : "";
        let url = this.baseUrl + "/" + this.mangaSubString + "/" + pagePath + "?m_orderby=latest";
        let res = this.fetchHtml(url);
        if (!res) return { items: [], totalPages: page };
        return this.parseMangaList(res.body, page);
    },

    getSearchManga: function(query, page) {
        page = Math.max(1, page || 1);
        query = (query || "").trim();
        if (!query) return this.getPopularManga(page);

        let pagePath = page > 1 ? "page/" + page + "/" : "";
        let url = this.baseUrl + "/" + pagePath + "?s=" + encodeURIComponent(query) + "&post_type=wp-manga";
        let res = this.fetchHtml(url);
        if (!res) return { items: [], totalPages: page };
        return this.parseMangaList(res.body, page);
    },

    getMangaList: function(page, status, genre, type) {
        page = Math.max(1, page || 1);

        let params = [];
        if (status === 1) params.push("status%5B%5D=on-going");
        else if (status === 2) params.push("status%5B%5D=end");
        else if (status === 3) params.push("status%5B%5D=on-hold");

        if (genre) {
            let arr = Array.isArray(genre) ? genre : [genre];
            for (let i = 0; i < arr.length; i++) {
                let slug = arr[i].toLowerCase().trim().replace(/\s+/g, "-").replace(/'/g, "");
                if (slug) params.push("genre%5B%5D=" + encodeURIComponent(slug));
            }
        }

        if (params.length === 0) return this.getPopularManga(page);

        let pagePath = page > 1 ? "page/" + page + "/" : "";
        let url = this.baseUrl + "/" + this.mangaSubString + "/" + pagePath + "?" + params.join("&");
        let res = this.fetchHtml(url);
        if (!res) return { items: [], totalPages: page };
        return this.parseMangaList(res.body, page);
    },

    // ── Manga Details ─────────────────────────────────────────────────────────

    getMangaDetails: function(url) {
        let fullUrl = url.startsWith("http") ? url : this.baseUrl + url;
        let res = this.fetchHtml(fullUrl);
        if (!res) return {};

        let doc = Html.parse(res.body, fullUrl);

        let title = "";
        let titleEl = doc.querySelector("div.post-title h1, div.post-title h3, h1.entry-title");
        if (titleEl) title = titleEl.text().trim();

        let thumbnailUrl = "";
        let thumbEl = doc.querySelector("div.summary_image img, .tab-summary img");
        if (thumbEl) {
            thumbnailUrl = thumbEl.attr("data-src") || thumbEl.attr("data-lazy-src") || thumbEl.attr("src") || "";
            if (thumbnailUrl && thumbnailUrl.startsWith("//")) thumbnailUrl = "https:" + thumbnailUrl;
        }

        let desc = "";
        let descEl = doc.querySelector("div.summary__content, .post-content_item .summary-content, .manga-excerpt");
        if (descEl) desc = descEl.text().trim();

        let author = "";
        let authorEl = doc.querySelector(".author-content a, .artist-content a");
        if (authorEl) author = authorEl.text().trim();

        let status = 0;
        let statusEl = doc.querySelector(".post-status .post-content_item:last-child .summary-content");
        if (statusEl) {
            let st = statusEl.text().toLowerCase().trim();
            if (st.includes("on-going") || st.includes("ongoing")) status = 1;
            else if (st.includes("completed") || st.includes("tamat") || st.includes("end")) status = 2;
            else if (st.includes("on-hold") || st.includes("hiatus")) status = 3;
        }

        let genres = [];
        let genreEls = doc.querySelectorAll(".genres-content a, .wp-manga-tags-list a");
        for (let i = 0; i < genreEls.length; i++) {
            let g = genreEls[i].text().trim();
            if (g && genres.indexOf(g) === -1) genres.push(g);
        }

        return { title: title, url: url, thumbnailUrl: thumbnailUrl, author: author, status: status, description: desc, genre: genres };
    },

    // ── Chapter List ──────────────────────────────────────────────────────────

    getChapterList: function(mangaUrl) {
        let fullUrl = mangaUrl.startsWith("http") ? mangaUrl : this.baseUrl + mangaUrl;
        let res = this.fetchHtml(fullUrl);
        if (!res) return [];

        let doc0 = Html.parse(res.body, fullUrl);
        let chapterHtml = "";

        let inlineItems = doc0.querySelectorAll("li.wp-manga-chapter");
        if (inlineItems && inlineItems.length > 0) {
            return this._parseChapterElements(inlineItems, fullUrl);
        }

        let cleanUrl = fullUrl.replace(/\/$/, "");
        let ajaxHtml = this.postXhr(cleanUrl + "/ajax/chapters", "");
        if (ajaxHtml && ajaxHtml.trim() !== "" && ajaxHtml.trim() !== "false") {
            chapterHtml = ajaxHtml;
        }

        if (!chapterHtml) {
            let wrapper = doc0.querySelector("div[id^=manga-chapters-holder]");
            if (wrapper) {
                let mangaId = wrapper.attr("data-id") || "";
                if (mangaId) {
                    let oldBody = "action=manga_get_chapters&manga=" + encodeURIComponent(mangaId);
                    let oldHtml = this.postXhr(this.baseUrl + "/wp-admin/admin-ajax.php", oldBody);
                    if (oldHtml && oldHtml.trim() !== "" && oldHtml.trim() !== "false") {
                        chapterHtml = oldHtml;
                    }
                }
            }
        }

        if (!chapterHtml) return [];

        let doc = Html.parse(chapterHtml, fullUrl);
        let items = doc.querySelectorAll("li.wp-manga-chapter");
        return this._parseChapterElements(items, fullUrl);
    },

    _parseChapterElements: function(items, baseUrl) {
        let chapters = [];
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let linkEl = item.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href") || "";
            if (!href || href === "#") continue;
            let chUrl = href.startsWith(this.baseUrl) ? href.substring(this.baseUrl.length) : href;
            chUrl = chUrl.replace(/\?style=list$/, "");

            let name = linkEl.text().trim();
            let nameEl = item.querySelector(".chapter-manhwa-title, .chapter-title");
            if (nameEl) name = nameEl.text().trim();
            if (!name) name = "Chapter";

            let dateUpload = 0;
            let dateEl = item.querySelector("span.chapter-release-date i, span.chapter-release-date a");
            if (!dateEl) dateEl = item.querySelector("span.chapter-release-date");
            if (dateEl) {
                let dtAttr = dateEl.attr("datetime") || "";
                if (dtAttr) {
                    let ts = Date.parse(dtAttr);
                    if (!isNaN(ts)) dateUpload = ts;
                } else {
                    dateUpload = this.parseIndonesianDate(dateEl.text().trim());
                }
            }

            chapters.push({ name: name, url: chUrl, dateUpload: dateUpload });
        }
        return chapters;
    },

    // ── Page List ─────────────────────────────────────────────────────────────

    getPageList: function(chapterUrl) {
        let fullUrl = chapterUrl.startsWith("http") ? chapterUrl : this.baseUrl + chapterUrl;
        let res = this.fetchHtml(fullUrl);
        if (!res) return [];

        let pages = [];

        let match = res.body.match(/ts_reader\.run\(([\s\S]*?)\);/);
        if (match && match[1]) {
            try {
                let json = JSON.parse(match[1]);
                if (json && json.sources) {
                    for (let s = 0; s < json.sources.length; s++) {
                        let imgs = json.sources[s].images;
                        if (imgs && imgs.length > 0) {
                            for (let i = 0; i < imgs.length; i++) {
                                if (imgs[i]) pages.push(imgs[i] + "|Referer=" + this.baseUrl + "/");
                            }
                            if (pages.length > 0) return pages;
                        }
                    }
                }
            } catch (e) {}
        }

        let doc = Html.parse(res.body, fullUrl);
        let imgEls = doc.querySelectorAll("div.page-break img, li.blocks-gallery-item img, #readerarea img, .reading-content img");
        for (let i = 0; i < imgEls.length; i++) {
            let img = imgEls[i];
            let src = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
            src = src.trim();
            if (!src || src.includes("pebaikan.png") || src.startsWith("data:image/svg")) continue;
            if (!src.startsWith("http")) src = src.startsWith("//") ? "https:" + src : this.baseUrl + src;
            pages.push(src + "|Referer=" + this.baseUrl + "/");
        }

        return pages;
    },

    // ── Genres / Filters ──────────────────────────────────────────────────────

    genres: [
        "Action", "Adult", "Adventure", "Comedy", "Cooking", "Crime",
        "Cultivation", "Demons", "Drama", "Ecchi", "Fantasy", "Game",
        "Gender Bender", "Gore", "Harem", "Historical", "Horror",
        "Isekai", "Josei", "Magic", "Martial Arts", "Mature", "Mecha",
        "Medical", "Military", "Music", "Mystery", "Office Worker",
        "One-Shot", "Parody", "Police", "Psychological", "Reincarnation",
        "Romance", "School", "School Life", "Sci-Fi", "Seinen",
        "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life",
        "Smut", "Sports", "Super Power", "Supernatural", "Survival",
        "Thriller", "Tragedy"
    ],

    formats: ["Manga", "Manhwa", "Manhua", "Comic"]
};
