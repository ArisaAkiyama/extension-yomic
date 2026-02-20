using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Yomic.Core.Models;
using Yomic.Core.Sources;
using System.Text.RegularExpressions;
using System.Net.Http;

namespace Yomic.Extensions.Weebcentral
{
    public class WeebcentralSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "Weebcentral";
        public override string BaseUrl => "https://weebcentral.com";
        public override string Language => "EN";
        public override string Version => "1.0.0";
        public override string IconUrl => "https://weebcentral.com/favicon.ico";
        public override string Description => "Read manga online for free at Weeb Central";
        public override string Author => "Yomic Desktop";
        public override string IconBackground => "#1E1F22";
        public override string IconForeground => "White";
        public override bool IsHasMorePages => true;

        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            var url = $"{BaseUrl}/search/data?sort=Popularity&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full+Display&page={page}";
            var doc = await GetHtmlAsync(url);
            return ParseMangaList(doc);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            string url = page == 1 ? BaseUrl : $"{BaseUrl}/latest-updates/{page}";
            var doc = await GetHtmlAsync(url);
            
            // On homepage (page 1), we might need to target a specific section.
            // On paginated pages, the result IS the article list.
            HtmlNode targetNode = doc.DocumentNode;
            if (page == 1)
            {
                targetNode = doc.DocumentNode.SelectSingleNode("//section[contains(@x-data, 'sub_feed_shown')]") ?? doc.DocumentNode;
            }

            var list = ParseMangaList(targetNode);

            // Weebcentral doesn't easily show total pages, so we'll return a high number or just handle it via IsHasMorePages
            return (list, 1000); 
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetFilteredMangaAsync(int page, int statusFilter = 0, int typeFilter = 0)
        {
            // Simple implementation using search or popular as a base if filters aren't easily mapped
            return (await GetPopularMangaAsync(page), 1000);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            return (await GetPopularMangaAsync(page), 1000);
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            if (page > 1) return new List<Manga>();

            var content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("text", query)
            });

            // Need to set HX-Request header for the simple search endpoint
            var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/search/simple?location=main")
            {
                Content = content
            };
            request.Headers.Add("HX-Request", "true");

            var response = await Client.SendAsync(request);
            var html = await response.Content.ReadAsStringAsync();
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var list = new List<Manga>();
            var nodes = doc.DocumentNode.SelectNodes("//a[contains(@href, '/series/')]");
            if (nodes == null) return list;

            foreach (var node in nodes)
            {
                var href = node.GetAttributeValue("href", "");
                var id = href.Replace(BaseUrl, "").Trim('/');
                var titleNode = node.SelectSingleNode(".//div[contains(@class, 'flex-1')]");
                var title = titleNode?.InnerText?.Trim() ?? "Unknown";
                var imgNode = node.SelectSingleNode(".//img");
                var cover = imgNode?.GetAttributeValue("src", "");

                list.Add(new Manga
                {
                    Title = title,
                    Url = id,
                    ThumbnailUrl = EnsureAbsoluteUrl(cover ?? ""),
                    Source = this.Id
                });
            }

            return list;
        }

        private List<Manga> ParseMangaList(HtmlNode root)
        {
            var list = new List<Manga>();
            var nodes = root.SelectNodes(".//article");
            if (nodes == null) return list;

            foreach (var node in nodes)
            {
                // Try different title selectors based on the structures we've seen
                var titleNode = node.SelectSingleNode(".//div[contains(@class, 'truncate')]") ?? 
                                node.SelectSingleNode(".//h2") ?? 
                                node.SelectSingleNode(".//h3") ?? 
                                node.SelectSingleNode(".//strong") ??
                                node.SelectSingleNode(".//a[contains(@class, 'link-hover')]");

                var linkNode = node.SelectSingleNode(".//a[contains(@href, '/series/')]");
                var imgNode = node.SelectSingleNode(".//img");

                if (linkNode != null)
                {
                    var href = linkNode.GetAttributeValue("href", "");
                    var id = href.Replace(BaseUrl, "").Trim('/');
                    
                    // If the link itself doesn't have the series ID (sometimes it's a chapter link wrapping the title)
                    if (id.Contains("/chapters/"))
                    {
                         linkNode = node.SelectSingleNode(".//a[contains(@href, '/series/')]");
                         href = linkNode?.GetAttributeValue("href", "") ?? href;
                         id = href.Replace(BaseUrl, "").Trim('/');
                    }
                    
                    // Specific check for search results where title is inside a link
                    var title = titleNode?.InnerText?.Trim() ?? imgNode?.GetAttributeValue("alt", "").Replace(" cover", "").Trim() ?? "Unknown";
                    
                    // Clean up title if it contains HTML entities or extra whitespace
                    title = System.Net.WebUtility.HtmlDecode(title);

                    var cover = ExtractCoverUrl(node);

                    var manga = new Manga
                    {
                        Title = title,
                        Url = id,
                        ThumbnailUrl = EnsureAbsoluteUrl(cover ?? ""),
                        Source = this.Id
                    };

                    // Try to parse status (Search/Popular results have this)
                    var statusNode = node.SelectSingleNode(".//div[strong[contains(text(), 'Status')]]/span");
                    if (statusNode != null)
                    {
                        var statusText = statusNode.InnerText.Trim().ToLower();
                        manga.Status = statusText.Contains("ongoing") ? Manga.ONGOING :
                                       statusText.Contains("complete") ? Manga.COMPLETED :
                                       statusText.Contains("hiatus") ? Manga.ON_HIATUS :
                                       statusText.Contains("cancel") ? Manga.CANCELLED :
                                       Manga.UNKNOWN;
                    }

                    list.Add(manga);
                }
            }

            return list;
        }

        private List<Manga> ParseMangaList(HtmlDocument doc) => ParseMangaList(doc.DocumentNode);

        public override async Task<Manga> GetMangaDetailsAsync(string id)
        {
            var url = id.StartsWith("http") ? id : $"{BaseUrl}/{id}";
            var doc = await GetHtmlAsync(url);
            var root = doc.DocumentNode;

            var manga = new Manga
            {
                Url = id,
                Source = this.Id,
                Title = root.SelectSingleNode("//h1")?.InnerText?.Trim() ?? "Unknown"
            };

            var authorNode = root.SelectSingleNode("//a[contains(@href, '/search?author=')]");
            manga.Author = authorNode?.InnerText?.Trim() ?? "Unknown";

            var synopsisNode = root.SelectSingleNode("//p[contains(@class, 'whitespace-pre-wrap')]");
            manga.Description = synopsisNode?.InnerText?.Trim() ?? "";

            var genreNodes = root.SelectNodes("//a[contains(@href, '/search?included_tag=')]");
            if (genreNodes != null)
            {
                manga.Genre = genreNodes.Select(n => n.InnerText.Trim()).ToList();
            }

            // 1. Attempt to find the main cover picture directly (Scoped to MAIN to avoid Header)
            var coverNode = root.SelectSingleNode("//main//div[@id='top']//picture");
            System.Console.WriteLine($"[Weebcentral] {(coverNode != null ? "Found cover via ID 'top'" : "Cover ID 'top' failed")}");
            
            // 2. Fallback: Find an image with 'cover' in alt text (Scoped to MAIN)
            if (coverNode == null)
            {
                var imgNode = root.SelectSingleNode("//main//img[contains(translate(@alt, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cover')]");
                coverNode = imgNode?.ParentNode;
                System.Console.WriteLine($"[Weebcentral] {(coverNode != null ? "Found cover via Alt text" : "Cover Alt text failed")}");
            }

            // 3. Fallback: Broad search in MAIN, but EXCLUDE brand/logo
            if (coverNode == null)
            {
                // Find any section in main that has an image, but check the src
                var potentialNodes = root.SelectNodes("//main//section[contains(@class, 'flex-col')]//img");
                if (potentialNodes != null)
                {
                    foreach (var img in potentialNodes)
                    {
                        var src = img.GetAttributeValue("src", "");
                        if (!src.Contains("brand") && !src.Contains("logo"))
                        {
                            coverNode = img.ParentNode;
                            System.Console.WriteLine($"[Weebcentral] Found cover via Fallback: {src}");
                            break;
                        }
                    }
                }
            }

            var cover = coverNode != null ? ExtractCoverUrl(coverNode) : "";
            
            System.Console.WriteLine($"[Weebcentral] Raw extracted cover: '{cover}'");
            System.Diagnostics.Debug.WriteLine($"[Weebcentral] Raw extracted cover: '{cover}'");

            // Final safety check (Case Insensitive)
            if (cover.IndexOf("brand.png", StringComparison.OrdinalIgnoreCase) >= 0 || 
                cover.IndexOf("brand.svg", StringComparison.OrdinalIgnoreCase) >= 0 ||
                cover.IndexOf("logo", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                 System.Console.WriteLine($"[Weebcentral] SAFETY TRIGGERED: Detected brand logo '{cover}'. Clearing it.");
                 System.Diagnostics.Debug.WriteLine($"[Weebcentral] SAFETY TRIGGERED: Detected brand logo '{cover}'. Clearing it.");
                 cover = "";
            }

            manga.ThumbnailUrl = EnsureAbsoluteUrl(cover);

            // Parse Status
            var statusNode = root.SelectSingleNode("//a[contains(@href, '/search?included_status=')]");
            if (statusNode != null)
            {
                var statusText = statusNode.InnerText.Trim().ToLower();
                manga.Status = statusText.Contains("ongoing") ? Manga.ONGOING :
                               statusText.Contains("complete") ? Manga.COMPLETED :
                               statusText.Contains("hiatus") ? Manga.ON_HIATUS :
                               statusText.Contains("cancel") ? Manga.CANCELLED :
                               Manga.UNKNOWN;
            }

            return manga;
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string id)
        {
            var url = id.StartsWith("http") ? id : $"{BaseUrl}/{id}";
            
            // Normalize to the AJAX endpoint: https://weebcentral.com/series/[ID]/full-chapter-list
            // This avoids missing chapters hidden behind the "Show All Chapters" button.
            var uri = new Uri(url.TrimEnd('/'));
            var segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            
            if (segments.Length >= 2 && segments[0] == "series")
            {
                url = $"{BaseUrl}/series/{segments[1]}/full-chapter-list";
            }
            else if (!url.EndsWith("/full-chapter-list"))
            {
                url = url.TrimEnd('/') + "/full-chapter-list";
            }

            var doc = await GetHtmlAsync(url);
            
            var list = new List<Chapter>();
            var nodes = doc.DocumentNode.SelectNodes("//a[contains(@href, '/chapters/')]");
            if (nodes == null) return list;

            foreach (var node in nodes)
            {
                var href = node.GetAttributeValue("href", "");
                var chapterId = href.Replace(BaseUrl, "").Trim('/');
                
                // Title is often like "Chapter 1174"
                var titleNode = node.SelectSingleNode(".//span[contains(text(), 'Chapter')]") 
                            ?? node.SelectSingleNode(".//span[contains(@class, 'truncate')]");
                
                var title = titleNode?.InnerText?.Trim() ?? node.InnerText.Trim();

                list.Add(new Chapter
                {
                    Name = title,
                    Url = chapterId
                });
            }

            return list;
        }

        public override async Task<List<string>> GetPageListAsync(string chapterId)
        {
            var url = chapterId.StartsWith("http") ? chapterId : $"{BaseUrl}/{chapterId}";
            var doc = await GetHtmlAsync(url);
            
            var pages = new List<string>();
            
            // 1. Get total page count from page_select_modal
            var modal = doc.DocumentNode.SelectSingleNode("//dialog[@id='page_select_modal']");
            int pageCount = 0;
            if (modal != null)
            {
                var buttons = modal.SelectNodes(".//button[not(contains(text(), 'Close'))]");
                if (buttons != null)
                {
                    foreach (var btn in buttons)
                    {
                        var text = btn.InnerText.Trim();
                        if (int.TryParse(text, out int p) && p > pageCount)
                        {
                            pageCount = p;
                        }
                    }
                }
            }

            // 2. Get image pattern from preload link
            var preloadLink = doc.DocumentNode.SelectSingleNode("//link[@rel='preload' and @as='image']");
            var firstImgUrl = preloadLink?.GetAttributeValue("href", "");

            if (string.IsNullOrEmpty(firstImgUrl))
            {
                // Fallback: search for any image that looks like a chapter image
                var anyImg = doc.DocumentNode.SelectSingleNode("//img[contains(@src, 'temp.compsci88.com/manga/')]");
                firstImgUrl = anyImg?.GetAttributeValue("src", "");
            }

            if (!string.IsNullOrEmpty(firstImgUrl) && pageCount > 0)
            {
                // Pattern is often .../One-Piece/1174-001.png
                var lastDashIndex = firstImgUrl.LastIndexOf('-');
                if (lastDashIndex != -1)
                {
                    var baseUrlPart = firstImgUrl.Substring(0, lastDashIndex + 1);
                    var afterDash = firstImgUrl.Substring(lastDashIndex + 1);
                    var extIndex = afterDash.LastIndexOf('.');
                    if (extIndex != -1)
                    {
                        var extensionPart = afterDash.Substring(extIndex);
                        var padLength = extIndex; // e.g. "001" has length 3

                        for (int i = 1; i <= pageCount; i++)
                        {
                            var pageStr = i.ToString().PadLeft(padLength, '0');
                            pages.Add($"{baseUrlPart}{pageStr}{extensionPart}");
                        }
                    }
                }
            }

            return pages;
        }

        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            var html = await GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        private string? ExtractCoverUrl(HtmlNode container)
    {
        if (container == null) return null;

        // 1. Try to find <source srcset="..."> (usually contains high quality webp/jpg)
        // srcset can contain multiple URLs (e.g. "url1 200w, url2 400w" or just "url")
        var sourceNode = container.SelectSingleNode(".//source");
        var srcset = sourceNode?.GetAttributeValue("srcset", "");
        if (!string.IsNullOrEmpty(srcset))
        {
            // Take the first URL found in srcset
            var url = srcset.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries)[0];
            System.Console.WriteLine($"[Weebcentral] Parsed source tag for cover: {url}");
            return url;
        }

        // 2. Fallback to <img> src
        var imgNode = container.SelectSingleNode(".//img");
        var imgUrl = imgNode?.GetAttributeValue("src", "");
        System.Console.WriteLine($"[Weebcentral] Fallback to img tag for cover: {imgUrl}");
        return imgUrl;
    }

    private string EnsureAbsoluteUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return url;
            if (url.StartsWith("//")) return "https:" + url;
            if (url.StartsWith("/")) return BaseUrl.TrimEnd('/') + url;
            return url;
        }
    }
}
