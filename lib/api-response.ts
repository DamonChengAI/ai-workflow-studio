import { NextResponse } from "next/server";

export function listResponse<T>(items: T[]) {
  return NextResponse.json({
    data: { items },
    meta: { total: items.length }
  });
}

export function dataResponse<T>(data: T, meta: Record<string, unknown> = {}) {
  return NextResponse.json({
    data,
    meta
  });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      error: {
        code: "mock_error",
        message
      }
    },
    { status }
  );
}
