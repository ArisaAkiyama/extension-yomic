using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Yomic.Core.Models;
using Yomic.Core.Sources;

namespace Yomic.Extensions.Maid
{
    public class MaidSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "Maid";
        public override string BaseUrl => "https://www.maid.my.id";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;

        public override string Version => "1.0.0";
        public override string IconUrl => "https://www.maid.my.id/wp-content/uploads/2019/05/cropped-LogoMaid-192x192.png";
        public override string Description => "Baca Manga Bahasa Indonesia di Maid - Manga Indonesia";
        public override string Author => "Yomic Desktop";
        public override string IconBackground => "#1a1a2e";
        public override string IconForeground => "#ffffff";

        // ===================================================================
        // HTML Helpers
        // ===================================================================

        private async Task<HtmlDocument> GetHtmlDocumentAsync(string url)
        {
            var html = await Client.GetStringAsync(url);
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
            // Latest mode (infinite scroll) — use large totalPages so HasNextPage is always true
            // Similar approach to Komiku. Infinite scroll will stop naturally when 0 items are returned.
            string url = page > 1 ? $"{BaseUrl}/page/{page}/" : $"{BaseUrl}/";
            var (items, _) = await ScrapeLatestPage(url);
            Console.WriteLine($"[Maid] GetLatestMangaAsync page {page}: {items.Count} items, returning totalPages=1000 for infinite scroll");
            return (items, 1000);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            // Directory mode — use actual total pages from pagination
            string url = page > 1 ? $"{BaseUrl}/page/{page}/" : $"{BaseUrl}/";
            return await ScrapeLatestPage(url);
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
            string url = $"{BaseUrl}/?s={Uri.EscapeDataString(query)}";
            var result = await ScrapeLatestPage(url);
            return result.Items;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string mangaId)
        {
            string slug = ExtractSlug(mangaId);
            string url = $"{BaseUrl}/manga/{slug}/";

            var doc = await GetHtmlDocumentAsync(url);

            // Title from series-titlex h2
            string title = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-titlex')]//h2")?.InnerText.Trim()
                         ?? doc.DocumentNode.SelectSingleNode("//h2")?.InnerText.Trim()
                         ?? "Unknown Title";

            // Cover from series-thumb img
            var coverImg = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-thumb')]//img");
            string cover = ExtractCover(coverImg);

            // Synopsis from series-synops
            string synopsis = "";
            var synopsisNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-synops')]//p")
                            ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'series-synops')]");
            if (synopsisNode != null)
                synopsis = System.Net.WebUtility.HtmlDecode(synopsisNode.InnerText).Trim();

            // Author from series-infolist
            string author = "Unknown";
            int status = Manga.UNKNOWN;
            var infoItems = doc.DocumentNode.SelectNodes("//ul[contains(@class,'series-infolist')]//li");
            if (infoItems != null)
            {
                foreach (var item in infoItems)
                {
                    var label = item.SelectSingleNode(".//b");
                    var value = item.SelectSingleNode(".//span");
                    if (label == null || value == null) continue;

                    string labelText = label.InnerText.Trim().ToLower();
                    string valueText = System.Net.WebUtility.HtmlDecode(value.InnerText).Trim();

                    if (labelText.Contains("author"))
                    {
                        author = valueText;
                    }
                }
            }

            // Status from series-infoz block
            var statusNode = doc.DocumentNode.SelectSingleNode("//span[contains(@class,'status')]");
            if (statusNode != null)
            {
                string st = statusNode.InnerText.Trim().ToLower();
                status = st switch
                {
                    "ongoing" => Manga.ONGOING,
                    "completed" => Manga.COMPLETED,
                    "hiatus" => Manga.ON_HIATUS,
                    _ => Manga.UNKNOWN
                };
            }

            // Genres from series-genres
            var genreNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'series-genres')]//a");
            var genres = new List<string>();
            if (genreNodes != null)
                genres = genreNodes.Select(g => System.Net.WebUtility.HtmlDecode(g.InnerText).Trim()).ToList();

            return new Manga
            {
                Url = slug,
                Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                ThumbnailUrl = GetImageWithReferer(cover),
                Description = synopsis,
                Author = author,
                Status = status,
                Source = this.Id,
                Genre = genres
            };
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
            string slug = ExtractSlug(mangaId);
            string url = $"{BaseUrl}/manga/{slug}/";
            var chapters = new List<Chapter>();

            try
            {
                var doc = await GetHtmlDocumentAsync(url);

                // Chapter list: ul.series-chapterlist > li
                var chapterNodes = doc.DocumentNode.SelectNodes("//ul[contains(@class,'series-chapterlist')]//li");

                if (chapterNodes == null) return chapters;

                foreach (var li in chapterNodes)
                {
                    // Each chapter has: div.flexch > div.flexch-infoz > a
                    var linkNode = li.SelectSingleNode(".//div[contains(@class,'flexch-infoz')]//a")
                                ?? li.SelectSingleNode(".//a");
                    if (linkNode == null) continue;

                    string href = linkNode.GetAttributeValue("href", "").Trim();
                    if (string.IsNullOrEmpty(href)) continue;

                    // Chapter name from span text
                    string chapterName = linkNode.SelectSingleNode(".//span")?.InnerText.Trim() ?? "";
                    // Remove date from the chapter name if embedded
                    var dateSpan = linkNode.SelectSingleNode(".//span[@class='date']");
                    if (dateSpan != null)
                    {
                        chapterName = chapterName.Replace(dateSpan.InnerText, "").Trim();
                    }

                    if (string.IsNullOrEmpty(chapterName))
                        chapterName = linkNode.InnerText.Trim();

                    float chapterNum = ParseChapterNumber(chapterName);

                    // Date from span.date
                    string dateStr = dateSpan?.InnerText.Trim() ?? "";
                    long dateUpload = DateTimeOffset.Now.ToUnixTimeMilliseconds();
                    if (!string.IsNullOrEmpty(dateStr))
                    {
                        dateUpload = ParseIndonesianDate(dateStr);
                    }

                    chapters.Add(new Chapter
                    {
                        Url = href,
                        Name = System.Net.WebUtility.HtmlDecode(chapterName).Trim(),
                        ChapterNumber = chapterNum,
                        DateUpload = dateUpload
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Maid] GetChapterListAsync error: {ex.Message}");
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

                var doc = await GetHtmlDocumentAsync(url);

                // Images in div.reader-area (note: class, not id!)
                var imgNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'reader-area')]//img");
                
                // Fallback selectors
                if (imgNodes == null)
                    imgNodes = doc.DocumentNode.SelectNodes("//div[@id='reader-area']//img");
                if (imgNodes == null)
                    imgNodes = doc.DocumentNode.SelectNodes("//div[@id='readerarea']//img");
                
                Console.WriteLine($"[Maid] Reader images found: {imgNodes?.Count ?? 0}");
                if (imgNodes == null) return pages;

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
                        // Images are hosted on imgbox etc, no referer needed
                        pages.Add(src);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Maid] GetPageListAsync error: {ex.Message}");
            }

            return pages;
        }

        // ===================================================================
        // Scraping Helpers
        // ===================================================================

        /// <summary>
        /// Scrape latest manga from the home page or search results.
        /// Cards use div.flexbox4-item structure.
        /// </summary>
        private async Task<(List<Manga> Items, int TotalPages)> ScrapeLatestPage(string url)
        {
            var list = new List<Manga>();
            int totalPages = 1;
            try
            {
                var doc = await GetHtmlDocumentAsync(url);
                var seenSlugs = new HashSet<string>();

                // Cards: div.flexbox4-item
                var cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'flexbox4-item')]");
                Console.WriteLine($"[Maid] Cards found: {cards?.Count ?? 0}");

                if (cards != null)
                {
                    foreach (var card in cards)
                    {
                        // Link from the first anchor
                        var linkNode = card.SelectSingleNode(".//a[contains(@href,'/manga/')]");
                        if (linkNode == null) continue;

                        string href = linkNode.GetAttributeValue("href", "");
                        if (!href.Contains("/manga/")) continue;

                        string slug = href.TrimEnd('/').Split('/').Last();
                        if (seenSlugs.Contains(slug)) continue;
                        seenSlugs.Add(slug);

                        // Title
                        string title = linkNode.GetAttributeValue("title", "");
                        if (string.IsNullOrEmpty(title))
                        {
                            var titleDiv = card.SelectSingleNode(".//div[contains(@class,'title')]//a");
                            title = titleDiv?.InnerText.Trim() ?? "";
                        }
                        if (string.IsNullOrEmpty(title)) continue;

                        // Cover image
                        var imgNode = card.SelectSingleNode(".//div[contains(@class,'flexbox4-thumb')]//img")
                                   ?? card.SelectSingleNode(".//img");
                        string cover = ExtractCover(imgNode);

                        list.Add(new Manga
                        {
                            Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                            Url = slug,
                            ThumbnailUrl = GetImageWithReferer(cover),
                            Source = this.Id,
                            Status = Manga.UNKNOWN
                        });
                    }
                }

                Console.WriteLine($"[Maid] Manga items scraped: {list.Count}");

                // Extract total pages from pagination
                // Pagination: <div class="pagination"> with <a class="page-numbers" href=".../page/44/">44</a>
                var pageLinks = doc.DocumentNode.SelectNodes("//div[contains(@class,'pagination')]//a[contains(@class,'page-numbers') and not(contains(@class,'next'))]");
                Console.WriteLine($"[Maid] Pagination links found: {pageLinks?.Count ?? 0}");
                if (pageLinks != null)
                {
                    foreach (var link in pageLinks)
                    {
                        string pageHref = link.GetAttributeValue("href", "");
                        var pageMatch = Regex.Match(pageHref, @"/page/(\d+)/?");
                        if (pageMatch.Success && int.TryParse(pageMatch.Groups[1].Value, out int pNum))
                        {
                            if (pNum > totalPages) totalPages = pNum;
                        }
                    }
                }
                // Also check the current page span
                var currentPage = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'pagination')]//span[contains(@class,'current')]");
                if (currentPage != null && int.TryParse(currentPage.InnerText.Trim(), out int curPage))
                {
                    if (curPage > totalPages) totalPages = curPage;
                }
                
                Console.WriteLine($"[Maid] Total pages resolved: {totalPages}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Maid] ScrapeLatestPage error: {ex.Message}");
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
                // For /manga/slug/ -> return slug
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

        /// <summary>
        /// Parse Indonesian date strings like "Februari 18, 2026" or "20 Februari 2026"
        /// </summary>
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

                var parts = dateStr.Trim().Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries);

                // Try format "Februari 18, 2026" (Month Day, Year)
                if (parts.Length >= 3 && months.ContainsKey(parts[0]))
                {
                    if (months.TryGetValue(parts[0], out int month) &&
                        int.TryParse(parts[1].TrimEnd(','), out int day) &&
                        int.TryParse(parts[2], out int year))
                    {
                        var dt = new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.FromHours(7));
                        return dt.ToUnixTimeMilliseconds();
                    }
                }

                // Try format "20 Februari 2026" (Day Month Year)
                if (parts.Length >= 3 && int.TryParse(parts[0], out int d2))
                {
                    if (months.TryGetValue(parts[1], out int month2) &&
                        int.TryParse(parts[2], out int year2))
                    {
                        var dt = new DateTimeOffset(year2, month2, d2, 0, 0, 0, TimeSpan.FromHours(7));
                        return dt.ToUnixTimeMilliseconds();
                    }
                }

                // Try English month names (e.g. "Sep 14, 2018")
                if (DateTimeOffset.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTimeOffset parsed))
                    return parsed.ToUnixTimeMilliseconds();
            }
            catch { }

            return DateTimeOffset.Now.ToUnixTimeMilliseconds();
        }
    }
}
