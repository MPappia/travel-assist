import { NextResponse, type NextRequest } from "next/server";

import { bookmarkletPayloadSchema, MAX_BODY_BYTES, payloadToSource } from "@/lib/listing-extract/payload";
import { createPendingImport } from "@/server/pending-imports";

// POST /import — reçoit le formulaire du bookmarklet (requête cross-site).
// Ne crée jamais rien directement : stocke un import en attente puis redirige (303) vers la confirmation.
export async function POST(request: NextRequest) {
  // Chaque cause de rejet a son propre code (affiché sur /import/setup et journalisé).
  const reject = (reason: "trop-volumineux" | "illisible" | "invalide", detail: string) => {
    console.warn(`POST /import rejeté (${reason}) : ${detail}`);
    return NextResponse.redirect(new URL(`/import/setup?erreur=${reason}`, request.url), 303);
  };

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return reject("trop-volumineux", `${length} octets > ${MAX_BODY_BYTES}`);
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    return reject("illisible", String(error));
  }
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;

  const parsed = bookmarkletPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const sizes = Object.entries(raw)
      .map(([k, v]) => `${k}=${v.length}`)
      .join(", ");
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ");
    return reject("invalide", `${issues} (tailles : ${sizes})`);
  }

  const pending = await createPendingImport("bookmarklet", payloadToSource(parsed.data));
  return NextResponse.redirect(new URL(`/import/${pending.id}`, request.url), 303);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/import/setup", request.url), 307);
}
