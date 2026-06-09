using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Yomic.Core.Models;
using Yomic.Core.Sources;

namespace Yomic.Extensions.Aarlas
{
    public class AarlasSource : IMangaSource
    {
        public long Id => 123456789004;
        public string Name => "Aarlas";
        public string BaseUrl => "https://www.arlas.online";
        public string Language => "id";
        public bool IsHasMorePages => true;

        public string Version => "1.0.0";
        public string IconUrl => "https://raw.githubusercontent.com/ArisaAkiyama/extension-yomic/main/icons/aarlas.png";
        public string Description => "Baca Manga Bahasa Indonesia di Aarlas (ZeistManga)";
        public string Author => "Yomic Desktop";
        public string IconBackground => "#000000";
        public string IconForeground => "#ffffff";

        private readonly HttpClient _httpClient;

        public AarlasSource()
        {
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        }

        public Task<List<Manga>> GetPopularMangaAsync(int page) => GetMangaListInternalAsync(page, "");
        public Task<List<Manga>> GetSearchMangaAsync(string query, int page) => GetMangaListInternalAsync(page, query);

        private async Task<List<Manga>> GetMangaListInternalAsync(int page, string query = "")
        {
            var mangas = new List<Manga>();
            
            try
            {
                int maxResults = 20;
                int startIndex = (page - 1) * maxResults + 1;
                
                string url = $"{BaseUrl}/feeds/posts/default/-/Series?alt=json&max-results={maxResults}&start-index={startIndex}";
                if (!string.IsNullOrEmpty(query))
                {
                    // For ZeistManga, query usually uses `?q=query` but that's for the search page.
                    // If we use the feed api:
                    url = $"{BaseUrl}/feeds/posts/default?alt=json&q={Uri.EscapeDataString(query)}&max-results={maxResults}&start-index={startIndex}";
                }

                var response = await _httpClient.GetStringAsync(url);
                using var document = JsonDocument.Parse(response);
                
                if (document.RootElement.TryGetProperty("feed", out var feed) && feed.TryGetProperty("entry", out var entries))
                {
                    foreach (var entry in entries.EnumerateArray())
                    {
                        var manga = new Manga();
                        
                        if (entry.TryGetProperty("title", out var titleObj) && titleObj.TryGetProperty("$t", out var titleVal))
                        {
                            manga.Title = titleVal.GetString() ?? "";
                        }
                        
                        if (entry.TryGetProperty("media$thumbnail", out var thumbObj) && thumbObj.TryGetProperty("url", out var thumbVal))
                        {
                            manga.ThumbnailUrl = thumbVal.GetString()?.Replace("/s72-c/", "/s600/") ?? "";
                        }
                        else if (entry.TryGetProperty("content", out var contentObj) && contentObj.TryGetProperty("$t", out var contentVal))
                        {
                            // Try to extract img src from content
                            var html = contentVal.GetString();
                            if (!string.IsNullOrEmpty(html))
                            {
                                var htmlDoc = new HtmlDocument();
                                htmlDoc.LoadHtml(html);
                                var img = htmlDoc.DocumentNode.SelectSingleNode("//img");
                                if (img != null) manga.ThumbnailUrl = img.GetAttributeValue("src", "");
                            }
                        }
                        
                        if (entry.TryGetProperty("link", out var links))
                        {
                            foreach (var link in links.EnumerateArray())
                            {
                                if (link.TryGetProperty("rel", out var rel) && rel.GetString() == "alternate")
                                {
                                    manga.Url = link.GetProperty("href").GetString() ?? "";
                                    break;
                                }
                            }
                        }

                        // Add to list if valid
                        if (!string.IsNullOrEmpty(manga.Title) && !string.IsNullOrEmpty(manga.Url))
                        {
                            mangas.Add(manga);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Console.WriteLine($"[Aarlas] GetMangaListAsync Error: {ex.Message}");
            }
            
            return mangas;
        }

        public async Task<Manga> GetMangaDetailsAsync(string url)
        {
            var html = await _httpClient.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var manga = new Manga
            {
                Url = url,
                Title = doc.DocumentNode.SelectSingleNode("//h1[contains(@class, 'entry-title')]")?.InnerText.Trim() 
                    ?? doc.DocumentNode.SelectSingleNode("//h1[contains(@class, 'title')]")?.InnerText.Trim()
                    ?? doc.DocumentNode.SelectSingleNode("//h1")?.InnerText.Trim() 
                    ?? "Unknown"
            };

            var coverImg = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'grid')]//img");
            if (coverImg != null) manga.ThumbnailUrl = coverImg.GetAttributeValue("src", "");

            var synopsisNode = doc.DocumentNode.SelectSingleNode("//div[@id='synopsis']");
            if (synopsisNode != null) manga.Description = synopsisNode.InnerText.Trim();

            var infoNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'y6x11p')]");
            if (infoNodes != null)
            {
                foreach (var info in infoNodes)
                {
                    var text = info.InnerText.Trim().ToLower();
                    var dtNode = info.SelectSingleNode(".//span[@class='dt']");
                    if (dtNode == null) continue;
                    var val = dtNode.InnerText.Trim();

                    if (text.Contains("author") || text.Contains("pengarang")) manga.Author = val;
                    else if (text.Contains("artist") || text.Contains("ilustrator")) manga.Artist = val;
                    else if (text.Contains("status"))
                    {
                        var statusStr = val.ToLower();
                        if (statusStr.Contains("ongoing") || statusStr.Contains("berjalan")) manga.Status = Manga.ONGOING;
                        else if (statusStr.Contains("completed") || statusStr.Contains("tamat")) manga.Status = Manga.COMPLETED;
                        else manga.Status = Manga.UNKNOWN;
                    }
                }
            }

            var genreNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'mt-15')]//a[@rel='tag']");
            if (genreNodes != null)
            {
                manga.Genre = genreNodes.Select(n => n.InnerText.Trim()).ToList();
            }

            return manga;
        }

        public async Task<List<Chapter>> GetChapterListAsync(string mangaUrl)
        {
            var chapters = new List<Chapter>();

            try
            {
                // Fetch the manga HTML to get the feed name
                var html = await _httpClient.GetStringAsync(mangaUrl);
                var doc = new HtmlDocument();
                doc.LoadHtml(html);

                var scriptNode = doc.DocumentNode.SelectSingleNode("//div[@id='clwd']/script");
                string feedName = "";

                if (scriptNode != null)
                {
                    var match = System.Text.RegularExpressions.Regex.Match(scriptNode.InnerHtml, @"clwd\.run\(['""]([^'""]+)['""]\)");
                    if (match.Success)
                    {
                        feedName = match.Groups[1].Value;
                    }
                }

                if (string.IsNullOrEmpty(feedName))
                {
                    // Fallback to checking the category from the manga page
                    throw new Exception("Feed name for chapters not found.");
                }

                // Fetch chapter list using the Blogger API
                string apiUrl = $"{BaseUrl}/feeds/posts/default/-/Chapter/{Uri.EscapeDataString(feedName)}?alt=json&max-results=9999";
                var response = await _httpClient.GetStringAsync(apiUrl);
                
                using var document = JsonDocument.Parse(response);
                if (document.RootElement.TryGetProperty("feed", out var feed) && feed.TryGetProperty("entry", out var entries))
                {
                    foreach (var entry in entries.EnumerateArray())
                    {
                        var chapter = new Chapter();
                        
                        if (entry.TryGetProperty("title", out var titleObj) && titleObj.TryGetProperty("$t", out var titleVal))
                        {
                            chapter.Name = titleVal.GetString() ?? "";
                        }
                        
                        if (entry.TryGetProperty("link", out var links))
                        {
                            foreach (var link in links.EnumerateArray())
                            {
                                if (link.TryGetProperty("rel", out var rel) && rel.GetString() == "alternate")
                                {
                                    chapter.Url = link.GetProperty("href").GetString() ?? "";
                                    break;
                                }
                            }
                        }

                        if (!string.IsNullOrEmpty(chapter.Name) && !string.IsNullOrEmpty(chapter.Url))
                        {
                            chapters.Add(chapter);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Console.WriteLine($"[Aarlas] GetChapterListAsync Error: {ex.Message}");
            }

            return chapters;
        }

        public async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            var pages = new List<string>();

            try
            {
                var html = await _httpClient.GetStringAsync(chapterUrl);
                var doc = new HtmlDocument();
                doc.LoadHtml(html);

                var imgNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'check-box')]//div[@class='separator']//img");
                if (imgNodes == null)
                {
                    // Fallback
                    imgNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'check-box')]//img");
                }

                if (imgNodes != null)
                {
                    foreach (var img in imgNodes)
                    {
                        string src = img.GetAttributeValue("src", "");
                        if (!string.IsNullOrEmpty(src))
                        {
                            pages.Add(src);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Console.WriteLine($"[Aarlas] GetPageListAsync Error: {ex.Message}");
            }

            return pages;
        }
    }
}
