var source = {
    id: 3639673976007021338,
    name: "Kiryuu",
    baseUrl: "https://v6.kiryuu.to",
    apiUrl: "https://v6.kiryuu.to/wp-json/wp/v2",
    language: "id",
    version: "1.0.0",
    description: "Baca komik Bahasa Indonesia dari Kiryuu",
    author: "DesktopKomik",
    iconUrl: "https://v6.kiryuu.to/wp-content/uploads/2021/10/cropped-logo-icon-kiryuu-1-456248-udlqjluy-194445-3fNc9Wlc-192x192.png",
    iconBackground: "#3b0764",
    iconForeground: "#f5d0fe",
    isNsfw: true,
    isHasMorePages: true,

    pageSize: 24,

    getPopularManga: function(page) {
        return this.getRestMangaPage(page, "");
    },

    getLatestUpdates: function(page) {
        return this.getRestMangaPage(page, "&orderby=modified");
    },

    getSearchManga: function(query, page) {
        query = (query || "").trim();
        if (!query) return this.getPopularManga(page);
        return this.getRestMangaPage(page, "&search=" + encodeURIComponent(query));
    },

    getRestMangaPage: function(page, extraQuery) {
        page = Math.max(1, page || 1);
        let url = this.apiUrl + "/manga?per_page=" + this.pageSize + "&page=" + page + "&_embed=wp:featuredmedia" + (extraQuery || "");
        let data = this.getJson(url);
        if (!data || !data.length) return { items: [], totalPages: page };

        let items = [];
        for (let i = 0; i < data.length; i++) {
            let manga = data[i];
            let link = manga.link || "";
            items.push({
                title: this.cleanText(this.valueAt(manga, ["title", "rendered"]) || this.titleFromUrl(link)),
                url: this.relativeUrl(link),
                thumbnailUrl: this.extractEmbeddedCover(manga),
                status: this.extractPostStatus(manga),
                source: this.id
            });
        }

        return {
            items: items,
            totalPages: items.length >= this.pageSize ? page + 1 : page
        };
    },

    getMangaDetails: function(url) {
        let absUrl = this.absoluteUrl(url);
        let slug = this.extractMangaSlug(absUrl);
        let data = this.getJson(this.apiUrl + "/manga?slug=" + encodeURIComponent(slug) + "&_embed=wp:featuredmedia");
        let manga = data && data.length ? data[0] : null;

        if (manga) {
            return {
                title: this.cleanText(this.valueAt(manga, ["title", "rendered"]) || this.titleFromUrl(absUrl)),
                url: this.relativeUrl(manga.link || absUrl),
                thumbnailUrl: this.extractEmbeddedCover(manga),
                author: "",
                status: this.extractPostStatus(manga),
                description: this.stripHtml(this.valueAt(manga, ["content", "rendered"]) || this.valueAt(manga, ["excerpt", "rendered"]) || ""),
                genre: this.extractClassListValues(manga.class_list || [], "genre-"),
                source: this.id
            };
        }

        let html = this.getHtml(absUrl);
        if (!html || this.isBlockedHtml(html)) return {};
        let doc = Html.parse(html, absUrl);
        return {
            title: this.textOf(doc, "h1") || this.titleFromUrl(absUrl),
            url: this.relativeUrl(absUrl),
            thumbnailUrl: this.attrAbsOf(doc, "article img.wp-post-image, img.wp-post-image", "src"),
            author: "",
            status: this.mapStatus(this.matchFirst(html, /status-([a-z-]+)/i)),
            description: this.stripHtml(this.matchFirst(html, /<div[^>]+data-slot="panel"[^>]*>([\s\S]*?)<div id="chapter-list"/i)),
            genre: [],
            source: this.id
        };
    },

    getChapterList: function(mangaUrl) {
        let mangaId = this.extractMangaId(mangaUrl);
        if (!mangaId) return this.parseChapterListFromDetail(mangaUrl);

        let url = this.baseUrl + "/wp-admin/admin-ajax.php?manga_id=" + encodeURIComponent(mangaId) + "&page=1&action=chapter_list";
        let html = this.getHtml(url);
        let chapters = this.parseChapterListHtml(html, url);
        return chapters.length ? chapters : this.parseChapterListFromDetail(mangaUrl);
    },

    getPageList: function(chapterUrl) {
        let absUrl = this.absoluteUrl(chapterUrl);
        let html = this.getHtml(absUrl);
        if (!html || this.isBlockedHtml(html)) return [];

        let main = this.matchFirst(html, /<main\b[^>]*>([\s\S]*?)<\/main>/i) || html;
        let pages = [];
        let seen = {};
        let re = /https?:\/\/[^"'<>\s]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'<>\s]*)?/gi;
        let match;

        while ((match = re.exec(main)) !== null) {
            let imageUrl = this.decodeHtml(match[0]).replace(/\\\//g, "/");
            if (this.isReaderImage(imageUrl) && !seen[imageUrl]) {
                seen[imageUrl] = true;
                pages.push(imageUrl + "|Referer=" + absUrl);
            }
        }

        return pages;
    },

    parseChapterListFromDetail: function(mangaUrl) {
        let absUrl = this.absoluteUrl(mangaUrl);
        let html = this.getHtml(absUrl);
        if (!html || this.isBlockedHtml(html)) return [];
        let chapters = this.parseChapterListHtml(html, absUrl);
        return this.uniqueChapters(chapters);
    },

    parseChapterListHtml: function(html, baseUrl) {
        let chapters = [];
        let re = /<a\b[^>]+href=["']([^"']*\/manga\/[^"']*\/chapter-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = re.exec(html || "")) !== null) {
            let href = this.decodeHtml(match[1]).trim();
            let name = this.stripHtml(match[2]) || this.titleFromUrl(href);
            if (!href || !name) continue;
            chapters.push({
                name: name,
                url: this.relativeUrl(this.toAbsolute(href, baseUrl)),
                dateUpload: this.parseDate(this.extractDateNear(html, match.index))
            });
        }

        return this.uniqueChapters(chapters);
    },

    uniqueChapters: function(chapters) {
        let seen = {};
        let out = [];
        for (let i = 0; i < chapters.length; i++) {
            let chapter = chapters[i];
            if (!chapter.url || seen[chapter.url]) continue;
            seen[chapter.url] = true;
            out.push(chapter);
        }
        return out;
    },

    extractMangaId: function(mangaUrl) {
        let absUrl = this.absoluteUrl(mangaUrl);
        let slug = this.extractMangaSlug(absUrl);
        if (!slug) return 0;
        let data = this.getJson(this.apiUrl + "/manga?slug=" + encodeURIComponent(slug) + "&_fields=id");
        return data && data.length && data[0].id ? data[0].id : 0;
    },

    extractEmbeddedCover: function(manga) {
        let media = this.valueAt(manga, ["_embedded", "wp:featuredmedia"]);
        if (media && media.length) {
            let item = media[0];
            return this.valueAt(item, ["media_details", "sizes", "card-thumbnail", "source_url"]) ||
                this.valueAt(item, ["media_details", "sizes", "medium", "source_url"]) ||
                item.source_url || "";
        }
        return "";
    },

    extractPostStatus: function(manga) {
        let classes = manga.class_list || [];
        for (let i = 0; i < classes.length; i++) {
            let status = this.mapStatus(classes[i]);
            if (status !== 0) return status;
        }
        return 0;
    },

    extractClassListValues: function(classes, prefix) {
        let values = [];
        let seen = {};
        for (let i = 0; i < classes.length; i++) {
            let value = classes[i] || "";
            if (value.indexOf(prefix) !== 0) continue;
            value = this.cleanText(value.substring(prefix.length).replace(/-/g, " "));
            if (value && !seen[value]) {
                seen[value] = true;
                values.push(value);
            }
        }
        return values;
    },

    extractDateNear: function(html, index) {
        let block = (html || "").substring(index, Math.min((html || "").length, index + 1200));
        return this.matchFirst(block, /<time[^>]+datetime=["']([^"']+)["']/i);
    },

    isReaderImage: function(url) {
        url = (url || "").toLowerCase();
        if (url.indexOf("logo-kiryuu") !== -1 || url.indexOf("cropped-logo") !== -1) return false;
        if (url.indexOf("/wp-content/uploads/") !== -1 && url.indexOf("cdn.uqni.net") === -1) return false;
        return url.indexOf("cdn.uqni.net") !== -1 || url.indexOf("/uploads/") !== -1;
    },

    extractMangaSlug: function(url) {
        let clean = this.relativeUrl(this.absoluteUrl(url)).split("?")[0].split("#")[0];
        let match = /\/manga\/([^\/]+)/i.exec(clean);
        return match ? match[1] : "";
    },

    titleFromUrl: function(url) {
        let parts = (url || "").split("?")[0].split("/").filter(x => x);
        return this.cleanText((parts.length ? parts[parts.length - 1] : "").replace(/\.\d+$/g, "").replace(/[-_]/g, " "));
    },

    mapStatus: function(status) {
        status = (status || "").toLowerCase();
        if (status.indexOf("ongoing") !== -1) return 1;
        if (status.indexOf("complete") !== -1 || status.indexOf("completed") !== -1 || status.indexOf("end") !== -1) return 2;
        return 0;
    },

    attrAbsOf: function(root, selector, attr) {
        let node = root.querySelector(selector);
        return node ? node.absUrl(attr) : "";
    },

    textOf: function(root, selector) {
        let node = root.querySelector(selector);
        return node ? this.cleanText(node.text()) : "";
    },

    stripHtml: function(value) {
        return this.cleanText((value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
    },

    cleanText: function(value) {
        return this.decodeHtml((value || "").replace(/\s+/g, " ").trim());
    },

    decodeHtml: function(value) {
        return (value || "")
            .replace(/\\u0026/g, "&")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, "\"")
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ");
    },

    valueAt: function(obj, path) {
        let current = obj;
        for (let i = 0; i < path.length; i++) {
            if (current === null || current === undefined) return "";
            current = current[path[i]];
        }
        return current === null || current === undefined ? "" : current;
    },

    matchFirst: function(text, regex) {
        let match = regex.exec(text || "");
        return match ? match[1] : "";
    },

    parseDate: function(value) {
        if (!value) return 0;
        let time = Date.parse(value);
        return isNaN(time) ? 0 : time;
    },

    isBlockedHtml: function(html) {
        html = (html || "").toLowerCase();
        return html.indexOf("just a moment") !== -1 ||
            html.indexOf("checking your browser") !== -1 ||
            html.indexOf("cloudflare ray id") !== -1 ||
            html.indexOf("internet-positif") !== -1;
    },

    absoluteUrl: function(url) {
        if (!url) return this.baseUrl;
        if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
        return this.baseUrl + (url.charAt(0) === "/" ? url : "/" + url);
    },

    toAbsolute: function(url, base) {
        if (!url) return "";
        url = url.trim();
        if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
        if (url.indexOf("//") === 0) return "https:" + url;
        return this.absoluteUrl(url);
    },

    relativeUrl: function(url) {
        if (!url) return "";
        return url.indexOf(this.baseUrl) === 0 ? url.substring(this.baseUrl.length) : url;
    },

    getHtml: function(url) {
        let response = fetch(url, {
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": this.baseUrl + "/"
            }
        });
        if (response.status < 200 || response.status >= 300) return "";
        return response.body;
    },

    getJson: function(url) {
        let response = fetch(url, {
            headers: {
                "Accept": "application/json",
                "Referer": this.baseUrl + "/"
            }
        });
        if (response.status < 200 || response.status >= 300) return null;
        return JSON.parse(response.body);
    }
};
