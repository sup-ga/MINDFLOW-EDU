import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? ""; } catch { return ""; }
})();
const PUBLIC_API_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? ""; } catch { return ""; }
})();
const BBB_API_URL = Deno.env.get("BBB_API_URL") ?? "";
const BBB_SECRET = Deno.env.get("BBB_SECRET") ?? "";

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
function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"));
  return match?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") ?? "";
}
async function sha1(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function apiUrl(method: string, params: URLSearchParams) {
  const query = params.toString();
  const checksum = await sha1(method + query + BBB_SECRET);
  const base = BBB_API_URL.trim().replace(/\/+$/, "");
  const endpoint = /\/bigbluebutton\/api$/i.test(base) ? base : base + "/bigbluebutton/api";
  return endpoint + "/" + method + "?" + query + "&checksum=" + checksum;
}
async function bbbCall(method: string, params: URLSearchParams) {
  const url = await apiUrl(method, params);
  const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(12000) });
  const body = await response.text();
  if (!response.ok || xmlValue(body, "returncode") !== "SUCCESS") {
    console.error("BigBlueButton API call failed", { method, status: response.status, messageKey: xmlValue(body, "messageKey") });
    throw new Error("Le service de classe virtuelle a refusé la demande. Vérifie l’URL API et la clé secrète BBB.");
  }
  return body;
}
function randomStablePassword(seed: string) {
  // Passwords are deterministic per session so repeated create calls remain idempotent.
  return seed;
}
async function dbRows(table: string, params: Record<string, string>) {
  const url = new URL("/rest/v1/" + table, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: "Bearer " + SERVICE_ROLE_KEY },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Impossible de vérifier les droits d’accès à la séance.");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Réponse de données invalide.");
  return data as Record<string, any>[];
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ success: false, error: "Méthode non autorisée." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLIC_API_KEY) {
    return reply({ success: false, error: "La configuration sécurisée de MindFlow est incomplète." }, 503);
  }
  if (!BBB_API_URL || !BBB_SECRET) {
    return reply({ success: false, error: "La connexion BigBlueButton n’est pas encore configurée. Vérifie BBB_API_URL et BBB_SECRET dans les secrets Supabase." }, 503);
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Connecte-toi à MindFlow pour ouvrir cette séance." }, 401);
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: PUBLIC_API_KEY, Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) return reply({ success: false, error: "Ta session a expiré. Reconnecte-toi à MindFlow." }, 401);
    const user = await userResponse.json();
    if (!user?.id) return reply({ success: false, error: "Utilisateur MindFlow non vérifié." }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id ?? "");
    const action = String(body.action ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !["start", "join", "prepare"].includes(action)) {
      return reply({ success: false, error: "Séance ou action invalide." }, 400);
    }
    const sessions = await dbRows("class_sessions", {
      select: "id,class_id,title,starts_at,ends_at,status",
      id: "eq." + sessionId,
      limit: "1",
    });
    const session = sessions[0];
    if (!session) return reply({ success: false, error: "Cette séance n’existe plus dans MindFlow." }, 404);
    if (session.status === "cancelled") {
      return reply({ success: false, error: "Cette séance a été annulée." }, 409);
    }
    const classes = await dbRows("professional_classes", {
      select: "id,offer_id,professional_id,title",
      id: "eq." + session.class_id,
      limit: "1",
    });
    const cls = classes[0];
    if (!cls) return reply({ success: false, error: "La classe associée à cette séance est introuvable." }, 404);

    const now = Date.now();
    const start = session.starts_at ? new Date(session.starts_at).getTime() : NaN;
    const end = session.ends_at ? new Date(session.ends_at).getTime() : start + 60 * 60 * 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return reply({ success: false, error: "Les horaires de cette séance sont incomplets." }, 409);
    }
    if (action !== "prepare" && now > end + 5 * 60 * 1000) return reply({ success: false, error: "La fenêtre de reprise de cette séance est terminée." }, 409);

    let isTeacher = false;
    const professionalProfiles = await dbRows("professional_profiles", {
      select: "id,display_name",
      user_id: "eq." + user.id,
      limit: "1",
    });
    const teacherProfile = professionalProfiles[0];
    if (teacherProfile && teacherProfile.id === cls.professional_id) isTeacher = true;

    if (action === "prepare") {
      if (!isTeacher) return reply({ success: false, error: "Seul le professeur responsable peut préparer cette salle." }, 403);
    } else if (action === "start") {
      if (!isTeacher) return reply({ success: false, error: "Seul le professeur responsable peut démarrer cette salle." }, 403);
      if (now < start - 15 * 60 * 1000) {
        return reply({ success: false, error: "La salle sera disponible 15 minutes avant l’heure prévue." }, 409);
      }
    } else {
      if (isTeacher) {
        if (now < start - 15 * 60 * 1000) {
          return reply({ success: false, error: "La salle sera disponible 15 minutes avant l’heure prévue." }, 409);
        }
      } else {
        const enrollments = await dbRows("class_enrollments", {
          select: "id",
          learner_id: "eq." + user.id,
          class_id: "eq." + cls.id,
          status: "eq.active",
          limit: "1",
        });
        let hasAccess = enrollments.length > 0;
        if (!hasAccess) {
          const reqs = await dbRows("class_requests", {
            select: "id,status,payment_status",
            learner_id: "eq." + user.id,
            class_id: "eq." + cls.id,
            payment_status: "eq.paid",
            status: "in.(accepted,enrolled)",
            limit: "1",
          });
          hasAccess = reqs.length > 0;
        }
        if (!hasAccess && cls.offer_id) {
          const reqs = await dbRows("class_requests", {
            select: "id,status,payment_status",
            learner_id: "eq." + user.id,
            offer_id: "eq." + cls.offer_id,
            payment_status: "eq.paid",
            status: "in.(accepted,enrolled)",
            limit: "1",
          });
          hasAccess = reqs.length > 0;
        }
        if (!hasAccess) return reply({ success: false, error: "Ton inscription ou ton paiement n’est pas encore confirmé pour cette classe." }, 403);
        if (now < start) return reply({ success: false, error: "Le bouton de visioconférence sera disponible à l’heure de début de la séance." }, 409);
      }
    }

    const meetingId = "mf-" + session.id;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BBB_SECRET + ":" + session.id));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const attendeePW = randomStablePassword("mfA" + hex.slice(0, 20));
    const moderatorPW = randomStablePassword("mfM" + hex.slice(20, 40));
    const meetingName = String(session.title || cls.title || "Cours MindFlow").trim().slice(0, 64) || "Cours MindFlow";
    const createParams = new URLSearchParams();
    createParams.set("name", meetingName);
    createParams.set("meetingID", meetingId);
    createParams.set("attendeePW", attendeePW);
    createParams.set("moderatorPW", moderatorPW);
    createParams.set("record", "false");
    createParams.set("autoStartRecording", "false");
    createParams.set("allowStartStopRecording", "false");
    try {
      await bbbCall("create", createParams);
    } catch (createError) {
      // Meeting IDs are deterministic per session, so an existing room is reusable.
      try {
        const info = await bbbCall("getMeetingInfo", new URLSearchParams({ meetingID }));
        if (xmlValue(info, "meetingID") !== meetingId) throw createError;
      } catch {
        throw createError;
      }
    }
    if (action === "prepare") {
      return reply({ success: true, prepared: true, meeting_id: meetingId });
    }

    const displayName = String((isTeacher ? teacherProfile?.display_name : null) ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Participant").trim().slice(0, 100) || "Participant";
    const joinParams = new URLSearchParams();
    joinParams.set("fullName", displayName);
    joinParams.set("meetingID", meetingId);
    joinParams.set("password", isTeacher || action === "start" ? moderatorPW : attendeePW);
    joinParams.set("redirect", "true");
    const joinUrl = await apiUrl("join", joinParams);
    return reply({ success: true, url: joinUrl, role: isTeacher ? "moderator" : "attendee" });
  } catch (error) {
    console.error("mindflow-classroom error", error);
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return reply({ success: false, error: message.includes("BigBlueButton") || message.includes("MindFlow") ? message : "Impossible d’ouvrir la salle pour le moment. Réessaie dans un instant." }, 500);
  }
});