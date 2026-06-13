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

namespace Yomic.Extensions.Komikindo
{
    public class KomikindoSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "Komikindo";
        public override string BaseUrl => "https://komikindo.bid";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;

        public override string Version => "1.0.0";
        public override string IconUrl => "https://www.google.com/s2/favicons?domain=komikindo.bid&sz=128";
        public override string Description => "Baca Manga Bahasa Indonesia di Komikindo (MangaThemesia)";
        public override string Author => "Yomic Desktop";
        public override string IconBackground => "#0C0C0C";
        public override string IconForeground => "#FFFFFF";

        private const string MangaUrlDirectory = "/manga";

        protected override void ConfigureClient(HttpClient client)
        {
            client.DefaultRequestHeaders.Referrer = new Uri($"{BaseUrl}/");
        }

        // ===================================================================
        // HTML Helpers
        // ===================================================================

        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            Console.WriteLine($"[Komikindo] GET {url}");
            string html = "";
            try 
            {
                html = await Client.GetStringAsync(url);
            }
            catch(HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Forbidden || ex.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable)
            {
                Console.WriteLine($"[Komikindo] Access Denied ({ex.StatusCode}). Attempting Cloudflare Bypass...");
                try 
                {
                    html = await Yomic.Core.Services.CloudflareBypassService.Instance.GetContentAsync(url);
                }
                catch (Exception bypassEx)
                {
                    Console.WriteLine($"[Komikindo] Bypass Failed: {bypassEx.Message}");
                    throw;
                }
            }

            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        private string GetImageWithReferer(string url)
        {
            if (string.IsNullOrEmpty(url)) return "";
            if (url.Contains("linksaya.com"))
            {
                return $"{url}|Referer=https://linksaya.com/";
            }
            return $"{url}|Referer={BaseUrl}/";
        }

        private string AdjustCoverUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return "";
            if (!url.Contains("resize="))
            {
                if (url.Contains("?"))
                    url += "&resize=165,225";
                else
                    url += "?resize=165,225";
            }
            return GetImageWithReferer(url);
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
            string url = $"{BaseUrl}{MangaUrlDirectory}/?page={page}&status={statusParam}&order=update";
            return await ScrapeMangaList(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            return await GetMangaListAsync(page, Manga.UNKNOWN);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page, int status)
        {
            string statusParam = status == Manga.ONGOING ? "ongoing" : status == Manga.COMPLETED ? "completed" : "";
            string url = $"{BaseUrl}{MangaUrlDirectory}/?page={page}&status={statusParam}&order=popular";
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
            string url = $"{BaseUrl}{MangaUrlDirectory}/?page={page}&title={Uri.EscapeDataString(query)}&order=update";
            var result = await ScrapeMangaList(url);
            return result.Items;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string mangaId)
        {
            string slug = ExtractSlug(mangaId);
            string url = $"{BaseUrl}/{slug}/";

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
                            ?? doc.DocumentNode.SelectSingleNode("//div[@itemprop='description']//p")
                            ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'entry-content')]");
            if (synopsisNode != null)
                synopsis = System.Net.WebUtility.HtmlDecode(synopsisNode.InnerText).Trim();

            // Status
            int status = Manga.UNKNOWN;
            
            // Strategy 1: New Modern Theme (.meta-item) or (.kh-status)
            var newStatusNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'kh-status')]//span[contains(@class,'status-text')]");
            if (newStatusNode != null)
            {
                string st = newStatusNode.InnerText.Trim().ToLower();
                if (st.Contains("ongoing") || st.Contains("berjalan")) status = Manga.ONGOING;
                else if (st.Contains("completed") || st.Contains("tamat") || st.Contains("selesai")) status = Manga.COMPLETED;
                else if (st.Contains("hiatus")) status = Manga.ON_HIATUS;
                else if (st.Contains("dropped") || st.Contains("cancelled")) status = Manga.CANCELLED;
            }
            
            // Strategy 2: Classic MangaThemesia (.tsinfo > .imptdt)
            if (status == Manga.UNKNOWN)
            {
                var statusItems = doc.DocumentNode.SelectNodes("//div[contains(@class,'tsinfo')]//div[contains(@class,'imptdt')]");
                if (statusItems != null)
                {
                    foreach (var item in statusItems)
                    {
                        string text = item.InnerText.Trim().ToLower();
                        if (text.Contains("status"))
                        {
                            var val = item.SelectSingleNode(".//i") ?? item.SelectSingleNode(".//a");
                            if (val != null)
                            {
                                string st = val.InnerText.Trim().ToLower();
                                status = st switch
                                {
                                    "ongoing" or "berjalan" => Manga.ONGOING,
                                    "completed" or "tamat" or "selesai" => Manga.COMPLETED,
                                    "hiatus" => Manga.ON_HIATUS,
                                    "cancelled" or "dropped" => Manga.CANCELLED,
                                    _ => Manga.UNKNOWN
                                };
                            }
                        }
                    }
                }
            }

            // Author
            string author = "Unknown";
            
            // Strategy 1: New Modern Theme (.meta-item)
            var metaItems = doc.DocumentNode.SelectNodes("//div[contains(@class,'meta-item')]");
            if (metaItems != null)
            {
                foreach (var meta in metaItems)
                {
                    var labelNode = meta.SelectSingleNode(".//span[contains(@class,'meta-label')]");
                    if (labelNode != null)
                    {
                        string label = labelNode.InnerText.Trim().ToLower();
                        if (label.Contains("author") || label.Contains("penulis") || label.Contains("pengarang"))
                        {
                            var pillNode = meta.SelectSingleNode(".//span[contains(@class,'meta-pill')]");
                            if (pillNode != null)
                            {
                                string val = System.Net.WebUtility.HtmlDecode(pillNode.InnerText).Trim();
                                if (!string.IsNullOrEmpty(val)) author = val;
                            }
                            break;
                        }
                    }
                }
            }
            
            // Strategy 2: Classic MangaThemesia (.fmed)
            if (author == "Unknown")
            {
                var fmedItems = doc.DocumentNode.SelectNodes("//div[contains(@class,'fmed')]");
                if (fmedItems != null)
                {
                    foreach (var fmed in fmedItems)
                    {
                        var labelNode = fmed.SelectSingleNode(".//b");
                        if (labelNode == null) continue;
                        string label = labelNode.InnerText.Trim().ToLower();
                        if (label.Contains("penulis") || label.Contains("author") || label.Contains("pengarang"))
                        {
                            var valNode = fmed.SelectSingleNode(".//span");
                            if (valNode != null)
                            {
                                string val = System.Net.WebUtility.HtmlDecode(valNode.InnerText).Trim();
                                if (!string.IsNullOrEmpty(val)) author = val;
                            }
                            break;
                        }
                    }
                }
            }

            // Strategy 3: Table infotable
            string artist = "";
            if (status == Manga.UNKNOWN || author == "Unknown")
            {
                var infoRows = doc.DocumentNode.SelectNodes("//table[@class='infotable']//tr");
                if (infoRows != null)
                {
                    foreach (var row in infoRows)
                    {
                        var labelNode = row.SelectSingleNode("./td[1]");
                        var valueNode = row.SelectSingleNode("./td[2]");
                        if (labelNode != null && valueNode != null)
                        {
                            string label = labelNode.InnerText.Trim().ToLower();
                            string val = System.Net.WebUtility.HtmlDecode(valueNode.InnerText).Trim();
                            if (label.Contains("status"))
                            {
                                if (status == Manga.UNKNOWN)
                                {
                                    status = val.ToLower() switch
                                    {
                                        "ongoing" or "berjalan" => Manga.ONGOING,
                                        "completed" or "tamat" or "selesai" => Manga.COMPLETED,
                                        "hiatus" => Manga.ON_HIATUS,
                                        "cancelled" or "dropped" => Manga.CANCELLED,
                                        _ => Manga.UNKNOWN
                                    };
                                }
                            }
                            else if (label.Contains("author") || label.Contains("penulis") || label.Contains("pengarang"))
                            {
                                if (author == "Unknown" && !string.IsNullOrEmpty(val))
                                {
                                    author = val;
                                }
                            }
                            else if (label.Contains("artist") || label.Contains("ilustrator") || label.Contains("art"))
                            {
                                if (string.IsNullOrEmpty(artist) && !string.IsNullOrEmpty(val))
                                {
                                    artist = val;
                                }
                            }
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
                ThumbnailUrl = AdjustCoverUrl(cover),
                Description = synopsis,
                Author = author,
                Artist = string.IsNullOrEmpty(artist) ? null : artist,
                Status = status,
                Source = this.Id,
                Genre = genres
            };
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
            string slug = ExtractSlug(mangaId);
            string url = $"{BaseUrl}/{slug}/";
            var chapters = new List<Chapter>();

            try
            {
                var doc = await GetHtmlAsync(url);

                var chapterNodes = doc.DocumentNode.SelectNodes("//div[@id='chapterlist']//li")
                                ?? doc.DocumentNode.SelectNodes("//div[contains(@class,'eplister')]//li");

                if (chapterNodes == null) return chapters;

                foreach (var li in chapterNodes)
                {
                    var linkNode = li.SelectSingleNode(".//a");
                    if (linkNode == null) continue;

                    string href = linkNode.GetAttributeValue("href", "").Trim();
                    if (string.IsNullOrEmpty(href)) continue;

                    string numStr = li.SelectSingleNode(".//*[@data-num]")?.GetAttributeValue("data-num", "")
                                 ?? li.SelectSingleNode(".//span[contains(@class,'chapternum')]")?.InnerText.Trim()
                                 ?? "";
                    float chapterNum = ParseChapterNumber(numStr);

                    string chapterName = li.SelectSingleNode(".//span[contains(@class,'chapternum')]")?.InnerText.Trim()
                                      ?? $"Chapter {chapterNum}";

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
                Console.WriteLine($"[Komikindo] GetChapterListAsync error: {ex.Message}");
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

                // Strategy 1: Images in #readerarea
                var imgNodes = doc.DocumentNode.SelectNodes("//div[@id='readerarea']//img");
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

                // Strategy 2: ts_reader.run JSON
                if (pages.Count == 0)
                {
                    string htmlStr = doc.DocumentNode.OuterHtml;
                    var jsonMatch = Regex.Match(htmlStr, @"ts_reader\.run\((\{.*?\})\);", RegexOptions.Singleline);
                    if (jsonMatch.Success)
                    {
                        try
                        {
                            string jsonStr = jsonMatch.Groups[1].Value;
                            using var jsonDoc = JsonDocument.Parse(jsonStr);
                            var root = jsonDoc.RootElement;

                            if (root.TryGetProperty("sources", out var sources))
                            {
                                foreach (var source in sources.EnumerateArray())
                                {
                                    if (source.TryGetProperty("images", out var images))
                                    {
                                        foreach (var imgUrl in images.EnumerateArray())
                                        {
                                            string imgSrc = imgUrl.GetString() ?? "";
                                            if (!string.IsNullOrEmpty(imgSrc))
                                            {
                                                if (imgSrc.StartsWith("//")) imgSrc = "https:" + imgSrc;
                                                pages.Add(GetImageWithReferer(imgSrc));
                                            }
                                        }
                                        if (pages.Count > 0) break;
                                    }
                                }
                            }
                        }
                        catch (Exception jsonEx)
                        {
                            Console.WriteLine($"[Komikindo] ts_reader JSON parse error: {jsonEx.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Komikindo] GetPageListAsync error: {ex.Message}");
            }

            return pages;
        }

        // ===================================================================
        // Scraping Helpers
        // ===================================================================

        private async Task<(List<Manga> Items, int TotalPages)> ScrapeMangaList(string url)
        {
            var list = new List<Manga>();
            int totalPages = 999;
            try
            {
                var doc = await GetHtmlAsync(url);
                var seenSlugs = new HashSet<string>();

                var cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'bsx')]");
                if (cards == null)
                {
                    cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'bs')]");
                }
                if (cards == null)
                {
                    cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'uta')]");
                }

                if (cards != null)
                {
                    foreach (var card in cards)
                    {
                        var linkNode = card.SelectSingleNode(".//a");
                        if (linkNode == null) continue;

                        string href = linkNode.GetAttributeValue("href", "");
                        if (string.IsNullOrEmpty(href)) continue;

                        string slug = href.TrimEnd('/').Split('/').Last();
                        if (seenSlugs.Contains(slug)) continue;
                        seenSlugs.Add(slug);

                        string title = linkNode.GetAttributeValue("title", "");
                        if (string.IsNullOrEmpty(title))
                        {
                            var titleSpan = card.SelectSingleNode(".//div[contains(@class,'tt')]")
                                         ?? card.SelectSingleNode(".//span[contains(@class,'tt')]")
                                         ?? card.SelectSingleNode(".//h4");
                            title = titleSpan?.InnerText.Trim() ?? "";
                        }
                        if (string.IsNullOrEmpty(title)) continue;

                        var imgNode = card.SelectSingleNode(".//img[contains(@class,'ts-post-image')]")
                                   ?? card.SelectSingleNode(".//img");
                        string cover = ExtractCover(imgNode);

                        int status = Manga.UNKNOWN;
                        var statusNode = card.SelectSingleNode(".//span[contains(@class,'status')]");
                        if (statusNode != null)
                        {
                            string st = statusNode.InnerText.Trim().ToLower();
                            if (st.Contains("completed") || st.Contains("tamat") || st.Contains("selesai")) status = Manga.COMPLETED;
                            else if (st.Contains("ongoing") || st.Contains("berjalan")) status = Manga.ONGOING;
                            else if (st.Contains("dropped") || st.Contains("cancelled")) status = Manga.CANCELLED;
                            else if (st.Contains("hiatus")) status = Manga.ON_HIATUS;
                        }
                        else
                        {
                            status = Manga.ONGOING;
                        }

                        list.Add(new Manga
                        {
                            Title = System.Net.WebUtility.HtmlDecode(title).Trim(),
                            Url = slug,
                            ThumbnailUrl = AdjustCoverUrl(cover),
                            Source = this.Id,
                            Status = status
                        });
                    }
                }

                var lastPageNode = doc.DocumentNode.SelectSingleNode("//a[contains(@class,'last')]")
                                ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'pagination')]//a[last()-1]");
                if (lastPageNode != null)
                {
                    string lastHref = lastPageNode.GetAttributeValue("href", "");
                    var pageMatch = Regex.Match(lastHref, @"page=(\d+)");
                    if (pageMatch.Success)
                        int.TryParse(pageMatch.Groups[1].Value, out totalPages);
                }

                if (totalPages == 999)
                {
                    var nextPage = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'pagination')]//a[contains(@class,'next')]")
                                ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class,'hpage')]//a[contains(@class,'r')]");
                    if (nextPage == null && list.Count > 0)
                        totalPages = 1;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Komikindo] ScrapeMangaList error: {ex.Message}");
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
