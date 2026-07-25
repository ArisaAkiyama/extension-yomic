var source = {
    name: "Ainz Scans ID",
    baseUrl: "https://ainzscans01.com",
    apiUrl: "https://api.ainzscans01.com/api",
    language: "id",
    version: "1.0.0",
    description: "Baca komik Bahasa Indonesia dari Ainz Scans",
    author: "DesktopKomik",
    iconBackground: "#0f172a",
    iconForeground: "#38bdf8",
    isNsfw: false,
    isHasMorePages: true,
    pageSize: 20,

    genres: [
        "Action", "Adult", "Adventure", "Beasts", "Comedy", "Cooking", "Crime",
        "Drama", "Ecchi", "Fantasy", "Gender Bender", "Gore", "Harem", "Historical",
        "Horror", "Isekai", "Josei", "Magic", "Manga", "Manhwa", "Martial Arts",
        "Mature", "Mecha", "Medical", "Military", "Monsters", "Murim", "Music",
        "Mystery", "Psychological", "Reincarnation", "Romance", "School Life", "Sci Fi",
        "Seinen", "Shotacon", "Shoujo", "Shounen", "Shounen Ai", "Slice Of Life",
        "Smut", "Sports", "Supernatural", "Survival", "System", "Thriller", "Tragedy", "Wuxia"
    ],

    formats: ["Manhwa", "Manhua", "Manga"],

    genreMap: {
        "Action": "action", "Adult": "adult", "Adventure": "adventure", "Beasts": "beasts",
        "Comedy": "comedy", "Cooking": "cooking", "Crime": "crime", "Drama": "drama",
        "Ecchi": "ecchi", "Fantasy": "fantasy", "Gender Bender": "gender-bender", "Gore": "gore",
        "Harem": "harem", "Historical": "historical", "Horror": "horror", "Isekai": "isekai",
        "Josei": "josei", "Magic": "magic", "Manga": "manga", "Manhwa": "manhwa",
        "Martial Arts": "martial-arts", "Mature": "mature", "Mecha": "mecha", "Medical": "medical",
        "Military": "military", "Monsters": "monsters", "Murim": "murim", "Music": "music",
        "Mystery": "mystery", "Psychological": "psychological", "Reincarnation": "reincarnation",
        "Romance": "romance", "School Life": "school-life", "Sci Fi": "sci-fi", "Seinen": "seinen",
        "Shotacon": "shotacon", "Shoujo": "shoujo", "Shounen": "shounen", "Shounen Ai": "shounen-ai",
        "Slice Of Life": "slice-of-life", "Smut": "smut", "Sports": "sports",
        "Supernatural": "supernatural", "Survival": "survival", "System": "system",
        "Thriller": "thriller", "Tragedy": "tragedy", "Wuxia": "wuxia"
    },

    typeMap: {
        "Manhwa": "MANHWA",
        "Manhua": "MANHUA",
        "Manga": "MANGA"
    },

    headers: function() {
        return {
            "Referer": this.baseUrl + "/",
            "Origin": this.baseUrl
        };
    },

    getPopularManga: function(page) {
        return this.getSearchPage(page, "", "", null, null, "views");
    },

    getLatestUpdates: function(page) {
        return this.getSearchPage(page, "", "", null, null, "latest");
    },

    getSearchManga: function(query, page) {
        return this.getSearchPage(page, query || "", "", null, null, "");
    },

    getMangaList: function(page, status, genre, type) {
        let statusStr = "";
        if (status === 1) statusStr = "ONGOING";
        else if (status === 2) statusStr = "COMPLETED";
        else if (status === 3) statusStr = "HIATUS";

        return this.getSearchPage(page, "", statusStr, genre, type, "");
    },

    getSearchPage: function(page, query, status, genre, type, sort) {
        page = Math.max(1, page || 1);
        let url = `${this.apiUrl}/search?type=COMIC&limit=${this.pageSize}&page=${page}`;

        if (query) url += "&q=" + encodeURIComponent(query);
        if (status) url += "&status=" + encodeURIComponent(status);
        if (sort) {
            url += "&sort=" + encodeURIComponent(sort) + "&order=desc";
        }

        if (type) {
            let arr = [];
            if (Array.isArray(type)) arr = type;
            else if (type.length !== undefined && typeof type !== 'string') {
                for (let i = 0; i < type.length; i++) arr.push(type[i]);
            } else arr = [type];

            if (arr.length > 0) {
                let val = this.typeMap[arr[0]] || arr[0].toUpperCase();
                url += "&comic_type=" + encodeURIComponent(val);
            }
        }

        if (genre) {
            let arr = [];
            if (Array.isArray(genre)) arr = genre;
            else if (genre.length !== undefined && typeof genre !== 'string') {
                for (let i = 0; i < genre.length; i++) arr.push(genre[i]);
            } else arr = [genre];

            if (arr.length > 0) {
                let gVal = this.genreMap[arr[0]] || arr[0].toLowerCase();
                url += "&genre=" + encodeURIComponent(gVal);
            }
        }

        let response = fetch(url, { headers: this.headers() });
        if (response.status !== 200) return { items: [], totalPages: page };

        let json = JSON.parse(response.body);
        let data = json.data || [];
        let totalPages = json.total_pages || page;

        let items = [];
        for (let i = 0; i < data.length; i++) {
            let manga = data[i];
            let statusVal = 0;
            let cStatus = (manga.comic_status || "").toUpperCase();
            if (cStatus === "ONGOING") statusVal = 1;
            else if (cStatus === "COMPLETED") statusVal = 2;
            else if (cStatus === "HIATUS") statusVal = 3;

            items.push({
                title: manga.title || "",
                url: "/comic/" + manga.slug,
                thumbnailUrl: manga.poster_image_url || "",
                status: statusVal
            });
        }

        return {
            items: items,
            totalPages: totalPages
        };
    },

    getMangaDetails: function(url) {
        let slug = url.substring(url.lastIndexOf("/") + 1);
        let apiUrl = `${this.apiUrl}/series/comic/${slug}`;

        let response = fetch(apiUrl, { headers: this.headers() });
        if (response.status !== 200) return {};

        let dto = JSON.parse(response.body);
        let statusVal = 0;
        let cStatus = (dto.comic_status || "").toUpperCase();
        if (cStatus === "ONGOING") statusVal = 1;
        else if (cStatus === "COMPLETED") statusVal = 2;
        else if (cStatus === "HIATUS") statusVal = 3;

        let author = dto.author_name || "";
        if (dto.artist_name && dto.artist_name !== author) {
            author += (author ? ", " : "") + dto.artist_name;
        }

        let genres = [];
        if (dto.primary_genre) {
            genres.push(dto.primary_genre);
        }

        return {
            title: dto.title || "",
            url: "/comic/" + dto.slug,
            thumbnailUrl: dto.poster_image_url || "",
            author: author,
            status: statusVal,
            description: dto.synopsis || "",
            genre: genres
        };
    },

    getChapterList: function(mangaUrl) {
        let slug = mangaUrl.substring(mangaUrl.lastIndexOf("/") + 1);
        let apiUrl = `${this.apiUrl}/series/comic/${slug}`;

        let response = fetch(apiUrl, { headers: this.headers() });
        if (response.status !== 200) return [];

        let dto = JSON.parse(response.body);
        let units = dto.units || [];
        let chapters = [];

        for (let i = 0; i < units.length; i++) {
            let unit = units[i];
            let numberStr = (unit.number || "").replace(/\.00$/, "");
            let name = "Chapter " + numberStr;

            let dateUpload = 0;
            if (unit.created_at) {
                let parsed = Date.parse(unit.created_at);
                if (!isNaN(parsed)) dateUpload = parsed;
            }

            chapters.push({
                name: name,
                url: `/comic/${slug}/chapter/${unit.slug}`,
                dateUpload: dateUpload
            });
        }

        return chapters;
    },

    getPageList: function(chapterUrl) {
        let apiUrl = `${this.apiUrl}/series${chapterUrl}`;

        let response = fetch(apiUrl, { headers: this.headers() });
        if (response.status !== 200) return [];

        let dto = JSON.parse(response.body);
        let pages = [];

        if (dto.chapter && dto.chapter.pages) {
            let pageList = dto.chapter.pages;
            for (let i = 0; i < pageList.length; i++) {
                let imgUrl = pageList[i].image_url || "";
                if (imgUrl) {
                    if (!imgUrl.startsWith("http")) {
                        imgUrl = "https://api.ainzscans01.com" + imgUrl;
                    }

                    if (imgUrl.includes("googleusercontent.com") || imgUrl.includes("bp.blogspot.com")) {
                        imgUrl = imgUrl.replace(/=[swh]\d+[^/?]*($|\?)/gi, "=s0$1")
                                       .replace(/\/[swh]\d+[^/]*\//gi, "/s0/");
                    }

                    pages.push(imgUrl);
                }
            }
        }

        return pages;
    }
};
