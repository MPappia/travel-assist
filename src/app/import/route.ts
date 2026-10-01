import { NextResponse, type NextRequest } from "next/server";

import { bookmarkletPayloadSchema, MAX_BODY_BYTES, payloadToSource } from "@/lib/listing-extract/payload";
import { createPendingImport } from "@/server/pending-imports";

// POST /import — reçoit le formulaire du bookmarklet (requête cross-site).
// Ne crée jamais rien directement : stocke un import en attente puis redirige (303) vers la confirmation.
export async function POST(request: NextRequest) {
  const invalid = () => NextResponse.redirect(new URL("/import/setup?erreur=invalide", request.url), 303);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return invalid();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalid();
  }
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;

  const parsed = bookmarkletPayloadSchema.safeParse(raw);
  if (!parsed.success) return invalid();

  const pending = await createPendingImport("bookmarklet", payloadToSource(parsed.data));
  return NextResponse.redirect(new URL(`/import/${pending.id}`, request.url), 303);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/import/setup", request.url), 307);
}
