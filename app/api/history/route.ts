import { requireAccount } from "../../../src/identity/service.js";
import { trustedOrigin } from "../../../src/identity/security.js";
import { mapServerError } from "../../../src/server/http.js";




import {
  deleteSearchHistory,
  getRecentSearchHistory,
  saveSearchHistory,
} from "../../../src/history/service.js";
import type { HistorySearchInput } from "../../../src/history/contracts.js";
import { copyConfirmedLocation, isHistorySearchInput } from "../../../src/history/validation.js";
import type { LocationCandidate } from "../../../src/location/types.js";

type SaveHistoryBody = HistorySearchInput;

function isSaveHistoryBody(
  value: unknown,
): value is SaveHistoryBody {
  return isHistorySearchInput(value) && Object.keys(value).every((field) =>
    ["query", "categoryIds", "radiusMeters", "confirmedLocation"].includes(field));
}

function isDeleteHistoryBody(
  value: unknown,
): value is { id: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const body = value as Record<string, unknown>;

  return (
    Object.keys(body).every((field) => field === "id") &&
    typeof body.id === "string" &&
    body.id.trim().length > 0
  );
}

function toHistoryResponseItem(history: {
  id: string;
  query: string;
  categoryIds: string[];
  radiusMeters: number;
  searchedAt: Date;
  confirmedLocation: LocationCandidate;
}) {
  return {
    id: history.id,
    query: history.query,
    categoryIds: history.categoryIds,
    radiusMeters: history.radiusMeters,
    searchedAt: history.searchedAt.toISOString(),
    confirmedLocation: copyConfirmedLocation(history.confirmedLocation),
  };
}

async function get(request: Request) {
  const identity = await requireAccount(request);
  const params = new URL(request.url).searchParams;
  const limitValue = params.get("limit");
  if ([...params.keys()].some((key) => key !== "limit") || params.getAll("limit").length > 1 ||
      (limitValue !== null && limitValue !== "10" && limitValue !== "20")) {
    return Response.json({ error: "Invalid history limit" }, { status: 400 });
  }
  const history = await getRecentSearchHistory(identity.userId, Number(limitValue ?? 10));
  return Response.json({ items: history.map(toHistoryResponseItem) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function post(request: Request) {
  trustedOrigin(request);
  const identity = await requireAccount(request);
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  if (!isSaveHistoryBody(body)) {
    return Response.json(
      {
        error: "Invalid search history input",
      },
      {
        status: 400,
      },
    );
  }

  const visitorId = identity.userId;

  const history = await saveSearchHistory({
    visitorId,
    userId: identity.userId,
    query: body.query,
    categoryIds: body.categoryIds,
    radiusMeters: body.radiusMeters,
    confirmedLocation: copyConfirmedLocation(body.confirmedLocation),
  });

  return Response.json({
    item: toHistoryResponseItem(history),
  });
}

async function remove(request: Request) {
  trustedOrigin(request);
  const identity = await requireAccount(request);
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  if (!isDeleteHistoryBody(body)) {
    return Response.json(
      {
        error: "Invalid search history input",
      },
      {
        status: 400,
      },
    );
  }

  const visitorId = identity.userId;
  const result = await deleteSearchHistory(body.id, visitorId);

  if (result.count === 0) {
    return Response.json(
      {
        error: "Search history not found",
      },
      {
        status: 404,
      },
    );
  }

  return Response.json({ deleted: true });
}

const wrap = (handler: (request: Request) => Promise<Response>) => async (request: Request) => {
  try { const response = await handler(request); response.headers.set("cache-control", "private, no-store"); return response; }
  catch (error) { return mapServerError(error); }
};
export const GET = wrap(get);
export const POST = wrap(post);
export const DELETE = wrap(remove);
