import type { Response } from "express";

export async function sendFetchResponseToExpress(
  expressResponse: Response,
  fetchResponse: globalThis.Response,
): Promise<void> {
  expressResponse.status(fetchResponse.status);

  const setCookies = fetchResponse.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      expressResponse.append("Set-Cookie", cookie);
    }
    const headers = new Headers(fetchResponse.headers);
    headers.delete("set-cookie");
    headers.forEach((value, key) => {
      expressResponse.setHeader(key, value);
    });
  } else {
    fetchResponse.headers.forEach((value, key) => {
      expressResponse.append(key, value);
    });
  }

  const bodyText = await fetchResponse.text();
  if (bodyText.length > 0) {
    expressResponse.send(bodyText);
    return;
  }
  expressResponse.end();
}
