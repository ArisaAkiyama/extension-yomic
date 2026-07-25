var source = {
    name: "ManhwaIndo",
    baseUrl: "https://www.manhwaindo.my",
    apiUrl: "https://www.manhwaindo.my",
    language: "id",
    version: "1.0.0",
    description: "Baca komik Manhwa Bahasa Indonesia dari ManhwaIndo",
    author: "DesktopKomik",
    iconBackground: "#1e293b",
    iconForeground: "#38bdf8",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 20,

    genres: [
        "4-Koma", "Action", "Adult", "Adventure", "Boys' Love", "Comedy", "Cooking", "Crime",
        "Crossdressing", "Demon", "Demon Fantasy", "Demons", "Drama", "Ecchi", "Emperor's Daughter",
        "Entertainment", "Fantasy", "Fight", "Game", "Gender Bender", "Girls' Love", "Gore",
        "Harem", "Historical", "Horror", "Isekai", "Josei", "Josei (W)", "Kids", "Long Strip",
        "Magic", "Magical Girls", "Manhwa", "Martial Art", "Martial Arts", "Mature",
        "Mature Psychological", "Mecha", "Medical", "Military", "Mistery", "Modern", "Monsters",
        "Murim", "Music", "Mystery", "One-Shot", "Oneshot", "Philosophical", "Police", "Politics",
        "Psychological", "Regression", "Reincarnation", "Reverse Harem", "Romance", "Royal Family",
        "School", "School Life", "Sci-Fi", "Seinein", "Seinen", "Shoujo", "Shoujo (G)", "Shoujo Ai",
        "Shounen", "Shounen (E)", "Shounen Ai", "Slice of Life", "Smut", "Sport", "Sports",
        "Super Power", "Superhero", "Supernatural", "Survival", "Thriller", "Time Travel",
        "Tragedy", "Vampire", "Villainess", "Webtoons", "Wuxia", "Yaoi", "Yuri"
    ],

    formats: ["Manga", "Manhwa", "Manhua", "Comic", "Novel"],

    genreMap: {
        "4-Koma": "4", "Action": "3", "Adult": "6669", "Adventure": "12", "Boys' Love": "2828",
        "Comedy": "5", "Cooking": "115", "Crime": "1764", "Crossdressing": "7101", "Demon": "7336",
        "Demon Fantasy": "7470", "Demons": "217", "Drama": "18", "Ecchi": "22", "Emperor's Daughter": "7135",
        "Entertainment": "7178", "Fantasy": "13", "Fight": "7360", "Game": "14", "Gender Bender": "112",
        "Girls' Love": "1399", "Gore": "48", "Harem": "23", "Historical": "191", "Horror": "53",
        "Isekai": "28", "Josei": "41", "Josei (W)": "7168", "Kids": "6839", "Long Strip": "6792",
        "Magic": "58", "Magical Girls": "1776", "Manhwa": "7136", "Martial Art": "6636", "Martial Arts": "51",
        "Mature": "30", "Mature Psychological": "7187", "Mecha": "88", "Medical": "162", "Military": "117",
        "Mistery": "6855", "Modern": "7331", "Monsters": "6772", "Murim": "7103", "Music": "577",
        "Mystery": "60", "One-Shot": "9", "Oneshot": "4369", "Philosophical": "2404", "Police": "964",
        "Politics": "6641", "Psychological": "61", "Regression": "7410", "Reincarnation": "46",
        "Reverse Harem": "7401", "Romance": "16", "Royal Family": "6385", "School": "56",
        "School Life": "6", "Sci-Fi": "34", "Seinein": "6694", "Seinen": "31", "Shoujo": "125",
        "Shoujo (G)": "7125", "Shoujo Ai": "140", "Shounen": "10", "Shounen (E)": "7310",
        "Shounen Ai": "717", "Slice of Life": "7", "Smut": "6670", "Sport": "6803", "Sports": "276",
        "Super Power": "97", "Superhero": "522", "Supernatural": "39", "Survival": "7026",
        "Thriller": "119", "Time Travel": "7308", "Tragedy": "42", "Vampire": "828",
        "Villainess": "6896", "Webtoons": "215", "Wuxia": "520", "Yaoi": "7185", "Yuri": "81"
    },

    typeMap: {
        "Manga": "manga",
        "Manhwa": "manhwa",
        "Manhua": "manhua",
        "Comic": "comic",
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
        let url = `${this.baseUrl}/series/`;
        if (page > 1) {
            url += `page/${page}/`;
        }

        let params = [];
        if (query) params.push("s=" + encodeURIComponent(query));
        if (status) params.push("status=" + encodeURIComponent(status));

        if (type) {
            let arr = [];
            if (Array.isArray(type)) arr = type;
            else if (type.length !== undefined && typeof type !== 'string') {
                for (let i = 0; i < type.length; i++) arr.push(type[i]);
            } else arr = [type];

            for (let i = 0; i < arr.length; i++) {
                let val = this.typeMap[arr[i]] || arr[i].toLowerCase();
                params.push("type=" + encodeURIComponent(val));
            }
        }

        if (order) {
            params.push("order=" + encodeURIComponent(order));
        }

        if (genre) {
            let arr = [];
            if (Array.isArray(genre)) arr = genre;
            else if (genre.length !== undefined && typeof genre !== 'string') {
                for (let i = 0; i < genre.length; i++) arr.push(genre[i]);
            } else arr = [genre];

            for (let i = 0; i < arr.length; i++) {
                let id = this.genreMap[arr[i]];
                if (id) {
                    params.push("genre%5B%5D=" + id);
                }
            }
        }

        if (params.length > 0) {
            url += "?" + params.join("&");
        }

        let response = fetch(url);
        if (response.status !== 200) return { items: [], totalPages: page };

        let doc = Html.parse(response.body, url);
        let cards = doc.querySelectorAll("div.bsx, div.utao, div.animposx");
        let items = [];

        for (let i = 0; i < cards.length; i++) {
            let card = cards[i];
            let linkEl = card.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href");
            if (!href) continue;

            let relativeUrl = href;
            if (href.startsWith(this.baseUrl)) {
                relativeUrl = href.substring(this.baseUrl.length);
            }

            let title = linkEl.attr("title");
            if (!title) {
                let ttEl = card.querySelector(".tt, .title");
                if (ttEl) title = ttEl.text().trim();
            }
            if (!title) title = linkEl.text().trim();

            let imgEl = card.querySelector("img");
            let thumbnailUrl = "";
            if (imgEl) {
                thumbnailUrl = imgEl.absUrl("src");
                if (!thumbnailUrl) thumbnailUrl = imgEl.attr("src") || "";
                if (!thumbnailUrl) thumbnailUrl = imgEl.attr("data-src") || "";
            }

            let statusVal = 0;
            let statusEl = card.querySelector(".status, .epxs");
            if (statusEl) {
                let sText = statusEl.text().toLowerCase();
                let sClass = statusEl.attr("class") || "";
                if (sText.includes("ongoing") || sClass.includes("ongoing")) statusVal = 1;
                else if (sText.includes("completed") || sClass.includes("completed")) statusVal = 2;
            }

            items.push({
                title: title.trim(),
                url: relativeUrl,
                thumbnailUrl: thumbnailUrl,
                status: statusVal
            });
        }

        let nextEl = doc.querySelector("a.next.page-numbers");
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

        let titleEl = doc.querySelector("h1.entry-title");
        let title = titleEl ? titleEl.text().trim() : "";

        let thumbEl = doc.querySelector(".thumb img, img.wp-post-image");
        let thumbnailUrl = thumbEl ? (thumbEl.absUrl("src") || thumbEl.attr("src") || "") : "";

        let descEl = doc.querySelector(".entry-content, div[itemprop='description'], .desc, .synopsis");
        let description = descEl ? descEl.text().trim() : "";

        let author = "";
        let authorEls = doc.querySelectorAll(".tsinfo .imethod, .infotable tr, .spe span");
        for (let i = 0; i < authorEls.length; i++) {
            let txt = authorEls[i].text();
            if (txt.includes("Author") || txt.includes("Pengarang")) {
                author = txt.replace(/Author|Pengarang|:|;/gi, "").trim();
                break;
            }
        }

        let status = 0;
        let bodyText = response.body.toLowerCase();
        if (bodyText.includes("status: ongoing") || bodyText.includes("status ongoing") || bodyText.includes(">ongoing<")) {
            status = 1;
        } else if (bodyText.includes("status: completed") || bodyText.includes("status completed") || bodyText.includes(">completed<")) {
            status = 2;
        } else if (bodyText.includes("status: hiatus") || bodyText.includes("status hiatus")) {
            status = 3;
        }

        let genres = [];
        let genreEls = doc.querySelectorAll(".mgen a, .genres-container a, a[rel='tag']");
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
        let items = doc.querySelectorAll("#chapterlist ul li, .eplister ul li, ul.cl-ul li");
        let chapters = [];

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let linkEl = item.querySelector("a");
            if (!linkEl) continue;

            let href = linkEl.attr("href");
            if (!href) continue;

            let relativeUrl = href;
            if (href.startsWith(this.baseUrl)) {
                relativeUrl = href.substring(this.baseUrl.length);
            }

            let nameEl = item.querySelector(".chapternum");
            let name = nameEl ? nameEl.text().trim() : linkEl.text().trim();

            let dateEl = item.querySelector(".chapterdate");
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

        // 1. Try ts_reader JS script parsing
        let match = response.body.match(/ts_reader\.run\((.*?)\);/);
        if (match && match[1]) {
            try {
                let json = JSON.parse(match[1]);
                if (json && json.sources && json.sources.length > 0 && json.sources[0].images) {
                    let imgs = json.sources[0].images;
                    for (let i = 0; i < imgs.length; i++) {
                        if (imgs[i]) pages.push(imgs[i]);
                    }
                    if (pages.length > 0) return pages;
                }
            } catch (e) {}
        }

        // 2. Fallback to HTML DOM parsing
        let doc = Html.parse(response.body, fullUrl);
        let imgEls = doc.querySelectorAll("#readerarea img");
        for (let i = 0; i < imgEls.length; i++) {
            let img = imgEls[i];
            let src = img.absUrl("src");
            if (!src) src = img.attr("src") || img.attr("data-src");
            if (src && !src.includes("pebaikan.png")) {
                pages.push(src);
            }
        }

        return pages;
    }
};
