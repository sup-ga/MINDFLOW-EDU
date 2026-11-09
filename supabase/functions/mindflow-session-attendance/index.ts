import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { return ""; }
})();
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? ""; } catch { return ""; }
})();
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
async function rest(table: string, params: Record<string, string>, method = "GET", body?: unknown, prefer?: string) {
  const url = new URL("/rest/v1/" + table, SUPABASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const h: Record<string, string> = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (prefer) h["Prefer"] = prefer;
  const response = await fetch(url, {
    method,
    headers: h,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("Attendance database request failed", { table, method, status: response.status, body: text.slice(0, 300) });
    throw new Error("Impossible d’enregistrer la présence pour le moment.");
  }
  return text ? JSON.parse(text) : [];
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ success: false, error: "Méthode non autorisée." }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) return reply({ success: false, error: "Configuration de présence incomplète." }, 503);
  try {
    const token = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Connecte-toi à MindFlow pour enregistrer ta présence." }, 401);
    const auth = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: PUBLIC_KEY, Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) return reply({ success: false, error: "Ta session a expiré. Reconnecte-toi à MindFlow." }, 401);
    const user = await auth.json();
    if (!user?.id) return reply({ success: false, error: "Utilisateur MindFlow non vérifié." }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (!["start", "heartbeat", "stop"].includes(action)) return reply({ success: false, error: "Action de présence invalide." }, 400);

    if (action === "start") {
      const sessionId = String(body.session_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return reply({ success: false, error: "Séance invalide." }, 400);
      const sessions = await rest("class_sessions", { select: "id,class_id,title,starts_at,ends_at,status", id: "eq." + sessionId, limit: "1" });
      const session = sessions[0];
      if (!session) return reply({ success: false, error: "Séance introuvable." }, 404);
      if (session.status === "cancelled") return reply({ success: false, error: "Cette séance a été annulée." }, 409);
      const now = Date.now();
      const start = new Date(session.starts_at).getTime();
      const end = new Date(session.ends_at).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || now < start - 15 * 60_000 || now > end + 5 * 60_000) {
        return reply({ success: false, error: "La fenêtre de présence et de reprise de cette séance est terminée ou pas encore ouverte." }, 409);
      }
      const enrollments = await rest("class_enrollments", {
        select: "id", learner_id: "eq." + user.id, class_id: "eq." + session.class_id, status: "eq.active", limit: "1",
      });
      let hasAccess = enrollments.length > 0;
      if (!hasAccess) {
        const reqs = await rest("class_requests", {
          select: "id", learner_id: "eq." + user.id, class_id: "eq." + session.class_id,
          payment_status: "eq.paid", status: "in.(accepted,enrolled)", limit: "1",
        });
        hasAccess = reqs.length > 0;
      }
      if (!hasAccess) {
        const classes = await rest("professional_classes", {
          select: "id,offer_id", id: "eq." + session.class_id, limit: "1",
        });
        const offerId = classes[0]?.offer_id;
        if (offerId) {
          const reqs = await rest("class_requests", {
            select: "id", learner_id: "eq." + user.id, offer_id: "eq." + offerId,
            payment_status: "eq.paid", status: "in.(accepted,enrolled)", limit: "1",
          });
          hasAccess = reqs.length > 0;
        }
      }
      if (!hasAccess) return reply({ success: false, error: "Ton inscription n’est pas confirmée pour cette séance." }, 403);
      const existing = await rest("class_session_attendance", {
        select: "id", session_id: "eq." + sessionId,
        learner_id: "eq." + user.id, ended_at: "is.null", order: "started_at.desc",
      });
      if (existing.length) {
        // Every new join starts a fresh presence segment. Time spent outside the room
        // is never counted, even when the learner reconnects within 90 seconds.
        await rest("class_session_attendance", {
          id: "in.(" + existing.map((row: Record<string, unknown>) => String(row.id)).join(",") + ")",
          learner_id: "eq." + user.id, ended_at: "is.null",
        }, "PATCH", { ended_at: new Date(now).toISOString() }, "return=representation");
      }
      const created = await rest("class_session_attendance", {}, "POST", {
        session_id: sessionId, learner_id: user.id, started_at: new Date(now).toISOString(),
        last_seen_at: new Date(now).toISOString(), duration_seconds: 0,
      }, "return=representation");
      if (!created[0]?.id) throw new Error("La présence n’a pas pu être initialisée.");
      return reply({ success: true, attendance_id: created[0].id, duration_seconds: 0 });
    }

    const attendanceId = String(body.attendance_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(attendanceId)) return reply({ success: false, error: "Enregistrement de présence invalide." }, 400);
    const rows = await rest("class_session_attendance", {
      select: "id,session_id,last_seen_at,duration_seconds,ended_at", id: "eq." + attendanceId,
      learner_id: "eq." + user.id, limit: "1",
    });
    const row = rows[0];
    if (!row) return reply({ success: false, error: "Enregistrement de présence introuvable." }, 404);
    if (row.ended_at) return reply({ success: true, duration_seconds: row.duration_seconds });
    const now = Date.now();
    const [sessions] = await Promise.all([rest("class_sessions", { select: "ends_at", id: "eq." + row.session_id, limit: "1" })]);
    const scheduledEnd = sessions?.[0]?.ends_at ? new Date(sessions[0].ends_at).getTime() : now;
    const last = new Date(row.last_seen_at).getTime();
    const countedNow = Math.min(now, scheduledEnd);
    const elapsed = Number.isFinite(last) && Number.isFinite(countedNow) ? Math.max(0, Math.min(75, Math.floor((countedNow - last) / 1000))) : 0;
    const patch: Record<string, unknown> = {
      duration_seconds: Number(row.duration_seconds || 0) + elapsed,
      last_seen_at: new Date(now).toISOString(),
    };
    if (action === "stop") patch.ended_at = new Date(now).toISOString();
    const updated = await rest("class_session_attendance", {
      id: "eq." + attendanceId, learner_id: "eq." + user.id, ended_at: "is.null",
    }, "PATCH", patch, "return=representation");
    return reply({ success: true, duration_seconds: updated[0]?.duration_seconds ?? patch.duration_seconds });
  } catch (error) {
    console.error("mindflow-session-attendance error", error);
    return reply({ success: false, error: error instanceof Error ? error.message : "Erreur inattendue." }, 500);
  }
});