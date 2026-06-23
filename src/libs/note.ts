// note の RSS からタイトル・サムネイル・URL を取得する
// RSS: https://note.com/{ユーザー名}/rss

const RSS_URL = "https://note.com/kuumin_design/rss";

export type NotePost = {
  title: string;
  link: string;
  thumbnail: string;
  pubDate: string;
};

// XML エンティティを最低限デコードする
const decodeEntities = (str: string): string =>
  str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

// item ブロックから指定タグの中身を1つ取り出す
const pick = (block: string, tag: string): string => {
  const matched = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return matched ? decodeEntities(matched[1]) : "";
};

// note の RSS を取得してパースする。失敗時は空配列を返す。
export const getNotePosts = async (limit = 10): Promise<NotePost[]> => {
  try {
    const res = await fetch(RSS_URL);
    if (!res.ok) {
      return [];
    }
    const xml = await res.text();

    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

    return items.slice(0, limit).map((block) => ({
      title: pick(block, "title"),
      link: pick(block, "link"),
      thumbnail: pick(block, "media:thumbnail"),
      pubDate: pick(block, "pubDate"),
    }));
  } catch (error) {
    console.error("[note] RSS の取得に失敗しました:", error);
    return [];
  }
};
