import { next } from "@vercel/edge";

// Vercel Edge Middleware で全ページに Basic 認証をかける。
// 認証情報は Vercel の環境変数で設定する（コードに直書きしない）。
//   BASIC_AUTH_USER     … ユーザー名
//   BASIC_AUTH_PASSWORD … パスワード

export const config = {
  // _astro（ハッシュ付きアセット）・favicon・OGP 画像などは認証対象外にして
  // Edge の実行回数を抑える。ページ HTML はすべて認証対象になる。
  matcher: ["/((?!_astro/|favicon\\.ico|robots\\.txt).*)"],
};

export default function middleware(request: Request) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // 環境変数が未設定なら認証をかけない（ローカル / 設定漏れ時に閉め出さないため）。
  if (!user || !password) {
    return next();
  }

  const authorization = request.headers.get("authorization");

  if (authorization) {
    const [scheme, encoded] = authorization.split(" ");

    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const separator = decoded.indexOf(":");
      const inputUser = decoded.slice(0, separator);
      const inputPassword = decoded.slice(separator + 1);

      if (inputUser === user && inputPassword === password) {
        return next();
      }
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area", charset="UTF-8"',
    },
  });
}
