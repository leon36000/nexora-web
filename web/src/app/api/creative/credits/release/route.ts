import { connection } from "next/server";
import { creativeCreditsDeps } from "@/server/creative/credits-deps";
import { handleCreativeCredits } from "@/server/creative/credits";

export async function POST(request: Request) {
  await connection();
  return handleCreativeCredits(request, "release", creativeCreditsDeps());
}
