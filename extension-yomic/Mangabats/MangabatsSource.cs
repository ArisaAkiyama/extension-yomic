using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;
using HtmlAgilityPack;
using Yomic.Core.Models;
using Yomic.Core.Sources;

namespace Yomic.Extensions.Mangabats
{
    public class MangabatsSource : HttpSource, IFilterableMangaSource
    {
        public override string Name => "Mangabats";
        public override string BaseUrl => "https://www.mangabats.com";
        
        public override string Version => "1.0.3";
        public override string IconUrl => "https://www.google.com/s2/favicons?domain=mangabats.com&sz=128";
        public override string Description => "Read manga online free at Mangabats with huge collection.";
        public override string Author => "Yomic Desktop";

        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            var tuple = await GetMangaListAsync(page);
            return tuple.Items;
        }

        // IFilterableMangaSource Implementation
        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            // User requested to match "hot-manga" order for the main list
            string url = page == 1 ? $"{BaseUrl}/manga-list/hot-manga" : $"{BaseUrl}/manga-list/hot-manga?page={page}";
            var html = await Client.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var mangaList = new List<Manga>();
            
            // New structure: <a> is the item itself
            var nodes = doc.DocumentNode.SelectNodes("//a[contains(@class, 'list-story-item')]");
            if (nodes == null) return (mangaList, 1);

            foreach (var node in nodes)
            {
                // Title is in 'title' attribute of <a>
                string titleRaw = node.GetAttributeValue("title", "").Trim();
                string title = System.Net.WebUtility.HtmlDecode(titleRaw);
                string href = node.GetAttributeValue("href", "");
                
                var imgNode = node.SelectSingleNode(".//img");
                string img = ExtractImageUrl(imgNode);

                // validate: must have title, href, AND image. Also exclude "Chapter" links if they sneak in.
                if (!string.IsNullOrEmpty(title) && 
                    !string.IsNullOrEmpty(href) && 
                    !string.IsNullOrEmpty(img) &&
                    !title.StartsWith("Chapter", StringComparison.OrdinalIgnoreCase))
                {
                    mangaList.Add(new Manga
                    {
                        Title = title,
                        Url = href,
                        ThumbnailUrl = $"{img}|Referer={BaseUrl}/",
                        Source = Id
                    });
                }
            }
            
            // Pagination - Use robust helper method
            int totalPages = ExtractTotalPages(doc.DocumentNode, page);

            return (mangaList, totalPages);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            // Use user-suggested URL: manga-list/latest-manga
            string url = page == 1 ? $"{BaseUrl}/manga-list/latest-manga" : $"{BaseUrl}/manga-list/latest-manga?page={page}";
            var html = await Client.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var mangaList = new List<Manga>();

            var nodes = doc.DocumentNode.SelectNodes("//a[contains(@class, 'list-story-item')]");
            if (nodes == null) return (mangaList, 1);

            foreach (var node in nodes)
            {
                string titleRaw = node.GetAttributeValue("title", "").Trim();
                string title = System.Net.WebUtility.HtmlDecode(titleRaw);
                string href = node.GetAttributeValue("href", "");
                
                var imgNode = node.SelectSingleNode(".//img");
                string img = ExtractImageUrl(imgNode);

                if (!string.IsNullOrEmpty(title) && 
                    !string.IsNullOrEmpty(href) && 
                    !string.IsNullOrEmpty(img) &&
                    !title.Contains("Chapter", StringComparison.OrdinalIgnoreCase) && 
                    !title.StartsWith("Vol.", StringComparison.OrdinalIgnoreCase))
                {
                    mangaList.Add(new Manga
                    {
                        Title = title,
                        Url = href,
                        ThumbnailUrl = $"{img}|Referer={BaseUrl}/",
                        Source = Id
                    });
                }
            }
            
            // Pagination - Optimistic Approach for Infinite Scroll
             // If we found items, assume there is a next page to keep scrolling alive.
             // Relying solely on 'page-next' usually fails if the button selector changes.
             int totalPages;
             if (mangaList.Count > 0)
             {
                 totalPages = page + 1;
             }
             else
             {
                 totalPages = page; // Stop if no items found
             }
             
            return (mangaList, totalPages);
        }



        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
             // Search page uses different structure than hot-manga/latest-manga
             // Container: div.story_item
             // Title/URL: div.story_item_right h3 a
             // Image: img (inside story_item)
             
             string searchSlug = query.Replace(" ", "_").ToLower();
             string url = $"{BaseUrl}/search/story/{searchSlug}";
             
             if (page > 1) url += $"?page={page}";
             
             var html = await Client.GetStringAsync(url);
             var doc = new HtmlDocument();
             doc.LoadHtml(html);
             
             // DEBUG: Log HTML length to verify content received
             System.Diagnostics.Debug.WriteLine($"[Mangabats Search] HTML length: {html?.Length ?? 0}");

             var mangaList = new List<Manga>();
             
             // FIXED: Correct selector for search results - div.story_item (not div.list-story-item)
             var nodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'story_item')]");
             
             // DEBUG: Log node count
             System.Diagnostics.Debug.WriteLine($"[Mangabats Search] div.story_item nodes found: {nodes?.Count ?? 0}");
             
             if (nodes != null)
             {
                 foreach (var node in nodes)
                 {
                     // Title and URL from div.story_item_right h3 a
                     var titleNode = node.SelectSingleNode(".//div[contains(@class, 'story_item_right')]//h3//a");
                     // Image - try img inside the node
                     var imgNode = node.SelectSingleNode(".//img");

                     if (titleNode != null)
                     {
                         string title = System.Net.WebUtility.HtmlDecode(titleNode.InnerText.Trim());
                         string href = titleNode.GetAttributeValue("href", "");
                         string img = ExtractImageUrl(imgNode);

                         if (!string.IsNullOrEmpty(title) && !string.IsNullOrEmpty(href))
                         {
                             mangaList.Add(new Manga
                             {
                                 Title = title,
                                Url = href,
                                ThumbnailUrl = $"{img}|Referer=https://www.mangabats.com/",
                                Source = Id
                            });
                         }
                     }
                 }
             }
             
             // DEBUG: Log final result count
             System.Diagnostics.Debug.WriteLine($"[Mangabats Search] Final manga count: {mangaList.Count}");

             return mangaList;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string url)
        {
            if (!url.StartsWith("http")) url = $"{BaseUrl}/{url.TrimStart('/')}";

            var html = await Client.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var manga = new Manga { Url = url, Source = Id };
            
            // 1. Title - Try h1 (most robust)
            var h1 = doc.DocumentNode.SelectSingleNode("//h1");
            manga.Title = System.Net.WebUtility.HtmlDecode(h1?.InnerText.Trim() ?? "Unknown");

            // 2. Metadata - Iterate all P tags to find labels
            var pTags = doc.DocumentNode.SelectNodes("//p");
            if (pTags != null)
            {
                foreach (var p in pTags)
                {
                    var text = p.InnerText.Trim();
                    if (string.IsNullOrEmpty(text)) continue;

                    if (text.Contains("Author", StringComparison.OrdinalIgnoreCase))
                    {
                        // Value might be in this tag OR next sibling text node OR next sibling element
                        manga.Author = ExtractSiblingText(p);
                    }
                    else if (text.Contains("Status", StringComparison.OrdinalIgnoreCase))
                    {
                        var statusStr = ExtractSiblingText(p).ToLower();
                        if (statusStr.Contains("ongoing")) manga.Status = Manga.ONGOING;
                        else if (statusStr.Contains("completed")) manga.Status = Manga.COMPLETED;
                        else manga.Status = Manga.UNKNOWN;
                    }
                }
            }

            // Specific Genre check (headers/divs often used for genres)
            var genreNodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'genres-wrap')]//a");
            if (genreNodes != null)
            {
                manga.Genre = genreNodes.Select(x => x.InnerText.Trim()).ToList();
            }
            else
            {
                // Fallback: check P tags for "Genres" if not found above
                if (pTags != null)
                {
                    foreach (var p in pTags)
                    {
                         if (p.InnerText.Contains("Genres", StringComparison.OrdinalIgnoreCase))
                         {
                             manga.Genre = ExtractSiblingText(p).Split(',').Select(x => x.Trim()).ToList();
                         }
                    }
                }
            }

            // Fallback for metadata if p-tags failed (Old structure check)
            if (string.IsNullOrEmpty(manga.Author))
            {
                var tableRows = doc.DocumentNode.SelectNodes("//table[contains(@class, 'variations-tableInfo')]//tr");
                if (tableRows != null)
                {
                    foreach (var row in tableRows)
                    {
                         // ... existing table logic can stay or be replaced, but let's keep it simple
                         var label = row.SelectSingleNode(".//td[contains(@class, 'table-label')]")?.InnerText.Trim();
                         var value = row.SelectSingleNode(".//td[contains(@class, 'table-value')]")?.InnerText.Trim();
                         if (label != null && value != null)
                         {
                             if (label.Contains("Author")) manga.Author = value;
                             if (label.Contains("Status")) { /* ... */ } 
                         }
                    }
                }
            }
            
            // 3. Description
            // Try #contentBox (most robust for this site)
            var contentBox = doc.DocumentNode.SelectSingleNode("//div[@id='contentBox']");
            if (contentBox != null)
            {
                var sb = new System.Text.StringBuilder();
                foreach (var child in contentBox.ChildNodes)
                {
                    // Skip the header (h2) usually containing "Title summary:"
                    if (child.Name == "h2" || child.Name == "h3" || child.Name == "p" && child.InnerText.ToLower().Contains("summary"))
                        continue;
                    
                    sb.Append(child.InnerText);
                }
                manga.Description = System.Net.WebUtility.HtmlDecode(sb.ToString().Trim());
            }
            else
            {
                var descNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'panel-story-info-description')]");
                if (descNode != null)
                {
                    var text = descNode.InnerText.Trim();
                    var cleaned = text.StartsWith("Description :") ? text.Substring("Description :".Length).Trim() : text;
                    manga.Description = System.Net.WebUtility.HtmlDecode(cleaned);
                }
                else
                {
                    // Fallback: finding header then next p/div
                    var headers = doc.DocumentNode.SelectNodes("//*[contains(text(), 'Description') or contains(text(), 'Summary')]");
                    if (headers != null)
                    {
                        foreach(var head in headers)
                        {
                             if(head.Name == "h2" || head.Name=="h3" || head.Name=="p")
                             {
                                 // Try next sibling
                                 var sibling = head.NextSibling;
                                 while(sibling != null && (sibling.NodeType == HtmlNodeType.Text && string.IsNullOrWhiteSpace(sibling.InnerText)))
                                     sibling = sibling.NextSibling;
                                 
                                 if(sibling != null) 
                                 {
                                     manga.Description = System.Net.WebUtility.HtmlDecode(sibling.InnerText.Trim());
                                 }
                             }
                        }
                    }
                }
            }

            // 4. Image
            var img = doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'story-info-left')]//img");
            if (img == null) img = doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'slide-caption')]//img"); // mobile/card view
            if (img != null) 
            {
                var src = img.GetAttributeValue("src", "");
                if (!string.IsNullOrEmpty(src))
                {
                    manga.ThumbnailUrl = $"{src}|Referer=https://www.mangabats.com/";
                }
            }

            return manga;
        }

        private string ExtractSiblingText(HtmlNode node)
        {
            // Try extracting text from the node itself if it has ":" and text after it
            var selfText = node.InnerText.Trim();
            if (selfText.Contains(":"))
            {
                var parts = selfText.Split(new[] { ':' }, 2);
                if (parts.Length > 1 && !string.IsNullOrWhiteSpace(parts[1])) return parts[1].Trim();
            }

            // Try next sibling text node
            var sibling = node.NextSibling;
            while (sibling != null)
            {
                if (sibling.NodeType == HtmlNodeType.Text)
                {
                     var txt = sibling.InnerText.Trim();
                     if(!string.IsNullOrEmpty(txt)) return txt;
                }
                else if (sibling.NodeType == HtmlNodeType.Element && sibling.Name == "p")
                {
                     // Sibling is P tag with value?
                     return sibling.InnerText.Trim();
                }
                else if (sibling.Name == "a")
                {
                    // Authors might be links
                     return sibling.InnerText.Trim();
                }
                
                sibling = sibling.NextSibling;
            }
            return "";
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaUrl)
        {
             if (!mangaUrl.StartsWith("http")) mangaUrl = $"{BaseUrl}/{mangaUrl.TrimStart('/')}";

            var html = await Client.GetStringAsync(mangaUrl);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var chapters = new List<Chapter>();
            
            // 1. Try API Method (New Structure)
            var apiContainer = doc.DocumentNode.SelectSingleNode("//div[@id='chapter-list-container']");
            if (apiContainer != null)
            {
                var slug = apiContainer.GetAttributeValue("data-comic-slug", "");
                if (!string.IsNullOrEmpty(slug))
                {
                    int offset = 0;
                    bool hasMore = true;
                    
                    try 
                    {
                        while (hasMore)
                        {
                            string apiUrl = $"https://www.mangabats.com/api/manga/{slug}/chapters?offset={offset}&limit=3000";
                            var json = await Client.GetStringAsync(apiUrl);
                            using (JsonDocument jdoc = JsonDocument.Parse(json))
                            {
                                if (jdoc.RootElement.TryGetProperty("data", out var dataEl) && 
                                    dataEl.TryGetProperty("chapters", out var chaptersEl) &&
                                    chaptersEl.ValueKind == JsonValueKind.Array)
                                {
                                    foreach (var chap in chaptersEl.EnumerateArray())
                                    {
                                        string name = chap.GetProperty("chapter_name").GetString() ?? "";
                                        string cSlug = chap.GetProperty("chapter_slug").GetString() ?? "";
                                        string updated = chap.TryGetProperty("updated_at", out var upEl) ? upEl.GetString() : "";
                                        
                                        string chapUrl = $"{BaseUrl}/manga/{slug}/{cSlug}";
                                        
                                        long dateUpload = 0;
                                        if (DateTime.TryParse(updated, out var dt)) dateUpload = new DateTimeOffset(dt).ToUnixTimeSeconds();
                                        
                                        // Deduplicate
                                        if (!chapters.Any(c => c.Url == chapUrl))
                                        {
                                            chapters.Add(new Chapter 
                                            {
                                                Name = name,
                                                Url = chapUrl,
                                                DateUpload = dateUpload
                                            });
                                        }
                                    }

                                    // Check pagination
                                    if (dataEl.TryGetProperty("pagination", out var pagEl))
                                    {
                                        hasMore = pagEl.TryGetProperty("has_more", out var moreEl) && moreEl.GetBoolean();
                                        if (hasMore && pagEl.TryGetProperty("limit", out var limitEl))
                                        {
                                            offset += limitEl.GetInt32();
                                        }
                                        else
                                        {
                                            hasMore = false;
                                        }
                                    }
                                    else
                                    {
                                        hasMore = false;
                                    }
                                }
                                else
                                {
                                    hasMore = false;
                                }
                            }
                        }

                        if (chapters.Count > 0) return chapters;
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"[Mangabats] API Error: {ex.Message}");
                        // API failed partway or at start, fall through to scraping if we have no chapters
                        if (chapters.Count == 0) { /* continue to fallback */ }
                        else return chapters;
                    }
                }
            }

            // 2. Fallback: Standard scraper (Old Structure)
            var nodes = doc.DocumentNode.SelectNodes("//ul[contains(@class, 'row-content-chapter')]//li");
            
            // REMOVED DANGEROUS FALLBACK: //a[contains(@href, 'chapter-')]
            // This fallback was picking up sidebar items. 
            // If API fails and standard selector fails, return empty list rather than garbage.

            if (nodes == null) return chapters;

            foreach (var node in nodes)
            {
                HtmlNode link = node.Name == "a" ? node : node.SelectSingleNode(".//a");
                var time = node.SelectSingleNode(".//span[contains(@class, 'chapter-time')]");
                
                if (link != null)
                {
                     string name = link.InnerText.Trim();
                     string url = link.GetAttributeValue("href", "");
                     string dateStr = time?.GetAttributeValue("title", "") ?? time?.InnerText.Trim() ?? "";

                     // deduplicate or filter
                     if(url.Contains("chapter") && !chapters.Any(c => c.Url == url))
                     {
                         chapters.Add(new Chapter
                         {
                             Name = name,
                             Url = url,
                             DateUpload = ParseDate(dateStr) 
                         });
                     }
                }
            }

            return chapters;
        }
        
        private long ParseDate(string dateStr)
        {
            if (string.IsNullOrEmpty(dateStr)) return 0;
            if (DateTime.TryParse(dateStr, out var date))
            {
                return new DateTimeOffset(date).ToUnixTimeSeconds();
            }
            return DateTimeOffset.Now.ToUnixTimeSeconds(); 
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
             if (!chapterUrl.StartsWith("http")) chapterUrl = $"{BaseUrl}/{chapterUrl.TrimStart('/')}";

            var html = await Client.GetStringAsync(chapterUrl);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var pages = new List<string>();
            
            // Prioritize .container-chapter-reader as requested
            var nodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'container-chapter-reader')]//img");
            if (nodes == null) return pages;

            foreach (var node in nodes)
            {
                var src = ExtractImageUrl(node);
                
                if (!string.IsNullOrEmpty(src)) 
                {
                   // Append Referer header for image loader (fixes 403 Forbidden)
                   // Syntax: URL|Referer=https://www.mangabats.com/
                   pages.Add($"{src}|Referer=https://www.mangabats.com/"); 
               }
           }

            return pages;
        }

        #region Robust Helper Methods

        /// <summary>
        /// Extracts image URL from an img node with multiple fallback strategies.
        /// Handles lazy loading attributes and placeholder detection.
        /// </summary>
        private string ExtractImageUrl(HtmlNode? imgNode)
        {
            if (imgNode == null) return string.Empty;

            // Priority order of attributes to check
            string[] imageAttributes = { "data-src", "data-lazy-src", "data-original", "src", "data-srcset" };
            
            // Placeholder patterns to detect and skip
            string[] placeholderPatterns = { 
                "lazy", "placeholder", "loading", "blank", "default", 
                "1x1", "data:image", "transparent", "thumb_default" 
            };

            foreach (var attr in imageAttributes)
            {
                var value = imgNode.GetAttributeValue(attr, "");
                if (string.IsNullOrWhiteSpace(value)) continue;

                // Handle srcset (get first URL)
                if (attr == "data-srcset" && value.Contains(","))
                {
                    value = value.Split(',').FirstOrDefault()?.Trim().Split(' ').FirstOrDefault() ?? "";
                }

                // Skip if it's a placeholder
                bool isPlaceholder = placeholderPatterns.Any(p => 
                    value.Contains(p, StringComparison.OrdinalIgnoreCase));
                
                if (isPlaceholder) continue;

                // Valid image URL found
                if (value.StartsWith("http") || value.StartsWith("//"))
                {
                    if (value.StartsWith("//")) value = "https:" + value;
                    return value;
                }
            }

            // Last resort: check any attribute containing "src" or "image"
            foreach (var attr in imgNode.Attributes)
            {
                if ((attr.Name.Contains("src", StringComparison.OrdinalIgnoreCase) || 
                     attr.Name.Contains("image", StringComparison.OrdinalIgnoreCase)) &&
                    attr.Value.StartsWith("http") &&
                    !placeholderPatterns.Any(p => attr.Value.Contains(p, StringComparison.OrdinalIgnoreCase)))
                {
                    return attr.Value;
                }
            }

            return string.Empty;
        }

        /// <summary>
        /// Extracts total pages from pagination with multiple fallback strategies.
        /// Does not rely on specific CSS class names.
        /// </summary>
        private int ExtractTotalPages(HtmlNode docNode, int currentPage)
        {
            // Strategy 1: Find any link with "page=" parameter and get the highest number
            var allLinks = docNode.SelectNodes("//a[@href]");
            int maxPage = currentPage;
            
            if (allLinks != null)
            {
                var pageRegex = new System.Text.RegularExpressions.Regex(@"[?&]page=(\d+)");
                foreach (var link in allLinks)
                {
                    var href = link.GetAttributeValue("href", "");
                    var match = pageRegex.Match(href);
                    if (match.Success && int.TryParse(match.Groups[1].Value, out int pageNum))
                    {
                        if (pageNum > maxPage) maxPage = pageNum;
                    }
                }
                
                if (maxPage > currentPage) return maxPage;
            }

            // Strategy 2: Find pagination container and look for page numbers
            string[] paginationSelectors = {
                "//ul[contains(@class, 'pag')]",
                "//div[contains(@class, 'pag')]",
                "//nav[contains(@class, 'pag')]",
                "//ul[contains(@class, 'page')]",
                "//div[contains(@class, 'page')]"
            };

            foreach (var selector in paginationSelectors)
            {
                var pagContainer = docNode.SelectSingleNode(selector);
                if (pagContainer != null)
                {
                    // Find all numbers in pagination links
                    var pageLinks = pagContainer.SelectNodes(".//a");
                    if (pageLinks != null)
                    {
                        foreach (var link in pageLinks)
                        {
                            var text = link.InnerText.Trim();
                            if (int.TryParse(text, out int pageNum) && pageNum > maxPage)
                            {
                                maxPage = pageNum;
                            }
                        }
                        
                        if (maxPage > currentPage) return maxPage;
                    }
                }
            }

            // Strategy 3: Look for "Next" button - if exists, assume at least one more page
            string[] nextSelectors = {
                "//a[contains(@class, 'next')]",
                "//a[contains(@class, 'page_next')]",
                "//a[contains(@class, 'page-next')]",
                "//a[contains(text(), 'Next')]",
                "//a[contains(text(), '»')]",
                "//a[contains(text(), '>')]"
            };

            foreach (var selector in nextSelectors)
            {
                var nextButton = docNode.SelectSingleNode(selector);
                if (nextButton != null)
                {
                    return currentPage + 1;
                }
            }

            // Strategy 4: Look for "Last" link
            string[] lastSelectors = {
                "//a[contains(@class, 'last')]",
                "//a[contains(@class, 'page_last')]",
                "//a[contains(@class, 'page-last')]",
                "//a[contains(text(), 'Last')]",
                "//a[contains(text(), '»»')]"
            };

            foreach (var selector in lastSelectors)
            {
                var lastLink = docNode.SelectSingleNode(selector);
                if (lastLink != null)
                {
                    var href = lastLink.GetAttributeValue("href", "");
                    var pageRegex = new System.Text.RegularExpressions.Regex(@"page=(\d+)");
                    var match = pageRegex.Match(href);
                    if (match.Success && int.TryParse(match.Groups[1].Value, out int lastPage))
                    {
                        return lastPage;
                    }
                }
            }

            return maxPage;
        }

        #endregion
    }
}
