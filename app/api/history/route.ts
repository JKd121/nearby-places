import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  deleteSearchHistory,
  getRecentSearchHistory,
  saveSearchHistory,
} from "../../../src/history/service.js";
import type { HistorySearchInput } from "../../../src/history/contracts.js";
import { copyConfirmedLocation, isHistorySearchInput } from "../../../src/history/validation.js";
import type { LocationCandidate } from "../../../src/location/types.js";

const VISITOR_COOKIE_NAME = "nearby_visitor_id";

const VISITOR_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 365;

type SaveHistoryBody = HistorySearchInput;

async function getOrCreateVisitor(): Promise<{ id: string; created: boolean }> {
  const cookieStore = await cookies();

  const existingVisitorId =
    cookieStore.get(VISITOR_COOKIE_NAME)?.value;

  if (existingVisitorId) {
    return { id: existingVisitorId, created: false };
  }

  const visitorId = randomUUID();

  cookieStore.set(VISITOR_COOKIE_NAME, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });

  return { id: visitorId, created: true };
}

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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limitValue = params.get("limit");
  if ([...params.keys()].some((key) => key !== "limit") || params.getAll("limit").length > 1 ||
      (limitValue !== null && limitValue !== "10" && limitValue !== "20")) {
    return NextResponse.json({ error: "Invalid history limit" }, { status: 400 });
  }
  const visitor = await getOrCreateVisitor();
  const history = visitor.created ? [] : await getRecentSearchHistory(visitor.id, Number(limitValue ?? 10));
  return NextResponse.json({ items: history.map(toHistoryResponseItem) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  if (!isSaveHistoryBody(body)) {
    return NextResponse.json(
      {
        error: "Invalid search history input",
      },
      {
        status: 400,
      },
    );
  }

  const { id: visitorId } = await getOrCreateVisitor();

  const history = await saveSearchHistory({
    visitorId,
    query: body.query,
    categoryIds: body.categoryIds,
    radiusMeters: body.radiusMeters,
    confirmedLocation: copyConfirmedLocation(body.confirmedLocation),
  });

  return NextResponse.json({
    item: toHistoryResponseItem(history),
  });
}

export async function DELETE(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
      },
      {
        status: 400,
      },
    );
  }

  if (!isDeleteHistoryBody(body)) {
    return NextResponse.json(
      {
        error: "Invalid search history input",
      },
      {
        status: 400,
      },
    );
  }

  const { id: visitorId } = await getOrCreateVisitor();
  const result = await deleteSearchHistory(body.id, visitorId);

  if (result.count === 0) {
    return NextResponse.json(
      {
        error: "Search history not found",
      },
      {
        status: 404,
      },
    );
  }

  return NextResponse.json({ deleted: true });
}
