using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Yomic.Core.Models;
using Yomic.Core.Sources;
using HtmlAgilityPack;
using Yomic.Core.Services;

namespace Yomic.Extensions.NHentai;

public class NHentaiSource : IMangaSource, IFilterableMangaSource
{
    private readonly HttpClient _httpClient;
    private readonly CloudflareBypassService _cloudflareBypassService;

    public long Id => 7309872737163460316; // Same as tachiyomi's 'all' id
    public string Name => "NHentai";
    public string BaseUrl => "https://nhentai.xxx";
    public string Language => "EN"; // They have multiple languages, default to EN for metadata
    public string Version => "1.1.0";
    public string IconUrl => "https://raw.githubusercontent.com/keiyoushi/extensions-source/main/src/all/nhentaixxx/res/mipmap-xxhdpi/ic_launcher.png";
    public string Description => "A port of the Keiyoushi NHentai.xxx extension for Yomic.";
    public string Author => "Yomic";
    public string IconBackground => "#ED2553"; // NHentai Pinkish-Red Color
    public string IconForeground => "#FFFFFF";
    public bool IsNsfw => true;

    public bool IsHasMorePages { get; private set; } = true;

    public NHentaiSource()
    {
        _cloudflareBypassService = CloudflareBypassService.Instance;
        
        _httpClient = new HttpClient();
        _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        _httpClient.DefaultRequestHeaders.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
        _httpClient.DefaultRequestHeaders.Add("Accept-Language", "en-US,en;q=0.5");
    }

    public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
    {
        var url = $"{BaseUrl}/?page={page}";
        var mangas = await ParseMangaListAsync(url);
        return (mangas, page + 1);
    }

    public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
    {
        return await GetLatestMangaAsync(page);
    }

    public async Task<List<Manga>> GetPopularMangaAsync(int page)
    {
        var url = $"{BaseUrl}/search/?q=\"\"&sort=popular&page={page}";
        return await GetSearchMangaAsync(url, page);
    }

    public async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
    {
        var url = query.StartsWith("http") 
            ? query 
            : $"{BaseUrl}/search/?q={Uri.EscapeDataString(query)}&page={page}";

        if (!query.StartsWith("http") && int.TryParse(query, out _))
        {
            try
            {
                var details = await GetMangaDetailsAsync($"/g/{query}/");
                return new List<Manga> { details };
            }
            catch { }
        }

        return await ParseMangaListAsync(url);
    }

    private async Task<List<Manga>> ParseMangaListAsync(string url)
    {
        var html = await GetHtmlAsync(url, default);
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var mangas = new List<Manga>();
        var nodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'gallery_item')]");

        if (nodes != null)
        {
            foreach (var node in nodes)
            {
                var aNode = node.SelectSingleNode(".//a");
                var imgNode = node.SelectSingleNode(".//img");
                var titleNode = node.SelectSingleNode(".//div[@class='caption']");

                if (aNode != null && imgNode != null)
                {
                    var thumbUrl = imgNode.GetAttributeValue("data-src", imgNode.GetAttributeValue("src", ""));
                    if (thumbUrl.StartsWith("//")) thumbUrl = "https:" + thumbUrl;
                    else if (thumbUrl.StartsWith("/")) thumbUrl = BaseUrl + thumbUrl;
                    thumbUrl = $"{thumbUrl}|Referer={BaseUrl}/";

                    mangas.Add(new Manga
                    {
                        Url = aNode.GetAttributeValue("href", ""),
                        Title = titleNode?.InnerText?.Trim() ?? "Unknown",
                        ThumbnailUrl = thumbUrl,
                        Source = Id
                    });
                }
            }
        }

        IsHasMorePages = mangas.Count > 0;
        return mangas;
    }

    public async Task<Manga> GetMangaDetailsAsync(string url)
    {
        var fullUrl = url.StartsWith("http") ? url : $"{BaseUrl}{url}";
        var html = await GetHtmlAsync(fullUrl, default);
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var infoNode = doc.DocumentNode.SelectSingleNode("//div[@id='info']") 
                    ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'info')]");

        var titleNode = infoNode?.SelectSingleNode(".//h1");
        var title = titleNode?.InnerText?.Trim();
        if (string.IsNullOrEmpty(title))
        {
            titleNode = infoNode?.SelectSingleNode(".//h2");
            title = titleNode?.InnerText?.Trim();
        }
        if (string.IsNullOrEmpty(title))
        {
            titleNode = doc.DocumentNode.SelectSingleNode("//h1");
            title = titleNode?.InnerText?.Trim();
        }
        if (string.IsNullOrEmpty(title)) title = "Unknown";

        var coverNode = doc.DocumentNode.SelectSingleNode("//div[@id='cover']//img")
                     ?? doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'cover')]//img");
        var coverUrl = coverNode?.GetAttributeValue("data-src", coverNode?.GetAttributeValue("src", ""));
        if (coverUrl != null)
        {
            if (coverUrl.StartsWith("//")) coverUrl = "https:" + coverUrl;
            else if (coverUrl.StartsWith("/")) coverUrl = BaseUrl + coverUrl;
            coverUrl = $"{coverUrl}|Referer={BaseUrl}/";
        }

        var tags = new List<string>();
        var tagNodes = infoNode?.SelectNodes(".//a[contains(@class, 'tag_btn')]//span[@class='tag_name']")
                    ?? doc.DocumentNode.SelectNodes("//a[contains(@class, 'tag_btn')]//span[@class='tag_name']");
        if (tagNodes != null)
        {
            tags = tagNodes.Select(n => n.InnerText.Trim()).Distinct().ToList();
        }

        var artistNodes = doc.DocumentNode.SelectNodes("//a[contains(@href, '/artist/')]//span[@class='tag_name']");
        var groupNodes = doc.DocumentNode.SelectNodes("//a[contains(@href, '/group/')]//span[@class='tag_name']");
        
        var artists = artistNodes?.Select(n => n.InnerText.Trim()).ToList() ?? new List<string>();
        var groups = groupNodes?.Select(n => n.InnerText.Trim()).ToList() ?? new List<string>();
        var author = groups.Any() ? string.Join(", ", groups) : string.Join(", ", artists);
        if (string.IsNullOrEmpty(author)) author = "Unknown";

        var pageNode = doc.DocumentNode.SelectSingleNode("//input[@id='load_pages']");
        var totalPages = pageNode?.GetAttributeValue("value", "0") ?? "0";

        var description = $"Title: {title}\nPages: {totalPages}";

        return new Manga
        {
            Url = url,
            Title = title,
            ThumbnailUrl = coverUrl ?? "",
            Author = author,
            Description = description,
            Genre = tags,
            Status = Manga.COMPLETED,
            Source = Id
        };
    }

    public async Task<List<Chapter>> GetChapterListAsync(string mangaUrl)
    {
        var fullUrl = mangaUrl.StartsWith("http") ? mangaUrl : $"{BaseUrl}{mangaUrl}";
        var html = await GetHtmlAsync(fullUrl, default);
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var groupNodes = doc.DocumentNode.SelectNodes("//a[contains(@href, '/group/')]//span[@class='tag_name']");
        var groups = groupNodes?.Select(n => n.InnerText.Trim()).ToList() ?? new List<string>();

        return new List<Chapter>
        {
            new Chapter
            {
                Url = mangaUrl,
                Name = "Chapter 1",
                DateUpload = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Scanlator = groups.Any() ? string.Join(", ", groups) : null
            }
        };
    }

    public async Task<List<string>> GetPageListAsync(string chapterUrl)
    {
        var fullUrl = chapterUrl.StartsWith("http") ? chapterUrl : $"{BaseUrl}{chapterUrl}";
        var html = await GetHtmlAsync(fullUrl, default);
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var pages = new List<string>();

        string serverUrl = "";
        var firstThumbNode = doc.DocumentNode.SelectSingleNode("//div[@id='thumbs_append']//div[contains(@class, 'gt_th')][1]//img");
        if (firstThumbNode != null)
        {
            var firstThumbUrl = firstThumbNode.GetAttributeValue("data-src", firstThumbNode.GetAttributeValue("src", ""));
            if (firstThumbUrl.StartsWith("//")) firstThumbUrl = "https:" + firstThumbUrl;
            else if (firstThumbUrl.StartsWith("/")) firstThumbUrl = BaseUrl + firstThumbUrl;

            int lastSlash = firstThumbUrl.LastIndexOf('/');
            if (lastSlash > 0)
            {
                serverUrl = firstThumbUrl.Substring(0, lastSlash);
            }
        }

        var match = System.Text.RegularExpressions.Regex.Match(html, @"var\s+g_th\s*=\s*\$\.parseJSON\('([^']+)'\)");
        if (match.Success && !string.IsNullOrEmpty(serverUrl))
        {
            var jsonString = match.Groups[1].Value;
            try
            {
                using var jsonDoc = System.Text.Json.JsonDocument.Parse(jsonString);
                var fl = jsonDoc.RootElement.GetProperty("fl");
                int totalPages = fl.EnumerateObject().Count();
                
                for (int i = 1; i <= totalPages; i++)
                {
                    if (fl.TryGetProperty(i.ToString(), out var propElem))
                    {
                        string val = propElem.GetString() ?? "";
                        char extChar = val.FirstOrDefault();
                        string ext = extChar switch
                        {
                            'j' => ".jpg",
                            'p' => ".png",
                            'g' => ".gif",
                            'w' => ".webp",
                            _ => ".jpg"
                        };
                        pages.Add($"{serverUrl}/{i}{ext}|Referer={BaseUrl}/");
                    }
                }
                
                if (pages.Count > 0) return pages;
            }
            catch {}
        }

        // Fallback
        var pageNode = doc.DocumentNode.SelectSingleNode("//input[@id='load_pages']");
        int fallbackTotal = 0;
        if (pageNode != null) int.TryParse(pageNode.GetAttributeValue("value", "0"), out fallbackTotal);

        if (fallbackTotal <= 0)
        {
            var thumbNodes = doc.DocumentNode.SelectNodes("//div[@id='thumbs_append']//div[contains(@class, 'gt_th')]//img");
            if (thumbNodes != null) fallbackTotal = thumbNodes.Count;
        }

        if (!string.IsNullOrEmpty(serverUrl) && fallbackTotal > 0)
        {
            var firstThumbUrl = firstThumbNode?.GetAttributeValue("data-src", firstThumbNode?.GetAttributeValue("src", "")) ?? "";
            string ext = ".jpg";
            int dotIdx = firstThumbUrl.LastIndexOf('.');
            if (dotIdx > 0) ext = firstThumbUrl.Substring(dotIdx);
            // clean 't' from thumbnail extension if it exists, like .jpg or something. Wait, in 1t.jpg, ext is .jpg anyway.
            for (int i = 1; i <= fallbackTotal; i++)
            {
                pages.Add($"{serverUrl}/{i}{ext}|Referer={BaseUrl}/");
            }
        }

        return pages;
    }

    private async Task<string> GetHtmlAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            var response = await _httpClient.SendAsync(request, cancellationToken);
            
            if (response.StatusCode == System.Net.HttpStatusCode.Forbidden || 
                response.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable)
            {
                if (_cloudflareBypassService != null)
                    return await _cloudflareBypassService.GetContentAsync(url);
                throw new Exception("Cloudflare blocked the request.");
            }

            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (HttpRequestException)
        {
            if (_cloudflareBypassService != null)
                return await _cloudflareBypassService.GetContentAsync(url);
            throw;
        }
    }
}
