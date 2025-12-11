import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    const roomPrices = await prisma.roomPrice.findMany();
    // Convert to a simple object format: { roomId: pricePerHour }
    const prices: Record<number, number> = {};
    roomPrices.forEach((rp) => {
      prices[rp.roomId] = rp.pricePerHour;
    });
    return NextResponse.json(prices);
  } catch (err) {
    console.error("GET /api/room-prices error", err);
    return NextResponse.json({ error: "Failed to fetch room prices" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prices } = body;

    if (!prices || typeof prices !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Upsert all room prices
    const updates = Object.entries(prices).map(([roomId, pricePerHour]) => {
      const roomIdNum = Number(roomId);
      const priceNum = Number(pricePerHour);

      if (Number.isNaN(roomIdNum) || Number.isNaN(priceNum) || priceNum < 0) {
        throw new Error(`Invalid price for room ${roomId}`);
      }

      return prisma.roomPrice.upsert({
        where: { roomId: roomIdNum },
        update: { pricePerHour: priceNum },
        create: { roomId: roomIdNum, pricePerHour: priceNum },
      });
    });

    await Promise.all(updates);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("POST /api/room-prices error", err);
    return NextResponse.json({ error: "Failed to save room prices" }, { status: 500 });
  }
}

