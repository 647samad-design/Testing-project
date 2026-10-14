/**
 * Emails and notifications in the recipient's language.
 *
 * The site is translated into 10 languages, but every email (digest, election
 * reminders, race results, new-message and team-invite notices, the
 * unsubscribe footer) used to go out in English. Each sender now looks up the
 * recipient's profiles.language_preference and builds its text here; links
 * point at the same language's URLs (/es/messages, ...).
 */

export type Lang = "en" | "es" | "pt" | "ht" | "ru" | "zh" | "vi" | "tl" | "ko" | "ar";
const LANGS: Lang[] = ["en", "es", "pt", "ht", "ru", "zh", "vi", "tl", "ko", "ar"];

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

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US", pt: "pt-BR", ht: "fr-HT", ru: "ru-RU", zh: "zh-CN", vi: "vi-VN", tl: "fil-PH", ko: "ko-KR", ar: "ar-u-nu-latn" };

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
    case "zh": return `${n}天`;
    case "vi": return `${n} ngày`;
    case "tl": return n === 1 ? "1 araw" : `${n} araw`;
    case "ko": return `${n}일`;
    case "ar": return n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يومًا`;
    default: return n === 1 ? "1 day" : `${n} days`;
  }
}

const BRAND = "Gov Search App";

const T = {
  digestSubject: { en: `Your ${BRAND} Digest`, es: `Tu resumen de ${BRAND}`, pt: `Seu resumo da ${BRAND}`, ht: `Rezime ${BRAND} ou`, ru: `Ваш дайджест ${BRAND}`, zh: `您的 ${BRAND} 摘要`, vi: `Bản tin ${BRAND} của bạn`, tl: `Ang iyong ${BRAND} Digest`, ko: `${BRAND} 요약`, ar: `ملخص ${BRAND} الخاص بك` },
  candidateUpdates: { en: "Candidate updates", es: "Novedades de candidatos", pt: "Novidades de candidatos", ht: "Nouvèl kandida yo", ru: "Новости кандидатов", zh: "候选人更新", vi: "Cập nhật ứng viên", tl: "Mga update ng kandidato", ko: "후보 소식", ar: "تحديثات المرشحين" },
  measureUpdates: { en: "Ballot measure updates", es: "Novedades de medidas en la boleta", pt: "Novidades das medidas na cédula", ht: "Nouvèl sou mezi bilten vòt yo", ru: "Новости о вопросах в бюллетене", zh: "投票议案更新", vi: "Cập nhật biện pháp bỏ phiếu", tl: "Mga update sa panukala sa balota", ko: "발의안 업데이트", ar: "تحديثات المقترحات" },
  recentArticles: { en: "Recently added articles", es: "Artículos agregados recientemente", pt: "Artigos adicionados recentemente", ht: "Atik ki fèk ajoute", ru: "Недавно добавленные статьи", zh: "最近添加的文章", vi: "Bài viết mới thêm", tl: "Mga bagong idinagdag na artikulo", ko: "최근 추가된 기사", ar: "مقالات أضيفت مؤخرًا" },
  newElections: { en: "New elections added", es: "Nuevas elecciones agregadas", pt: "Novas eleições adicionadas", ht: "Nouvo eleksyon ki ajoute", ru: "Добавлены новые выборы", zh: "新增选举", vi: "Đã thêm cuộc bầu cử mới", tl: "Mga bagong halalang idinagdag", ko: "새 선거 추가", ar: "أضيفت انتخابات جديدة" },
  manageIn: { en: "Manage what you receive in your account settings (Notifications tab)", es: "Administra lo que recibes en la configuración de tu cuenta (pestaña Notificaciones)", pt: "Gerencie o que você recebe nas configurações da conta (aba Notificações)", ht: "Jere sa ou resevwa nan paramèt kont ou (onglè Notifikasyon)", ru: "Управляйте рассылками в настройках аккаунта (вкладка «Уведомления»)", zh: "在账户设置（通知标签页）中管理您接收的内容", vi: "Quản lý nội dung nhận trong cài đặt tài khoản (tab Thông báo)", tl: "Pamahalaan ang iyong natatanggap sa account settings (tab na Notifications)", ko: "계정 설정(알림 탭)에서 수신 항목을 관리하세요", ar: "تحكّم فيما تتلقاه من إعدادات حسابك (علامة تبويب الإشعارات)" },
  unsubscribeAsk: { en: "Don't want these emails?", es: "¿No quieres recibir estos correos?", pt: "Não quer receber estes e-mails?", ht: "Ou pa vle imèl sa yo?", ru: "Не хотите получать эти письма?", zh: "不想收到这些邮件？", vi: "Không muốn nhận các email này?", tl: "Ayaw mo ng mga email na ito?", ko: "이 이메일을 받고 싶지 않으신가요?", ar: "لا تريد هذه الرسائل؟" },
  unsubscribe: { en: "Unsubscribe", es: "Darse de baja", pt: "Cancelar inscrição", ht: "Dezabòne", ru: "Отписаться", zh: "退订", vi: "Hủy đăng ký", tl: "Mag-unsubscribe", ko: "수신 거부", ar: "إلغاء الاشتراك" },
  newMessageSubject: { en: `You have a new message on ${BRAND}`, es: `Tienes un mensaje nuevo en ${BRAND}`, pt: `Você tem uma nova mensagem na ${BRAND}`, ht: `Ou gen yon nouvo mesaj sou ${BRAND}`, ru: `У вас новое сообщение в ${BRAND}`, zh: `您在 ${BRAND} 上有一条新消息`, vi: `Bạn có tin nhắn mới trên ${BRAND}`, tl: `May bago kang mensahe sa ${BRAND}`, ko: `${BRAND}에 새 메시지가 있습니다`, ar: `لديك رسالة جديدة على ${BRAND}` },
  newMessageIntro: { en: `You have a new message on ${BRAND}:`, es: `Tienes un mensaje nuevo en ${BRAND}:`, pt: `Você tem uma nova mensagem na ${BRAND}:`, ht: `Ou gen yon nouvo mesaj sou ${BRAND}:`, ru: `У вас новое сообщение в ${BRAND}:`, zh: `您在 ${BRAND} 上有一条新消息：`, vi: `Bạn có tin nhắn mới trên ${BRAND}:`, tl: `May bago kang mensahe sa ${BRAND}:`, ko: `${BRAND}에 새 메시지가 있습니다:`, ar: `لديك رسالة جديدة على ${BRAND}:` },
  replyAt: { en: "Reply at", es: "Responde en", pt: "Responda em", ht: "Reponn sou", ru: "Ответить можно здесь:", zh: "回复地址：", vi: "Trả lời tại", tl: "Sumagot sa", ko: "답장하기:", ar: "الرد عبر" },
  replyFromPage: { en: "Reply from the Messages page.", es: "Responde desde la página de Mensajes.", pt: "Responda pela página de Mensagens.", ht: "Reponn sou paj Mesaj la.", ru: "Ответить можно на странице «Сообщения».", zh: "请在消息页面回复。", vi: "Trả lời từ trang Tin nhắn.", tl: "Sumagot mula sa pahina ng Mga Mensahe.", ko: "메시지 페이지에서 답장하세요.", ar: "ردّ من صفحة الرسائل." },
  teamSubject: { en: `You've been added to a ${BRAND} campaign team`, es: `Te agregaron a un equipo de campaña de ${BRAND}`, pt: `Você foi adicionado a uma equipe de campanha da ${BRAND}`, ht: `Yo ajoute w nan yon ekip kanpay ${BRAND}`, ru: `Вас добавили в команду кампании ${BRAND}`, zh: `您已被加入一个 ${BRAND} 竞选团队`, vi: `Bạn đã được thêm vào một đội vận động trên ${BRAND}`, tl: `Idinagdag ka sa isang campaign team sa ${BRAND}`, ko: `${BRAND} 캠프 팀에 추가되었습니다`, ar: `تمت إضافتك إلى فريق حملة على ${BRAND}` },
} as const;

const ROLES: Record<string, Record<Lang, string>> = {
  candidate: { en: "candidate", es: "candidato", pt: "candidato", ht: "kandida", ru: "кандидат", zh: "候选人", vi: "ứng viên", tl: "kandidato", ko: "후보", ar: "مرشح" },
  campaign_manager: { en: "campaign manager", es: "director de campaña", pt: "coordenador de campanha", ht: "manadjè kanpay", ru: "руководитель кампании", zh: "竞选经理", vi: "quản lý chiến dịch", tl: "campaign manager", ko: "캠프 매니저", ar: "مدير حملة" },
  social_manager: { en: "social media manager", es: "responsable de redes sociales", pt: "responsável pelas redes sociais", ht: "responsab rezo sosyal", ru: "менеджер соцсетей", zh: "社交媒体经理", vi: "quản lý mạng xã hội", tl: "social media manager", ko: "소셜 미디어 매니저", ar: "مدير وسائل التواصل" },
  volunteer_manager: { en: "volunteer manager", es: "coordinador de voluntarios", pt: "coordenador de voluntários", ht: "kowòdonatè volontè", ru: "координатор волонтёров", zh: "志愿者经理", vi: "quản lý tình nguyện viên", tl: "volunteer manager", ko: "자원봉사 매니저", ar: "مدير المتطوعين" },
  staff: { en: "staff member", es: "miembro del personal", pt: "membro da equipe", ht: "anplwaye", ru: "сотрудник", zh: "工作人员", vi: "nhân viên", tl: "staff", ko: "스태프", ar: "موظف" },
  volunteer: { en: "volunteer", es: "voluntario", pt: "voluntário", ht: "volontè", ru: "волонтёр", zh: "志愿者", vi: "tình nguyện viên", tl: "volunteer", ko: "자원봉사자", ar: "متطوع" },
  member: { en: "team member", es: "miembro del equipo", pt: "membro da equipe", ht: "manm ekip", ru: "участник команды", zh: "团队成员", vi: "thành viên nhóm", tl: "miyembro ng team", ko: "팀원", ar: "عضو في الفريق" },
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
    zh: `${electionName}还有${n}`,
    vi: `${electionName} còn ${n}`,
    tl: `${electionName} sa loob ng ${n}`,
    ko: `${electionName}까지 ${n}`,
    ar: `${electionName} بعد ${n}`,
  }[lang];
  const body = {
    en: `A candidate or race you follow is on the ballot for ${electionName} on ${date}. Check your ballot on ${BRAND} to get ready.`,
    es: `Un candidato o una contienda que sigues está en la boleta de ${electionName} el ${date}. Revisa tu boleta en ${BRAND} para prepararte.`,
    pt: `Um candidato ou uma disputa que você segue está na cédula de ${electionName} em ${date}. Confira sua cédula na ${BRAND} para se preparar.`,
    ht: `Yon kandida oswa yon kous w ap swiv ap sou bilten vòt ${electionName} nan dat ${date}. Gade bilten vòt ou sou ${BRAND} pou w pare.`,
    ru: `Кандидат или выборы, за которыми вы следите, будут в бюллетене «${electionName}» ${date}. Проверьте свой бюллетень в ${BRAND}, чтобы подготовиться.`,
    zh: `您关注的候选人或竞选将出现在${date}的${electionName}选票上。请在 ${BRAND} 查看您的选票，做好准备。`,
    vi: `Một ứng viên hoặc cuộc đua bạn theo dõi có trên lá phiếu ${electionName} vào ${date}. Hãy xem lá phiếu trên ${BRAND} để chuẩn bị.`,
    tl: `May kandidato o labanang sinusundan mo sa balota ng ${electionName} sa ${date}. Tingnan ang iyong balota sa ${BRAND} para maghanda.`,
    ko: `팔로우한 후보나 선거가 ${date} ${electionName} 투표용지에 있습니다. ${BRAND}에서 투표용지를 확인하고 준비하세요.`,
    ar: `مرشح أو سباق تتابعه موجود في بطاقة اقتراع ${electionName} بتاريخ ${date}. راجع بطاقتك على ${BRAND} لتستعد.`,
  }[lang];
  return { title, body };
}

export function raceResult(lang: Lang, type: "race_called" | "race_certified" | string, office: string, state: string, winner: string | null, party: string | null) {
  const w = winner ?? "";
  const withParty = party ? ` (${party})` : "";
  if (type === "race_called") {
    return {
      title: { en: `${w} wins ${office} in ${state}`, es: `${w} gana ${office} en ${state}`, pt: `${w} vence ${office} em ${state}`, ht: `${w} genyen ${office} nan ${state}`, ru: `${w} побеждает: ${office}, ${state}`, zh: `${w}赢得${state}${office}选举`, vi: `${w} thắng ${office} tại ${state}`, tl: `Nanalo si ${w} bilang ${office} sa ${state}`, ko: `${w}, ${state} ${office} 당선`, ar: `${w} يفوز بمنصب ${office} في ${state}` }[lang],
      body: { en: `AP has called the ${office} race for ${w}${withParty}.`, es: `AP declaró a ${w}${withParty} ganador de la contienda de ${office}.`, pt: `A AP declarou ${w}${withParty} vencedor da disputa de ${office}.`, ht: `AP deklare ${w}${withParty} gayan kous ${office} la.`, ru: `AP объявило ${w}${withParty} победителем выборов: ${office}.`, zh: `美联社已宣布${w}${withParty}赢得${office}选举。`, vi: `AP đã công bố ${w}${withParty} thắng cuộc đua ${office}.`, tl: `Idineklara ng AP na si ${w}${withParty} ang nanalo sa ${office}.`, ko: `AP가 ${office} 선거에서 ${w}${withParty}의 당선을 확정했습니다.`, ar: `أعلنت AP فوز ${w}${withParty} في سباق ${office}.` }[lang],
    };
  }
  return {
    title: { en: `${office} results certified in ${state}`, es: `Resultados de ${office} certificados en ${state}`, pt: `Resultados de ${office} certificados em ${state}`, ht: `Rezilta ${office} sètifye nan ${state}`, ru: `Результаты утверждены: ${office}, ${state}`, zh: `${state}${office}选举结果已认证`, vi: `Kết quả ${office} tại ${state} đã được chứng nhận`, tl: `Na-certify ang resulta ng ${office} sa ${state}`, ko: `${state} ${office} 결과 확정`, ar: `اعتُمدت نتائج ${office} في ${state}` }[lang],
    body: { en: `The ${office} race in ${state} has been officially certified.`, es: `La contienda de ${office} en ${state} se certificó oficialmente.`, pt: `A disputa de ${office} em ${state} foi oficialmente certificada.`, ht: `Kous ${office} nan ${state} sètifye ofisyèlman.`, ru: `Результаты выборов (${office}, ${state}) официально утверждены.`, zh: `${state}${office}选举结果已正式认证。`, vi: `Cuộc đua ${office} tại ${state} đã được chính thức chứng nhận.`, tl: `Opisyal nang na-certify ang labanan para sa ${office} sa ${state}.`, ko: `${state} ${office} 선거 결과가 공식 확정되었습니다.`, ar: `اعتُمد سباق ${office} في ${state} رسميًا.` }[lang],
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
    zh: `<p>您已以${r}身份加入 ${BRAND} 上一位候选人的竞选团队。请登录并查看候选人门户以开始。</p>`,
    vi: `<p>Bạn đã được thêm với vai trò ${r} vào đội vận động của một ứng viên trên ${BRAND}. Đăng nhập và vào Cổng ứng viên để bắt đầu.</p>`,
    tl: `<p>Idinagdag ka bilang ${r} sa campaign team ng isang kandidato sa ${BRAND}. Mag-sign in at tingnan ang iyong Candidate Portal para magsimula.</p>`,
    ko: `<p>${BRAND} 후보 캠프 팀에 ${r}(으)로 추가되었습니다. 로그인한 뒤 후보자 포털에서 시작하세요.</p>`,
    ar: `<p>تمت إضافتك بصفة ${r} إلى فريق حملة مرشح على ${BRAND}. سجّل الدخول وافتح بوابة المرشح للبدء.</p>`,
  }[lang];
  const link = siteLink(lang, "/candidate-portal");
  return { subject: tr("teamSubject", lang), html: link ? `${html}<p><a href="${link}">${esc(link)}</a></p>` : html };
}
