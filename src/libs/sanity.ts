// Sanity からコンテンツを取得する。
// クライアントは @sanity/astro が生やす仮想モジュール経由（設定は astro.config.mjs）。
import { createImageUrlBuilder } from "@sanity/image-url";
import type { SanityImageObject, SanityImageSource } from "@sanity/image-url";
import { sanityClient } from "sanity:client";

// 型定義
export type SanityImage = SanityImageObject & {
  alt?: string;
  // img の width / height 属性に入れるための元画像サイズ（THUMBNAIL_FIELD で取得）
  dimensions: { width: number; height: number; aspectRatio: number };
};

export type Project = {
  _id: string;
  _createdAt: string;
  title: string;
  subtitle: string;
  slug: { current: string };
  thumbnail: SanityImage | null;
  award: string | null;
};

export type Animation = {
  _id: string;
  _createdAt: string;
  title: string;
  slug: { current: string };
  thumbnail: SanityImage | null;
  link: string | null;
};

const builder = createImageUrlBuilder(sanityClient);

// 画像アセットから URL を組み立てる。
// 例: urlFor(project.thumbnail).width(345).height(194).url()
export const urlFor = (source: SanityImageSource) => builder.image(source);

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
  subtitle,
  slug,
  ${THUMBNAIL_FIELD},
  award
`;

const ANIMATION_FIELDS = `
  _id,
  _createdAt,
  title,
  slug,
  link,
  ${THUMBNAIL_FIELD}
`;

// 管理画面のドラッグ順（orderRank）で並べる。
// orderRank が未設定のドキュメントは末尾に回す（"z" は lexorank の "0|..." より大きい）。
const BY_ORDER_RANK = `order(coalesce(orderRank, "zzzzzz") asc)`;

// 一覧取得（slug 未設定の下書きは除外し、管理画面で並べた順）
export const getProjects = async (limit = 10): Promise<Project[]> =>
  await sanityClient.fetch<Project[]>(
    `*[_type == "project" && defined(slug.current)]|${BY_ORDER_RANK}[0...$limit]{${PROJECT_FIELDS}}`,
    { limit },
  );

// 詳細取得（該当なしは null）
export const getProject = async (slug: string): Promise<Project | null> =>
  await sanityClient.fetch<Project | null>(`*[_type == "project" && slug.current == $slug][0]{${PROJECT_FIELDS}}`, {
    slug,
  });

// 一覧取得（slug 未設定の下書きは除外し、管理画面で並べた順）
export const getAnimations = async (limit = 10): Promise<Animation[]> =>
  await sanityClient.fetch<Animation[]>(
    `*[_type == "animation" && defined(slug.current)]|${BY_ORDER_RANK}[0...$limit]{${ANIMATION_FIELDS}}`,
    { limit },
  );

// 詳細取得（該当なしは null）
export const getAnimation = async (slug: string): Promise<Animation | null> =>
  await sanityClient.fetch<Animation | null>(
    `*[_type == "animation" && slug.current == $slug][0]{${ANIMATION_FIELDS}}`,
    { slug },
  );
