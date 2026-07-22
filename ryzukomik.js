var source = {
    name: "Ryzukomik",
    baseUrl: "https://ryzukomik.my.id",
    apiUrl: "https://ryzukomik.my.id",
    language: "id",
    version: "1.0.0",
    description: "Ryzukomik Indonesian manga extension",
    author: "DesktopKomik",
    iconBackground: "#0a0a0a",
    iconForeground: "#ea580c",
    isNsfw: false,
    isHasMorePages: true,

    cleanTitle: function(title) {
        return title.replace(/^(?:-\s*|komik\s+)+/i, '').trim();
    },

    getPopularManga: function(page) {
        return this.getMangaList(page, 0, null, null);
    },

    getLatestUpdates: function(page) {
        let currentPage = Math.max(1, page || 1);
        if (currentPage === 1) {
            let url = this.apiUrl + "/komi";
            let response = fetch(url);
            if (response.status !== 200) return { items: [], totalPages: 1 };
            
            let doc = Html.parse(response.body, url);
            let container = doc.querySelector("#manga-container");
            if (!container) return { items: [], totalPages: 1 };
            
            let articles = container.querySelectorAll("article");
            let items = [];
            for (let art of articles) {
                let titleEl = art.querySelector("h3");
                let title = titleEl ? this.cleanTitle(titleEl.text().trim()) : "";
                
                let linkEl = art.querySelector("a");
                let relUrl = linkEl ? linkEl.attr("href") : "";
                
                let imgEl = art.querySelector("img[alt='poster']");
                let thumbUrl = imgEl ? imgEl.absUrl("src") : "";

                if (title && relUrl) {
                    items.push({
                        title: title,
                        url: relUrl,
                        thumbnailUrl: thumbUrl
                    });
                }
            }
            return { items: items, totalPages: 1 };
        } else {
            return this.getPopularManga(page);
        }
    },

    getSearchManga: function(query, page) {
        let currentPage = Math.max(1, page || 1);
        query = (query || "").trim();
        if (!query) return this.getPopularManga(currentPage);

        let url = this.apiUrl + "/komi/browse?ajax=1&s=" + encodeURIComponent(query) + "&page=" + currentPage;
        let response = fetch(url);
        if (response.status !== 200) return { items: [], totalPages: currentPage };

        let json = JSON.parse(response.body);
        let gridHtml = json.grid || "";
        let doc = Html.parse(gridHtml, this.baseUrl);
        
        let cards = doc.querySelectorAll("div.group.flex.flex-col");
        let items = [];
        for (let card of cards) {
            let titleEl = card.querySelector("h3");
            let title = titleEl ? this.cleanTitle(titleEl.text().trim()) : "";
            
            let linkEl = card.querySelector("a");
            let relUrl = linkEl ? linkEl.attr("href") : "";
            
            let imgEl = card.querySelector("img");
            let thumbUrl = imgEl ? imgEl.absUrl("src") : "";

            if (title && relUrl) {
                items.push({
                    title: title,
                    url: relUrl,
                    thumbnailUrl: thumbUrl
                });
            }
        }

        let totalPages = json.total_pages || currentPage;
        return {
            items: items,
            totalPages: Math.max(currentPage, totalPages)
        };
    },

    getMangaList: function(page, status, genres, formats) {
        let currentPage = Math.max(1, page || 1);
        let url = this.apiUrl + "/komi/browse?ajax=1";

        let genreSlug = "";
        if (genres) {
            if (Array.isArray(genres) && genres.length > 0) {
                genreSlug = genres[0];
            } else if (typeof genres === 'string') {
                genreSlug = genres;
            }
            genreSlug = genreSlug.toLowerCase().trim().replace(/\s+/g, "-");
        }

        let targetFormats = [];
        if (formats && Array.isArray(formats)) {
            for (let i = 0; i < formats.length; i++) {
                if (formats[i]) targetFormats.push(formats[i].toLowerCase().trim());
            }
        }

        if (genreSlug) {
            url += "&genre=" + encodeURIComponent(genreSlug) + "&page=" + currentPage;
        } else {
            url += "&daftar=" + currentPage;
        }

        let response = fetch(url);
        if (response.status !== 200) return { items: [], totalPages: currentPage };

        let json = JSON.parse(response.body);
        let gridHtml = json.grid || "";
        let doc = Html.parse(gridHtml, this.baseUrl);
        
        let cards = doc.querySelectorAll("div.group.flex.flex-col");
        let items = [];
        for (let card of cards) {
            // Read format badge
            let formatVal = "";
            let spanEl = card.querySelector("span");
            if (spanEl) {
                formatVal = spanEl.text().trim().toLowerCase();
            }

            if (targetFormats.length > 0) {
                if (targetFormats.indexOf(formatVal) === -1) {
                    continue;
                }
            }

            let titleEl = card.querySelector("h3");
            let title = titleEl ? this.cleanTitle(titleEl.text().trim()) : "";
            
            let linkEl = card.querySelector("a");
            let relUrl = linkEl ? linkEl.attr("href") : "";
            
            let imgEl = card.querySelector("img");
            let thumbUrl = imgEl ? imgEl.absUrl("src") : "";

            if (title && relUrl) {
                items.push({
                    title: title,
                    url: relUrl,
                    thumbnailUrl: thumbUrl
                });
            }
        }

        let totalPages = json.total_pages || currentPage;
        return {
            items: items,
            totalPages: Math.max(currentPage, totalPages)
        };
    },

    getMangaDetails: function(url) {
        let fullUrl = this.baseUrl + url;
        let response = fetch(fullUrl);
        if (response.status !== 200) return {};

        let doc = Html.parse(response.body, fullUrl);
        
        let titleEl = doc.querySelector("h1");
        let title = titleEl ? this.cleanTitle(titleEl.text().trim()) : "";
        
        let thumbEl = doc.querySelector("img[alt='poster']");
        let thumbnailUrl = thumbEl ? thumbEl.absUrl("src") : "";

        let description = "";
        let synopsisEl = doc.querySelector("#synopsisFull") || doc.querySelector("#synopsisShort");
        if (synopsisEl) {
            description = synopsisEl.text().trim();
        }

        // Details metadata
        let author = "";
        let status = 0; // Unknown=0, Ongoing=1, Completed=2
        
        let detailDivs = doc.querySelectorAll(".flex.justify-between.items-center, .flex.justify-between.items-start");
        for (let i = 0; i < detailDivs.length; i++) {
            let text = detailDivs[i].text().toLowerCase();
            if (text.includes("pengarang") || text.includes("author")) {
                let valEl = detailDivs[i].querySelector("span.text-neutral-200");
                if (valEl) author = valEl.text().trim();
            } else if (text.includes("status")) {
                let valEl = detailDivs[i].querySelector("span.text-neutral-200");
                if (valEl) {
                    let statusStr = valEl.text().toLowerCase();
                    if (statusStr.includes("berjalan") || statusStr.includes("ongoing")) {
                        status = 1;
                    } else if (statusStr.includes("tamat") || statusStr.includes("completed")) {
                        status = 2;
                    }
                }
            }
        }

        let genres = [];
        let genreLinks = doc.querySelectorAll(".genre-link");
        for (let i = 0; i < genreLinks.length; i++) {
            genres.push(genreLinks[i].text().trim());
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
        let chapterListDiv = doc.querySelector("#chapterList");
        if (!chapterListDiv) return [];

        let aTags = chapterListDiv.querySelectorAll("a.chapter-item");
        let chapters = [];
        for (let a of aTags) {
            let titleEl = a.querySelector(".ch-title");
            let title = titleEl ? titleEl.text().trim() : a.text().trim();
            let relativeUrl = a.attr("href");

            // Optional Date Parsing
            let dateUpload = 0;
            let dateEl = a.querySelector(".ch-date");
            if (dateEl) {
                let dateText = dateEl.text().trim();
                dateUpload = this.parseRelativeDate(dateText);
            }

            chapters.push({
                name: title,
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
        // Regex parsing of Javascript variable `originalImages`
        let match = response.body.match(/const\s+originalImages\s*=\s*(\[[^\]]+\]);/);
        if (match && match[1]) {
            try {
                pages = JSON.parse(match[1]);
            } catch(e) {
                // Fallback to DOM parsing if regex fails
            }
        }

        if (pages.length === 0) {
            let doc = Html.parse(response.body, fullUrl);
            let imgEls = doc.querySelectorAll("#chap-img img");
            for (let img of imgEls) {
                let src = img.absUrl("src") || img.attr("src");
                if (src) pages.push(src);
            }
        }

        return pages.map(function(p) { return p + "|Referer=none"; });
    },

    parseRelativeDate: function(text) {
        text = text.toLowerCase();
        let now = Date.now();
        let num = parseInt(text.replace(/[^0-9]/g, "")) || 0;
        if (num === 0) return now;

        if (text.includes("detik") || text.includes("sec")) {
            return now - (num * 1000);
        } else if (text.includes("menit") || text.includes("min")) {
            return now - (num * 60 * 1000);
        } else if (text.includes("jam") || text.includes("hour")) {
            return now - (num * 60 * 60 * 1000);
        } else if (text.includes("hari") || text.includes("day")) {
            return now - (num * 24 * 60 * 60 * 1000);
        } else if (text.includes("minggu") || text.includes("week")) {
            return now - (num * 7 * 24 * 60 * 60 * 1000);
        } else if (text.includes("bulan") || text.includes("month")) {
            return now - (num * 30 * 24 * 60 * 60 * 1000);
        }
        return now;
    },

    genres: [
        "4-Koma", "Action", "Adult", "Adventure", "Comedy", "Demons", "Drama", "Ecchi", 
        "Fantasy", "Game", "Gender Bender", "Gore", "Harem", "Historical", "Horror", 
        "Isekai", "Josei", "Loli", "Magic", "Martial Arts", "Mature", "Mecha", 
        "Military", "Music", "Mystery", "Psychological", "Romance", "School Life", 
        "Sci-Fi", "Seinen", "Shota", "Shoujo", "Shounen", "Slice of Life", "Sports", 
        "Super Power", "Supernatural", "Thriller", "Tragedy", "Vampire", "Yuri"
    ],

    formats: [
        "Manga", "Manhwa", "Manhua"
    ]
};
