import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { initDb, createOrUpdateUser, getUser, addPurchase, getPendingDeliveries, markDelivered } from "./lib/db";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const API_ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  "POST /api/auth/login": async (request) => {
    try {
      const { username } = await request.json();
      if (!username || username.length < 3 || username.length > 16) {
        return jsonResponse({ error: "Invalid username" }, 400);
      }
      const apiUrl = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;
      const res = await fetch(apiUrl);
      if (!res.ok) return jsonResponse({ error: "Minecraft username not found" }, 404);
      const data = await res.json();
      const uuid = data.id.replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/, "$1-$2-$3-$4-$5");
      await initDb();
      const user = await createOrUpdateUser(uuid, data.name);
      return jsonResponse({ ok: true, username: data.name, uuid, gold: user?.gold || 100 });
    } catch {
      return jsonResponse({ error: "Could not verify username" }, 500);
    }
  },
  "GET /api/auth/me": async (request) => {
    const uuid = request.headers.get("x-player-uuid");
    if (!uuid) return jsonResponse({ error: "Not logged in" }, 401);
    await initDb();
    const user = await getUser(uuid);
    if (!user) return jsonResponse({ error: "User not found" }, 404);
    return jsonResponse({ ok: true, username: user.username, uuid: user.uuid, gold: user.gold });
  },
  "POST /api/store/buy": async (request) => {
    try {
      const { uuid, itemId, itemName, cost } = await request.json();
      if (!uuid || !itemId || !cost) return jsonResponse({ error: "Missing fields" }, 400);
      await initDb();
      const db = (await import("./lib/db")).getDb();
      if (!db) return jsonResponse({ error: "Database not configured" }, 500);
      const user = await getUser(uuid);
      if (!user) return jsonResponse({ error: "Login first" }, 401);
      if (Number(user.gold) < cost) return jsonResponse({ error: "Not enough gold", gold: user.gold }, 400);
      await db.execute({ sql: "UPDATE users SET gold = gold - ? WHERE uuid = ?", args: [cost, uuid] });
      await addPurchase(uuid, itemId, itemName, cost);
      const updated = await getUser(uuid);
      return jsonResponse({ ok: true, gold: updated?.gold, message: `Purchased ${itemName}!` });
    } catch {
      return jsonResponse({ error: "Purchase failed" }, 500);
    }
  },
  "GET /api/deliveries/pending": async (request) => {
    const uuid = request.headers.get("x-player-uuid");
    if (!uuid) return jsonResponse({ error: "Not logged in" }, 401);
    await initDb();
    const deliveries = await getPendingDeliveries(uuid);
    return jsonResponse({ ok: true, deliveries });
  },
  "POST /api/deliveries/mark": async (request) => {
    try {
      const { id } = await request.json();
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      await initDb();
      await markDelivered(Number(id));
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: "Failed" }, 500);
    }
  },
  "GET /api/sync/player": async (request) => {
    const url = new URL(request.url);
    const uuid = url.searchParams.get("uuid");
    if (!uuid) return jsonResponse({ error: "Missing uuid" }, 400);
    await initDb();
    const db = (await import("./lib/db")).getDb();
    if (!db) return jsonResponse({ error: "No DB" }, 500);
    let user = await getUser(uuid);
    if (!user) {
      return jsonResponse({ ok: false, registered: false });
    }
    const deliveries = await getPendingDeliveries(uuid);
    return jsonResponse({
      ok: true, registered: true,
      username: user.username,
      gold: user.gold,
      pendingDeliveries: deliveries,
    });
  },
  "POST /api/sync/deliver": async (request) => {
    try {
      const { uuid, id } = await request.json();
      if (!uuid || !id) return jsonResponse({ error: "Missing fields" }, 400);
      await initDb();
      await markDelivered(Number(id));
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: "Failed" }, 500);
    }
  },
};

async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const key = `${method} ${path}`;

  const handler = API_ROUTES[key];
  if (handler) return handler(request);

  const wildcardKey = `${method} ${path.replace(/\/[^/]+$/, "/:param")}`;
  if (API_ROUTES[wildcardKey]) return API_ROUTES[wildcardKey](request);

  return null;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const apiResponse = await handleApiRequest(request);
      if (apiResponse) return apiResponse;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
