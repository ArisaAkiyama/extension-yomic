using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Yomic.Core.Models;
using Yomic.Core.Sources;

namespace Yomic.Extensions.CrotPedia
{
    public class CrotPediaSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "CrotPedia";
        public override string BaseUrl => "https://crotpedia.net";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;

        public override string Version => "1.0.0";
        public override string IconUrl => "https://www.google.com/s2/favicons?domain=crotpedia.net&sz=128";
        public override string Description => "Baca Manga Bahasa Indonesia di CrotPedia (ZManga)";
        public override string Author => "Yomic Desktop";
        public override string IconBackground => "#0c0d14";
        public override string IconForeground => "#ffffff";

        protected override void ConfigureClient(HttpClient client)
        {
            client.DefaultRequestHeaders.Referrer = new Uri($"{BaseUrl}/");
        }

        // ===================================================================
        // HTML Helpers
        // ===================================================================

        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            Console.WriteLine($"[CrotPedia] GET {url}");
            string html = await GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        private string GetImageWithReferer(string url)
        {
            if (string.IsNullOrEmpty(url)) return "";
            return $"{url}|Referer={BaseUrl}/";
        }

        private static string ExtractCover(HtmlNode? imgNode)
        {
            if (imgNode == null) return "";
            string src = imgNode.GetAttributeValue("src", "");
            if (string.IsNullOrEmpty(src) || src.Contains("data:image"))
                src = imgNode.GetAttributeValue("data-src", "");
            if (string.IsNullOrEmpty(src) || src.Contains("data:image"))
                src = imgNode.GetAttributeValue("data-lazy-src", "");
            return src?.Trim() ?? "";
        }

        // ===================================================================
        // IFilterableMangaSource
        // ===================================================================

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            return await GetLatestMangaAsync(page, Manga.UNKNOWN);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page, int status)
        {
            string statusParam = status == Manga.ONGOING ? "ongoing" : status == Manga.COMPLETED ? "completed" : "";
            string pageSegment = page > 1 ? $"page/{page}/" : "";
            string url = $"{BaseUrl}/advanced-search/{pageSegment}?status={statusParam}&order=update";
            return await ScrapeMangaList(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            return await GetMangaListAsync(page, Manga.UNKNOWN);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page, int status)
        {
            string statusParam = status == Manga.ONGOING ? "ongoing" : status == Manga.COMPLETED ? "completed" : "";
            string pageSegment = page > 1 ? $"page/{page}/" : "";
            string url = $"{BaseUrl}/advanced-search/{pageSegment}?status={statusParam}&order=popular";
            return await ScrapeMangaList(url);
        }

        // ===================================================================
        // HttpSource (abstract)
        // ===================================================================

        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            var result = await GetMangaListAsync(page);
            return result.Items;
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            string pageSegment = page > 1 ? $"page/{page}/" : "";
            string url = $"{BaseUrl}/advanced-search/{pageSegment}?title={Uri.EscapeDataString(query)}&order=update";
            var result = await ScrapeMangaList(url);
            return result.Items;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string mangaId)
        {
            string url = mangaId;
            if (!url.StartsWith("http"))
                url = $"{BaseUrl}/{mangaId.TrimStart('/')}";

            var doc = await GetHtmlAsync(url);

            // Title
            string title = doc.DocumentNode.SelectSingleNode("//h1[@class='entry-title']")?.InnerText.Trim()
                         ?? doc.DocumentNode.SelectSingleNode("//h1")?.InnerText.Trim()
                         ?? "Unknown Title";

            // Cover
            var coverImg = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-thumb')]//img");
            string cover = ExtractCover(coverImg);

            // Synopsis
            string synopsis = "";
            var synopsisNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-synops')]")
                            ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'entry-content')]");
            if (synopsisNode != null)
                synopsis = System.Net.WebUtility.HtmlDecode(synopsisNode.InnerText).Trim();

            // Status
            int status = Manga.UNKNOWN;
            var statusNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-infoz')]//*[contains(@class,'status')]");
            if (statusNode != null)
            {
                string st = statusNode.InnerText.Trim().ToLower();
                if (st.Contains("ongoing") || st.Contains("berjalan")) status = Manga.ONGOING;
                else if (st.Contains("completed") || st.Contains("tamat")) status = Manga.COMPLETED;
                else if (st.Contains("hiatus")) status = Manga.ON_HIATUS;
                else if (st.Contains("dropped") || st.Contains("cancelled")) status = Manga.CANCELLED;
            }

            // Author
            string author = "Unknown";
            var authorNode = doc.DocumentNode.SelectSingleNode("//ul[contains(@class,'series-infolist')]//li[contains(.,'Author')]//span")
                          ?? doc.DocumentNode.SelectSingleNode("//ul[contains(@class,'series-infolist')]//li[contains(.,'Penulis')]//span");
            if (authorNode != null)
            {
                string val = System.Net.WebUtility.HtmlDecode(authorNode.InnerText).Trim();
                if (!string.IsNullOrEmpty(val) && val != "-") author = val;
            }

            // Artist
            string artist = "Unknown";
            var artistNode = doc.DocumentNode.SelectSingleNode("//ul[contains(@class,'series-infolist')]//li[contains(.,'Artist')]//span")
                          ?? doc.DocumentNode.SelectSingleNode("//ul[contains(@class,'series-infolist')]//li[contains(.,'Artis')]//span");
            if (artistNode != null)
            {
                string val = System.Net.WebUtility.HtmlDecode(artistNode.InnerText).Trim();
                if (!string.IsNullOrEmpty(val) && val != "-") artist = val;
            }

            // Genres
            var genreNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'series-genres')]//a");
            var genres = new List<string>();
            if (genreNodes != null)
                genres = genreNodes.Select(g => System.Net.WebUtility.HtmlDecode(g.InnerText).Trim()).ToList();

            // Type
            var typeNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'block')]//span[contains(@class,'type')]");
            if (typeNode != null)
            {
                string typeVal = typeNode.InnerText.Trim();
                if (!string.IsNullOrEmpty(typeVal) && typeVal != "-" && !genres.Contains(typeVal, StringComparer.OrdinalIgnoreCase))
                {
                    genres.Add(typeVal);
                }
            }

            // Alternative Name
            var altNameNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-title')]//span");
            if (altNameNode != null)
            {
                string altName = altNameNode.InnerText.Trim();
                if (!string.IsNullOrEmpty(altName))
                {
                    synopsis = $"Alternative Name: {altName}\n\n{synopsis}";
                }
            }

            return new Manga
            {
                Url = mangaId,
                Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                ThumbnailUrl = GetImageWithReferer(cover),
                Description = synopsis,
                Author = author,
                Artist = artist,
                Status = status,
                Source = this.Id,
                Genre = genres
            };
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
            string url = mangaId;
            if (!url.StartsWith("http"))
                url = $"{BaseUrl}/{mangaId.TrimStart('/')}";
            var chapters = new List<Chapter>();

            try
            {
                var doc = await GetHtmlAsync(url);

                var chapterNodes = doc.DocumentNode.SelectNodes("//ul[contains(@class,'series-chapterlist')]//div[contains(@class,'flexch-infoz')]//a");

                if (chapterNodes == null) return chapters;

                foreach (var linkNode in chapterNodes)
                {
                    string href = linkNode.GetAttributeValue("href", "").Trim();
                    if (string.IsNullOrEmpty(href)) continue;

                    var nameSpan = linkNode.SelectSingleNode(".//span[not(contains(@class,'date'))]");
                    string name = nameSpan?.InnerText?.Trim() ?? linkNode.InnerText.Trim();
                    
                    if (string.IsNullOrEmpty(name))
                    {
                        var firstSpan = linkNode.SelectSingleNode(".//span");
                        name = firstSpan?.InnerText?.Trim() ?? "Chapter";
                    }

                    float chapterNum = ParseChapterNumber(name);

                    var dateSpan = linkNode.SelectSingleNode(".//span[contains(@class,'date')]");
                    string dateStr = dateSpan?.InnerText?.Trim() ?? "";
                    
                    long dateUpload = DateTimeOffset.Now.ToUnixTimeMilliseconds();
                    if (!string.IsNullOrEmpty(dateStr))
                    {
                        dateUpload = ParseIndonesianDate(dateStr);
                    }

                    chapters.Add(new Chapter
                    {
                        Url = href,
                        Name = System.Net.WebUtility.HtmlDecode(name).Trim(),
                        ChapterNumber = chapterNum,
                        DateUpload = dateUpload
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CrotPedia] GetChapterListAsync error: {ex.Message}");
            }

            return chapters.OrderByDescending(c => c.ChapterNumber).ToList();
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            var pages = new List<string>();
            try
            {
                string url = chapterUrl;
                if (!url.StartsWith("http"))
                    url = $"{BaseUrl}/{chapterUrl.TrimStart('/')}";

                var doc = await GetHtmlAsync(url);

                var imgNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'reader-area')]//img");
                if (imgNodes != null)
                {
                    foreach (var img in imgNodes)
                    {
                        string src = img.GetAttributeValue("src", "");
                        if (string.IsNullOrEmpty(src) || src.Contains("data:image"))
                            src = img.GetAttributeValue("data-src", "");
                        if (string.IsNullOrEmpty(src) || src.Contains("data:image"))
                            src = img.GetAttributeValue("data-lazy-src", "");

                        if (!string.IsNullOrEmpty(src) && !src.Contains("histats") && !src.Contains("stats."))
                        {
                            src = src.Trim();
                            if (src.StartsWith("//")) src = "https:" + src;
                            pages.Add(GetImageWithReferer(src));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CrotPedia] GetPageListAsync error: {ex.Message}");
            }

            return pages;
        }

        // ===================================================================
        // Scraping Helpers
        // ===================================================================

        private async Task<(List<Manga> Items, int TotalPages)> ScrapeMangaList(string url)
        {
            var list = new List<Manga>();
            int totalPages = 1;
            try
            {
                var doc = await GetHtmlAsync(url);
                var seenSlugs = new HashSet<string>();

                var cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'flexbox2-item')]");
                if (cards != null)
                {
                    foreach (var card in cards)
                    {
                        var linkNode = card.SelectSingleNode(".//div[contains(@class,'flexbox2-content')]//a");
                        if (linkNode == null) continue;

                        string href = linkNode.GetAttributeValue("href", "");
                        if (string.IsNullOrEmpty(href)) continue;

                        string relativeUrl = href;
                        if (href.StartsWith("http"))
                        {
                            try
                            {
                                var uri = new Uri(href);
                                relativeUrl = uri.PathAndQuery;
                            }
                            catch {}
                        }

                        string slug = ExtractSlug(href);
                        if (seenSlugs.Contains(slug)) continue;
                        seenSlugs.Add(slug);

                        var titleSpan = card.SelectSingleNode(".//div[contains(@class,'flexbox2-title')]//span")
                                     ?? card.SelectSingleNode(".//div[contains(@class,'flexbox2-title')]");
                        string title = titleSpan?.InnerText?.Trim() ?? "Unknown Title";

                        var imgNode = card.SelectSingleNode(".//img");
                        string cover = ExtractCover(imgNode);

                        list.Add(new Manga
                        {
                            Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                            Url = relativeUrl,
                            ThumbnailUrl = GetImageWithReferer(cover),
                            Source = this.Id,
                            Status = Manga.UNKNOWN
                        });
                    }
                }

                // Check pagination
                var nextButton = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'pagination')]//*[contains(@class,'next')]");
                if (nextButton != null)
                {
                    var lastPageNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'pagination')]//a[last()]");
                    if (lastPageNode != null)
                    {
                        string lastHref = lastPageNode.GetAttributeValue("href", "");
                        var pageMatch = Regex.Match(lastHref, @"/page/(\d+)");
                        if (pageMatch.Success && int.TryParse(pageMatch.Groups[1].Value, out int parsedPages))
                        {
                            totalPages = parsedPages;
                        }
                        else
                        {
                            var pageNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'pagination')]//a");
                            if (pageNodes != null)
                            {
                                int maxPage = 1;
                                foreach (var node in pageNodes)
                                {
                                    string nodeHref = node.GetAttributeValue("href", "");
                                    var match = Regex.Match(nodeHref, @"/page/(\d+)");
                                    if (match.Success && int.TryParse(match.Groups[1].Value, out int pageNum))
                                    {
                                        if (pageNum > maxPage) maxPage = pageNum;
                                    }
                                }
                                totalPages = maxPage;
                            }
                        }
                    }
                }
                
                if (totalPages <= 1 && nextButton != null)
                {
                    totalPages = 999;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CrotPedia] ScrapeMangaList error: {ex.Message}");
            }

            return (list, totalPages);
        }

        // ===================================================================
        // Utility Helpers
        // ===================================================================

        private static string ExtractSlug(string input)
        {
            if (string.IsNullOrEmpty(input)) return input;
            if (input.StartsWith("http"))
            {
                var uri = new Uri(input);
                var segments = uri.AbsolutePath.Trim('/').Split('/');
                return segments.Last();
            }
            return input.Trim('/');
        }

        private static float ParseChapterNumber(string text)
        {
            if (string.IsNullOrEmpty(text)) return 0;
            string cleaned = text.Replace(",", ".");
            var match = Regex.Match(cleaned, @"(\d+(\.\d+)?)");
            if (match.Success && float.TryParse(match.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out float result))
                return result;
            return 0;
        }

        private static long ParseIndonesianDate(string dateStr)
        {
            try
            {
                var months = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
                {
                    {"januari", 1}, {"februari", 2}, {"maret", 3}, {"april", 4},
                    {"mei", 5}, {"juni", 6}, {"juli", 7}, {"agustus", 8},
                    {"september", 9}, {"oktober", 10}, {"november", 11}, {"desember", 12}
                };

                var parts = dateStr.Trim().Replace(",", "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 3)
                {
                    if (months.TryGetValue(parts[0], out int month1) &&
                        int.TryParse(parts[1], out int day1) &&
                        int.TryParse(parts[2], out int year1))
                    {
                        var dt = new DateTimeOffset(year1, month1, day1, 0, 0, 0, TimeSpan.FromHours(7));
                        return dt.ToUnixTimeMilliseconds();
                    }

                    if (int.TryParse(parts[0], out int day2) &&
                        months.TryGetValue(parts[1], out int month2) &&
                        int.TryParse(parts[2], out int year2))
                    {
                        var dt = new DateTimeOffset(year2, month2, day2, 0, 0, 0, TimeSpan.FromHours(7));
                        return dt.ToUnixTimeMilliseconds();
                    }
                }

                if (DateTimeOffset.TryParse(dateStr, out DateTimeOffset parsed))
                    return parsed.ToUnixTimeMilliseconds();
            }
            catch { }

            return DateTimeOffset.Now.ToUnixTimeMilliseconds();
        }
    }
}
