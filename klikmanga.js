var source = {
    name: "KlikManga",
    baseUrl: "https://klikmanga.org",
    apiUrl: "https://klikmanga.org",
    language: "id",
    version: "1.0.0",
    description: "Baca komik Manga, Manhwa, dan Manhua Bahasa Indonesia dari KlikManga",
    author: "DesktopKomik",
    iconBackground: "#0f172a",
    iconForeground: "#38bdf8",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 18,

    genres: [
        "Action", "Adult", "Adventure", "Comedy", "Cooking", "Crime", "Demon", "Demons",
        "Drama", "Ecchi", "Fantasy", "Game", "Gender Bender", "Gore", "Harem", "Historical",
        "Horror", "Isekai", "Josei", "Magic", "Martial Arts", "Mature", "Mecha", "Medical",
        "Military", "Music", "Mystery", "One-shot", "Psychological", "Reincarnation", "Romance",
        "School Life", "Sci-fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai",
        "Slice of Life", "Smut", "Sports", "Super Power", "Supernatural", "Thriller",
        "Tragedy", "Vampire", "Webtoon", "Wuxia", "Yaoi", "Yuri"
    ],

    formats: ["Manga", "Manhwa", "Manhua", "Comic", "Novel"],

    typeMap: {
        "Manga": "manga",
        "Manhwa": "manhwa",
        "Manhua": "manhua",
        "Comic": "comic",
        "Novel": "novel"
    },

    getPopularManga: function(page) {
        return this.getSeriesPage(page, "", "", null, null, "views");
    },

    getLatestUpdates: function(page) {
        return this.getSeriesPage(page, "", "", null, null, "latest");
    },

    getSearchManga: function(query, page) {
        return this.getSeriesPage(page, query || "", "", null, null, "");
    },

    getMangaList: function(page, status, genre, type) {
        let statusStr = "";
        if (status === 1) statusStr = "on-going";
        else if (status === 2) statusStr = "end";
        else if (status === 3) statusStr = "on-hold";

        return this.getSeriesPage(page, "", statusStr, genre, type, "views");
    },

    getSeriesPage: function(page, query, status, genre, type, order) {
        page = Math.max(1, page || 1);
        let url = `${this.baseUrl}/daftar-komik/`;
        if (page > 1) {
            url += `page/${page}/`;
        }

        let params = [];
        params.push("post_type=wp-manga");

        if (query) params.push("s=" + encodeURIComponent(query));
        if (status) params.push("status%5B%5D=" + encodeURIComponent(status));

        if (type) {
            let arr = [];
            if (Array.isArray(type)) arr = type;
            else if (type.length !== undefined && typeof type !== 'string') {
                for (let i = 0; i < type.length; i++) arr.push(type[i]);
            } else arr = [type];

            for (let i = 0; i < arr.length; i++) {
                let val = this.typeMap[arr[i]] || arr[i].toLowerCase();
                params.push("type%5B%5D=" + encodeURIComponent(val));
            }
        }

        if (order) {
            params.push("m_orderby=" + encodeURIComponent(order));
        }

        if (genre) {
            let arr = [];
            if (Array.isArray(genre)) arr = genre;
            else if (genre.length !== undefined && typeof genre !== 'string') {
                for (let i = 0; i < genre.length; i++) arr.push(genre[i]);
            } else arr = [genre];

            for (let i = 0; i < arr.length; i++) {
                let slug = arr[i].toLowerCase().trim().replace(/\s+/g, "-");
                if (slug) {
                    params.push("genre%5B%5D=" + encodeURIComponent(slug));
                }
            }
        }

        if (params.length > 0) {
            url += "?" + params.join("&");
        }

        let response = fetch(url);
        if (response.status !== 200) return { items: [], totalPages: page };

        let doc = Html.parse(response.body, url);
        let cards = doc.querySelectorAll(".c-tabs-item__content, .page-item-detail, .manga-item, div.bsx, div.utao");
        let items = [];

        for (let i = 0; i < cards.length; i++) {
            let card = cards[i];
            let linkEl = card.querySelector(".post-title a, h3 a, h4 a, .item-summary a, a");
            if (!linkEl) continue;

            let href = linkEl.attr("href");
            if (!href || href === "#") continue;

            let relativeUrl = href;
            if (href.startsWith(this.baseUrl)) {
                relativeUrl = href.substring(this.baseUrl.length);
            }

            let title = linkEl.attr("title");
            if (!title) title = linkEl.text().trim();

            let imgEl = card.querySelector("img");
            let thumbnailUrl = "";
            if (imgEl) {
                thumbnailUrl = imgEl.absUrl("src");
                if (!thumbnailUrl) thumbnailUrl = imgEl.attr("src") || "";
                if (!thumbnailUrl) thumbnailUrl = imgEl.attr("data-src") || imgEl.attr("data-lazy-src") || "";
            }

            let statusVal = 0;
            let statusEl = card.querySelector(".post-status, .mg_status, .status");
            if (statusEl) {
                let sText = statusEl.text().toLowerCase();
                if (sText.includes("on-going") || sText.includes("ongoing")) statusVal = 1;
                else if (sText.includes("end") || sText.includes("completed")) statusVal = 2;
            }

            items.push({
                title: title.trim(),
                url: relativeUrl,
                thumbnailUrl: thumbnailUrl,
                status: statusVal
            });
        }

        let nextEl = doc.querySelector("a.next, a.next.page-numbers, .nav-previous a");
        let totalPages = nextEl || items.length >= this.pageSize ? page + 1 : page;

        return {
            items: items,
            totalPages: totalPages
        };
    },

    getMangaDetails: function(url) {
        let fullUrl = this.baseUrl + url;
        let response = fetch(fullUrl);
        if (response.status !== 200) return {};

        let doc = Html.parse(response.body, fullUrl);

        let titleEl = doc.querySelector(".post-title h1, h1.entry-title, h1");
        let title = titleEl ? titleEl.text().trim() : "";

        let thumbEl = doc.querySelector(".summary_image img, .thumb img, img.wp-post-image");
        let thumbnailUrl = thumbEl ? (thumbEl.absUrl("src") || thumbEl.attr("src") || thumbEl.attr("data-src") || "") : "";

        let descEl = doc.querySelector(".description-summary, .summary__content, .entry-content, div[itemprop='description']");
        let description = descEl ? descEl.text().trim() : "";

        let author = "";
        let authorEls = doc.querySelectorAll(".author-content a, .artist-content a, .tsinfo .imethod, .spe span");
        for (let i = 0; i < authorEls.length; i++) {
            let txt = authorEls[i].text().trim();
            if (txt && !txt.toLowerCase().includes("updating")) {
                author = txt;
                break;
            }
        }

        let status = 0;
        let statusEl = doc.querySelector(".post-status .summary-content, .status");
        if (statusEl) {
            let sText = statusEl.text().toLowerCase();
            if (sText.includes("on-going") || sText.includes("ongoing")) status = 1;
            else if (sText.includes("end") || sText.includes("completed")) status = 2;
            else if (sText.includes("on-hold") || sText.includes("hiatus")) status = 3;
        }

        let genres = [];
        let genreEls = doc.querySelectorAll(".genres-content a, .mgen a, a[rel='tag']");
        for (let i = 0; i < genreEls.length; i++) {
            let gText = genreEls[i].text().trim();
            if (gText && genres.indexOf(gText) === -1) {
                genres.push(gText);
            }
        }

        return {
            title: title,
            url: url,
            thumbnailUrl: thumbnailUrl,
            author: author,
            status: status,
            description: description,
            genre: genres
        };
    },

    getChapterList: function(mangaUrl) {
        let fullUrl = this.baseUrl + mangaUrl;
        let response = fetch(fullUrl);
        if (response.status !== 200) return [];

        let doc = Html.parse(response.body, fullUrl);
        let items = doc.querySelectorAll("li.wp-manga-chapter, #chapterlist ul li, ul.main.version-chap li");
        let chapters = [];

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let linkEl = item.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href");
            if (!href || href === "#") continue;

            let relativeUrl = href;
            if (href.startsWith(this.baseUrl)) {
                relativeUrl = href.substring(this.baseUrl.length);
            }

            let name = linkEl.text().trim();
            let dateEl = item.querySelector(".chapter-release-date, .chapterdate");
            let dateUpload = 0;
            if (dateEl) {
                let dateStr = dateEl.text().trim();
                if (dateStr) {
                    let parsedDate = Date.parse(dateStr);
                    if (!isNaN(parsedDate)) {
                        dateUpload = parsedDate;
                    }
                }
            }

            chapters.push({
                name: name,
                url: relativeUrl,
                dateUpload: dateUpload
            });
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let fullUrl = this.baseUrl + chapterUrl;
        let response = fetch(fullUrl);
        if (response.status !== 200) return [];

        let pages = [];

        // 1. Madara JS ts_reader / chapter_images check
        let match = response.body.match(/chapter_images\s*=\s*(\[.*?\]);/);
        if (match && match[1]) {
            try {
                let imgs = JSON.parse(match[1]);
                for (let i = 0; i < imgs.length; i++) {
                    if (imgs[i]) pages.push(imgs[i]);
                }
                if (pages.length > 0) return pages;
            } catch (e) {}
        }

        // 2. DOM parsing
        let doc = Html.parse(response.body, fullUrl);
        let imgEls = doc.querySelectorAll(".reading-content img, .page-break img, #readerarea img");
        for (let i = 0; i < imgEls.length; i++) {
            let img = imgEls[i];
            let src = img.absUrl("src");
            if (!src) src = img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src");
            if (src && !src.includes("pebaikan.png")) {
                pages.push(src.trim());
            }
        }

        return pages;
    }
};
