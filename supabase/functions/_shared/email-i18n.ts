/**
 * Emails and notifications in the recipient's language.
 *
 * The site is translated into 5 languages, but every email (digest, election
 * reminders, race results, new-message and team-invite notices, the
 * unsubscribe footer) used to go out in English. Each sender now looks up the
 * recipient's profiles.language_preference and builds its text here; links
 * point at the same language's URLs (/es/messages, ...).
 */

export type Lang = "en" | "es" | "pt" | "ht" | "ru";
const LANGS: Lang[] = ["en", "es", "pt", "ht", "ru"];

export function asLang(v: unknown): Lang {
  return LANGS.includes(v as Lang) ? (v as Lang) : "en";
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** language_preference for each user id (missing -> English). */
export async function getUserLangs(supabase: Db, userIds: string[]): Promise<Map<string, Lang>> {
  const out = new Map<string, Lang>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data } = await supabase.from("profiles").select("id, language_preference").in("id", userIds.slice(i, i + 500));
    for (const row of data ?? []) out.set(row.id, asLang(row.language_preference));
  }
  return out;
}

/** Absolute link to a page of the site in a language, or "" if SITE_URL is unset. */
export function siteLink(lang: Lang, path: string): string {
  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
  if (!site) return "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return lang === "en" ? `${site}${p}` : `${site}/${lang}${p === "/" ? "" : p}`;
}

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US", pt: "pt-BR", ht: "fr-HT", ru: "ru-RU" };

/** A YYYY-MM-DD date written the way readers of that language expect. */
export function formatDate(lang: Lang, isoDate: string): string {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "long", timeZone: "UTC" }).format(d);
  } catch {
    return isoDate;
  }
}

export function days(lang: Lang, n: number): string {
  switch (lang) {
    case "es": return n === 1 ? "1 día" : `${n} días`;
    case "pt": return n === 1 ? "1 dia" : `${n} dias`;
    case "ht": return n === 1 ? "1 jou" : `${n} jou`;
    case "ru": {
      const m10 = n % 10, m100 = n % 100;
      const w = m10 === 1 && m100 !== 11 ? "день" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "дня" : "дней";
      return `${n} ${w}`;
    }
    default: return n === 1 ? "1 day" : `${n} days`;
  }
}

const BRAND = "Gov Search App";

const T = {
  digestSubject: { en: `Your ${BRAND} Digest`, es: `Tu resumen de ${BRAND}`, pt: `Seu resumo da ${BRAND}`, ht: `Rezime ${BRAND} ou`, ru: `Ваш дайджест ${BRAND}` },
  candidateUpdates: { en: "Candidate updates", es: "Novedades de candidatos", pt: "Novidades de candidatos", ht: "Nouvèl kandida yo", ru: "Новости кандидатов" },
  measureUpdates: { en: "Ballot measure updates", es: "Novedades de medidas en la boleta", pt: "Novidades das medidas na cédula", ht: "Nouvèl sou mezi bilten vòt yo", ru: "Новости о вопросах в бюллетене" },
  recentArticles: { en: "Recently added articles", es: "Artículos agregados recientemente", pt: "Artigos adicionados recentemente", ht: "Atik ki fèk ajoute", ru: "Недавно добавленные статьи" },
  newElections: { en: "New elections added", es: "Nuevas elecciones agregadas", pt: "Novas eleições adicionadas", ht: "Nouvo eleksyon ki ajoute", ru: "Добавлены новые выборы" },
  manageIn: { en: "Manage what you receive in your account settings (Notifications tab)", es: "Administra lo que recibes en la configuración de tu cuenta (pestaña Notificaciones)", pt: "Gerencie o que você recebe nas configurações da conta (aba Notificações)", ht: "Jere sa ou resevwa nan paramèt kont ou (onglè Notifikasyon)", ru: "Управляйте рассылками в настройках аккаунта (вкладка «Уведомления»)" },
  unsubscribeAsk: { en: "Don't want these emails?", es: "¿No quieres recibir estos correos?", pt: "Não quer receber estes e-mails?", ht: "Ou pa vle imèl sa yo?", ru: "Не хотите получать эти письма?" },
  unsubscribe: { en: "Unsubscribe", es: "Darse de baja", pt: "Cancelar inscrição", ht: "Dezabòne", ru: "Отписаться" },
  newMessageSubject: { en: `You have a new message on ${BRAND}`, es: `Tienes un mensaje nuevo en ${BRAND}`, pt: `Você tem uma nova mensagem na ${BRAND}`, ht: `Ou gen yon nouvo mesaj sou ${BRAND}`, ru: `У вас новое сообщение в ${BRAND}` },
  newMessageIntro: { en: `You have a new message on ${BRAND}:`, es: `Tienes un mensaje nuevo en ${BRAND}:`, pt: `Você tem uma nova mensagem na ${BRAND}:`, ht: `Ou gen yon nouvo mesaj sou ${BRAND}:`, ru: `У вас новое сообщение в ${BRAND}:` },
  replyAt: { en: "Reply at", es: "Responde en", pt: "Responda em", ht: "Reponn sou", ru: "Ответить можно здесь:" },
  replyFromPage: { en: "Reply from the Messages page.", es: "Responde desde la página de Mensajes.", pt: "Responda pela página de Mensagens.", ht: "Reponn sou paj Mesaj la.", ru: "Ответить можно на странице «Сообщения»." },
  teamSubject: { en: `You've been added to a ${BRAND} campaign team`, es: `Te agregaron a un equipo de campaña de ${BRAND}`, pt: `Você foi adicionado a uma equipe de campanha da ${BRAND}`, ht: `Yo ajoute w nan yon ekip kanpay ${BRAND}`, ru: `Вас добавили в команду кампании ${BRAND}` },
} as const;

const ROLES: Record<string, Record<Lang, string>> = {
  candidate: { en: "candidate", es: "candidato", pt: "candidato", ht: "kandida", ru: "кандидат" },
  campaign_manager: { en: "campaign manager", es: "director de campaña", pt: "coordenador de campanha", ht: "manadjè kanpay", ru: "руководитель кампании" },
  social_manager: { en: "social media manager", es: "responsable de redes sociales", pt: "responsável pelas redes sociais", ht: "responsab rezo sosyal", ru: "менеджер соцсетей" },
  volunteer_manager: { en: "volunteer manager", es: "coordinador de voluntarios", pt: "coordenador de voluntários", ht: "kowòdonatè volontè", ru: "координатор волонтёров" },
  staff: { en: "staff member", es: "miembro del personal", pt: "membro da equipe", ht: "anplwaye", ru: "сотрудник" },
  volunteer: { en: "volunteer", es: "voluntario", pt: "voluntário", ht: "volontè", ru: "волонтёр" },
  member: { en: "team member", es: "miembro del equipo", pt: "membro da equipe", ht: "manm ekip", ru: "участник команды" },
};

export const tr = (key: keyof typeof T, lang: Lang): string => T[key][lang];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Footer line pointing to notification settings (with a link when SITE_URL is set). */
export function manageFooter(lang: Lang): string {
  const link = siteLink(lang, "/account");
  return `<p style="color:#888;font-size:12px;margin-top:24px;">${tr("manageIn", lang)}${link ? `: <a href="${link}">${esc(link)}</a>` : "."}</p>`;
}

export function unsubscribeFooter(lang: Lang, link: string): string {
  return `<p style="color:#888;font-size:12px;margin-top:24px;">${tr("unsubscribeAsk", lang)} <a href="${link}">${tr("unsubscribe", lang)}</a>.</p>`;
}

export function electionReminder(lang: Lang, electionName: string, isoDate: string, daysUntil: number) {
  const date = formatDate(lang, isoDate);
  const n = days(lang, daysUntil);
  const title = {
    en: `${electionName} is in ${n}`,
    es: `${electionName} es en ${n}`,
    pt: `${electionName} será em ${n}`,
    ht: `${electionName} nan ${n}`,
    ru: `${electionName} — через ${n}`,
  }[lang];
  const body = {
    en: `A candidate or race you follow is on the ballot for ${electionName} on ${date}. Check your ballot on ${BRAND} to get ready.`,
    es: `Un candidato o una contienda que sigues está en la boleta de ${electionName} el ${date}. Revisa tu boleta en ${BRAND} para prepararte.`,
    pt: `Um candidato ou uma disputa que você segue está na cédula de ${electionName} em ${date}. Confira sua cédula na ${BRAND} para se preparar.`,
    ht: `Yon kandida oswa yon kous w ap swiv ap sou bilten vòt ${electionName} nan dat ${date}. Gade bilten vòt ou sou ${BRAND} pou w pare.`,
    ru: `Кандидат или выборы, за которыми вы следите, будут в бюллетене «${electionName}» ${date}. Проверьте свой бюллетень в ${BRAND}, чтобы подготовиться.`,
  }[lang];
  return { title, body };
}

export function raceResult(lang: Lang, type: "race_called" | "race_certified" | string, office: string, state: string, winner: string | null, party: string | null) {
  const w = winner ?? "";
  const withParty = party ? ` (${party})` : "";
  if (type === "race_called") {
    return {
      title: { en: `${w} wins ${office} in ${state}`, es: `${w} gana ${office} en ${state}`, pt: `${w} vence ${office} em ${state}`, ht: `${w} genyen ${office} nan ${state}`, ru: `${w} побеждает: ${office}, ${state}` }[lang],
      body: { en: `AP has called the ${office} race for ${w}${withParty}.`, es: `AP declaró a ${w}${withParty} ganador de la contienda de ${office}.`, pt: `A AP declarou ${w}${withParty} vencedor da disputa de ${office}.`, ht: `AP deklare ${w}${withParty} gayan kous ${office} la.`, ru: `AP объявило ${w}${withParty} победителем выборов: ${office}.` }[lang],
    };
  }
  return {
    title: { en: `${office} results certified in ${state}`, es: `Resultados de ${office} certificados en ${state}`, pt: `Resultados de ${office} certificados em ${state}`, ht: `Rezilta ${office} sètifye nan ${state}`, ru: `Результаты утверждены: ${office}, ${state}` }[lang],
    body: { en: `The ${office} race in ${state} has been officially certified.`, es: `La contienda de ${office} en ${state} se certificó oficialmente.`, pt: `A disputa de ${office} em ${state} foi oficialmente certificada.`, ht: `Kous ${office} nan ${state} sètifye ofisyèlman.`, ru: `Результаты выборов (${office}, ${state}) официально утверждены.` }[lang],
  };
}

export function teamInvite(lang: Lang, role: string | null | undefined) {
  const r = (ROLES[role ?? ""] ?? ROLES.member)[lang];
  const html = {
    en: `<p>You've been added as a ${r} on a ${BRAND} candidate's campaign team. Sign in and check your Candidate Portal to get started.</p>`,
    es: `<p>Te agregaron como ${r} al equipo de campaña de un candidato en ${BRAND}. Inicia sesión y revisa tu Portal de candidatos para empezar.</p>`,
    pt: `<p>Você foi adicionado como ${r} à equipe de campanha de um candidato na ${BRAND}. Entre e confira seu Portal do candidato para começar.</p>`,
    ht: `<p>Yo ajoute w kòm ${r} nan ekip kanpay yon kandida sou ${BRAND}. Konekte epi gade Pòtay kandida ou pou kòmanse.</p>`,
    ru: `<p>Вас добавили в команду кампании кандидата в ${BRAND} (роль: ${r}). Войдите и откройте портал кандидата, чтобы начать.</p>`,
  }[lang];
  const link = siteLink(lang, "/candidate-portal");
  return { subject: tr("teamSubject", lang), html: link ? `${html}<p><a href="${link}">${esc(link)}</a></p>` : html };
}
