var source = {
    name: "ManhwaIndo",
    baseUrl: "https://www.manhwaindo.my",
    language: "id",
    version: "1.0.0",
    description: "Baca Manhwa, Manga, dan Manhua Bahasa Indonesia dari ManhwaIndo",
    author: "DesktopKomik",
    iconBackground: "#0d1b2a",
    iconForeground: "#ff6b35",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 20,

    genres: [
        "4-Koma", "Action", "Adult", "Adventure", "Boys Love", "Comedy",
        "Cooking", "Crime", "Cultivation", "Demons", "Drama", "Ecchi",
        "Fantasy", "Game", "Gender Bender", "Girls Love", "Gore", "Harem",
        "Historical", "Horror", "Isekai", "Josei", "Loli", "Magic",
        "Martial Arts", "Mature", "Mecha", "Medical", "Military",
        "Monster Girls", "Music", "Mystery", "Office Worker", "One Shot",
        "Parody", "Police", "Psychological", "Reincarnation", "Romance",
        "Romcom", "School", "School Life", "Sci-Fi", "Seinen", "Shota",
        "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life",
        "Smut", "Sports", "Super Power", "Supernatural", "Survival",
        "Thriller", "Time Travel", "Tragedy", "Vampire", "Webtoon",
        "Wuxia", "Xianxia", "Yaoi", "Yuri", "Zombie",
        "Action Adventure", "Fantasy Romance", "Isekai Fantasy",
        "Reincarnation Fantasy", "Romantic Comedy", "School Romance",
        "Superhero", "Villainess", "Reverse Harem", "Dungeon",
        "System", "Tower", "Leveling", "VRMMO", "Apocalypse",
        "Post-Apocalyptic", "Time Loop", "Regression", "Transmigration",
        "Second Life", "Awakening", "Hunter"
    ],

    formats: ["Manga", "Manhwa", "Manhua", "Webtoon", "Novel"],

    typeMap: {
        "Manga": "manga",
        "Manhwa": "manhwa",
        "Manhua": "manhua",
        "Webtoon": "webtoon",
        "Novel": "novel"
    },

    getPopularManga: function(page) {
        return this.getSeriesPage(page, "", "", null, null, "popular");
    },

    getLatestUpdates: function(page) {
        return this.getSeriesPage(page, "", "", null, null, "update");
    },

    getSearchManga: function(query, page) {
        return this.getSeriesPage(page, query || "", "", null, null, "");
    },

    getMangaList: function(page, status, genre, type) {
        let statusStr = "";
        if (status === 1) statusStr = "ongoing";
        else if (status === 2) statusStr = "completed";
        else if (status === 3) statusStr = "hiatus";

        return this.getSeriesPage(page, "", statusStr, genre, type, "");
    },

    getSeriesPage: function(page, query, status, genre, type, order) {
        page = Math.max(1, page || 1);

        // Try Madara/MangaThemesia style first
        let url = this.baseUrl + "/manga/";
        let params = [];
        if (page > 1) params.push("page=" + page);
        if (query) params.push("s=" + encodeURIComponent(query));
        if (status) params.push("status=" + encodeURIComponent(status));
        if (order) params.push("order=" + encodeURIComponent(order));

        if (type) {
            let arr = Array.isArray(type) ? type : [type];
            for (let i = 0; i < arr.length; i++) {
                let val = this.typeMap[arr[i]] || arr[i].toLowerCase();
                params.push("type=" + encodeURIComponent(val));
            }
        }

        if (genre) {
            let arr = Array.isArray(genre) ? genre : [genre];
            for (let i = 0; i < arr.length; i++) {
                let slug = arr[i].toLowerCase().trim().replace(/\s+/g, "-").replace(/'/g, "");
                if (slug) params.push("genre%5B%5D=" + encodeURIComponent(slug));
            }
        }

        if (params.length > 0) url += "?" + params.join("&");

        let response = fetch(url);
        if (response.status !== 200) {
            // Fallback: try root with query param (ZManga style)
            let altUrl = this.baseUrl + (page > 1 ? "/page/" + page + "/" : "/") + (query ? "?s=" + encodeURIComponent(query) : "");
            response = fetch(altUrl);
            if (response.status !== 200) return { items: [], totalPages: page };
        }

        let doc = Html.parse(response.body, url);
        // Try multiple card selectors
        let cards = doc.querySelectorAll(
            "div.bsx, div.utao, div.animposx, div.manga-item, .page-item-detail, " +
            ".flexbox2-item, .flexbox3-item, .flexbox4-item, .searchbox, article"
        );
        let items = [];

        for (let i = 0; i < cards.length; i++) {
            let card = cards[i];
            let linkEl = card.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href");
            if (!href || href === "#") continue;

            let relativeUrl = href.startsWith(this.baseUrl) ? href.substring(this.baseUrl.length) : href;

            let title = linkEl.attr("title") || "";
            if (!title) {
                let ttEl = card.querySelector(".tt, .title, .flexbox2-title .title, .flexbox3-title .title, h3, h2");
                if (ttEl) title = ttEl.text().trim();
            }
            if (!title) {
                let imgEl = card.querySelector("img");
                if (imgEl) title = imgEl.attr("alt") || "";
            }
            if (!title) title = linkEl.text().trim();

            let thumbnailUrl = "";
            let imgs = card.querySelectorAll("img");
            for (let j = 0; j < imgs.length; j++) {
                let s = imgs[j].attr("data-src") || imgs[j].attr("data-lazy-src") || imgs[j].attr("src") || "";
                if (s && !s.includes("/flags/") && !s.includes(".svg") && !s.startsWith("data:image/svg")) {
                    thumbnailUrl = s;
                    break;
                }
            }
            if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
                thumbnailUrl = thumbnailUrl.startsWith("//") ? "https:" + thumbnailUrl : this.baseUrl + thumbnailUrl;
            }

            let statusVal = 0;
            let statusEl = card.querySelector(".status, .epxs, .mg_status");
            if (statusEl) {
                let sText = (statusEl.text() || "").toLowerCase();
                if (sText.includes("ongoing")) statusVal = 1;
                else if (sText.includes("completed") || sText.includes("end")) statusVal = 2;
            }

            items.push({ title: title.trim(), url: relativeUrl, thumbnailUrl: thumbnailUrl, status: statusVal });
        }

        let nextEl = doc.querySelector(".hpage a.r, .pagination a.next, a.next.page-numbers, a[rel='next']");
        let totalPages = (nextEl || items.length >= 10) ? page + 1 : page;

        return { items: items, totalPages: totalPages };
    },

    getMangaDetails: function(url) {
        let fullUrl = url.startsWith("http") ? url : this.baseUrl + url;
        let response = fetch(fullUrl);
        if (response.status !== 200) return {};

        let doc = Html.parse(response.body, fullUrl);

        let title = "";
        let titleEl = doc.querySelector("h1.entry-title, h1.manga-title, .series-title h2, h1");
        if (titleEl) title = titleEl.text().trim().replace(/\s*bahasa\s+indonesia.*/i, "");

        let thumbnailUrl = "";
        let thumbEl = doc.querySelector(".thumb img, .cover img, .series-thumb img, img.wp-post-image");
        if (thumbEl) {
            thumbnailUrl = thumbEl.attr("data-src") || thumbEl.attr("data-lazy-src") || thumbEl.attr("src") || "";
            if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
                thumbnailUrl = thumbnailUrl.startsWith("//") ? "https:" + thumbnailUrl : this.baseUrl + thumbnailUrl;
            }
        }

        let descEl = doc.querySelector(".entry-content, div[itemprop='description'], .desc, .synopsis, .series-synops, .series-synopsis");
        let description = descEl ? descEl.text().trim() : "";

        let author = "";
        let infoEls = doc.querySelectorAll(".tsinfo .imethod, .infotable tr, .spe span, .imptdt, .series-infoz.block span");
        for (let i = 0; i < infoEls.length; i++) {
            let txt = infoEls[i].text();
            if (txt.includes("Author") || txt.includes("Pengarang") || txt.includes("Komikus")) {
                author = txt.replace(/Author|Pengarang|Komikus|:|;/gi, "").trim();
                break;
            }
        }

        let status = 0;
        let bodyLower = response.body.toLowerCase();
        if (bodyLower.includes("status: ongoing") || bodyLower.includes(">ongoing<") || bodyLower.includes("on going")) status = 1;
        else if (bodyLower.includes("status: completed") || bodyLower.includes(">completed<") || bodyLower.includes("tamat")) status = 2;
        else if (bodyLower.includes("status: hiatus")) status = 3;

        let genres = [];
        let genreEls = doc.querySelectorAll(".mgen a, .genres-container a, a[rel='tag'], .genre-info a, .series-genres a");
        for (let i = 0; i < genreEls.length; i++) {
            let gText = genreEls[i].text().trim();
            if (gText && genres.indexOf(gText) === -1) genres.push(gText);
        }

        return { title: title, url: url, thumbnailUrl: thumbnailUrl, author: author, status: status, description: description, genre: genres };
    },

    getChapterList: function(mangaUrl) {
        let fullUrl = mangaUrl.startsWith("http") ? mangaUrl : this.baseUrl + mangaUrl;
        let response = fetch(fullUrl);
        if (response.status !== 200) return [];

        let doc = Html.parse(response.body, fullUrl);
        // Try Madara-style then ZManga-style
        let items = doc.querySelectorAll("#chapterlist ul li, .eplister ul li, .series-chapterlist a, .chapters a");
        let chapters = [];
        let seen = {};

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let linkEl = item.tagName && item.tagName.toLowerCase() === "a" ? item : item.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href");
            if (!href || href === "#" || seen[href]) continue;
            seen[href] = true;

            let relativeUrl = href.startsWith(this.baseUrl) ? href.substring(this.baseUrl.length) : href;

            let nameEl = item.querySelector ? item.querySelector(".chapternum, .chapter-title") : null;
            let name = nameEl ? nameEl.text().trim() : linkEl.text().trim().replace(/\s+/g, " ").trim();

            let dateUpload = 0;
            let dateEl = item.querySelector ? item.querySelector(".chapterdate, .chapter-date, .date, time") : null;
            if (dateEl) {
                let parsedDate = Date.parse(dateEl.text().trim());
                if (!isNaN(parsedDate)) dateUpload = parsedDate;
            }

            if (name) chapters.push({ name: name, url: relativeUrl, dateUpload: dateUpload });
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let fullUrl = chapterUrl.startsWith("http") ? chapterUrl : this.baseUrl + chapterUrl;
        let response = fetch(fullUrl);
        if (response.status !== 200) return [];

        let pages = [];

        // 1. Try ts_reader JS script parsing
        let match = response.body.match(/ts_reader\.run\((.*?)\);/);
        if (match && match[1]) {
            try {
                let json = JSON.parse(match[1]);
                if (json && json.sources && json.sources.length > 0 && json.sources[0].images) {
                    let imgs = json.sources[0].images;
                    for (let i = 0; i < imgs.length; i++) {
                        if (imgs[i]) pages.push(imgs[i] + "|Referer=" + this.baseUrl + "/");
                    }
                    if (pages.length > 0) return pages;
                }
            } catch (e) {}
        }

        // 2. Fallback to HTML DOM
        let doc = Html.parse(response.body, fullUrl);
        let imgEls = doc.querySelectorAll("#readerarea img, .entry-content img, .reader-area img, .chapter-content img");
        let seen = {};
        for (let i = 0; i < imgEls.length; i++) {
            let img = imgEls[i];
            let src = img.absUrl("src") || img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "";
            if (src && !src.includes("pebaikan.png") && !seen[src]) {
                seen[src] = true;
                pages.push(src.trim() + "|Referer=" + this.baseUrl + "/");
            }
        }

        return pages;
    }
};
