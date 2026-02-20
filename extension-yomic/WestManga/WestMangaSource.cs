using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Yomic.Core.Models;
using Yomic.Core.Sources;

namespace Yomic.Extensions.WestManga
{
    public class WestMangaSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "WestManga";
        public override string BaseUrl => "https://westmanga.me";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;

        public override string Version => "1.0.0";
        public override string IconUrl => "https://www.google.com/s2/favicons?domain=westmanga.me&sz=128";
        public override string Description => "Baca Manga Bahasa Indonesia di WestManga";
        public override string Author => "Yomic Desktop";
        public override string IconBackground => "#18181b";
        public override string IconForeground => "#ffffff";

        private const string ApiBase = "https://data.westmanga.me/api";
        private const string ACCESS_KEY = "WM_WEB_FRONT_END";
        private const string SECRET_KEY = "xxxoidj";

        private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };

        protected override void ConfigureClient(HttpClient client)
        {
            client.DefaultRequestHeaders.Add("Origin", "https://westmanga.me");
            client.DefaultRequestHeaders.Referrer = new Uri("https://westmanga.me/");
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        }

        // ===========================================================================
        // IFilterableMangaSource
        // ===========================================================================

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            string url = $"{ApiBase}/contents?page={page}&per_page=20&type=Comic";
            return await FetchMangaListAsync(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            string url = $"{ApiBase}/contents?project=true&page={page}&per_page=20&type=Comic";
            return await FetchMangaListAsync(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetFilteredMangaAsync(int page, int statusFilter = 0, int typeFilter = 0)
        {
            return await GetLatestMangaAsync(page);
        }

        // ===========================================================================
        // HttpSource (abstract)
        // ===========================================================================

        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            // Use home-data for popular (daily/weekly/monthly)
            try
            {
                string url = $"{ApiBase}/contents/home-data";
                var json = await GetApiStringAsync(url);
                var result = JsonSerializer.Deserialize<WmApiResult<WmHomeData>>(json, _jsonOptions);

                if (result?.Data?.Popular?.AllTime != null)
                {
                    return result.Data.Popular.AllTime.Select(MapToManga).ToList();
                }
                // Fallback: projectUpdate
                if (result?.Data?.ProjectUpdate != null)
                {
                    return result.Data.ProjectUpdate.Select(MapToManga).ToList();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WestManga] GetPopularMangaAsync error: {ex.Message}");
            }

            // Fallback to paginated project-updates
            var tuple = await GetMangaListAsync(page);
            return tuple.Items;
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            string url = $"{ApiBase}/contents?q={Uri.EscapeDataString(query)}&page={page}&per_page=20&type=Comic";
            try
            {
                var json = await GetApiStringAsync(url);
                var result = JsonSerializer.Deserialize<WmApiResult<List<WmContent>>>(json, _jsonOptions);
                if (result?.Data != null)
                    return result.Data.Select(MapToManga).ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WestManga] Search error: {ex.Message}");
            }
            return new List<Manga>();
        }

        public override async Task<Manga> GetMangaDetailsAsync(string mangaId)
        {
            string slug = ExtractSlug(mangaId);
            string url = $"{ApiBase}/comic/{slug}";

            var json = await GetApiStringAsync(url);
            var result = JsonSerializer.Deserialize<WmApiResult<WmContentDetail>>(json, _jsonOptions);

            var data = result?.Data;
            if (data == null) throw new Exception("Failed to parse manga details");

            return new Manga
            {
                Id = data.Id,
                Url = data.Slug ?? slug,
                Title = data.Title ?? "Unknown Title",
                ThumbnailUrl = data.Cover,
                Description = data.Sinopsis,
                Author = data.Author ?? "Unknown",
                Status = ParseStatus(data.Status),
                Source = this.Id,
                Genre = data.Genres?.Select(g => g.Name ?? "").Where(n => !string.IsNullOrEmpty(n)).ToList()
            };
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
            string slug = ExtractSlug(mangaId);
            string url = $"{ApiBase}/comic/{slug}";
            var chapters = new List<Chapter>();

            try
            {
                var json = await GetApiStringAsync(url);
                var result = JsonSerializer.Deserialize<WmApiResult<WmContentDetail>>(json, _jsonOptions);

                if (result?.Data?.Chapters != null)
                {
                    foreach (var ch in result.Data.Chapters)
                    {
                        var chapter = new Chapter
                        {
                            Id = ch.Id,
                            MangaId = result.Data.Id,
                            Name = $"Chapter {ch.Number}",
                            Url = ch.Slug ?? ch.Id.ToString(),
                            ChapterNumber = ParseFloat(ch.Number)
                        };

                        if (ch.UpdatedAt?.Time > 0)
                            chapter.DateUpload = ch.UpdatedAt.Time;
                        else
                            chapter.DateUpload = DateTimeOffset.Now.ToUnixTimeMilliseconds();

                        chapters.Add(chapter);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WestManga] GetChapterListAsync error: {ex.Message}");
            }

            return chapters.OrderByDescending(c => c.ChapterNumber).ToList();
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            // chapterUrl is the chapter slug
            string slug = ExtractSlug(chapterUrl);
            string url = $"{ApiBase}/v/{slug}";
            var pages = new List<string>();

            try
            {
                var json = await GetApiStringAsync(url);
                var result = JsonSerializer.Deserialize<WmApiResult<WmChapterDetail>>(json, _jsonOptions);

                if (result?.Data?.Images != null)
                {
                    foreach (var img in result.Data.Images)
                    {
                        if (!string.IsNullOrEmpty(img))
                        {
                            // Add referer header for hotlink protection
                            pages.Add($"{img}|Referer={BaseUrl}/");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WestManga] GetPageListAsync error: {ex.Message}");
            }

            return pages;
        }

        // ===========================================================================
        // API Helpers
        // ===========================================================================

        /// <summary>
        /// Fetch a WestManga API endpoint with the required x-wm-* headers.
        /// </summary>
        private async Task<string> GetApiStringAsync(string url)
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

            var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("x-wm-accses-key", ACCESS_KEY);
            request.Headers.Add("x-wm-request-time", timestamp);
            request.Headers.Add("x-wm-request-signature", ComputeSignature(url, timestamp));

            Console.WriteLine($"[WestManga] GET {url}");
            var response = await Client.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                var preview = body.Length > 200 ? body[..200] : body;
                Console.WriteLine($"[WestManga] HTTP {response.StatusCode}: {preview}");
                throw new HttpRequestException($"WestManga API returned {response.StatusCode}");
            }

            return await response.Content.ReadAsStringAsync();
        }

        /// <summary>
        /// Compute the HMAC-SHA256 signature for the request.
        /// Logic from WestManga.kt:
        /// key = timestamp + method + path + ACCESS_KEY + SECRET_KEY
        /// message = "wm-api-request"
        /// </summary>
        private static string ComputeSignature(string url, string timestamp)
        {
            var uri = new Uri(url);
            var path = uri.AbsolutePath;

            string message = "wm-api-request";
            string key = timestamp + "GET" + path + ACCESS_KEY + SECRET_KEY;

            var keyBytes = Encoding.UTF8.GetBytes(key);
            var messageBytes = Encoding.UTF8.GetBytes(message);

            using var hmac = new HMACSHA256(keyBytes);
            var hash = hmac.ComputeHash(messageBytes);
            return Convert.ToHexStringLower(hash);
        }

        // ===========================================================================
        // Mapping Helpers
        // ===========================================================================

        private async Task<(List<Manga> Items, int TotalPages)> FetchMangaListAsync(string url)
        {
            try
            {
                var json = await GetApiStringAsync(url);
                var result = JsonSerializer.Deserialize<WmApiResult<List<WmContent>>>(json, _jsonOptions);

                if (result?.Data != null)
                {
                    var items = result.Data.Select(MapToManga).ToList();
                    int totalPages = result.Paginator?.LastPage ?? 999;
                    return (items, totalPages);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WestManga] FetchMangaListAsync error: {ex.Message}");
            }

            return (new List<Manga>(), 1);
        }

        private Manga MapToManga(WmContent c)
        {
            return new Manga
            {
                Id = c.Id,
                Url = c.Slug ?? c.Id.ToString(),
                Title = c.Title ?? "Unknown",
                ThumbnailUrl = c.Cover,
                Source = this.Id,
                Status = ParseStatus(c.Status)
            };
        }

        private static string ExtractSlug(string input)
        {
            if (string.IsNullOrEmpty(input)) return input;
            if (input.StartsWith("http"))
            {
                var uri = new Uri(input);
                return uri.AbsolutePath.Trim('/').Split('/').Last();
            }
            return input.Trim('/');
        }

        private static int ParseStatus(string? status)
        {
            if (string.IsNullOrEmpty(status)) return Manga.UNKNOWN;
            return status.ToLowerInvariant() switch
            {
                "ongoing" => Manga.ONGOING,
                "completed" => Manga.COMPLETED,
                "hiatus" => Manga.ON_HIATUS,
                "cancelled" or "dropped" => Manga.CANCELLED,
                _ => Manga.UNKNOWN
            };
        }

        private static float ParseFloat(string? value)
        {
            if (string.IsNullOrEmpty(value)) return 0;
            if (float.TryParse(value, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out float result))
                return result;
            return 0;
        }

        // ===========================================================================
        // JSON Models (WestManga API)
        // ===========================================================================

        private class WmApiResult<T>
        {
            [JsonPropertyName("status")]
            public bool Status { get; set; }

            [JsonPropertyName("message")]
            public string? Message { get; set; }

            [JsonPropertyName("data")]
            public T? Data { get; set; }

            [JsonPropertyName("paginator")]
            public WmPaginator? Paginator { get; set; }
        }

        private class WmPaginator
        {
            [JsonPropertyName("current_page")]
            public int CurrentPage { get; set; }

            [JsonPropertyName("last_page")]
            public int LastPage { get; set; }

            [JsonPropertyName("total")]
            public int Total { get; set; }
        }

        private class WmContent
        {
            [JsonPropertyName("id")]
            public long Id { get; set; }

            [JsonPropertyName("title")]
            public string? Title { get; set; }

            [JsonPropertyName("slug")]
            public string? Slug { get; set; }

            [JsonPropertyName("cover")]
            public string? Cover { get; set; }

            [JsonPropertyName("content_type")]
            public string? ContentType { get; set; }

            [JsonPropertyName("status")]
            public string? Status { get; set; }

            [JsonPropertyName("hot")]
            public bool Hot { get; set; }

            [JsonPropertyName("rating")]
            public JsonElement? Rating { get; set; }

            [JsonPropertyName("total_views")]
            public long TotalViews { get; set; }
        }

        private class WmContentDetail : WmContent
        {
            [JsonPropertyName("sinopsis")]
            public string? Sinopsis { get; set; }

            [JsonPropertyName("author")]
            public string? Author { get; set; }

            [JsonPropertyName("alternative_name")]
            public string? AlternativeName { get; set; }

            [JsonPropertyName("release")]
            public JsonElement? Release { get; set; }

            [JsonPropertyName("genres")]
            public List<WmGenre>? Genres { get; set; }

            [JsonPropertyName("chapters")]
            public List<WmChapter>? Chapters { get; set; }
        }

        private class WmGenre
        {
            [JsonPropertyName("name")]
            public string? Name { get; set; }

            [JsonPropertyName("slug")]
            public string? Slug { get; set; }
        }

        private class WmChapter
        {
            [JsonPropertyName("id")]
            public long Id { get; set; }

            [JsonPropertyName("content_id")]
            public long ContentId { get; set; }

            [JsonPropertyName("number")]
            public string? Number { get; set; }

            [JsonPropertyName("slug")]
            public string? Slug { get; set; }

            [JsonPropertyName("updated_at")]
            public WmTimestamp? UpdatedAt { get; set; }
        }

        private class WmTimestamp
        {
            [JsonPropertyName("formatted")]
            public string? Formatted { get; set; }

            [JsonPropertyName("time")]
            public long Time { get; set; }
        }

        private class WmChapterDetail
        {
            [JsonPropertyName("id")]
            public long Id { get; set; }

            [JsonPropertyName("content_id")]
            public long ContentId { get; set; }

            [JsonPropertyName("number")]
            public string? Number { get; set; }

            [JsonPropertyName("slug")]
            public string? Slug { get; set; }

            [JsonPropertyName("images")]
            public List<string>? Images { get; set; }
        }

        private class WmHomeData
        {
            [JsonPropertyName("popular")]
            public WmPopular? Popular { get; set; }

            [JsonPropertyName("projectUpdate")]
            public List<WmContent>? ProjectUpdate { get; set; }

            [JsonPropertyName("mirrorUpdate")]
            public List<WmContent>? MirrorUpdate { get; set; }

            [JsonPropertyName("newProject")]
            public List<WmContent>? NewProject { get; set; }
        }

        private class WmPopular
        {
            [JsonPropertyName("daily")]
            public List<WmContent>? Daily { get; set; }

            [JsonPropertyName("weekly")]
            public List<WmContent>? Weekly { get; set; }

            [JsonPropertyName("monthly")]
            public List<WmContent>? Monthly { get; set; }

            [JsonPropertyName("allTime")]
            public List<WmContent>? AllTime { get; set; }
        }
    }
}
