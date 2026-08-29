// Sanity からコンテンツを取得する。
// クライアントは @sanity/astro が生やす仮想モジュール経由（設定は astro.config.mjs）。
import type { PortableTextBlock } from "@portabletext/types";
import { createImageUrlBuilder } from "@sanity/image-url";
import type { SanityImageObject, SanityImageSource } from "@sanity/image-url";
import { sanityClient } from "sanity:client";

// 型定義
export type SanityImage = SanityImageObject & {
  alt?: string;
  // img の width / height 属性に入れるための元画像サイズ（THUMBNAIL_FIELD で取得）
  dimensions: { width: number; height: number; aspectRatio: number };
};

// 「役割 + 名前」で1組のクレジット（Studio 側は array of object）
export type Credit = {
  _key: string;
  role: string;
  name: string;
};

export type Project = {
  _id: string;
  _createdAt: string;
  title: string;
  // リッチテキスト（Portable Text）。toHTML() に渡して描画する
  outline: PortableTextBlock[] | null;
  slug: { current: string };
  thumbnail: SanityImage | null;
  images: SanityImage[];
  credits: Credit[] | null;
  link: string | null;
};

export type Animation = {
  _id: string;
  _createdAt: string;
  title: string;
  slug: { current: string };
  thumbnail: SanityImage | null;
  // サムネイル動画のアセット URL（未設定なら null。板には thumbnail を貼る）
  video: string | null;
  link: string | null;
};

const builder = createImageUrlBuilder(sanityClient);

// 画像アセットから URL を組み立てる。
// 例: urlFor(project.thumbnail).width(345).height(194).url()
export const urlFor = (source: SanityImageSource) => builder.image(source);

// 画像の比率（横 / 縦）。Studio でトリミングされている場合はその範囲で出す。
// Projects の板(WebGL)と詳細ページのメインビジュアルは、この比率をそのまま形にする。
// 取れなければ null（呼び出し側で既定の比率にフォールバックする）
export const imageAspectRatio = (image: SanityImage | null | undefined): number | null => {
  const { width, height } = image?.dimensions ?? {};
  if (!width || !height) {
    return null;
  }

  const crop = image?.crop;
  const cropped = {
    width: width * (1 - (crop?.left ?? 0) - (crop?.right ?? 0)),
    height: height * (1 - (crop?.top ?? 0) - (crop?.bottom ?? 0)),
  };

  return cropped.width > 0 && cropped.height > 0 ? cropped.width / cropped.height : null;
};

// asset は参照のまま残す（urlFor が _ref を必要とするため）。
// aspectRatio だけ metadata から引き上げて img の height 算出に使う。
const THUMBNAIL_FIELD = `
  thumbnail{
    ...,
    "dimensions": asset->metadata.dimensions
  }
`;

const PROJECT_FIELDS = `
  _id,
  _createdAt,
  title,
  outline,
  slug,
  credits[]{_key, role, name},
  ${THUMBNAIL_FIELD},
  link,
  images[]{
    ...,
    "dimensions": asset->metadata.dimensions
  }
`;

// サムネイル動画は animation にだけ生やしてある。
// WebGL の VideoTexture に渡すだけなので、アセットの URL 以外は要らない。
const VIDEO_FIELD = `
  "video": video.asset->url
`;

const ANIMATION_FIELDS = `
  _id,
  _createdAt,
  title,
  slug,
  link,
  ${VIDEO_FIELD},
  ${THUMBNAIL_FIELD}
`;

// 管理画面のドラッグ順（orderRank）で並べる。
// orderRank が未設定のドキュメントは末尾に回す（"z" は lexorank の "0|..." より大きい）。
const BY_ORDER_RANK = `order(coalesce(orderRank, "zzzzzz") asc)`;

// 一覧取得（slug 未設定の下書きは除外し、管理画面で並べた順）
export const getProjects = async (): Promise<Project[]> =>
  await sanityClient.fetch<Project[]>(
    `*[_type == "project" && defined(slug.current)]|${BY_ORDER_RANK}{${PROJECT_FIELDS}}`,
  );

// 詳細取得（該当なしは null）
export const getProject = async (slug: string): Promise<Project | null> =>
  await sanityClient.fetch<Project | null>(`*[_type == "project" && slug.current == $slug][0]{${PROJECT_FIELDS}}`, {
    slug,
  });

// 一覧取得（slug 未設定の下書きは除外し、管理画面で並べた順）
export const getAnimations = async (): Promise<Animation[]> =>
  await sanityClient.fetch<Animation[]>(
    `*[_type == "animation" && defined(slug.current)]|${BY_ORDER_RANK}{${ANIMATION_FIELDS}}`,
  );

// 詳細取得（該当なしは null）
export const getAnimation = async (slug: string): Promise<Animation | null> =>
  await sanityClient.fetch<Animation | null>(
    `*[_type == "animation" && slug.current == $slug][0]{${ANIMATION_FIELDS}}`,
    { slug },
  );
