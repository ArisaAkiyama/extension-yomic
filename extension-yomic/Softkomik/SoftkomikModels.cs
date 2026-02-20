using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Yomic.Extensions.Softkomik
{
    // Generic wrapper for __NEXT_DATA__
    internal class NextData<T>
    {
        [JsonPropertyName("props")]
        public Props<T>? Props { get; set; }
    }

    internal class Props<T>
    {
        [JsonPropertyName("pageProps")]
        public PageProps<T>? PageProps { get; set; }
    }

    internal class PageProps<T>
    {
        [JsonPropertyName("data")]
        public T? Data { get; set; }
    }

    // --- Search / Home Models ---

    internal class SoftkomikHomeData
    {
        [JsonPropertyName("newKomik")]
        public List<SoftkomikManga>? NewKomik { get; set; }

        [JsonPropertyName("updateNonProject")]
        public List<SoftkomikManga>? UpdateNonProject { get; set; }
    }

    internal class SoftkomikSearchData
    {
        [JsonPropertyName("page")]
        public int Page { get; set; }

        [JsonPropertyName("maxPage")]
        public int MaxPage { get; set; }

        [JsonPropertyName("data")]
        public List<SoftkomikManga>? Data { get; set; }
    }

    internal class SoftkomikManga
    {
        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("title_slug")]
        public string? TitleSlug { get; set; }

        [JsonPropertyName("gambar")]
        public string? Gambar { get; set; } // Cover image path

        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("latest_chapter")]
        public string? LatestChapter { get; set; }

        [JsonPropertyName("updated_at")]
        public string? UpdatedAt { get; set; }
    }

    // --- Detail Models ---

    internal class SoftkomikDetailData
    {
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("title_slug")]
        public string? TitleSlug { get; set; }

        [JsonPropertyName("sinopsis")]
        public string? Sinopsis { get; set; }

        [JsonPropertyName("gambar")]
        public string? Gambar { get; set; }

        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("author")]
        public string? Author { get; set; }

        [JsonPropertyName("latest_chapter")]
        public string? LatestChapter { get; set; } // "015"

        [JsonPropertyName("Genre")]
        public List<string>? Genre { get; set; }
    }

    // --- Chapter / Reader Models ---

    internal class SoftkomikReaderData
    {
        [JsonPropertyName("komik")]
        public SoftkomikDetailData? Komik { get; set; }

        [JsonPropertyName("chapter")]
        public string? CurrentChapter { get; set; }

        [JsonPropertyName("data")]
        public SoftkomikImagesData? Data { get; set; }

        [JsonPropertyName("prevChapter")]
        public List<SoftkomikChapterNav>? PrevChapter { get; set; }

        [JsonPropertyName("nextChapter")]
        public List<SoftkomikChapterNav>? NextChapter { get; set; }
    }

    internal class SoftkomikImagesData
    {
        [JsonPropertyName("imageSrc")]
        public List<string>? ImageSrc { get; set; }

        [JsonPropertyName("storageInter2")]
        public bool StorageInter2 { get; set; }
    }

    internal class SoftkomikChapterNav
    {
        [JsonPropertyName("chapter")]
        public string? Chapter { get; set; }
    }
}
