using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Yomic.Core.Models;
using Yomic.Core.Sources;
using Newtonsoft.Json.Linq;

namespace Yomic.Extensions.MangaDex
{
    public class MangaDexSource : HttpSource, IFilterableMangaSource
    {
        public override long Id => 5; // Unique ID for MangaDex
        public override string Name => "MangaDex";
        public override string BaseUrl => "https://api.mangadex.org";
        public string WebBaseUrl => "https://mangadex.org";

        // Rate limiting: 3 requests per second (same as Mihon)
        private static readonly SemaphoreSlim _rateLimiter = new SemaphoreSlim(3, 3);
        private static readonly TimeSpan _rateLimitWindow = TimeSpan.FromSeconds(1);
        
        // Language filter - can be set from ViewModel (en = English, id = Indonesian)
        public static string SelectedLanguage { get; set; } = "en";

        private async Task<JObject?> RateLimitedGetJsonAsync(string url)
        {
            await _rateLimiter.WaitAsync();
            try
            {
                return await GetJsonAsync(url);
            }
            finally
            {
                // Release after the rate limit window
                _ = Task.Run(async () =>
                {
                    await Task.Delay(_rateLimitWindow);
                    _rateLimiter.Release();
                });
            }
        }

        // Helper to safe parse JSON
        private async Task<JObject?> GetJsonAsync(string url)
        {
            try
            {
                var json = await GetStringAsync(url);
                return JObject.Parse(json);
            }
            catch (Exception ex)
            {
                 // If normal fetch fails (likely TLS handshake), force browser fetch
                 Console.WriteLine($"[MangaDex] JSON Fetch Failed: {ex.Message}. Trying ForceBrowserFetch...");
                 try 
                 {
                     var json = await ForceBrowserFetchAsync(url);
                     if (json.Trim().StartsWith("<"))
                     {
                         var doc = new HtmlAgilityPack.HtmlDocument();
                         doc.LoadHtml(json);
                         json = doc.DocumentNode.InnerText; 
                     }
                     return JObject.Parse(json);
                 }
                 catch (Exception browserEx)
                 {
                     Console.WriteLine($"[MangaDex] Browser Fetch also failed: {browserEx.Message}");
                     return null;
                 }
            }
        }

        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            var tuple = await GetMangaListAsync(page);
            return tuple.Items;
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            // API: GET /manga, Limit 20 per page
            int limit = 20;
            int offset = (page - 1) * limit;
            
            // Filter manga by available translated language (only show manga that have translations in selected language)
            Console.WriteLine($"[MangaDex] ========== GetMangaListAsync ==========");
            Console.WriteLine($"[MangaDex] SelectedLanguage = '{SelectedLanguage}'");
            string url = $"{BaseUrl}/manga?limit={limit}&offset={offset}&includes[]=cover_art&order[createdAt]=desc&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]={SelectedLanguage}";
            Console.WriteLine($"[MangaDex] API URL: {url}");
            
            var json = await RateLimitedGetJsonAsync(url);
            if (json == null) return (new List<Manga>(), 1);

            // Total items for pagination
            int total = json["total"]?.ToObject<int>() ?? 0;
            int totalPages = (int)Math.Ceiling((double)total / limit);
            Console.WriteLine($"[MangaDex] Total manga found: {total}, TotalPages: {totalPages}");

            return (ParseMangaList(json), totalPages);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            int limit = 20;
            int offset = (page - 1) * limit;
            
            // Filter manga by available translated language (only show manga that have translations in selected language)
            string url = $"{BaseUrl}/manga?limit={limit}&offset={offset}&includes[]=cover_art&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]={SelectedLanguage}";
            
            var json = await RateLimitedGetJsonAsync(url);
            if (json == null) return (new List<Manga>(), 1);

            int total = json["total"]?.ToObject<int>() ?? 0;
            int totalPages = (int)Math.Ceiling((double)total / limit);

            return (ParseMangaList(json), totalPages);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetFilteredMangaAsync(int page, int statusFilter = 0, int typeFilter = 0)
        {
            int limit = 20;
            int offset = (page - 1) * limit;
            
            // Filter manga by available translated language
            string query = $"{BaseUrl}/manga?limit={limit}&offset={offset}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]={SelectedLanguage}";
            
            // Status mapping: 1=Ongoing, 2=Completed
            if (statusFilter == 1) query += "&status[]=ongoing";
            else if (statusFilter == 2) query += "&status[]=completed";
            
            // Type not directly mapped for MangaDex in this context without more info
            
            var json = await RateLimitedGetJsonAsync(query);
            if (json == null) return (new List<Manga>(), 1);
            
            int total = json["total"]?.ToObject<int>() ?? 0;
            int totalPages = (int)Math.Ceiling((double)total / limit);

            return (ParseMangaList(json), totalPages);
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            int limit = 20;
            int offset = (page - 1) * limit;
            
            string encodedQuery = Uri.EscapeDataString(query);
            // Filter search results by available translated language
            string url = $"{BaseUrl}/manga?limit={limit}&offset={offset}&title={encodedQuery}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]={SelectedLanguage}&order[relevance]=desc";
            
            var json = await RateLimitedGetJsonAsync(url);
            if (json == null) return new List<Manga>();

            return ParseMangaList(json);
        }
        
        private List<Manga> ParseMangaList(JObject json)
        {
            var list = new List<Manga>();
            var data = json["data"] as JArray;
            if (data == null) return list;

            foreach (var item in data)
            {
                string id = item["id"]?.ToString() ?? "";
                var attr = item["attributes"];
                string title = attr?["title"]?["en"]?.ToString() ?? attr?["title"]?.First?.First?.ToString() ?? "Unknown Title";
                
                string coverFileName = "";
                var relationships = item["relationships"] as JArray;
                var coverRel = relationships?.FirstOrDefault(x => x["type"]?.ToString() == "cover_art");
                if (coverRel != null && coverRel["attributes"] != null)
                {
                    coverFileName = coverRel["attributes"]?["fileName"]?.ToString() ?? "";
                }
                
                string coverUrl = "";
                if (!string.IsNullOrEmpty(coverFileName))
                {
                    coverUrl = $"https://uploads.mangadex.org/covers/{id}/{coverFileName}.256.jpg|Referer=https://mangadex.org/";
                }

                list.Add(new Manga
                {
                    // Id = 0
                    Title = title,
                    Url = $"{WebBaseUrl}/title/{id}", // Using Web URL as identifier
                    ThumbnailUrl = coverUrl,
                    Source = Id
                });
            }
            return list;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string url)
        {
            // URL likely: https://mangadex.org/title/{id} or just {id}
            string id = url.Replace(WebBaseUrl, "").Replace("/title/", "").Split('/')[0];
            
            string apiUrl = $"{BaseUrl}/manga/{id}?includes[]=author&includes[]=artist&includes[]=cover_art";
            var json = await RateLimitedGetJsonAsync(apiUrl);
            
            var manga = new Manga { Url = url, Source = Id };
            
            if (json != null && json["data"] != null)
            {
                var data = json["data"];
                var attr = data["attributes"];
                
                manga.Title = attr?["title"]?["en"]?.ToString() ?? attr?["title"]?.First?.First?.ToString() ?? "Unknown";
                manga.Description = attr?["description"]?["en"]?.ToString() ?? attr?["description"]?.First?.First?.ToString() ?? "";
                
                 string status = attr?["status"]?.ToString() ?? "";
                 if (status == "ongoing") manga.Status = Manga.ONGOING;
                 else if (status == "completed") manga.Status = Manga.COMPLETED;
                 else if (status == "hiatus") manga.Status = Manga.ON_HIATUS;
                 else if (status == "cancelled") manga.Status = Manga.CANCELLED;
                 else manga.Status = Manga.UNKNOWN;
                
                var rels = data["relationships"] as JArray;
                var authorNode = rels?.FirstOrDefault(x => x["type"]?.ToString() == "author");
                if (authorNode != null)
                {
                     manga.Author = authorNode["attributes"]?["name"]?.ToString() ?? "Unknown";
                }
                
                var tags = attr?["tags"] as JArray;
                if (tags != null)
                {
                    manga.Genre = tags.Select(t => t["attributes"]?["name"]?["en"]?.ToString() ?? "").Where(x => !string.IsNullOrEmpty(x)).ToList();
                }
                
                var coverNode = rels?.FirstOrDefault(x => x["type"]?.ToString() == "cover_art");
                if (coverNode != null)
                {
                     string fileName = coverNode["attributes"]?["fileName"]?.ToString() ?? "";
                     if (!string.IsNullOrEmpty(fileName))
                     {
                         manga.ThumbnailUrl = $"https://uploads.mangadex.org/covers/{id}/{fileName}.256.jpg|Referer=https://mangadex.org";
                     }
                }
            }
            
            return manga;
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaUrl)
        {
            string id = mangaUrl.Replace(WebBaseUrl, "").Replace("/title/", "").Split('/')[0];
            
            // Use SelectedLanguage for dynamic language filtering (en or id)
            string url = $"{BaseUrl}/manga/{id}/feed?limit=500&translatedLanguage[]={SelectedLanguage}&order[chapter]=desc&includes[]=scanlation_group";
            Console.WriteLine($"[MangaDex] Loading chapters with language: {SelectedLanguage}");
            
            var json = await RateLimitedGetJsonAsync(url);
            var chapters = new List<Chapter>();
            
            if (json != null && json["data"] is JArray data)
            {
                foreach (var item in data)
                {
                    // Filter by selected language
                    string lang = item["attributes"]?["translatedLanguage"]?.ToString() ?? "";
                    if (lang != SelectedLanguage) continue;
                    
                    // Log external chapters for debugging (but still include them)
                    string externalUrl = item["attributes"]?["externalUrl"]?.ToString() ?? "";
                    if (!string.IsNullOrEmpty(externalUrl))
                    {
                        Console.WriteLine($"[MangaDex] Chapter has external source: {item["id"]} -> {externalUrl}");
                        // Don't skip - try to load anyway as user confirmed blob: URLs work on website
                    }

                    string chId = item["id"]?.ToString() ?? "";
                    var attr = item["attributes"];
                    string chNumStr = attr?["chapter"]?.ToString() ?? "0";
                    string title = attr?["title"]?.ToString() ?? "";
                    string date = attr?["publishAt"]?.ToString() ?? "";
                    
                    if (string.IsNullOrEmpty(title)) title = $"Chapter {chNumStr}";
                    else title = $"Chapter {chNumStr}: {title}";
                    
                    var rels = item["relationships"] as JArray;
                    var group = rels?.FirstOrDefault(x => x["type"]?.ToString() == "scanlation_group")?["attributes"]?["name"]?.ToString();
                    if (!string.IsNullOrEmpty(group)) title += $" [{group}]";

                    float.TryParse(chNumStr, out float num);

                    chapters.Add(new Chapter
                    {
                        // Id = 0
                        Name = title,
                        Url = $"{WebBaseUrl}/chapter/{chId}",
                        ChapterNumber = num,
                        DateUpload = ParseDate(date)
                    });
                }
            }

            return chapters;
        }
        
        private long ParseDate(string dateStr)
        {
            if (DateTimeOffset.TryParse(dateStr, out var d))
            {
                 return d.ToUnixTimeSeconds();
            }
            return DateTimeOffset.Now.ToUnixTimeSeconds();
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            string id = chapterUrl.Split('/').Last();
            
            // Use Cubari API which proxies MangaDex and bypasses hotlink protection
            // Cubari fetches images server-side and returns direct CDN URLs
            string cubariUrl = $"https://cubari.moe/read/api/mangadex/chapter/{id}/";
            Console.WriteLine($"[MangaDex] Fetching pages via Cubari: {cubariUrl}");
            
            var pages = new List<string>();
            
            try
            {
                var response = await GetStringAsync(cubariUrl);
                
                // Cubari returns a JSON array of direct image URLs
                var urls = JArray.Parse(response);
                
                foreach (var url in urls)
                {
                    string imageUrl = url.ToString();
                    // Use Cubari as referer since they're proxying the request
                    pages.Add($"{imageUrl}|Referer=https://cubari.moe/");
                }
                
                Console.WriteLine($"[MangaDex] Got {pages.Count} pages from Cubari");
                if (pages.Count > 0)
                {
                    Console.WriteLine($"[MangaDex] First page: {pages[0].Split('|')[0]}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[MangaDex] Cubari API error: {ex.Message}");
                Console.WriteLine($"[MangaDex] Falling back to direct MangaDex API...");
                
                // Fallback to direct MangaDex API if Cubari fails
                pages = await GetPageListDirectAsync(id);
            }

            return pages;
        }
        
        /// <summary>
        /// Fallback method using direct MangaDex at-home API
        /// </summary>
        private async Task<List<string>> GetPageListDirectAsync(string id)
        {
            string serverUrl = $"{BaseUrl}/at-home/server/{id}";
            Console.WriteLine($"[MangaDex] Fetching page list directly from: {serverUrl}");
            
            var json = await RateLimitedGetJsonAsync(serverUrl);
            var pages = new List<string>();
            
            if (json != null)
            {
                string baseUrl = json["baseUrl"]?.ToString() ?? "";
                var chapter = json["chapter"];
                string hash = chapter?["hash"]?.ToString() ?? "";
                
                var dataSaver = chapter?["dataSaver"] as JArray;
                var data = chapter?["data"] as JArray;
                var pageFiles = dataSaver ?? data;
                string quality = dataSaver != null ? "data-saver" : "data";
                
                Console.WriteLine($"[MangaDex] Direct API: baseUrl={baseUrl}, pages={pageFiles?.Count ?? 0}");
                
                if (pageFiles != null && !string.IsNullOrEmpty(baseUrl) && !string.IsNullOrEmpty(hash))
                {
                    foreach (var file in pageFiles)
                    {
                        pages.Add($"{baseUrl}/{quality}/{hash}/{file}|Referer=https://mangadex.org/&Origin=https://mangadex.org");
                    }
                }
            }
            
            return pages;
        }
    }
}
