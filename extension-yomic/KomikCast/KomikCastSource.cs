using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Yomic.Core.Models;
using Yomic.Core.Sources;

namespace Yomic.Extensions.KomikCast
{
    public class KomikCastSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "KomikCast";
        // Base API URL
        public override string BaseUrl => "https://be.komikcast.cc";
        private const string WebsiteUrl = "https://v2.komikcast.fit";
        public override string Language => "id";
        public override bool IsHasMorePages => true;

        public override string Version => "1.2.0";
        public override string IconUrl => "https://www.google.com/s2/favicons?domain=v2.komikcast.fit&sz=128";
        public override string Description => "Baca Komik Online Bahasa Indonesia di KomikCast";
        public override string Author => "Yomic Desktop";

        public KomikCastSource()
        {
            // Headers are now configured via ConfigureClient() which is called
            // every time HttpClient is created/recreated (e.g., on proxy state change)
        }

        protected override void ConfigureClient(System.Net.Http.HttpClient client)
        {
            // Initial headers to mimicking the SPA frontend
            if (!client.DefaultRequestHeaders.Contains("Origin"))
                client.DefaultRequestHeaders.Add("Origin", WebsiteUrl);
            if (!client.DefaultRequestHeaders.Contains("Referer"))
                client.DefaultRequestHeaders.Add("Referer", $"{WebsiteUrl}/");
        }

        private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };



        // Helper to get image URL with Referer
        private string GetImageWithReferer(string url)
        {
             if (string.IsNullOrEmpty(url)) return "";
             return $"{url}|Referer={WebsiteUrl}/";
        }

        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            // API: sort=popularity is the correct parameter for popular items
            var res = await FetchMangaListAsync("popular", page, "project");
            return res.Items;
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            // User requested "TERBARU (Bukan Project)" -> Mirror type
            return await FetchMangaListAsync("update", page, "mirror");
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            // Default Browse to Project
            return await FetchMangaListAsync("update", page, "project");
        }



        // ... (GetSearchMangaAsync, GetMangaDetailsAsync, etc. remain unchanged) ...

        // ... (Private Helpers) ...

        private async Task<(List<Manga> Items, int TotalPages)> FetchMangaListAsync(string order, int page, string type)
        {
            string url = $"{BaseUrl}/series?type={type}&page={page}&take=30";
            
            if (order == "update") url += "&sort=latest"; 
            else if (order == "popular") url += "&sort=popularity"; // Fixed: views -> popularity

            var result = await GetJson<ApiListResult<MangaItem>>(url);
            
            if (result?.Data == null) return (new List<Manga>(), 1000);
            
            // CRITICAL FIX: Ensure STABLE ordering like Kiryuu
            // 1. Sort by UpdatedAt descending (primary key)
            // 2. Use Id as secondary key to guarantee stable order when timestamps are equal
            var sortedData = result.Data
                .OrderByDescending(x => x.UpdatedAt ?? "")
                .ThenByDescending(x => x.Id) // Secondary key for stability
                .ToList();
            
            int totalPages = result.Meta?.LastPage > 0 ? result.Meta.LastPage : 1000;
            return (sortedData.Select(MapManga).ToList(), totalPages);
        }

        private Manga MapManga(MangaItem item)
        {
            if (item?.Data == null) return new Manga();
            
            var manga = new Manga
            {
                Title = item.Data.Title ?? "",
                Url = $"{WebsiteUrl}/series/{item.Data.Slug}", 
                ThumbnailUrl = GetImageWithReferer(item.Data.CoverImage),
                Source = this.Id,
                LastUpdate = ParseDate(item.UpdatedAt)
            };
            
            if (item.Data.Status?.Equals("ongoing", StringComparison.OrdinalIgnoreCase) == true) manga.Status = Manga.ONGOING;
            else if (item.Data.Status?.Equals("completed", StringComparison.OrdinalIgnoreCase) == true) manga.Status = Manga.COMPLETED;
            else manga.Status = Manga.UNKNOWN;

            return manga;
        }

        private async Task<T> GetJson<T>(string url)
        {
            try 
            {
                // Try standard request first
                var json = await Client.GetStringAsync(url);
                return JsonSerializer.Deserialize<T>(json, _jsonOptions);
            }
            catch(HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Forbidden || ex.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable)
            {
                Console.WriteLine($"[KomikCast] Access Denied ({ex.StatusCode}). Attempting Cloudflare Bypass...");
                try 
                {
                    // Use Puppeteer to get valid content
                    var content = await Yomic.Core.Services.CloudflareBypassService.Instance.GetContentAsync(url);
                    
                    // If content is pure JSON, return it. Puppeteer usually returns the whole page source.
                    // If API returns JSON shown in body, standard GetContentAsync might wrap it in HTML tag if not careful?
                    // Puppeteer GetContentAsync returns page.Content() which is HTML.
                    // For API endpoints, we should use EvaluateScript or simply get text content of body pre.
                    // But KomikCast API likely returns JSON text. Chrome wraps JSON in <pre> usually.
                    
                    if (content.Contains("<pre")) 
                    {
                        // Extract JSON from <pre> tag if present (Chrome formatting)
                        var match = Regex.Match(content, @"<pre[^>]*>(.*?)</pre>", RegexOptions.Singleline);
                        if (match.Success) content = match.Groups[1].Value;
                    }
                    // Simple cleanup of HTML tags if any remain
                    content = Regex.Replace(content, "<.*?>", ""); 
                    content = System.Net.WebUtility.HtmlDecode(content);

                    return JsonSerializer.Deserialize<T>(content, _jsonOptions);
                }
                catch (Exception bypassEx)
                {
                    Console.WriteLine($"[KomikCast] Bypass Failed: {bypassEx.Message}");
                    return default;
                }
            }
            catch(Exception ex)
            {
                Console.WriteLine($"[KomikCast] API Error: {ex.Message} on {url}");
                return default;
            }
        }

        private long ParseDate(string dateStr)
        {
             if (DateTimeOffset.TryParse(dateStr, out var d)) 
             {
                 // Fix: API often returns future dates (server time skew), which breaks 'Time Ago' display.
                 // Clamp to Now if in future.
                 if (d > DateTimeOffset.Now) return DateTimeOffset.Now.ToUnixTimeMilliseconds();
                 return d.ToUnixTimeMilliseconds();
             }
             return DateTimeOffset.Now.ToUnixTimeMilliseconds();
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            // API uses filter parameter with syntax: title=like="query",nativeTitle=like="query"
            string encodedQuery = Uri.EscapeDataString(query);
            string filter = Uri.EscapeDataString($"title=like=\"{query}\",nativeTitle=like=\"{query}\"");
            
            // NOTE: We manually construct the filter string because the API expects quotes inside the value
            // filter=title=like="query",nativeTitle=like="query"
            string url = $"{BaseUrl}/series?filter={filter}&page={page}&take=30";
            
            var result = await GetJson<ApiListResult<MangaItem>>(url);
            return result?.Data?.Select(MapManga).ToList() ?? new List<Manga>();
        }

        public override async Task<Manga> GetMangaDetailsAsync(string url)
        {
            // Url might be the frontend URL or just the slug
            // Extract slug
            string slug = url.TrimEnd('/').Split('/').Last();
            
            // API Call
            string apiUrl = $"{BaseUrl}/series/{slug}";
            var response = await GetJson<ApiResult<MangaItem>>(apiUrl);
            
            if (response?.Data == null) throw new Exception("Manga not found via API");
            
            var m = response.Data;
            var manga = MapManga(m);
            manga.Description = m.Data?.Synopsis ?? "";
            manga.Genre = m.Data?.Genres?.Select(g => g.Data?.Name ?? "").Where(x => !string.IsNullOrEmpty(x)).ToList();
            
            // Author
            manga.Author = m.Data?.Author ?? "";
            
            // Status
            if (m.Data?.Status?.Equals("ongoing", StringComparison.OrdinalIgnoreCase) == true) manga.Status = Manga.ONGOING;
            else if (m.Data?.Status?.Equals("completed", StringComparison.OrdinalIgnoreCase) == true) manga.Status = Manga.COMPLETED;
            else manga.Status = Manga.UNKNOWN;

            return manga;
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaUrl)
        {
            string slug = mangaUrl.TrimEnd('/').Split('/').Last();
            string apiUrl = $"{BaseUrl}/series/{slug}/chapters";
            var response = await GetJson<ApiListResult<ChapterItem>>(apiUrl);
            
            var list = new List<Chapter>();
            if (response?.Data != null)
            {
                foreach (var item in response.Data)
                {
                    if (item.Data == null) continue;
                    
                    // Prefer ID generic for parsing
                    // API returns generic "index"
                    string name = item.Data.Title;
                    if (string.IsNullOrEmpty(name)) name = $"Chapter {item.Data.Index}";
                    
                    string chapterId = item.Data.Slug ?? item.Data.Index.ToString(); // Use slug or index
                    // Construct Frontend URL for scraping
                    string chapterUrl = $"{WebsiteUrl}/series/{slug}/chapter/{chapterId}";

                    list.Add(new Chapter
                    {
                        Id = item.Id, 
                        Name = name,
                        Url = chapterUrl,
                        ChapterNumber = (float)item.Data.Index,
                        DateUpload = ParseDate(item.CreatedAt)
                    });
                }
            }
            return list;
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            var pages = new List<string>();
            try 
            {
                // specific fix: "Different Kings" API endpoint is /series/{slug}/chapters/{index}
                // Frontend URL: {WebsiteUrl}/series/{slug}/chapter/{index}
                // We convert Frontend URL to API URL.
                
                string apiUrl = chapterUrl.Replace(WebsiteUrl, BaseUrl).Replace("/chapter/", "/chapters/");
                
                var response = await GetJson<ApiResult<ChapterItem>>(apiUrl);
                
                if (response?.Data?.Data?.Images != null)
                {
                     foreach(var img in response.Data.Data.Images)
                     {
                         pages.Add(GetImageWithReferer(img));
                     }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[KomikCast] Error fetching pages: {ex.Message}");
            }

            return pages;
        }



        // --- JSON Models ---

        private class ApiResult<T>
        {
            public int Status { get; set; }
            public T Data { get; set; }
        }

        private class ApiListResult<T>
        {
            public int Status { get; set; }
            public List<T> Data { get; set; }
            public MetaData Meta { get; set; }
        }

        private class MetaData
        {
            public int Total { get; set; }
            public int Page { get; set; }
            public int LastPage { get; set; }
        }

        private class MangaItem
        {
            public int Id { get; set; }
            public MangaData Data { get; set; }
            public string CreatedAt { get; set; }
            public string UpdatedAt { get; set; }
        }

        private class MangaData
        {
            public string Title { get; set; }
            public string Slug { get; set; }
            public string CoverImage { get; set; }
            public string Author { get; set; }
            public string Status { get; set; }
            public string Synopsis { get; set; }
            public List<GenreItem> Genres { get; set; }
        }

        private class GenreItem
        {
            public GenreData Data { get; set; }
        }
        private class GenreData 
        {
            public string Name { get; set; }
        }

        private class ChapterItem
        {
            // Chapter List returns list of these. Detail returns one of these.
            public int Id { get; set; }
            public ChapterDetails Data { get; set; }
            public string CreatedAt { get; set; }
        }

        private class ChapterDetails
        {
            public string Title { get; set; }
            public double Index { get; set; }
            public string Slug { get; set; }
            public List<string> Images { get; set; }
        }
    }
}
