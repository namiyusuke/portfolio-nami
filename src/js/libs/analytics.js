// Swup遷移では gtag の自動計測が走らないため、page:view ごとに手動送信する。
// 初回ロードもここから送信するため、gtag 側の config は
// send_page_view: false にしておくこと(二重計測防止)
export const sendPageView = () => {
  if (typeof window.gtag !== "function") {
    return;
  }
  window.gtag("event", "page_view", {
    page_title: document.title,
    page_location: location.href,
    page_path: location.pathname + location.search,
  });
};
