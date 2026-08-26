// ヘッダーの日付(和風月名＋二十四節気)と、愛媛県(松山市)の現在気温を表示する。
// 気温は Open-Meteo(APIキー不要・無料)からリアルタイム取得する。

// 松山市の緯度経度
const MATSUYAMA = { latitude: 33.8416, longitude: 132.7657 };

// 和風月名(1〜12月)
const WAFU_MONTHS = [
  "睦月",
  "如月",
  "弥生",
  "卯月",
  "皐月",
  "水無月",
  "文月",
  "葉月",
  "長月",
  "神無月",
  "霜月",
  "師走",
];

// 二十四節気(その節気が始まる目安の月日)。日付以降に該当する最後の節気を採用する。
const SEKKI = [
  [1, 6, "小寒"],
  [1, 20, "大寒"],
  [2, 4, "立春"],
  [2, 19, "雨水"],
  [3, 6, "啓蟄"],
  [3, 21, "春分"],
  [4, 5, "清明"],
  [4, 20, "穀雨"],
  [5, 6, "立夏"],
  [5, 21, "小満"],
  [6, 6, "芒種"],
  [6, 21, "夏至"],
  [7, 7, "小暑"],
  [7, 23, "大暑"],
  [8, 8, "立秋"],
  [8, 23, "処暑"],
  [9, 8, "白露"],
  [9, 23, "秋分"],
  [10, 8, "寒露"],
  [10, 24, "霜降"],
  [11, 7, "立冬"],
  [11, 22, "小雪"],
  [12, 7, "大雪"],
  [12, 22, "冬至"],
];

// 数字を漢数字に変換(年表記用)。例: 2026 → 二〇二六
const toKanjiNumber = (n) => {
  const digits = "〇一二三四五六七八九";
  return String(n)
    .split("")
    .map((d) => digits[Number(d)])
    .join("");
};

// 現在日時から「二〇二六年 卯月／晴明」形式の文字列を組み立てる
const buildDateText = (date = new Date()) => {
  const year = toKanjiNumber(date.getFullYear());
  const month = WAFU_MONTHS[date.getMonth()];

  // 該当する二十四節気を求める(年初は前年末の冬至になるためフォールバックを用意)
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let sekki = SEKKI[SEKKI.length - 1][2]; // 既定値: 冬至
  for (const [sm, sd, name] of SEKKI) {
    if (m > sm || (m === sm && d >= sd)) {
      sekki = name;
    }
  }

  return `${year}年 ${month}／${sekki}`;
};

// 松山市の現在気温を取得する
const fetchTemperature = async () => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${MATSUYAMA.latitude}&longitude=${MATSUYAMA.longitude}&current=temperature_2m`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`weather request failed: ${res.status}`);
  }
  const data = await res.json();
  return Math.round(data.current.temperature_2m);
};

// ヘッダーの日付・気温を更新する。
// 日付は即時更新し、気温は取得でき次第差し替える(取得失敗時は既存表示を維持)。
export const initHeaderWeather = async () => {
  const dateEl = document.querySelector(".header-date-text");
  const tempEl = document.querySelector(".header-temperature-text");
  if (!dateEl && !tempEl) return;

  if (dateEl) {
    dateEl.textContent = buildDateText();
  }

  if (tempEl) {
    try {
      const temp = await fetchTemperature();
      tempEl.textContent = `気温${temp}°`;
    } catch (err) {
      console.error("気温の取得に失敗しました", err);
    }
  }
};
