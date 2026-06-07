using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Yomic.Extensions.NHentai.Models;

public class NHentaiDto
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("media_id")]
    public string MediaId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public NHentaiTitle? Title { get; set; }

    [JsonPropertyName("images")]
    public NHentaiImages? Images { get; set; }

    [JsonPropertyName("tags")]
    public List<NHentaiTag> Tags { get; set; } = new();

    [JsonPropertyName("upload_date")]
    public long UploadDate { get; set; }

    [JsonPropertyName("num_favorites")]
    public long NumFavorites { get; set; }
}

public class NHentaiTitle
{
    [JsonPropertyName("english")]
    public string? English { get; set; }

    [JsonPropertyName("japanese")]
    public string? Japanese { get; set; }

    [JsonPropertyName("pretty")]
    public string? Pretty { get; set; }
}

public class NHentaiImages
{
    [JsonPropertyName("pages")]
    public List<NHentaiImage> Pages { get; set; } = new();
}

public class NHentaiImage
{
    [JsonPropertyName("t")]
    public string Type { get; set; } = string.Empty;

    [JsonIgnore]
    public string Extension => Type switch
    {
        "w" => "webp",
        "p" => "png",
        "g" => "gif",
        _ => "jpg"
    };
}

public class NHentaiTag
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;
}
