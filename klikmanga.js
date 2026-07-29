var source = {
    name: "KlikManga",
    baseUrl: "https://klikmanga.org",
    language: "id",
    version: "1.1.0",
    description: "Baca Manga, Manhwa, dan Manhua Bahasa Indonesia dari KlikManga (Madara)",
    author: "DesktopKomik",
    iconBackground: "#1a1a2e",
    iconForeground: "#e94560",
    isNsfw: false,
    isHasMorePages: true,

    // Madara core settings (from Keiyoushi KlikManga.kt)
    mangaSubString: "daftar-komik",       // override from default "manga"
    useLoadMoreRequest: true,             // useLoadMoreRequest = Always

    // ── Date Parsing ──────────────────────────────────────────────────────────

    parseIndonesianDate: function(dateStr) {
        if (!dateStr) return 0;
        dateStr = dateStr.trim();

        // Relative: "X days/hours/mins ago"
        let relMatch = dateStr.match(/(\d+)\s*(minute|hour|day|week|month|year)/i);
        if (relMatch) {
            let n = parseInt(relMatch[1]);
            let unit = relMatch[2].toLowerCase();
            let ms = n;
            if (unit.startsWith("minute")) ms = n * 60000;
            else if (unit.startsWith("hour")) ms = n * 3600000;
            else if (unit.startsWith("day")) ms = n * 86400000;
            else if (unit.startsWith("week")) ms = n * 604800000;
            else if (unit.startsWith("month")) ms = n * 2592000000;
            else if (unit.startsWith("year")) ms = n * 31536000000;
            return Date.now() - ms;
        }

        // Indonesian month names → standard format
        let months = {
            "januari": 0, "januari": 0, "jan": 0,
            "februari": 1, "feb": 1,
            "maret": 2, "mar": 2,
            "april": 3, "apr": 3,
            "mei": 4,
            "juni": 5, "jun": 5,
            "juli": 6, "jul": 6,
            "agustus": 7, "agu": 7, "aug": 7,
            "september": 8, "sep": 8,
            "oktober": 9, "okt": 9, "oct": 9,
            "november": 10, "nov": 10,
            "desember": 11, "des": 11, "dec": 11
        };

        // Format: "dd MMMM yyyy" (Keiyoushi: SimpleDateFormat("MMMM dd, yyyy", Locale("id")))
        // Also handle "MMMM dd, yyyy" English format
        let m = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (!m) m = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);

        if (m) {
            let day, monthName, year;
            let firstPart = m[1], secondPart = m[2], thirdPart = m[3];
            if (isNaN(parseInt(firstPart))) {
                // Format: "MMMM dd, yyyy"
                monthName = firstPart.toLowerCase();
                day = parseInt(secondPart);
                year = parseInt(thirdPart);
            } else {
                // Format: "dd MMMM yyyy"
                day = parseInt(firstPart);
                monthName = secondPart.toLowerCase();
                year = parseInt(thirdPart);
            }
            let monthIdx = months[monthName];
            if (monthIdx !== undefined) {
                let d = new Date(year, monthIdx, day);
                return d.getTime();
            }
        }

        let ts = Date.parse(dateStr);
        return isNaN(ts) ? 0 : ts;
    },

    // ── HTTP Helper ───────────────────────────────────────────────────────────

    fetchHtml: function(url) {
        try {
            let response = fetch(url, {
                headers: {
                    "Referer": this.baseUrl + "/"
                }
            });
            if (!response || response.status !== 200) return null;
            return { body: response.body, status: response.status };
        } catch (e) { return null; }
    },

    postAjax: function(action, data) {
        let url = this.baseUrl + "/wp-admin/admin-ajax.php";
        let body = "action=" + encodeURIComponent(action);
        for (let k in data) {
            body += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(data[k]);
        }
        try {
            let response = fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": this.baseUrl + "/"
                },
                body: body
            });
            if (!response || response.status !== 200) return null;
            return response.body;
        } catch (e) { return null; }
    },

    // ── Load More AJAX (Madara style) ─────────────────────────────────────────

    loadMoreRequest: function(page, popular) {
        let url = this.baseUrl + "/wp-admin/admin-ajax.php";
        let order = popular ? "meta_value_num" : "modified";
        let body = "action=madara_load_more"
            + "&page=" + (page - 1)
            + "&template=madara-core%2Fapp%2Fviews%2Ffront%2Fcategory%2Fcontent-authors"
            + "&vars%5Borderby%5D=" + order
            + "&vars%5Bmeta_key%5D=_wp_manga_views"
            + "&vars%5Bpaged%5D=1"
            + "&vars%5Bpost_type%5D=wp-manga"
            + "&vars%5Bpost_status%5D=publish"
            + "&vars%5Bno_found_rows%5D=true"
            + "&vars%5Bupdates_only%5D=0"
            + "&vars%5Bmeta_query%5D%5Brelation%5D=AND"
            + "&vars%5Bmapped_args%5D%5Borderby%5D=" + order
            + "&vars%5Bmapped_args%5D%5Bmeta_key%5D=_wp_manga_views"
            + "&vars%5Bs%5D="
            + "&vars%5Bsearch%5D=";
        try {
            let response = fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": this.baseUrl + "/"
                },
                body: body
            });
            if (!response || response.status !== 200) return null;
            return response.body;
        } catch (e) { return null; }
    },

    // ── Parse Manga List from HTML ────────────────────────────────────────────

    parseMangaList: function(html, baseUrl, page) {
        if (!html) return { items: [], totalPages: page };

        let doc = Html.parse(html, baseUrl || this.baseUrl);
        // Madara selectors: div.page-item-detail, .manga__item
        let cards = doc.querySelectorAll("div.page-item-detail, .manga__item");
        let items = [];

        for (let i = 0; i < cards.length; i++) {
            let card = cards[i];

            // URL + Title from div.post-title a
            let linkEl = card.querySelector("div.post-title a, h3 a, h2 a");
            if (!linkEl) continue;
            let href = linkEl.attr("href") || linkEl.attr("abs:href") || "";
            if (!href || href === "#") continue;

            // Strip baseUrl prefix for storage
            let mangaUrl = href.startsWith(this.baseUrl) ? href.substring(this.baseUrl.length) : href;
            if (!mangaUrl) continue;

            let title = linkEl.attr("title") || linkEl.text().trim() || "";

            // Thumbnail (lazy-loaded)
            let thumbnailUrl = "";
            let img = card.querySelector("img");
            if (img) {
                thumbnailUrl = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
                if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
                    thumbnailUrl = thumbnailUrl.startsWith("//") ? "https:" + thumbnailUrl : this.baseUrl + thumbnailUrl;
                }
            }

            items.push({
                title: title,
                url: mangaUrl,
                thumbnailUrl: thumbnailUrl,
                status: 0
            });
        }

        // Madara load-more pagination: has next page if items are returned and not "no-posts"
        let noMore = html.includes("class=\"no-posts\"") || html.includes("no-posts");
        let hasNext = items.length > 0 && !noMore;
        let totalPages = hasNext ? page + 1 : page;

        return { items: items, totalPages: totalPages };
    },

    // ── Public Entry Points ───────────────────────────────────────────────────

    getPopularManga: function(page) {
        page = Math.max(1, page || 1);
        // useLoadMoreRequest = Always → use AJAX
        let html = this.loadMoreRequest(page, true);
        if (!html || html.trim() === "" || html.trim() === "false") {
            return { items: [], totalPages: page };
        }
        return this.parseMangaList(html, this.baseUrl, page);
    },

    getLatestUpdates: function(page) {
        page = Math.max(1, page || 1);
        let html = this.loadMoreRequest(page, false);
        if (!html || html.trim() === "" || html.trim() === "false") {
            return { items: [], totalPages: page };
        }
        return this.parseMangaList(html, this.baseUrl, page);
    },

    getSearchManga: function(query, page) {
        page = Math.max(1, page || 1);
        query = (query || "").trim();
        if (!query) return this.getPopularManga(page);

        // Madara search: GET /daftar-komik/page/N/?s=query&post_type=wp-manga
        let url = this.baseUrl + "/" + this.mangaSubString + "/page/" + page + "/";
        url += "?s=" + encodeURIComponent(query) + "&post_type=wp-manga";

        let res = this.fetchHtml(url);
        if (!res) return { items: [], totalPages: page };
        return this.parseMangaList(res.body, url, page);
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

        let url = this.baseUrl + "/" + this.mangaSubString + "/page/" + page + "/";
        if (params.length > 0) url += "?" + params.join("&");

        let res = this.fetchHtml(url);
        if (!res) return { items: [], totalPages: page };
        return this.parseMangaList(res.body, url, page);
    },

    // ── Manga Details ─────────────────────────────────────────────────────────

    getMangaDetails: function(url) {
        let fullUrl = url.startsWith("http") ? url : this.baseUrl + url;
        let res = this.fetchHtml(fullUrl);
        if (!res) return {};

        let doc = Html.parse(res.body, fullUrl);

        // Title
        let title = "";
        let titleEl = doc.querySelector("div.post-title h1, div.post-title h3, h1.entry-title");
        if (titleEl) title = titleEl.text().trim();

        // Thumbnail
        let thumbnailUrl = "";
        let thumbEl = doc.querySelector("div.summary_image img, .tab-summary img");
        if (thumbEl) {
            thumbnailUrl = thumbEl.attr("data-src") || thumbEl.attr("data-lazy-src") || thumbEl.attr("src") || "";
            if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
                thumbnailUrl = thumbnailUrl.startsWith("//") ? "https:" + thumbnailUrl : this.baseUrl + thumbnailUrl;
            }
        }

        // Description
        let desc = "";
        let descEl = doc.querySelector("div.summary__content, .post-content_item .summary-content, div.manga-excerpt");
        if (descEl) desc = descEl.text().trim();

        // Author
        let author = "";
        let authorEl = doc.querySelector(".author-content a, .artist-content a");
        if (authorEl) author = authorEl.text().trim();

        // Status (Madara style)
        let status = 0;
        let statusEl = doc.querySelector(".post-status .post-content_item:last-child .summary-content");
        if (statusEl) {
            let st = statusEl.text().toLowerCase().trim();
            if (st.includes("on-going") || st.includes("ongoing") || st.includes("berlangsung")) status = 1;
            else if (st.includes("completed") || st.includes("complete") || st.includes("tamat")) status = 2;
            else if (st.includes("on-hold") || st.includes("hiatus") || st.includes("ditunda")) status = 3;
        }

        // Genres
        let genres = [];
        let genreEls = doc.querySelectorAll(".genres-content a, .wp-manga-tags-list a");
        for (let i = 0; i < genreEls.length; i++) {
            let g = genreEls[i].text().trim();
            if (g && genres.indexOf(g) === -1) genres.push(g);
        }

        return {
            title: title,
            url: url,
            thumbnailUrl: thumbnailUrl,
            author: author,
            status: status,
            description: desc,
            genre: genres
        };
    },

    // ── Chapter List ─────────────────────────────────────────────────────────

    getChapterList: function(mangaUrl) {
        let fullUrl = mangaUrl.startsWith("http") ? mangaUrl : this.baseUrl + mangaUrl;
        let res = this.fetchHtml(fullUrl);
        if (!res) return [];

        // Extract manga ID for AJAX chapter request
        let mangaId = "";
        let idMatch = res.body.match(/manga_chapters_holder[^>]+data-id="(\d+)"/);
        if (!idMatch) idMatch = res.body.match(/data-id="(\d+)"/);
        if (idMatch) mangaId = idMatch[1];

        let chapterHtml = "";

        // Use AJAX if ID found (Madara standard approach)
        if (mangaId) {
            let ajaxResult = this.postAjax("manga_get_chapters", {
                "manga": mangaId,
                "only_manga": "1"
            });
            if (ajaxResult && ajaxResult.trim() !== "" && ajaxResult.trim() !== "false") {
                chapterHtml = ajaxResult;
            }
        }

        // Fallback to inline chapter list
        if (!chapterHtml) {
            let doc0 = Html.parse(res.body, fullUrl);
            let inlineList = doc0.querySelector("ul.main.version-chap, #chapterlist ul");
            if (inlineList) chapterHtml = inlineList.html();
        }

        if (!chapterHtml) return [];

        let doc = Html.parse("<ul>" + chapterHtml + "</ul>", fullUrl);
        let items = doc.querySelectorAll("li, .wp-manga-chapter");
        let chapters = [];

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let linkEl = item.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href") || "";
            if (!href || href === "#") continue;
            let chUrl = href.startsWith(this.baseUrl) ? href.substring(this.baseUrl.length) : href;

            // Chapter name from a tag text or .chapter-manhwa-title
            let nameEl = item.querySelector(".chapter-manhwa-title, .chapter-title");
            let name = nameEl ? nameEl.text().trim() : linkEl.text().trim();
            if (!name) name = "Chapter";

            // Date
            let dateUpload = 0;
            let dateEl = item.querySelector(".chapter-release-date i, .chapter-release-date a, .chapter-release-date");
            if (dateEl) {
                // Check for datetime attribute first
                let datetimeAttr = dateEl.attr("datetime") || "";
                if (datetimeAttr) {
                    let ts = Date.parse(datetimeAttr);
                    if (!isNaN(ts)) dateUpload = ts;
                } else {
                    dateUpload = this.parseIndonesianDate(dateEl.text());
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

        // 1. Madara standard: ts_reader.run(JSON) script tag
        let match = res.body.match(/ts_reader\.run\(([\s\S]*?)\);/);
        if (match && match[1]) {
            try {
                let json = JSON.parse(match[1]);
                if (json && json.sources && json.sources.length > 0) {
                    // Pick the first source with images
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

        // 2. Fallback: #readerarea img elements
        let doc = Html.parse(res.body, fullUrl);
        let imgEls = doc.querySelectorAll("#readerarea img, .reading-content img");
        for (let i = 0; i < imgEls.length; i++) {
            let img = imgEls[i];
            let src = img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
            if (src && !src.includes("pebaikan.png") && !src.startsWith("data:image/svg")) {
                if (!src.startsWith("http")) {
                    src = src.startsWith("//") ? "https:" + src : this.baseUrl + src;
                }
                pages.push(src + "|Referer=" + this.baseUrl + "/");
            }
        }

        return pages;
    },

    // ── Genres & Filters ──────────────────────────────────────────────────────

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
