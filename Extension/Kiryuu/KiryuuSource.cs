using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Text.Json;
using System.Text.Json.Serialization;
using Yomic.Core.Models;
using Yomic.Core.Sources;
using System.Net.Http;
using System.Text.RegularExpressions;
using HtmlAgilityPack;
using System.Globalization;

namespace Yomic.Extensions.Kiryuu
{
    public class KiryuuSource : HttpSource, IFilterableMangaSource
    {
        public override long Id => 20;
        public override string Name => "Kiryuu";
        public override string BaseUrl => "https://kiryuu03.com";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;

        private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };



        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            var html = await Client.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        private string GetImageWithReferer(string url)
        {
             if (string.IsNullOrEmpty(url)) return "";
             // Envira CDN images work better without the forced Referer
             if (url.Contains("envira-cdn")) return url; 
             return $"{url}|Referer={BaseUrl}/";
        }

        // --- Hybrid: Scrape Popular List (Project Page) ---
        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            string url = page == 1 ? $"{BaseUrl}/project/" : $"{BaseUrl}/project/?the_page={page}";
            return await ScrapeProjectManga(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
             string url = page == 1 ? $"{BaseUrl}/latest/" : $"{BaseUrl}/latest/?the_page={page}";
             var items = await ScrapeLatestManga(url);
             return (items, 999);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            var items = await GetPopularMangaAsync(page);
            return (items, 999); 
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetFilteredMangaAsync(int page, int sort, int status)
        {
             return await GetLatestMangaAsync(page);
        }

        // --- Project Scraper (Card-First, No Duplicates) ---
        private async Task<List<Manga>> ScrapeProjectManga(string url)
        {
            var list = new List<Manga>();
            try
            {
                Console.WriteLine($"[Kiryuu] Scraping Project URL: {url}");
                var doc = await GetHtmlAsync(url);
                var seenIds = new HashSet<string>();

                var container = doc.DocumentNode.SelectSingleNode("//div[@id='search-results']");
                var cards = container?.SelectNodes("./div");

                if (cards == null) return list;

                foreach (var card in cards)
                {
                    var titleNode = card.SelectSingleNode(".//h1") 
                                 ?? card.SelectSingleNode(".//h3") 
                                 ?? card.SelectSingleNode(".//h4")
                                 ?? card.SelectSingleNode(".//a[@title]"); 

                    var link = titleNode?.Name == "a" ? titleNode : titleNode?.SelectSingleNode(".//a");
                    if (link == null) link = card.SelectSingleNode(".//a[contains(@href, '/manga/')]");

                    if (link == null) continue;

                    var href = link.GetAttributeValue("href", "");
                    if (!href.Contains("/manga/")) continue;

                    var slug = href.TrimEnd('/').Split('/').Last();
                    if (seenIds.Contains(slug)) continue;
                    seenIds.Add(slug);

                    string title = titleNode?.InnerText.Trim() ?? "";
                    if (string.IsNullOrEmpty(title)) title = link.GetAttributeValue("title", "");

                    // Specific selector for cover image
                    var imgNode = card.SelectSingleNode(".//img[contains(@class, 'wp-post-image')]") 
                               ?? card.SelectSingleNode(".//img");
                    
                    string cover = "";
                    if (imgNode != null)
                    {
                        cover = imgNode.GetAttributeValue("src", "");
                        if (string.IsNullOrEmpty(cover) || cover.Contains("data:image")) 
                             cover = imgNode.GetAttributeValue("data-src", "");
                        if (string.IsNullOrEmpty(cover) || cover.Contains("data:image")) 
                             cover = imgNode.GetAttributeValue("data-lazy-src", "");
                        if (string.IsNullOrEmpty(cover) || cover.Contains("data:image")) 
                             cover = imgNode.GetAttributeValue("srcset", "").Split(',').FirstOrDefault()?.Split(' ').FirstOrDefault() ?? "";
                    }

                    long lastUpdate = DateTimeOffset.Now.ToUnixTimeMilliseconds();
                    var timeNode = card.SelectSingleNode(".//time");
                    if (timeNode != null)
                    {
                        string dateStr = timeNode.GetAttributeValue("datetime", "");
                        if (!string.IsNullOrEmpty(dateStr) && DateTimeOffset.TryParse(dateStr, out DateTimeOffset dt))
                            lastUpdate = dt.ToUnixTimeMilliseconds();
                    }

                    list.Add(new Manga
                    {
                        Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                        Url = slug,
                        ThumbnailUrl = GetImageWithReferer(cover),
                        Source = this.Id,
                        LastUpdate = lastUpdate,
                        Status = Manga.ONGOING
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Kiryuu] Scrape Project Error: {ex.Message}");
            }
            return list;
        }

        // --- Latest Scraper (Time-First) ---
        private async Task<List<Manga>> ScrapeLatestManga(string url)
        {
            var list = new List<Manga>();
            try
            {
                Console.WriteLine($"[Kiryuu] Scraping Latest URL: {url}");
                var doc = await GetHtmlAsync(url);
                var seenIds = new HashSet<string>();

                var timeNodes = doc.DocumentNode.SelectNodes("//time");
                if (timeNodes == null) return await ScrapeProjectManga(url); 

                foreach (var timeNode in timeNodes)
                {
                    long lastUpdate = DateTimeOffset.Now.ToUnixTimeMilliseconds();
                    string dateStr = timeNode.GetAttributeValue("datetime", "");
                    if (!string.IsNullOrEmpty(dateStr) && DateTimeOffset.TryParse(dateStr, out DateTimeOffset dt))
                        lastUpdate = dt.ToUnixTimeMilliseconds();

                    HtmlNode card = timeNode.ParentNode;
                    HtmlNode titleNode = null;
                    HtmlNode imgNode = null;

                    for(int i=0; i<5 && card != null; i++)
                    {
                        titleNode = card.SelectSingleNode(".//h1") ?? card.SelectSingleNode(".//h3") ?? card.SelectSingleNode(".//h4") ?? card.SelectSingleNode(".//a[@title]");
                        if (titleNode == null)
                        {
                            var links = card.SelectNodes(".//a");
                            if (links != null)
                                foreach(var l in links)
                                    if(l.GetAttributeValue("href", "").Contains("/manga/") && !string.IsNullOrEmpty(l.InnerText.Trim()))
                                    { titleNode = l; break; }
                        }
                        imgNode = card.SelectSingleNode(".//img");
                        if (titleNode != null && imgNode != null) break;
                        card = card.ParentNode;
                    }

                    if (titleNode != null)
                    {
                        var link = titleNode.Name == "a" ? titleNode : titleNode.SelectSingleNode(".//a");
                        if (link == null) link = card.SelectSingleNode(".//a[contains(@href, '/manga/')]");
                        
                        if (link != null)
                        {
                            var href = link.GetAttributeValue("href", "");
                            var slug = href.TrimEnd('/').Split('/').Last();
                            if (seenIds.Contains(slug)) continue; 
                            seenIds.Add(slug);

                            string title = titleNode.InnerText.Trim();
                            if (string.IsNullOrEmpty(title)) title = link.GetAttributeValue("title", "");
                            
                            string cover = "";
                            if (imgNode != null)
                            {
                                cover = imgNode.GetAttributeValue("src", "");
                                if (string.IsNullOrEmpty(cover) || cover.Contains("data:image")) 
                                     cover = imgNode.GetAttributeValue("data-src", "");
                                if (string.IsNullOrEmpty(cover) || cover.Contains("data:image")) 
                                     cover = imgNode.GetAttributeValue("data-lazy-src", "");
                                if (string.IsNullOrEmpty(cover) || cover.Contains("data:image")) 
                                     cover = imgNode.GetAttributeValue("srcset", "").Split(',').FirstOrDefault()?.Split(' ').FirstOrDefault() ?? "";
                            }

                            list.Add(new Manga
                            {
                                Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                                Url = slug, 
                                ThumbnailUrl = GetImageWithReferer(cover),
                                Source = this.Id,
                                LastUpdate = lastUpdate, 
                                Status = Manga.ONGOING 
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Kiryuu] Scrape Latest Error: {ex.Message}");
            }
            return list;
        }

        // --- API: Search, Details, Chapters ---
        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            string url = $"{BaseUrl}/wp-json/wp/v2/manga?search={System.Net.WebUtility.UrlEncode(query)}&page={page}&_embed";
            var result = await FetchMangaListTuple(url);
            return result.Items;
        }

        private async Task<(List<Manga> Items, int TotalPages)> FetchMangaListTuple(string url)
        {
            var list = new List<Manga>();
            int totalPages = 1;
            try
            {
                var response = await Client.GetAsync(url);
                response.EnsureSuccessStatusCode();
                if (response.Headers.TryGetValues("X-WP-TotalPages", out var values))
                   int.TryParse(values.FirstOrDefault(), out totalPages);
                var json = await response.Content.ReadAsStringAsync();
                var wpMangas = JsonSerializer.Deserialize<List<WpManga>>(json, _jsonOptions);
                if (wpMangas != null) foreach (var item in wpMangas) list.Add(MapWpMangaToManga(item));
            }
            catch { }
            return (list, totalPages);
        }

        public override async Task<Manga> GetMangaDetailsAsync(string id)
        {
            string url;
            bool isNumeric = long.TryParse(id, out _);
            if (isNumeric) url = $"{BaseUrl}/wp-json/wp/v2/manga/{id}?_embed";
            else 
            {
                string slug = id.TrimEnd('/').Split('/').Last();
                url = $"{BaseUrl}/wp-json/wp/v2/manga?slug={slug}&_embed";
            }
            try
            {
                var response = await Client.GetAsync(url);
                var json = await response.Content.ReadAsStringAsync();
                WpManga wpManga = isNumeric ? JsonSerializer.Deserialize<WpManga>(json, _jsonOptions) 
                                            : JsonSerializer.Deserialize<List<WpManga>>(json, _jsonOptions)?.FirstOrDefault();
                if (wpManga != null) return MapWpMangaToManga(wpManga);
            }
            catch { }
            throw new Exception("Manga not found");
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
             // 1. Resolve to Numeric ID if slug/url is passed
             if (!long.TryParse(mangaId, out _))
            {
                string slug = mangaId.TrimEnd('/').Split('/').Last();
                string lookupUrl = $"{BaseUrl}/wp-json/wp/v2/manga?slug={slug}";
                try 
                {
                    var json = await Client.GetStringAsync(lookupUrl);
                    var list = JsonSerializer.Deserialize<List<WpManga>>(json, _jsonOptions);
                    if(list != null && list.Count > 0) 
                        mangaId = list[0].Id.ToString();
                    else 
                        return new List<Chapter>();
                } 
                catch { return new List<Chapter>(); }
            }

            // 2. Fetch Chapters using Numeric ID - Use high per_page to get all chapters
            string url = $"{BaseUrl}/wp-json/kiru/v1/chapter?parent_id={mangaId}&per_page=2000";
            var chapters = new List<Chapter>();
            try
            {
                var json = await Client.GetStringAsync(url);
                var kiruChapters = JsonSerializer.Deserialize<List<KiruChapter>>(json, _jsonOptions);
                if (kiruChapters != null)
                {
                    foreach (var kc in kiruChapters)
                    {
                        var chapter = new Chapter
                        {
                            Id = kc.Id, 
                            MangaId = long.Parse(mangaId),
                            Name = kc.Title ?? $"Chapter {kc.Number}",
                            Url = kc.Id.ToString(), 
                            ChapterNumber = ParseFloat(kc.Number)
                        };

                        // Use actual date if available, otherwise fallback to reasonable guess
                        if (!string.IsNullOrEmpty(kc.Date) && DateTimeOffset.TryParse(kc.Date, out var dt))
                            chapter.DateUpload = dt.ToUnixTimeMilliseconds();
                        else
                            chapter.DateUpload = DateTimeOffset.Now.ToUnixTimeMilliseconds();

                        chapters.Add(chapter);
                    }
                }
            }
            catch { }

            // 3. Sort numerically descending
            return chapters.OrderByDescending(c => c.ChapterNumber).ToList();
        }

        public override async Task<List<string>> GetPageListAsync(string chapterId)
        {
             string url = $"{BaseUrl}/wp-json/kiru/v1/chapter?id={chapterId}";
            var pages = new List<string>();
            try
            {
                var json = await Client.GetStringAsync(url);
                var chapter = JsonSerializer.Deserialize<KiruChapter>(json, _jsonOptions);
                if (chapter != null && !string.IsNullOrEmpty(chapter.Content))
                {
                    var doc = new HtmlAgilityPack.HtmlDocument();
                    doc.LoadHtml(chapter.Content);
                    var imgs = doc.DocumentNode.SelectNodes("//img");
                    if (imgs != null)
                        foreach (var img in imgs)
                        {
                             var src = img.GetAttributeValue("data-src", "");
                             if (string.IsNullOrEmpty(src)) src = img.GetAttributeValue("data-original", "");
                             if (string.IsNullOrEmpty(src)) src = img.GetAttributeValue("src", "");

                             if (!string.IsNullOrEmpty(src) && !src.Contains("histats") && !src.Contains("stats.")) 
                             {
                                 src = src.Trim();
                                 if(src.StartsWith("//")) src = "https:" + src;
                                 pages.Add(GetImageWithReferer(src));
                             }
                        }
                }
            }
            catch { }
            return pages;
        }

        private Manga MapWpMangaToManga(WpManga item)
        {
             var m = new Manga
            {
                Title = System.Net.WebUtility.HtmlDecode(item.Title?.Rendered ?? ""),
                Url = item.Slug, // Use Slug instead of ID for readable/browsable URL
                Source = this.Id,
                Description = StripHtml(System.Net.WebUtility.HtmlDecode(item.Content?.Rendered ?? "")),
                Status = Manga.UNKNOWN,
                Author = "Unknown",
                Genre = new List<string>()
            };

            if (item.Embedded?.FeaturedMedia != null && item.Embedded.FeaturedMedia.Count > 0)
            {
                m.ThumbnailUrl = GetImageWithReferer(item.Embedded.FeaturedMedia[0].SourceUrl);
            }

            if (item.Embedded?.Terms != null)
            {
                foreach (var termList in item.Embedded.Terms)
                {
                    foreach (var term in termList)
                    {
                        string name = System.Net.WebUtility.HtmlDecode(term.Name).Trim();
                        string tax = term.Taxonomy?.ToLower() ?? "";

                        if (tax == "genres" || tax == "genre")
                        {
                            m.Genre.Add(name);
                        }
                        else if (tax == "status")
                        {
                            m.Status = term.Slug.ToLower() switch
                            {
                                "ongoing" => Manga.ONGOING,
                                "completed" => Manga.COMPLETED,
                                "hiatus" => Manga.ON_HIATUS,
                                _ => Manga.UNKNOWN
                            };
                        }
                        else if (tax == "author")
                        {
                            m.Author = name;
                        }
                        else if (tax == "artist")
                        {
                           if(m.Author == "Unknown") m.Author = name;
                           else m.Author += ", " + name;
                        }
                    }
                }
            }
            return m;
        }

        private string StripHtml(string input)
        {
            if (string.IsNullOrEmpty(input)) return input;
            return Regex.Replace(input, "<.*?>", String.Empty).Trim();
        }

        private float ParseFloat(string num)
        {
            if (string.IsNullOrEmpty(num)) return 0;
            try
            {
                // Extract numeric part (e.g. "1160 - FIX" -> "1160", "913,5" -> "913.5")
                string cleaned = num.Replace(",", ".");
                var match = Regex.Match(cleaned, @"(\d+(\.\d+)?)");
                if (match.Success && float.TryParse(match.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out float result))
                    return result;
            }
            catch { }
            return 0;
        }
        
        private class WpManga {
            [JsonPropertyName("id")] public int Id { get; set; }
            [JsonPropertyName("slug")] public string Slug { get; set; }
            [JsonPropertyName("title")] public WpRendered Title { get; set; }
            [JsonPropertyName("content")] public WpRendered Content { get; set; }
            [JsonPropertyName("_embedded")] public WpEmbedded Embedded { get; set; }
        }
        private class WpRendered { [JsonPropertyName("rendered")] public string Rendered { get; set; } }
        
        private class WpEmbedded { 
            [JsonPropertyName("wp:featuredmedia")] public List<WpMedia> FeaturedMedia { get; set; }
            [JsonPropertyName("wp:term")] public List<List<WpTerm>> Terms { get; set; }
        }
        
        private class WpMedia { 
            [JsonPropertyName("source_url")] public string SourceUrl { get; set; }
        }

        private class WpTerm { 
            [JsonPropertyName("id")] public int Id { get; set; }
            [JsonPropertyName("name")] public string Name { get; set; }
            [JsonPropertyName("slug")] public string Slug { get; set; }
            [JsonPropertyName("taxonomy")] public string Taxonomy { get; set; }
            [JsonPropertyName("link")] public string Link { get; set; }
        }
        
        private class KiruChapter {
            [JsonPropertyName("id")] public long Id { get; set; }
            [JsonPropertyName("title")] public string Title { get; set; }
            [JsonPropertyName("number")] public string Number { get; set; }
            [JsonPropertyName("content")] public string Content { get; set; }
            [JsonPropertyName("date")] public string Date { get; set; }
            [JsonPropertyName("modified")] public string Modified { get; set; }
        }
    }
}
