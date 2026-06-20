// ================================
// サイト共通設定
// ================================
export const SITE = {
  name: "",
  description: "Webサイトの説明文",
  url: "https://example.com",
  base: "",
  trackingId: null, // G-XXXXXXX
  clientRouter: false, // ページ遷移は swup(src/js)で制御するため Astro 標準の ClientRouter は不使用
};

// ================================
// 会社情報
// ================================
export const COMPANY = {
  name: "会社名",
  founder: "代表者",
  description: "会社紹介",
  foundingDate: "設立年月",
  telephone: "+81-XX-XXX-XXXX",
  fax: "+81-XX-XXX-XXXX",
  email: "info@example.com",
  address: {
    addressLocality: "市町村",
    addressRegion: "都道府県",
    postalCode: "郵便番号",
    streetAddress: "番地",
    addressCountry: "JP",
  },
  contactPoint: [
    {
      telephone: "+81-XX-XXX-XXXX",
    },
  ],
};

// ================================
// SNS情報
// ================================
export const SNS = {
  x: null,
  instagram: null,
  facebook: null,
};
