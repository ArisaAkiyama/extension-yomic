using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Yomic.Extensions.Softkomik;
using Yomic.Core.Models;
using Yomic.Core.Sources;
using Yomic.Core.Services;

namespace Yomic.Extensions
{
    public class SoftkomikSource : HttpSource, IFilterableMangaSource
    {
        private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        public override string Version => "1.0.2";
        public override string Language => "ID";

        public override string Name => "Softkomik";
        public override string BaseUrl => "https://softkomik.com";
        public override string IconUrl => "https://www.google.com/s2/favicons?domain=softkomik.com&sz=128";
        public override string Description => "Baca Komik Manga Manhua Manhwa Bahasa Indonesia";
        public override string Author => "Softkomik";
        public override string IconBackground => "#222222";
        public override string IconForeground => "#ffffff";
        
        private const string ImageBaseUrl = "https://cover.softdevices.my.id/softkomik-cover/";

        public SoftkomikSource()
        {
            Console.WriteLine("[Softkomik] Source Loaded v1.0.1");
        }

        // --- IFilterableMangaSource Implementation ---

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            string url = page == 1 ? $"{BaseUrl}/komik/update" : $"{BaseUrl}/komik/update?page={page}";
            return await GetMangaListTupleAsync(url);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
             // Verify: Should "Browse" use List or Update? Usually List (Popular/New)
             // Let's keep List for Browse.
             string url = page == 1 ? $"{BaseUrl}/komik/list" : $"{BaseUrl}/komik/list?page={page}";
             return await GetMangaListTupleAsync(url);
        }
        
        public async Task<(List<Manga> Items, int TotalPages)> GetFilteredMangaAsync(int page, int statusFilter = 0, int typeFilter = 0)
        {
             string url = page == 1 ? $"{BaseUrl}/komik/list" : $"{BaseUrl}/komik/list?page={page}";
             return await GetMangaListTupleAsync(url);
        }

        // --- HttpSource Implementation ---

        public override async Task<List<Manga>> GetPopularMangaAsync(int page = 1)
        {
            string url = page == 1 ? $"{BaseUrl}/komik/list" : $"{BaseUrl}/komik/list?page={page}";
            var result = await GetMangaListTupleAsync(url);
            return result.Items;
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page = 1)
        {
            string url = $"{BaseUrl}/komik/list?title={Uri.EscapeDataString(query)}";
            if (page > 1) url += $"&page={page}";

            var json = await GetNextDataAsync<SoftkomikSearchData>(url);

             if (json?.Props?.PageProps?.Data?.Data == null)
                return new List<Manga>();

            return json.Props.PageProps.Data.Data.Select(ParseManga).ToList();
        }

        public override async Task<Manga> GetMangaDetailsAsync(string mangaId)
        {
            string slug = mangaId;
            if (mangaId.StartsWith("http"))
            {
               var uri = new Uri(mangaId);
               slug = uri.AbsolutePath.Trim('/');
            }

            string url = $"{BaseUrl}/{slug}";
            var json = await GetNextDataAsync<SoftkomikDetailData>(url);
            
            var data = json?.Props?.PageProps?.Data;
            if (data == null) throw new Exception("Failed to parsing manga details JSON");

            return new Manga
            {
                Id = 0, 
                Url = data.TitleSlug ?? slug, 
                Title = data.Title ?? "Unknown Title",
                ThumbnailUrl = GetCoverUrl(data.Gambar),
                Description = data.Sinopsis,
                Author = data.Author ?? "Unknown",
                Status = ParseStatus(data.Status),
                Source = this.Id,
                Genre = data.Genre ?? new List<string>()
            };
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
             // Fallback Logic
             string slug = mangaId;
             if (mangaId.StartsWith("http"))
             {
                var uri = new Uri(mangaId);
                slug = uri.AbsolutePath.Trim('/');
             }
             
             string url = $"{BaseUrl}/{slug}";
             var json = await GetNextDataAsync<SoftkomikDetailData>(url);
             var data = json?.Props?.PageProps?.Data;
            
             if (data == null) return new List<Chapter>();

             var chapters = new List<Chapter>();
             string latestStr = data.LatestChapter ?? "0"; 

             if (float.TryParse(latestStr, out float maxChap))
             {
                 for (int i = (int)maxChap; i >= 1; i--)
                 {
                     chapters.Add(new Chapter
                     {
                         Id = 0, 
                         Url = $"{BaseUrl}/{slug}/chapter/{i:000}",
                         Name = $"Chapter {i}", // Renamed from Title
                         MangaId = 0 
                     });
                 }
             }
             else 
             {
                 chapters.Add(new Chapter
                 {
                     Url = $"{BaseUrl}/{slug}/chapter/{latestStr}",
                     Name = $"Chapter {latestStr}", // Renamed from Title
                 });
             }

             return chapters;
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            Console.WriteLine($"[Softkomik] GetPageListAsync called for: {chapterUrl}");
            var json = await GetNextDataAsync<SoftkomikReaderData>(chapterUrl);
            var readerData = json?.Props?.PageProps?.Data;
            var imageData = readerData?.Data;
            var images = imageData?.ImageSrc;
            
            if (images == null) 
            {
                Console.WriteLine("[Softkomik] No images found in JSON");
                return new List<string>();
            }

            bool storageInter2 = imageData?.StorageInter2 ?? false;
            string cdnBaseUrl = storageInter2 ? "https://cd3.softkomik.com/softkomik" : "https://gd1.softkomik.com/softkomik";
            
            Console.WriteLine($"[Softkomik] StorageInter2: {storageInter2}, Base: {cdnBaseUrl}");

            return images.Select(img => 
            {
                if (img.StartsWith("http")) return img;
                
                string combined = $"{cdnBaseUrl}/{img}";
                // Append Referer pipe hack for apps that support it
                string final = $"{combined}|Referer={BaseUrl}/";
                // Console.WriteLine($"[Softkomik] Generated Image URL: {final}");
                return final;
            }).ToList();
        }

        // --- Helpers ---

        private async Task<(List<Manga> Items, int TotalPages)> GetMangaListTupleAsync(string url)
        {
            var json = await GetNextDataAsync<SoftkomikSearchData>(url);

            if (json?.Props?.PageProps?.Data?.Data == null)
                return (new List<Manga>(), 1);

            var list = json.Props.PageProps.Data.Data.Select(ParseManga).ToList();
            int totalPages = json.Props.PageProps.Data.MaxPage;
            
            return (list, totalPages > 0 ? totalPages : 100);
        }

        private async Task<NextData<T>?> GetNextDataAsync<T>(string url)
        {
            string html = await GetStringAsync(url);
            
            var match = Regex.Match(html, @"<script id=""__NEXT_DATA__"" type=""application/json"">(.*?)</script>");
            if (!match.Success) return null;

            string jsonStr = match.Groups[1].Value;
            try 
            {
                return JsonSerializer.Deserialize<NextData<T>>(jsonStr, _jsonOptions);
            }
            catch (Exception)
            {
                return null;
            }
        }

        private Manga ParseManga(SoftkomikManga k)
        {
            return new Manga
            {
                Url = k.TitleSlug ?? "",
                Title = k.Title ?? "Unknown",
                ThumbnailUrl = GetCoverUrl(k.Gambar),
                Source = this.Id,
                Status = ParseStatus(k.Status)
            };
        }

        private string GetCoverUrl(string? path)
        {
            if (string.IsNullOrEmpty(path)) return "";
            string absoluteUrl = path.StartsWith("http") ? path : $"{ImageBaseUrl}{path}";
            // Use wsrv.nl (images.weserv.nl) to proxy and convert images to WebP
            // This handles AVIF and other formats that might not be supported natively by the app
            return $"https://wsrv.nl/?url={Uri.EscapeDataString(absoluteUrl)}&output=webp&w=256&q=75";
        }
        
        private int ParseStatus(string? status)
        {
            if (string.IsNullOrEmpty(status)) return Manga.UNKNOWN;
            status = status.ToLower();
            if (status.Contains("ongoing")) return Manga.ONGOING;
            if (status.Contains("completed") || status.Contains("tamat")) return Manga.COMPLETED;
            return Manga.UNKNOWN;
        }
    }
}
