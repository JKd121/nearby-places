import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  deleteSearchHistory,
  getRecentSearchHistory,
  saveSearchHistory,
} from "../../../src/history/service.js";

const VISITOR_COOKIE_NAME = "nearby_visitor_id";

const VISITOR_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 365;

type SaveHistoryBody = {
  query: string;
  categoryIds: string[];
  radiusMeters: number;
};

async function getOrCreateVisitorId(): Promise<string> {
  const cookieStore = await cookies();

  const existingVisitorId =
    cookieStore.get(VISITOR_COOKIE_NAME)?.value;

  if (existingVisitorId) {
    return existingVisitorId;
  }

  const visitorId = randomUUID();

  cookieStore.set(VISITOR_COOKIE_NAME, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });

  return visitorId;
}

function isSaveHistoryBody(
  value: unknown,
): value is SaveHistoryBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;

  return (
    typeof body.query === "string" &&
    body.query.trim().length > 0 &&
    Array.isArray(body.categoryIds) &&
    body.categoryIds.length > 0 &&
    body.categoryIds.every(
      (categoryId) =>
        typeof categoryId === "string" &&
        categoryId.length > 0,
    ) &&
    typeof body.radiusMeters === "number" &&
    Number.isInteger(body.radiusMeters) &&
    body.radiusMeters > 0
  );
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
}) {
  return {
    id: history.id,
    query: history.query,
    categoryIds: history.categoryIds,
    radiusMeters: history.radiusMeters,
    searchedAt: history.searchedAt.toISOString(),
  };
}

export async function GET() {
  const visitorId = await getOrCreateVisitorId();

  const history =
    await getRecentSearchHistory(visitorId);

  return NextResponse.json({
    items: history.map(toHistoryResponseItem),
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

  const visitorId = await getOrCreateVisitorId();

  const history = await saveSearchHistory({
    visitorId,
    query: body.query,
    categoryIds: body.categoryIds,
    radiusMeters: body.radiusMeters,
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

  const visitorId = await getOrCreateVisitorId();
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
