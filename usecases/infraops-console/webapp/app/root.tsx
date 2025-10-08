import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";

import globalStylesUrl from "./styles/global.css?url";
import { authenticator } from "./utils/auth.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: globalStylesUrl },
];

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const user = await authenticator.authenticate('TOTP', request);
    return { user }
  } catch (error) {
    return { user: null };
  }
}

export default function App() {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>エラーが発生しました</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="container" style={{ padding: "2rem" }}>
          <h1>エラーが発生しました</h1>
          {isRouteErrorResponse(error) ? (
            <>
              <h2>{error.status} {error.statusText}</h2>
              <p>{error.data}</p>
            </>
          ) : error instanceof Error ? (
            <>
              <h2>{error.name}: {error.message}</h2>
              <pre>{error.stack}</pre>
            </>
          ) : (
            <h2>不明なエラーが発生しました</h2>
          )}
          <div style={{ marginTop: "2rem" }}>
            <a href="/">ホームに戻る</a>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
