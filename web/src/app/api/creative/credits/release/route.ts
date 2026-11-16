import { connection } from "next/server";
import { handleCreativeCredits } from "@/server/creative/credits";
import { creativeCreditsDeps } from "@/server/creative/credits-deps";

export async function POST(request: Request) {
  await connection();
  return handleCreativeCredits(request, "release", creativeCreditsDeps());
}
