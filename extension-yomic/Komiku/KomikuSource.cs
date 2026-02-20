using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Yomic.Core.Models;
using Yomic.Core.Sources;
using System.Text.RegularExpressions;

namespace Yomic.Extensions.Komiku
{
    public class KomikuSource : HttpSource, IFilterableMangaSource
    {
        public override long Id => 3; 
        public override string Name => "Komiku";
        public override string BaseUrl => "https://komiku.org";
        public override string Language => "ID";
        public override bool IsHasMorePages => true;



        public override async Task<List<Manga>> GetPopularMangaAsync(int page)
        {
            // Page 1: Homepage
            string url = page == 1 ? BaseUrl : $"{BaseUrl}/pustaka/page/{page}/?orderby=meta_value_num&tipe=manga";
            
            var doc = await GetHtmlAsync(url);
            var list = new List<Manga>();

            Console.WriteLine($"[Komiku] Parsing URL: {url}");
            
            // Selector Strategy: Generic Card
            var nodes = doc.DocumentNode.SelectNodes("//div[.//a[contains(@href, '/manga/')] and .//img]");
            
            if (nodes == null) 
            {
                 // Try Article tag just in case
                 nodes = doc.DocumentNode.SelectNodes("//article[.//a[contains(@href, '/manga/')] and .//img]");
            }

            Console.WriteLine($"[Komiku] Parsing: Found {nodes?.Count ?? 0} nodes using Generic Selector.");

            if (nodes != null)
            {
                 var filteredNodes = new HtmlNodeCollection(nodes[0].OwnerDocument.DocumentNode);
                 foreach(var n in nodes) { filteredNodes.Add(n); }
                 nodes = filteredNodes;
            }

            if (nodes == null) return list;

            foreach (var node in nodes)
            {
                try
                {
                    var a = node.SelectSingleNode(".//a");
                    var img = node.SelectSingleNode(".//img");
                    
                    var titleNode = node.SelectSingleNode(".//h4") 
                                  ?? node.SelectSingleNode(".//h3") 
                                  ?? node.SelectSingleNode(".//div[@class='tt']");

                    if (a != null && img != null)
                    {
                        var href = a.GetAttributeValue("href", "");
                        
                        // FILTER: Exclude system links
                        if (href.Contains("?tipe=") || href.Contains("?orderby=")) continue;

                        var id = href.TrimEnd('/').Split('/').Last();
                        var title = titleNode?.InnerText?.Trim() ?? img.GetAttributeValue("alt", "").Trim();
                        var cover = img.GetAttributeValue("src", "");

                        // Handle Lazy Load
                        if (string.IsNullOrEmpty(cover) || cover.Contains("data:image") || cover.Contains("placeholder") || cover.Contains("lazy.jpg")) 
                        {
                            cover = img.GetAttributeValue("data-src", "");
                            if (string.IsNullOrEmpty(cover)) cover = img.GetAttributeValue("data-original", "");
                        }
                        
                        cover = EnsureAbsoluteUrl(cover);

                        // CLEAN TITLES
                        title = CleanTitle(title);

                        if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(title))
                        {
                            list.Add(new Manga
                            {
                                Title = title,
                                Url = id,
                                ThumbnailUrl = cover,
                                Source = this.Id
                            });

                            // DEBUG: Log first 3 items
                            if (list.Count <= 3) 
                            {
                                Console.WriteLine($"[Komiku] Item [{list.Count}]: {title} | Cover: {cover}");
                            }
                        }
                    }
                }
                catch (Exception ex) { Console.WriteLine($"[Komiku] Item Parse Error: {ex.Message}"); }
            }
            
            return list.GroupBy(m => m.Url).Select(g => g.First()).ToList();
        }

        /// <summary>
        /// Get paginated manga list from /daftar-komik/ (6,661 comics, 134 pages)
        /// </summary>
        public async Task<(List<Manga> Items, int TotalPages)> GetMangaListAsync(int page)
        {
            string url = page == 1 
                ? $"{BaseUrl}/daftar-komik/" 
                : $"{BaseUrl}/daftar-komik/page/{page}/";
            
            var doc = await GetHtmlAsync(url);
            var list = new List<Manga>();
            int totalPages = 134; // Default

            Console.WriteLine($"[Komiku] Fetching manga list page {page}: {url}");

            // Try to extract total pages from pagination
            var pageLinks = doc.DocumentNode.SelectNodes("//a[contains(@class, 'page-numbers')]");
            if (pageLinks != null)
            {
                foreach (var link in pageLinks)
                {
                    var text = link.InnerText.Trim();
                    if (int.TryParse(text, out int pageNum) && pageNum > totalPages)
                    {
                        totalPages = pageNum;
                    }
                }
            }

            // Strategy: Parse all links that point to /manga/ and extract unique manga
            // The daftar-komik page lists manga with links like: /manga/manga-name/
            var seenIds = new HashSet<string>();
            var allLinks = doc.DocumentNode.SelectNodes("//a[contains(@href, '/manga/')]");
            
            Console.WriteLine($"[Komiku] Found {allLinks?.Count ?? 0} manga links on page");

            if (allLinks != null)
            {
                foreach (var link in allLinks)
                {
                    try
                    {
                        var href = link.GetAttributeValue("href", "");
                        if (string.IsNullOrEmpty(href)) continue;
                        
                        // Skip system and non-content links
                        if (href.Contains("?") || href.Contains("#") || href.StartsWith("javascript")) continue;
                        if (href.Contains("/genre/") || href.Contains("/pustaka/")) continue;
                        
                        // Extract manga ID (Use full relative path if possible)
                        // This allows /manhwa/, /manhua/, /manga/ prefixes to work
                        string id = href;
                        string slug = href.TrimEnd('/').Split('/').Last();
                        
                        // Check slug against blacklist
                        if (string.IsNullOrEmpty(slug) || seenIds.Contains(slug)) continue;
                        if (slug.Equals("manga", StringComparison.OrdinalIgnoreCase) ||
                            slug.Equals("manhwa", StringComparison.OrdinalIgnoreCase) ||
                            slug.Equals("manhua", StringComparison.OrdinalIgnoreCase) ||
                            slug.Equals("komik", StringComparison.OrdinalIgnoreCase)) continue;
                        
                        seenIds.Add(slug); // Track by slug to avoid duplicates
                        
                        // Ensure ID is relative path starting with /
                        if (id.StartsWith("http"))
                        {
                            var uri = new Uri(id);
                            id = uri.AbsolutePath;
                        }
                        if (!id.StartsWith("/")) id = "/" + id;
                        
                        // Get title from link text, child nodes, img alt, or parent
                        var title = link.InnerText.Trim();
                        
                        // If empty, try img alt inside link
                        if (string.IsNullOrEmpty(title))
                        {
                            var imgInLink = link.SelectSingleNode(".//img");
                            title = imgInLink?.GetAttributeValue("alt", "")?.Trim() ?? "";
                        }
                        
                        // If still empty, try h3/h4 in parent
                        if (string.IsNullOrEmpty(title))
                        {
                            var parent = link.ParentNode;
                            for (int i = 0; i < 3 && parent != null && string.IsNullOrEmpty(title); i++)
                            {
                                var h = parent.SelectSingleNode(".//h3 | .//h4 | .//strong");
                                title = h?.InnerText?.Trim() ?? "";
                                parent = parent.ParentNode;
                            }
                        }
                        
                        // Clean common prefixes
                        title = CleanTitle(title);
                        
                        // Fallback to ID if title still empty
                        if (string.IsNullOrEmpty(title))
                        {
                            title = id.Replace("-", " ").Replace("_", " ");
                            // Capitalize first letter of each word
                            title = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(title);
                        }
                        
                        if (string.IsNullOrEmpty(title)) continue;
                        
                        // Try to find image from parent container
                        var coverParent = link.ParentNode;
                        string cover = "";
                        
                        // Look for img in sibling or parent
                        for (int i = 0; i < 3 && coverParent != null; i++)
                        {
                            var img = coverParent.SelectSingleNode(".//img");
                            if (img != null)
                            {
                                cover = img.GetAttributeValue("src", "");
                                if (string.IsNullOrEmpty(cover) || cover.Contains("data:image") || cover.Contains("lazy"))
                                {
                                    cover = img.GetAttributeValue("data-src", "") ?? "";
                                }
                                cover = EnsureAbsoluteUrl(cover);
                                if (!string.IsNullOrEmpty(cover)) break;
                            }
                            coverParent = coverParent.ParentNode;
                        }

                        list.Add(new Manga
                        {
                            Title = title,
                            Url = id, // Now full relative path
                            ThumbnailUrl = cover,
                            Source = this.Id
                        });
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[Komiku] Link parse error: {ex.Message}");
                    }
                }
            }

            Console.WriteLine($"[Komiku] Parsed {list.Count} unique manga, Total Pages: {totalPages}");
            return (list, totalPages);
        }

        /// <summary>
        /// Get filtered manga list from API with status and type filters
        /// Status: 1=Ongoing, 2=Completed
        /// Type: manga, manhwa, manhua
        /// </summary>
        public async Task<(List<Manga> Items, int TotalPages)> GetFilteredMangaAsync(int page, int statusFilter = 0, int typeFilter = 0)
        {
            // Use API endpoint instead of pustaka (which uses HTMX)
            // API accepts: status=ongoing/completed, type=manga/manhwa/manhua
            var queryParams = new List<string>();
            
            // Status filter (1=Ongoing, 2=Completed) - API uses text values
            if (statusFilter == 1)
            {
                queryParams.Add("status=ongoing");
            }
            else if (statusFilter == 2)
            {
                queryParams.Add("status=completed");
            }
            
            // Type filter (1=Manga, 2=Manhwa, 3=Manhua)
            if (typeFilter > 0)
            {
                string tipe = typeFilter switch
                {
                    1 => "manga",
                    2 => "manhwa",
                    3 => "manhua",
                    _ => ""
                };
                if (!string.IsNullOrEmpty(tipe))
                {
                    queryParams.Add($"type={tipe}");
                }
            }
            
            string queryString = queryParams.Count > 0 ? "?" + string.Join("&", queryParams) : "";
            
            // Use API endpoint
            string url = page == 1 
                ? $"https://api.komiku.org/manga/{queryString}"
                : $"https://api.komiku.org/manga/page/{page}/{queryString}";

            var doc = await GetHtmlAsync(url);
            var list = new List<Manga>();
            int totalPages = 100;

            Console.WriteLine($"[Komiku] Fetching filtered manga page {page}: {url}");

            // Try to extract total pages from pagination
            var pageLinks = doc.DocumentNode.SelectNodes("//a[contains(@class, 'page-numbers')]");
            if (pageLinks != null)
            {
                foreach (var link in pageLinks)
                {
                    var text = link.InnerText.Trim();
                    if (int.TryParse(text, out int pageNum) && pageNum > totalPages)
                    {
                        totalPages = pageNum;
                    }
                }
            }

            // Parse manga items from pustaka page - same structure as Latest
            var nodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'bge')]");
            
            if (nodes != null)
            {
                var seenIds = new HashSet<string>();
                
                foreach (var node in nodes)
                {
                    try
                    {
                        var imgNode = node.SelectSingleNode(".//div[contains(@class, 'bgei')]//img");
                        var linkNode = node.SelectSingleNode(".//div[contains(@class, 'kan')]/a") ?? node.SelectSingleNode(".//div[contains(@class, 'bgei')]/a");
                        var titleNode = node.SelectSingleNode(".//div[contains(@class, 'kan')]//h3");

                        if (linkNode == null) continue;

                        var href = linkNode.GetAttributeValue("href", "");
                        if (string.IsNullOrEmpty(href) || !href.Contains("/manga/")) continue;

                        var id = href.TrimEnd('/').Split('/').Last();
                        if (string.IsNullOrEmpty(id) || seenIds.Contains(id)) continue;

                        seenIds.Add(id);

                        var title = titleNode?.InnerText?.Trim() ?? linkNode?.InnerText?.Trim() ?? "";
                        title = CleanTitle(title);
                        
                        if (string.IsNullOrEmpty(title))
                        {
                            title = id.Replace("-", " ");
                            title = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(title);
                        }

                        string cover = "";
                        if (imgNode != null)
                        {
                            cover = imgNode.GetAttributeValue("src", "") ?? "";
                            if (string.IsNullOrEmpty(cover) || cover.Contains("lazy.jpg") || cover.Contains("data:image"))
                            {
                                cover = imgNode.GetAttributeValue("data-src", "") ?? "";
                            }
                        }

                        // Set status based on filter
                        int mangaStatus = statusFilter switch
                        {
                            1 => Manga.ONGOING,
                            2 => Manga.COMPLETED,
                            _ => Manga.UNKNOWN
                        };

                        // Use href directly (already has full path like /manga/xxx/)
                        string mangaUrl = href;
                        if (!mangaUrl.StartsWith("/"))
                        {
                            // Extract path from full URL if needed
                            try
                            {
                                var uri = new Uri(href);
                                mangaUrl = uri.AbsolutePath;
                            }
                            catch
                            {
                                mangaUrl = $"/manga/{id}/";
                            }
                        }

                        list.Add(new Manga
                        {
                            Title = title,
                            Url = mangaUrl,
                            ThumbnailUrl = cover,
                            Source = this.Id,
                            Status = mangaStatus
                        });
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[Komiku] Filtered item parse error: {ex.Message}");
                    }
                }
            }

            Console.WriteLine($"[Komiku] Filtered: Found {list.Count} manga, Total Pages: {totalPages}");
            return (list, totalPages);
        }

        public async Task<(List<Manga> Items, int TotalPages)> GetLatestMangaAsync(int page)
        {
            // Switch to Web Scraping to match user expectation (API is sometimes stale or different)
            // Website: https://komiku.org/pustaka/page/{page}/?orderby=modified&tipe=manga
            
            string url = page == 1 
                ? "https://api.komiku.org/manga/?orderby=modified&tipe=manga" 
                : $"https://api.komiku.org/manga/page/{page}/?orderby=modified&tipe=manga";

            var doc = await GetHtmlAsync(url);
            var list = new List<Manga>();
            int totalPages = 1000;
            
            Console.WriteLine($"[Komiku] Fetching Latest Updates (WEB) page {page}: {url}");

            // Selector for Pustaka Grid Cards (Generic Layout)
            var nodes = doc.DocumentNode.SelectNodes("//div[contains(@class, 'bge')]");
            
            if (nodes == null)
            {
                // Fallback: Generic Grid Card selector (same as GetPopularMangaAsync)
                nodes = doc.DocumentNode.SelectNodes("//div[.//a[contains(@href, '/manga/')] and .//img]");
            }

            if (nodes != null)
            {
                var seenIds = new HashSet<string>();
                
                foreach (var node in nodes)
                {
                    try
                    {
                        var a = node.SelectSingleNode(".//div[contains(@class, 'kan')]/a") 
                                ?? node.SelectSingleNode(".//a"); // Fallback for generic
                                
                        var img = node.SelectSingleNode(".//img");
                        
                        // Extract Title
                        var titleNode = node.SelectSingleNode(".//h3") ?? node.SelectSingleNode(".//h4");

                        if (a != null && img != null)
                        {
                            var href = a.GetAttributeValue("href", "");
                            var id = href.TrimEnd('/').Split('/').Last();
                            
                            if (string.IsNullOrEmpty(id) || seenIds.Contains(id)) continue;
                            seenIds.Add(id);
                            
                            // Ensure ID is relative path
                            if (href.StartsWith("http"))
                            {
                                var uri = new Uri(href);
                                href = uri.AbsolutePath;
                            }
                            if (!href.StartsWith("/")) href = "/" + href;
                            id = href; 

                            var title = titleNode?.InnerText?.Trim();
                            if (string.IsNullOrEmpty(title))
                                 title = img.GetAttributeValue("alt", "").Trim();
                            
                            var cover = img.GetAttributeValue("src", "");
                            if (string.IsNullOrEmpty(cover) || cover.Contains("data:image") || cover.Contains("placeholder") || cover.Contains("lazy.jpg")) 
                            {
                                cover = img.GetAttributeValue("data-src", "");
                                if (string.IsNullOrEmpty(cover)) cover = img.GetAttributeValue("data-original", "");
                            }
                            
                            cover = EnsureAbsoluteUrl(cover);
                            title = CleanTitle(title);

                            // Extract Last Update Time
                            long lastUpdate = 0;
                            var infoText = node.InnerText; 
                            if (!string.IsNullOrEmpty(infoText))
                            {
                                var timeMatch = Regex.Match(infoText, @"(\d+\s+(menit|jam|hari|minggu|bulan|tahun|detik)\s+lalu)|(kemarin)|(hari ini)", RegexOptions.IgnoreCase);
                                if (timeMatch.Success)
                                {
                                    lastUpdate = ParseIndonesianReleaseTime(timeMatch.Value);
                                }
                            }

                            if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(title))
                            {
                                list.Add(new Manga
                                {
                                    Title = title,
                                    Url = id,
                                    ThumbnailUrl = cover,
                                    Source = this.Id,
                                    LastUpdate = lastUpdate
                                });
                            }
                        }
                    }
                    catch (Exception ex) { Console.WriteLine($"[Komiku] Latest Web Parse Error: {ex.Message}"); }
                }
            }
            
            Console.WriteLine($"[Komiku] Parsed {list.Count} latest items from WEB");
            return (list, totalPages);
        }

        public override async Task<List<Manga>> GetSearchMangaAsync(string query, int page)
        {
            // API QUIRK: Leading '-' is treated as exclusion. If user searches for "-50kg", API excludes "50kg".
            // Fix: Remove leading '-' so we search for "50kg" which will find "-50kg Cinderella".
            if (query.StartsWith("-"))
            {
                query = query.TrimStart('-');
            }

            // Update URL to target the API directly since the main page uses HTMX to load results
            string url = $"https://api.komiku.org/?post_type=manga&s={System.Net.WebUtility.UrlEncode(query)}";
            
            var doc = await GetHtmlAsync(url);
            var list = ParseSearchDocument(doc);

            // If no results found, try forcing browser-based fetch (Cloudflare bypass)
            if (list.Count == 0) 
            {
                 Console.WriteLine("[Komiku] 0 results with standard HTTP. Retrying with Browser/Bypass...");
                 
                 try 
                 {
                     var browserHtml = await ForceBrowserFetchAsync(url);
                     var browserDoc = new HtmlAgilityPack.HtmlDocument();
                     browserDoc.LoadHtml(browserHtml);
                     
                     var browserList = ParseSearchDocument(browserDoc);
                     if (browserList.Count > 0)
                     {
                         Console.WriteLine($"[Komiku] Browser Search Success! Found {browserList.Count} items.");
                         return browserList;
                     }
                 }
                 catch (Exception ex)
                 {
                     Console.WriteLine($"[Komiku] Browser fallback failed: {ex.Message}");
                 }
            }
            
            Console.WriteLine($"[Komiku] Found {list.Count} results for '{query}'");
            return list;
        }

        private List<Manga> ParseSearchDocument(HtmlAgilityPack.HtmlDocument doc)
        {
            var list = new List<Manga>();
            var seenIds = new HashSet<string>();

            // Relaxed strategy: Parse ALL manga links
            var allLinks = doc.DocumentNode.SelectNodes("//a[contains(@href, '/manga/')]");
            
            if (allLinks == null) return list;

            foreach (var link in allLinks)
            {
                try
                {
                   var href = link.GetAttributeValue("href", "");
                   if (string.IsNullOrEmpty(href)) continue;
                   
                   var slug = href.TrimEnd('/').Split('/').Last();
                   
                   // STRICT BLACKLIST (Check Slug)
                   if (string.IsNullOrEmpty(slug) || 
                       slug.Equals("manga", StringComparison.OrdinalIgnoreCase) ||
                       slug.Equals("manhwa", StringComparison.OrdinalIgnoreCase) ||
                       slug.Equals("manhua", StringComparison.OrdinalIgnoreCase) ||
                       slug.Equals("komik", StringComparison.OrdinalIgnoreCase) ||
                       slug.StartsWith("genre", StringComparison.OrdinalIgnoreCase) ||
                       slug.StartsWith("page", StringComparison.OrdinalIgnoreCase) ||
                       seenIds.Contains(slug)) 
                   {
                       continue;
                   }
                   
                   seenIds.Add(slug);

                   // Use full relative path for ID
                   string id = href;
                   if (id.StartsWith("http"))
                   {
                       var uri = new Uri(id);
                       id = uri.AbsolutePath;
                   }
                   if (!id.StartsWith("/")) id = "/" + id;
                   
                   // Parse Title: Priority = Title Attr > Img Alt > InnerText
                   // We prioritize Img Alt over InnerText because InnerText often contains metadata (like "Manga Fantasi") 
                   // which leads to false positives in IsGenericTitle and fallback to ID.
                   var title = link.GetAttributeValue("title", "");
                   
                   if (string.IsNullOrEmpty(title))
                   {
                       var imgInLink = link.SelectSingleNode(".//img");
                       title = imgInLink?.GetAttributeValue("alt", "")?.Trim() ?? "";
                   }

                   if (string.IsNullOrEmpty(title)) 
                   {
                        title = link.InnerText.Trim();
                   }
                   
                   if (string.IsNullOrEmpty(title))
                   {
                       var parent = link.ParentNode;
                       for (int i = 0; i < 3 && parent != null && string.IsNullOrEmpty(title); i++)
                       {
                           var h = parent.SelectSingleNode(".//h3 | .//h4 | .//strong");
                           title = h?.InnerText?.Trim() ?? "";
                           parent = parent.ParentNode;
                       }
                   }
                   
                   if (string.IsNullOrEmpty(title))
                   {
                        title = id.Replace("-", " ").Replace("_", " ");
                        title = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(title);
                   }
                   else
                   {
                          title = CleanTitle(title);
                   }

                   // Parse Cover
                   string cover = "";
                   var img = link.SelectSingleNode(".//img");
                   if (img == null && link.ParentNode != null)
                   {
                        img = link.ParentNode.SelectSingleNode(".//img");
                   }

                   if (img != null)
                   {
                       cover = img.GetAttributeValue("src", "");
                       if (string.IsNullOrEmpty(cover) || cover.Contains("data:image") || cover.Contains("lazy"))
                       {
                           cover = img.GetAttributeValue("data-src", "") ?? "";
                       }
                       
                       // API returns landscape thumbnails with ?resize=450,235 - remove to get original portrait image
                       if (cover.Contains("?resize="))
                       {
                           cover = cover.Split('?')[0];
                       }
                       
                       cover = EnsureAbsoluteUrl(cover);
                   }

                   if (IsGenericTitle(title)) 
                   {
                        Console.WriteLine($"[Komiku] FILTERED Generic '{title}' -> Fallback to ID");
                        title = System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(id.Replace("-", " "));
                   }

                   list.Add(new Manga
                   {
                       Title = title,
                       Url = id,
                       ThumbnailUrl = cover,
                       Source = this.Id
                   });
                }
                catch (Exception ex)
                {
                     Console.WriteLine($"[Komiku] Search item parse error: {ex.Message}");
                }
            }
            return list;
        }

        public override async Task<Manga> GetMangaDetailsAsync(string id)
        {
            // Handle both full path (/manga/xxx/) and just ID (xxx)
            string url;
            if (id.StartsWith("/") || id.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                // Already a full path or relative path
                if (id.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                {
                    url = id; // Full URL
                }
                else
                {
                    // Ensure BaseUrl doesn't have trailing slash if id has leading slash
                    url = $"{BaseUrl.TrimEnd('/')}{id}"; 
                }
            }
            else
            {
                // Just an ID
                url = $"{BaseUrl}/manga/{id}";
            }
            
            Console.WriteLine($"[Komiku] GetMangaDetailsAsync URL: {url}");
            
            // Declare outside try block to ensure return validity
            var manga = new Manga { Url = id, Source = this.Id, Title = id };
            
            try 
            {
                var doc = await GetHtmlAsync(url);
                var root = doc.DocumentNode;
                
                var titleNode = root.SelectSingleNode("//h1");
                if (titleNode != null) manga.Title = titleNode.InnerText.Trim();

            // Clean Title (Consistent with GetMangaList)
            manga.Title = CleanTitle(manga.Title);

            // Generic Metadata Scraper
            var allTextNodes = root.SelectNodes("//td | //li | //p | //span");
            if (allTextNodes != null)
            {
                foreach (var node in allTextNodes)
                {
                    var text = node.InnerText.Trim();
                    if (string.IsNullOrEmpty(text)) continue;

                    if (text.StartsWith("Pengarang", StringComparison.OrdinalIgnoreCase) || text.StartsWith("Author", StringComparison.OrdinalIgnoreCase))
                    {
                        manga.Author = CleanMetadata(text, "Pengarang", "Author");
                    }
                }
            }

            // Author fallback - from table row
            if (string.IsNullOrEmpty(manga.Author))
            {
                var row = root.SelectSingleNode("//tr[td[contains(text(), 'Pengarang')]]");
                if (row != null) manga.Author = row.SelectSingleNode(".//td[2]")?.InnerText.Trim();
            }

            if (string.IsNullOrEmpty(manga.Author)) manga.Author = "Unknown";
            
            // Status - Parse from table row explicitly
            var statusRow = root.SelectSingleNode("//tr[td[contains(text(), 'Status')]]");
            if (statusRow != null)
            {
                var statusValue = statusRow.SelectSingleNode(".//td[2]")?.InnerText.Trim();
                if (!string.IsNullOrEmpty(statusValue))
                {
                    manga.Status = ParseStatus(statusValue);
                    Console.WriteLine($"[Komiku] Found Status: {statusValue} -> {manga.Status}");
                }
            }
            
            // Description
            var descNode = root.SelectSingleNode("//p[@class='desc']");
            if (descNode == null)
            {
                var header = root.SelectSingleNode("//h3[contains(text(), 'Sinopsis')]");
                descNode = header?.NextSibling;
                while (descNode != null && (descNode.Name == "#text" || descNode.Name == "br")) descNode = descNode.NextSibling;
            }
            manga.Description = descNode?.InnerText?.Trim() ?? "No description available.";

            // Cover
            var img = root.SelectSingleNode("//div[@class='ims']//img") ?? root.SelectSingleNode("//div[contains(@class, 'foto')]//img");
            var cover = img?.GetAttributeValue("src", "");
                if (string.IsNullOrEmpty(cover) || cover.Contains("lazy.jpg")) cover = img?.GetAttributeValue("data-src", "");
            
            // Fix Relative URLs
            cover = EnsureAbsoluteUrl(cover ?? "");
            
            manga.ThumbnailUrl = cover;

            // Genre - Parse from ul.genre list only (not navigation links)
            var genreNodes = root.SelectNodes("//ul[@class='genre']//li[@class='genre']//a");
            if (genreNodes != null)
            {
                manga.Genre = new List<string>();
                foreach (var gn in genreNodes)
                {
                    var genreName = gn.InnerText?.Trim();
                    if (!string.IsNullOrEmpty(genreName) && !manga.Genre.Contains(genreName))
                    {
                        manga.Genre.Add(genreName);
                    }
                }
                Console.WriteLine($"[Komiku] Found {manga.Genre.Count} genres: {string.Join(", ", manga.Genre)}");
            }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Komiku] CRITICAL Parsing Error for {id}: {ex}");
                // Return what we have so far, or at least the basic ID
            }

            return manga;
        }

        private string EnsureAbsoluteUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return "";
            if (url.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return url;
            
            if (url.StartsWith("//")) return "https:" + url;
            
            string baseUri = BaseUrl.TrimEnd('/');
            if (url.StartsWith("/")) return baseUri + url;
            
            return baseUri + "/" + url;
        }

        private string CleanMetadata(string text, params string[] labels)
        {
            foreach (var label in labels)
            {
                text = text.Replace(label, "", StringComparison.OrdinalIgnoreCase);
            }
            return text.Replace(":", "").Trim();
        }

        private string CleanTitle(string title)
        {
            if (string.IsNullOrWhiteSpace(title)) return "";
            
            title = System.Net.WebUtility.HtmlDecode(title);
            
            // Remove common prefixes/suffixes
            title = title
                .Replace("Baca Manga", "", StringComparison.OrdinalIgnoreCase)
                .Replace("Baca Manhwa", "", StringComparison.OrdinalIgnoreCase)
                .Replace("Baca Manhua", "", StringComparison.OrdinalIgnoreCase)
                .Replace("Baca Komik", "", StringComparison.OrdinalIgnoreCase)
                .Trim();
                
            // Remove leading "Komik " etc if present
            if (title.StartsWith("Komik ", StringComparison.OrdinalIgnoreCase)) title = title.Substring(6).Trim();
            if (title.StartsWith("Manga ", StringComparison.OrdinalIgnoreCase)) title = title.Substring(6).Trim();
            if (title.StartsWith("Manhwa ", StringComparison.OrdinalIgnoreCase)) title = title.Substring(7).Trim();
            if (title.StartsWith("Manhua ", StringComparison.OrdinalIgnoreCase)) title = title.Substring(7).Trim();
            
            return title;
        }

        public override async Task<List<Chapter>> GetChapterListAsync(string mangaId)
        {
            var list = new List<Chapter>();
            try
            {
                // Handle various ID formats (slug, relative path, full URL)
                string url;
                if (mangaId.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                {
                    url = mangaId;
                }
                else if (mangaId.StartsWith("/"))
                {
                    url = $"{BaseUrl.TrimEnd('/')}{mangaId}";
                }
                else
                {
                    url = $"{BaseUrl}/manga/{mangaId}";
                }

                Console.WriteLine($"[Komiku] GetChapterListAsync URL: {url}");
                var doc = await GetHtmlAsync(url);
                var seenUrls = new HashSet<string>();

                // STRATEGY 1: Table Parsing (Contains Date) - Verified Komiku Structure which uses id="Daftar_Chapter"
                var rows = doc.DocumentNode.SelectNodes("//table[@id='Daftar_Chapter']//tr") 
                        ?? doc.DocumentNode.SelectNodes("//table[contains(@class, 'table')]//tr");
                
                if (rows != null)
                {
                    Console.WriteLine($"[Komiku] Found {rows.Count} rows in chapter table.");
                    foreach (var row in rows)
                    {
                        var linkNode = row.SelectSingleNode(".//a");
                        if (linkNode == null) continue;

                        var href = linkNode.GetAttributeValue("href", "").Trim();
                        var title = linkNode.InnerText.Trim();
                        
                        // Date is usually in a sibling td with class 'tpe' or 'tanggalseries'
                        var dateNode = row.SelectSingleNode(".//td[contains(@class, 'tpe')]") 
                                    ?? row.SelectSingleNode(".//td[contains(@class, 'date')]")
                                    ?? row.SelectSingleNode(".//td[contains(@class, 'tanggalseries')]");
                        
                        // Fallback: Check 2nd column if class not found
                        if (dateNode == null)
                        {
                            var tds = row.SelectNodes(".//td");
                            if (tds != null && tds.Count > 1) dateNode = tds[tds.Count - 1];
                        }
                        
                        string timeStr = dateNode?.InnerText?.Trim() ?? "";
                        long dateUpload = ParseIndonesianReleaseTime(timeStr);
                        
                        if (!string.IsNullOrEmpty(href)) // Check dups via seenUrls later
                        {
                             // Robust Normalization
                             href = EnsureAbsoluteUrl(href);
                             
                             if (!seenUrls.Contains(href)) 
                             {
                                 seenUrls.Add(href);
                                 
                                 // Clean/Parse Title
                                 string cleanName = title.Replace("\n", " ").Trim();
                                 float number = ExtractChapterNumber(cleanName);
                                 
                                 list.Add(new Chapter
                                 {
                                     Name = cleanName,
                                     Url = href,
                                     MangaId = 0,
                                     ChapterNumber = number,
                                     DateUpload = dateUpload
                                 });
                             }
                        }
                    }
                }

                // STRATEGY 2: Generic Link Scan (Fallback if table not found or to catch extras)
                // Scrape ALL links and filter carefully in memory
                var nodes = doc.DocumentNode.SelectNodes("//a");
                
                if (nodes == null) 
                {
                    Console.WriteLine("[Komiku] No links found in page!");
                    return list;
                }

                Console.WriteLine($"[Komiku] Scanning {nodes.Count} links for chapters of {mangaId}...");

                foreach (var node in nodes)
                {
                    try
                    {
                        var href = node.GetAttributeValue("href", "");
                        var text = node.InnerText.Trim().Replace("\n", " ").Replace("\r", " ");
                        
                        if (string.IsNullOrEmpty(href) || href.Contains("?") || href.Contains("#") || href.Contains("javascript")) continue;

                        // Robust Normalization
                        if (!href.StartsWith("http"))
                        {
                            if (href.StartsWith("/")) href = BaseUrl + href;
                            else href = $"{BaseUrl}/{href}";
                        }
                        
                        // CRITERIA:
                        // 1. Must contain "-chapter-" or "/ch-"
                        // 2. Must NOT match the manga URL itself (avoid self-links)
                        // 3. Must NOT be a genre/pagination/system link
                        bool isChapter = (href.Contains("-chapter-") || href.Contains("/ch-")) &&
                                         !href.Contains("/manga/") && 
                                         !href.Contains("/genre/") && 
                                         !href.Contains("/pustaka/");

                        if (isChapter && !seenUrls.Contains(href))
                        {
                            seenUrls.Add(href);
                            
                            // Clean Title
                            string cleanTitle = text;
                            var match = Regex.Match(text, @"Chapter\s+([\d\.]+)", RegexOptions.IgnoreCase);
                            if (match.Success) 
                            {
                                cleanTitle = $"Chapter {match.Groups[1].Value}";
                            }
                            else if (cleanTitle.Length > 20) // Heuristic for long titles
                            {
                                cleanTitle = text.Replace("Chapter", "", StringComparison.OrdinalIgnoreCase).Trim();
                            }

                            // Debug Log for specific missing chapters
                            if (href.Contains("chapter-1") || href.Contains("chapter-2"))
                            {
                                Console.WriteLine($"[Komiku] Found Early Chapter: {cleanTitle} -> {href}");
                            }

                            list.Add(new Chapter
                            {
                                Id = 0,
                                Name = cleanTitle,
                                MangaId = 0,
                                Url = href,
                                DateUpload = DateTimeOffset.Now.ToUnixTimeMilliseconds()
                            });
                        }
                    }
                    catch (Exception ex) 
                    {
                         Console.WriteLine($"[Komiku] Error parsing link node: {ex.Message}");
                    }
                }
                
                Console.WriteLine($"[Komiku] Total Chapters Extracted: {list.Count}");
                
                // Sort by Number Descending to ensure consistent view if UI doesn't sort
                // Try to extract number
                return list.OrderByDescending(c => ExtractChapterNumber(c.Name)).ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Komiku] Critical Error in GetChapterList: {ex.Message}");
                return list;
            }
        }

        private long ParseIndonesianReleaseTime(string date)
        {
             if (string.IsNullOrWhiteSpace(date)) return DateTimeOffset.Now.ToUnixTimeMilliseconds();

             date = date.ToLowerInvariant().Trim();
             var now = DateTimeOffset.Now;

             if (date.Contains("hari ini") || date.Contains("today")) return now.ToUnixTimeMilliseconds();
             if (date.Contains("kemarin") || date.Contains("yesterday")) return now.AddDays(-1).ToUnixTimeMilliseconds();

             // "16 menit lalu", "2 jam lalu"
             var match = Regex.Match(date, @"(\d+)\s+(menit|jam|hari|minggu|bulan|tahun|detik)");
             if (match.Success)
             {
                 int val = int.Parse(match.Groups[1].Value);
                 string unit = match.Groups[2].Value;

                 if (unit == "detik") return now.AddSeconds(-val).ToUnixTimeMilliseconds();
                 if (unit == "menit") return now.AddMinutes(-val).ToUnixTimeMilliseconds();
                 if (unit == "jam")   return now.AddHours(-val).ToUnixTimeMilliseconds();
                 if (unit == "hari")  return now.AddDays(-val).ToUnixTimeMilliseconds();
                 if (unit == "minggu") return now.AddDays(-val * 7).ToUnixTimeMilliseconds();
                 if (unit == "bulan") return now.AddMonths(-val).ToUnixTimeMilliseconds();
                 if (unit == "tahun") return now.AddYears(-val).ToUnixTimeMilliseconds();
             }

             // Absolute Date Parsing: dd/MM/yyyy
             if (Regex.IsMatch(date, @"\d{1,2}/\d{1,2}/\d{4}"))
             {
                 // Use AssumeUniversal to treat 00:00 as UTC, preventing "Previous Day" shift when displayed in UTC
                 if (DateTimeOffset.TryParseExact(date, "dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var result))
                 {
                     return result.ToUnixTimeMilliseconds();
                 }
             }
             
             return now.ToUnixTimeMilliseconds();
        }

        private float ExtractChapterNumber(string name)
        {
            var match = Regex.Match(name, @"([\d\.]+)", RegexOptions.RightToLeft);
            if (match.Success && float.TryParse(match.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out float result))
            {
                return result;
            }
            return 0;
        }

        private int ParseStatus(string status)
        {
            if (string.IsNullOrWhiteSpace(status)) return Manga.UNKNOWN;
            status = status.ToLower().Trim();
            
            // 1 = ONGOING
            if (status.Contains("ongoing") || status.Contains("berjalan") || status.Contains("berlangsung")) 
                return Manga.ONGOING;
            
            // 2 = COMPLETED
            if (status.Contains("completed") || status.Contains("tamat") || status.Contains("selesai") || status.Contains("end")) 
                return Manga.COMPLETED;
            
            // 3 = LICENSED
            if (status.Contains("licensed") || status.Contains("lisensi")) 
                return Manga.LICENSED;
            
            // 4 = PUBLISHING_FINISHED
            if (status.Contains("publishing finished") || status.Contains("finish") || status.Contains("rilis selesai")) 
                return Manga.PUBLISHING_FINISHED;
            
            // 5 = CANCELLED
            if (status.Contains("cancelled") || status.Contains("canceled") || status.Contains("dibatalkan") || status.Contains("batal")) 
                return Manga.CANCELLED;
            
            // 6 = HIATUS
            if (status.Contains("hiatus") || status.Contains("istirahat") || status.Contains("jeda")) 
                return Manga.ON_HIATUS;
            
            return Manga.UNKNOWN;
        }

        public override async Task<List<string>> GetPageListAsync(string chapterUrl)
        {
            var pages = new List<string>();
            try 
            {
                var doc = await GetHtmlAsync(chapterUrl);
                
                // Selector Update: 'Baca_Komik' is the current ID. Fallback to 'bacaimg'.
                var imgs = doc.DocumentNode.SelectNodes("//div[@id='Baca_Komik']//img | //div[@id='bacaimg']//img");
                
                if (imgs != null)
                {
                    Console.WriteLine($"[Komiku] Found {imgs.Count} images in reader.");
                    foreach(var img in imgs)
                    {
                        var src = img.GetAttributeValue("src", "");
                        if (string.IsNullOrEmpty(src) || src.Contains("data:image")) 
                        {
                            // Try data-src if src is placeholder
                            src = img.GetAttributeValue("data-src", "");
                        }

                        if (!string.IsNullOrEmpty(src)) 
                        {
                            pages.Add(src);
                        }
                    }
                }
                else
                {
                     Console.WriteLine($"[Komiku] NO IMAGES FOUND. Check selector!");
                }
                return pages;
            } 
            catch (Exception ex)
            {
                Console.WriteLine($"[Komiku] Error scraping pages: {ex.Message}");
                return new List<string>(); 
            }
        }

        private async Task<HtmlDocument> GetHtmlAsync(string url)
        {
            var html = await GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }
        private bool IsGenericTitle(string title)
        {
            if (string.IsNullOrWhiteSpace(title)) return true;
            
            // Normalize spaces including NBSP (char 160)
            string clean = title.Replace(" ", "")
                                .Replace("\t", "")
                                .Replace("\n", "")
                                .Replace("\r", "")
                                .Replace(((char)160).ToString(), "") // NBSP
                                .Replace("&nbsp;", ""); 

            if (clean.Contains("Manga", StringComparison.OrdinalIgnoreCase) || 
                clean.Contains("Manhwa", StringComparison.OrdinalIgnoreCase) || 
                clean.Contains("Manhua", StringComparison.OrdinalIgnoreCase) || 
                clean.Contains("Komik", StringComparison.OrdinalIgnoreCase))
            {
                if (clean.Contains("Aksi", StringComparison.OrdinalIgnoreCase) || 
                    clean.Contains("Romantis", StringComparison.OrdinalIgnoreCase) ||
                    clean.Contains("Action", StringComparison.OrdinalIgnoreCase) ||
                    clean.Contains("Romance", StringComparison.OrdinalIgnoreCase) ||
                    clean.Contains("Fantasy", StringComparison.OrdinalIgnoreCase) ||
                    clean.Contains("Comedy", StringComparison.OrdinalIgnoreCase) ||
                    clean.Contains("Adventure", StringComparison.OrdinalIgnoreCase) ||
                    clean.Contains("Slice", StringComparison.OrdinalIgnoreCase) || 
                    clean.Length < 18) 
                {
                    return true;
                }
            }

            return clean.Equals("MangaAksi", StringComparison.OrdinalIgnoreCase) ||
                   clean.Equals("ManhwaAksi", StringComparison.OrdinalIgnoreCase) ||
                   clean.Equals("Manga", StringComparison.OrdinalIgnoreCase) ||
                   clean.Equals("Manhwa", StringComparison.OrdinalIgnoreCase) ||
                   clean.Equals("Manhua", StringComparison.OrdinalIgnoreCase) ||
                   clean.Equals("Komik", StringComparison.OrdinalIgnoreCase) ||
                   clean.StartsWith("Genre", StringComparison.OrdinalIgnoreCase) ||
                   title.Trim().Length < 2; 
        }

    }
}
