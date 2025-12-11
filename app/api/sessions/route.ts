import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
    });
    // Convert BigInt to number for JSON serialization
    const serializedSessions = sessions.map((session) => ({
      ...session,
      durationMs: Number(session.durationMs),
    }));
    return NextResponse.json(serializedSessions);
  } catch (err) {
    console.error("GET /api/sessions error", err);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      roomId,
      roomName,
      start,
      end,
      durationMs,
      priceAmd,
      pricePerHourAmd,
    } = body;

    if (
      typeof roomId !== "number" ||
      typeof roomName !== "string" ||
      typeof start !== "string" ||
      typeof end !== "string" ||
      typeof durationMs !== "number" ||
      typeof priceAmd !== "number" ||
      typeof pricePerHourAmd !== "number"
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const session = await prisma.session.create({
      data: {
        roomId,
        roomName,
        start: new Date(start),
        end: new Date(end),
        durationMs: BigInt(durationMs),
        priceAmd,
        pricePerHourAmd,
      },
    });

    // Convert BigInt to number for JSON serialization
    const serializedSession = {
      ...session,
      durationMs: Number(session.durationMs),
    };

    return NextResponse.json(serializedSession, { status: 201 });
  } catch (err) {
    console.error("POST /api/sessions error", err);
    return NextResponse.json({ error: "Failed to save session" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    await prisma.session.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/sessions error", err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}

