import { connection } from "next/server";
import { getDb } from "@/server/db";
import { handleHealth } from "@/server/health";

export async function GET() {
  await connection();
  return handleHealth(getDb);
}
