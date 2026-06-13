var source = {
    name: "MangaDex",
    baseUrl: "https://mangadex.org",
    apiUrl: "https://api.mangadex.org",
    language: "en,id",
    version: "1.0.0",
    description: "MangaDex extension implemented in JavaScript using Jint Engine",
    author: "DesktopKomik",
    iconBackground: "#FF6740",
    iconForeground: "#FFFFFF",
    isNsfw: true, // MangaDex has explicit content
    isHasMorePages: true,
    
    appPageSize: 14,
    apiPageSize: 30, // We can request up to 100, let's use 30 for safe margins
    
    getLangsParam: function() {
        return "&availableTranslatedLanguage[]=en&availableTranslatedLanguage[]=id";
    },

    getTranslatedLangsParam: function() {
        return "&translatedLanguage[]=en&translatedLanguage[]=id";
    },

    parseMangaList: function(responseBody) {
        let json = JSON.parse(responseBody);
        if (!json || json.result !== "ok" || !json.data) return [];
        
        let result = [];
        for (let i = 0; i < json.data.length; i++) {
            let item = json.data[i];
            let manga = {
                title: "",
                url: `/manga/${item.id}`,
                thumbnailUrl: "",
                status: 0 // Unknown
            };
            
            // Title
            if (item.attributes && item.attributes.title) {
                manga.title = item.attributes.title.en || Object.values(item.attributes.title)[0] || "Unknown";
            }
            
            // Status map: ongoing=1, completed=2, hiatus=3, cancelled=4
            if (item.attributes && item.attributes.status) {
                let s = item.attributes.status;
                if (s === "ongoing") manga.status = 1;
                else if (s === "completed") manga.status = 2;
                else if (s === "hiatus") manga.status = 3;
                else if (s === "cancelled") manga.status = 4;
            }
            
            // Cover
            if (item.relationships) {
                let coverArt = item.relationships.find(x => x.type === "cover_art");
                if (coverArt && coverArt.attributes && coverArt.attributes.fileName) {
                    manga.thumbnailUrl = `https://uploads.mangadex.org/covers/${item.id}/${coverArt.attributes.fileName}.512.jpg`;
                }
            }
            
            result.push(manga);
        }
        return result;
    },

    getApiMangaPage: function(page, queryString) {
        let startIndex = (Math.max(1, page) - 1) * this.appPageSize;
        let firstApiPage = Math.floor(startIndex / this.apiPageSize) + 1;
        let offset = startIndex % this.apiPageSize;
        let collected = [];
        let sourceTotalPages = 9999;
        
        let ratings = "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic";
        
        for (let sourcePage = firstApiPage; collected.length < this.appPageSize && sourcePage <= sourceTotalPages; sourcePage++) {
            let apiOffset = (sourcePage - 1) * this.apiPageSize;
            let url = `${this.apiUrl}/manga?limit=${this.apiPageSize}&offset=${apiOffset}&includes[]=cover_art${this.getLangsParam()}${ratings}${queryString}`;
            
            let response = fetch(url);
            if (response.status !== 200) break;
            
            let items = this.parseMangaList(response.body);
            if (items.length === 0) break;
            
            let json = JSON.parse(response.body);
            if (json.total) {
                sourceTotalPages = Math.ceil(json.total / this.apiPageSize);
            }
            
            if (sourcePage === firstApiPage && offset > 0) {
                items = items.slice(offset);
            }
            
            collected = collected.concat(items);
            if (items.length < this.apiPageSize && sourcePage > firstApiPage) {
                break;
            }
        }
        
        return {
            items: collected.slice(0, this.appPageSize),
            totalPages: sourceTotalPages >= 9999 ? 9999 : Math.max(page, Math.ceil(sourceTotalPages * this.apiPageSize / this.appPageSize))
        };
    },

    getPopularManga: function(page) {
        return this.getApiMangaPage(page, "&order[followedCount]=desc");
    },

    getLatestUpdates: function(page) {
        return this.getApiMangaPage(page, "&order[latestUploadedChapter]=desc");
    },

    getSearchManga: function(query, page) {
        let q = "";
        if (query && query.trim() !== "") {
            q = `&title=${encodeURIComponent(query)}`;
        }
        return this.getApiMangaPage(page, q);
    },

    getMangaList: function(page, status) {
        let statusParam = "";
        if (status === 1) statusParam = "&status[]=ongoing";
        else if (status === 2) statusParam = "&status[]=completed";
        else if (status === 3) statusParam = "&status[]=hiatus";
        else if (status === 4) statusParam = "&status[]=cancelled";
        
        return this.getApiMangaPage(page, `&order[followedCount]=desc${statusParam}`);
    },

    getMangaDetails: function(url) {
        let id = url.replace("/manga/", "").split("/")[0];
        let reqUrl = `${this.apiUrl}/manga/${id}?includes[]=author&includes[]=artist&includes[]=cover_art`;
        
        let response = fetch(reqUrl);
        if (response.status !== 200) return null;
        
        let json = JSON.parse(response.body);
        if (!json || json.result !== "ok" || !json.data) return null;
        
        let item = json.data;
        let manga = {
            title: "",
            url: url,
            thumbnailUrl: "",
            description: "",
            author: "",
            status: 0,
            genres: []
        };
        
        if (item.attributes) {
            manga.title = item.attributes.title.en || Object.values(item.attributes.title)[0] || "Unknown";
            if (item.attributes.description) {
                manga.description = item.attributes.description.en || Object.values(item.attributes.description)[0] || "";
            }
            
            let s = item.attributes.status;
            if (s === "ongoing") manga.status = 1;
            else if (s === "completed") manga.status = 2;
            else if (s === "hiatus") manga.status = 3;
            else if (s === "cancelled") manga.status = 4;
            
            if (item.attributes.tags) {
                for (let i = 0; i < item.attributes.tags.length; i++) {
                    let tag = item.attributes.tags[i];
                    if (tag.attributes && tag.attributes.name && tag.attributes.name.en) {
                        manga.genres.push(tag.attributes.name.en);
                    }
                }
            }
        }
        
        if (item.relationships) {
            let coverArt = item.relationships.find(x => x.type === "cover_art");
            if (coverArt && coverArt.attributes && coverArt.attributes.fileName) {
                manga.thumbnailUrl = `https://uploads.mangadex.org/covers/${item.id}/${coverArt.attributes.fileName}.512.jpg`;
            }
            
            let authors = item.relationships.filter(x => x.type === "author" || x.type === "artist");
            let authorNames = [];
            for (let i = 0; i < authors.length; i++) {
                if (authors[i].attributes && authors[i].attributes.name) {
                    if (!authorNames.includes(authors[i].attributes.name)) {
                        authorNames.push(authors[i].attributes.name);
                    }
                }
            }
            manga.author = authorNames.join(", ");
        }
        
        return manga;
    },

    getChapterList: function(mangaUrl) {
        let id = mangaUrl.replace("/manga/", "").split("/")[0];
        let offset = 0;
        let limit = 500;
        let allChapters = [];
        let total = 0;
        
        do {
            let reqUrl = `${this.apiUrl}/manga/${id}/feed?limit=${limit}&offset=${offset}${this.getTranslatedLangsParam()}&order[chapter]=desc&order[volume]=desc&includes[]=scanlation_group`;
            let response = fetch(reqUrl);
            if (response.status !== 200) break;
            
            let json = JSON.parse(response.body);
            if (!json || json.result !== "ok" || !json.data) break;
            
            for (let i = 0; i < json.data.length; i++) {
                let item = json.data[i];
                let chapter = {
                    title: "",
                    url: `/chapter/${item.id}`,
                    chapterNumber: 0,
                    volumeNumber: "",
                    scanlator: "",
                    dateUpload: 0
                };
                
                if (item.attributes) {
                    let vol = item.attributes.volume ? `Vol.${item.attributes.volume} ` : "";
                    let ch = item.attributes.chapter ? `Ch.${item.attributes.chapter} ` : "";
                    let title = item.attributes.title ? `- ${item.attributes.title}` : "";
                    
                    if (!vol && !ch && !title) {
                        chapter.title = "Oneshot";
                    } else {
                        chapter.title = `${vol}${ch}${title}`.trim();
                        // Prepend language to title
                        let lang = item.attributes.translatedLanguage;
                        if (lang) {
                            chapter.title = `[${lang.toUpperCase()}] ${chapter.title}`;
                        }
                    }
                    
                    if (item.attributes.chapter) {
                        chapter.chapterNumber = parseFloat(item.attributes.chapter);
                    }
                    if (item.attributes.publishAt) {
                        chapter.dateUpload = Date.parse(item.attributes.publishAt);
                    }
                }
                
                if (item.relationships) {
                    let scanlators = item.relationships.filter(x => x.type === "scanlation_group");
                    let scNames = [];
                    for (let j = 0; j < scanlators.length; j++) {
                        if (scanlators[j].attributes && scanlators[j].attributes.name) {
                            scNames.push(scanlators[j].attributes.name);
                        }
                    }
                    chapter.scanlator = scNames.join(", ");
                }
                
                allChapters.push(chapter);
            }
            
            total = json.total || 0;
            offset += limit;
        } while (offset < total);
        
        return allChapters;
    },

    getPageList: function(chapterUrl) {
        let id = chapterUrl.replace("/chapter/", "").split("/")[0];
        let reqUrl = `${this.apiUrl}/at-home/server/${id}`;
        
        let response = fetch(reqUrl);
        if (response.status !== 200) return [];
        
        let json = JSON.parse(response.body);
        if (!json || json.result !== "ok" || !json.chapter) return [];
        
        let pages = [];
        let baseUrl = json.baseUrl;
        let hash = json.chapter.hash;
        let data = json.chapter.data;
        
        for (let i = 0; i < data.length; i++) {
            pages.push(`${baseUrl}/data/${hash}/${data[i]}`);
        }
        
        return pages;
    }
};
