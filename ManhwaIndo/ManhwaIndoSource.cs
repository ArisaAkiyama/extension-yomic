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

namespace Yomic.Extensions.ManhwaIndo
{
    public class ManhwaIndoSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "ManhwaIndo";
        public override string BaseUrl => "https://www.manhwaindo.my";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;

        public override string Version => "1.0.0";
        public override string IconUrl => "https://i2.wp.com/www.manhwaindo.my/wp-content/uploads/2025/11/fav-300x300.png";
        public override string Description => "Baca Manhwa Manga Manhua Bahasa Indonesia di ManhwaIndo";
        public override string Author => "Yomic Desktop";
        public override string IconBackground => "#1a1a2e";
        public override string IconForeground => "#ffffff";

        // ===================================================================
        // HTML Helpers
        // ===================================================================

        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            Console.WriteLine($"[ManhwaIndo] GET {url}");
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
            string url = $"{BaseUrl}/series/?page={page}&order=update";
            return await ScrapeMangaList(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            string url = $"{BaseUrl}/series/?page={page}&order=popular";
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
            string url = $"{BaseUrl}/series/?page={page}&title={Uri.EscapeDataString(query)}&order=update";
            var result = await ScrapeMangaList(url);
            return result.Items;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string mangaId)
        {
            // mangaId is the slug
            string slug = ExtractSlug(mangaId);
            string url = $"{BaseUrl}/series/{slug}/";

            var doc = await GetHtmlAsync(url);

            // Title
            string title = doc.DocumentNode.SelectSingleNode("//h1[@class='entry-title']")?.InnerText.Trim()
                         ?? doc.DocumentNode.SelectSingleNode("//h1")?.InnerText.Trim()
                         ?? "Unknown Title";

            // Cover
            var coverImg = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'thumb')]//img")
                        ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'sertothumb')]//img");
            string cover = ExtractCover(coverImg);

            // Synopsis
            string synopsis = "";
            var synopsisNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'entry-content')]/p")
                            ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'synp')]//p")
                            ?? doc.DocumentNode.SelectSingleNode("//div[@itemprop='description']//p");
            if (synopsisNode != null)
                synopsis = System.Net.WebUtility.HtmlDecode(synopsisNode.InnerText).Trim();

            // Info box (Author, Status, etc.)
            string author = "Unknown";
            int status = Manga.UNKNOWN;
            var infoItems = doc.DocumentNode.SelectNodes("//div[contains(@class,'infox')]//span")
                         ?? doc.DocumentNode.SelectNodes("//div[contains(@class,'tsinfo')]//div[contains(@class,'imptdt')]");
            if (infoItems != null)
            {
                foreach (var item in infoItems)
                {
                    string text = item.InnerText.Trim().ToLower();
                    if (text.Contains("author") || text.Contains("pengarang"))
                    {
                        var val = item.SelectSingleNode(".//i") ?? item.SelectSingleNode(".//a");
                        if (val != null) author = System.Net.WebUtility.HtmlDecode(val.InnerText).Trim();
                    }
                    else if (text.Contains("status"))
                    {
                        var val = item.SelectSingleNode(".//i") ?? item.SelectSingleNode(".//a");
                        if (val != null)
                        {
                            string st = val.InnerText.Trim().ToLower();
                            status = st switch
                            {
                                "ongoing" => Manga.ONGOING,
                                "completed" => Manga.COMPLETED,
                                "hiatus" => Manga.ON_HIATUS,
                                _ => Manga.UNKNOWN
                            };
                        }
                    }
                }
            }

            // Genres
            var genreNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'seriestugenre')]//a")
                          ?? doc.DocumentNode.SelectNodes("//span[contains(@class,'mgen')]//a");
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
            string url = $"{BaseUrl}/series/{slug}/";
            var chapters = new List<Chapter>();

            try
            {
                var doc = await GetHtmlAsync(url);

                // Chapter list items: #chapterlist li or .eplister li
                var chapterNodes = doc.DocumentNode.SelectNodes("//div[@id='chapterlist']//li")
                                ?? doc.DocumentNode.SelectNodes("//div[contains(@class,'eplister')]//li");

                if (chapterNodes == null) return chapters;

                foreach (var li in chapterNodes)
                {
                    var linkNode = li.SelectSingleNode(".//a");
                    if (linkNode == null) continue;

                    string href = linkNode.GetAttributeValue("href", "").Trim();
                    if (string.IsNullOrEmpty(href)) continue;

                    // Chapter number from data-num attribute or from text
                    string numStr = li.SelectSingleNode(".//*[@data-num]")?.GetAttributeValue("data-num", "")
                                 ?? li.SelectSingleNode(".//span[contains(@class,'chapternum')]")?.InnerText.Trim()
                                 ?? "";
                    float chapterNum = ParseChapterNumber(numStr);

                    // Chapter name
                    string chapterName = li.SelectSingleNode(".//span[contains(@class,'chapternum')]")?.InnerText.Trim()
                                      ?? $"Chapter {chapterNum}";

                    // Date
                    string dateStr = li.SelectSingleNode(".//span[contains(@class,'chapterdate')]")?.InnerText.Trim() ?? "";
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
                Console.WriteLine($"[ManhwaIndo] GetChapterListAsync error: {ex.Message}");
            }

            return chapters.OrderByDescending(c => c.ChapterNumber).ToList();
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            var pages = new List<string>();
            try
            {
                // chapterUrl is the full URL
                string url = chapterUrl;
                if (!url.StartsWith("http"))
                    url = $"{BaseUrl}/{chapterUrl.TrimStart('/')}";

                var doc = await GetHtmlAsync(url);

                // Images in #readerarea
                var imgNodes = doc.DocumentNode.SelectNodes("//div[@id='readerarea']//img");
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
                        pages.Add(GetImageWithReferer(src));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ManhwaIndo] GetPageListAsync error: {ex.Message}");
            }

            return pages;
        }

        // ===================================================================
        // Scraping Helpers
        // ===================================================================

        /// <summary>
        /// Scrape manga list from /series/ pages.
        /// Each manga card is a div.bsx containing an anchor with img + title.
        /// </summary>
        private async Task<(List<Manga> Items, int TotalPages)> ScrapeMangaList(string url)
        {
            var list = new List<Manga>();
            int totalPages = 999;
            try
            {
                var doc = await GetHtmlAsync(url);
                var seenSlugs = new HashSet<string>();

                // Cards: div.bsx > a
                var cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'bsx')]");
                if (cards == null)
                {
                    // Fallback: try listupd pattern
                    cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'bs')]");
                }

                if (cards != null)
                {
                    foreach (var card in cards)
                    {
                        var linkNode = card.SelectSingleNode(".//a");
                        if (linkNode == null) continue;

                        string href = linkNode.GetAttributeValue("href", "");
                        if (!href.Contains("/series/")) continue;

                        string slug = href.TrimEnd('/').Split('/').Last();
                        if (seenSlugs.Contains(slug)) continue;
                        seenSlugs.Add(slug);

                        // Title from the anchor title attribute or nested text
                        string title = linkNode.GetAttributeValue("title", "");
                        if (string.IsNullOrEmpty(title))
                        {
                            var titleSpan = card.SelectSingleNode(".//div[contains(@class,'tt')]")
                                         ?? card.SelectSingleNode(".//span[contains(@class,'tt')]");
                            title = titleSpan?.InnerText.Trim() ?? "";
                        }
                        if (string.IsNullOrEmpty(title)) continue;

                        // Cover image
                        var imgNode = card.SelectSingleNode(".//img[contains(@class,'ts-post-image')]")
                                   ?? card.SelectSingleNode(".//img");
                        string cover = ExtractCover(imgNode);

                        // Rating (optional)
                        var ratingNode = card.SelectSingleNode(".//*[contains(@class,'numscore')]");
                        
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

                // Try to extract total pages from pagination
                var lastPageNode = doc.DocumentNode.SelectSingleNode("//a[contains(@class,'last')]")
                                ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'pagination')]//a[last()-1]");
                if (lastPageNode != null)
                {
                    string lastHref = lastPageNode.GetAttributeValue("href", "");
                    var pageMatch = Regex.Match(lastHref, @"page=(\d+)");
                    if (pageMatch.Success)
                        int.TryParse(pageMatch.Groups[1].Value, out totalPages);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ManhwaIndo] ScrapeMangaList error: {ex.Message}");
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
                // For /series/slug/ -> return slug
                return segments.Last();
            }
            return input.Trim('/');
        }

        private static float ParseChapterNumber(string text)
        {
            if (string.IsNullOrEmpty(text)) return 0;
            // Extract number from text like "Chapter 65" or just "65"
            string cleaned = text.Replace(",", ".");
            var match = Regex.Match(cleaned, @"(\d+(\.\d+)?)");
            if (match.Success && float.TryParse(match.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out float result))
                return result;
            return 0;
        }

        /// <summary>
        /// Parse Indonesian date strings like "20 Februari 2026"
        /// </summary>
        private static long ParseIndonesianDate(string dateStr)
        {
            try
            {
                // Map Indonesian month names to numbers
                var months = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
                {
                    {"januari", 1}, {"februari", 2}, {"maret", 3}, {"april", 4},
                    {"mei", 5}, {"juni", 6}, {"juli", 7}, {"agustus", 8},
                    {"september", 9}, {"oktober", 10}, {"november", 11}, {"desember", 12}
                };

                var parts = dateStr.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 3)
                {
                    if (int.TryParse(parts[0], out int day) &&
                        months.TryGetValue(parts[1], out int month) &&
                        int.TryParse(parts[2], out int year))
                    {
                        var dt = new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.FromHours(7));
                        return dt.ToUnixTimeMilliseconds();
                    }
                }

                // Fallback: try standard parsing
                if (DateTimeOffset.TryParse(dateStr, out DateTimeOffset parsed))
                    return parsed.ToUnixTimeMilliseconds();
            }
            catch { }

            return DateTimeOffset.Now.ToUnixTimeMilliseconds();
        }
    }
}
