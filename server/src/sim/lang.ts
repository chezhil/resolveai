// Language detection for Kannada, Hindi and English (including romanised Kannada and Hinglish),
// plus the reply templates the offline planner uses. Claude writes its own replies.

import type { Lang } from "../core/types.js";

const KN_ROMAN = ["maadidru", "madidru", "enu", "helilla", "illa", "banthu", "bandilla", "duddu", "saar", "swalpa", "yaake", "aagilla", "nodi", "beku"];
const HI_ROMAN = ["nahi", "nahin", "hai", "paisa", "paise", "kab", "aaya", "mera", "meri", "kya", "abhi", "hua", "raha", "bhai", "kyun", "settlement ruka", "ruka"];

export function detectLang(text: string, fallback: Lang = "en"): Lang {
  if (/[ಀ-೿]/.test(text)) return "kn";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const words = text.toLowerCase().split(/[^a-z]+/);
  const kn = words.filter((w) => KN_ROMAN.includes(w)).length;
  const hi = words.filter((w) => HI_ROMAN.includes(w)).length;
  if (kn > 0 && kn >= hi) return "kn";
  if (hi > 0) return "hi";
  return fallback;
}

export const LANG_NAME: Record<Lang, string> = { kn: "Kannada", hi: "Hindi", en: "English" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type Tpl = (a: Record<string, string | number>) => { text: string; gloss: string };

/** Planner reply templates. `gloss` is the English meaning shown in the console. */
export const TEMPLATES: Record<string, Partial<Record<Lang, Tpl>> & { en: Tpl }> = {
  failedPaymentMerchant: {
    kn: (a) => ({
      text: `ನಮಸ್ಕಾರ ${a.name} ಅವರೇ. ${rupees(+a.amount)} ಗ್ರಾಹಕರ ಖಾತೆಯಿಂದ ಕಡಿತವಾಗಿದೆ, ಆದರೆ ಬ್ಯಾಂಕ್‌ನಲ್ಲಿ ಕ್ರೆಡಿಟ್ ಬಾಕಿ ಇದೆ. ನಾವು ಬ್ಯಾಂಕ್ ಟಿಕೆಟ್ ಹಾಕಿದ್ದೇವೆ. ಹಣ ${a.eta} ಒಳಗೆ ನಿಮ್ಮ ಖಾತೆಗೆ ಬರುತ್ತದೆ. ಬಂದ ತಕ್ಷಣ ಸೌಂಡ್‌ಬಾಕ್ಸ್ ಹೇಳುತ್ತದೆ. ಗ್ರಾಹಕರು ಮತ್ತೆ ಪಾವತಿಸಬೇಕಿಲ್ಲ.`,
      gloss: `Namaskara ${a.name}. ${rupees(+a.amount)} was debited from the customer but the credit is pending at the bank. We've raised a bank ticket. The money will reach your account by ${a.eta}. The soundbox will announce it the moment it lands. The customer does not need to pay again.`,
    }),
    hi: (a) => ({
      text: `नमस्ते ${a.name} जी। ग्राहक के खाते से ${rupees(+a.amount)} कट गए हैं, बैंक में क्रेडिट पेंडिंग है। हमने बैंक टिकट डाल दिया है। पैसा ${a.eta} तक आपके खाते में आ जाएगा। आते ही साउंडबॉक्स बोलेगा। ग्राहक को दोबारा पेमेंट नहीं करना है।`,
      gloss: `Hello ${a.name}. ${rupees(+a.amount)} was debited from the customer; the credit is pending at the bank. We've raised a bank ticket. The money will reach your account by ${a.eta}. The soundbox will announce it. The customer need not pay again.`,
    }),
    en: (a) => {
      const text = `Hi ${a.name}, the customer's ${rupees(+a.amount)} was debited but the credit is pending at the bank. I've raised a bank ticket and the money will reach your account by ${a.eta}. Your soundbox will announce it when it lands. The customer does not need to pay again.`;
      return { text, gloss: text };
    },
  },
  failedPaymentPayer: {
    en: (a) => {
      const text = `Your ${rupees(+a.amount)} payment to ${a.business} is safe. The merchant's bank will credit it by ${a.eta}. Please don't pay again — we'll confirm once it lands.`;
      return { text, gloss: text };
    },
  },
  creditLanded: {
    kn: (a) => ({
      text: `${a.name} ಅವರೇ, ${rupees(+a.amount)} ನಿಮ್ಮ ಖಾತೆಗೆ ಜಮೆಯಾಗಿದೆ ✅. ಪ್ರಕರಣ ಮುಚ್ಚಲಾಗಿದೆ. ನಮ್ಮ ಸೇವೆಗೆ 1-5 ರೇಟಿಂಗ್ ಕೊಡಿ.`,
      gloss: `${a.name}, ${rupees(+a.amount)} has been credited to your account ✅. Case closed. Please rate us 1–5.`,
    }),
    hi: (a) => ({
      text: `${a.name} जी, ${rupees(+a.amount)} आपके खाते में आ गए हैं ✅। केस बंद कर दिया गया है। कृपया 1-5 रेटिंग दें।`,
      gloss: `${a.name}, ${rupees(+a.amount)} has reached your account ✅. Case closed. Please rate 1–5.`,
    }),
    en: (a) => {
      const text = `${a.name}, ${rupees(+a.amount)} has been credited to your account ✅. Case closed — tap to rate us 1–5.`;
      return { text, gloss: text };
    },
  },
  settlementPending: {
    hi: (a) => ({
      text: `${a.name} जी, आपका ${rupees(+a.amount)} का सेटलमेंट बैंक अकाउंट के नाम में फर्क की वजह से रुका था। हमने बैंक से नाम वेरिफाई कर लिया है — "${a.holder}" आपके PAN नाम से मैच करता है। रिलीज़ के लिए अप्रूवल लगा दिया है, अप्रूव होते ही 2 घंटे में पैसा आ जाएगा।`,
      gloss: `${a.name}, your ${rupees(+a.amount)} settlement was held because the bank account name differs. We verified the name with the bank — "${a.holder}" matches your PAN name. Release is queued for approval; once approved, money arrives within 2 hours.`,
    }),
    en: (a) => {
      const text = `${a.name}, your ${rupees(+a.amount)} settlement was held for a bank-name mismatch. I verified the account with the bank — "${a.holder}" matches your PAN name — and queued the release for approval. Once approved, the payout lands within 2 hours.`;
      return { text, gloss: text };
    },
  },
  settlementReleased: {
    hi: (a) => ({
      text: `${a.name} जी, ${rupees(+a.amount)} आपके खाते में भेज दिए गए हैं (UTR ${a.utr}) ✅। केस बंद।`,
      gloss: `${a.name}, ${rupees(+a.amount)} has been paid to your account (UTR ${a.utr}) ✅. Case closed.`,
    }),
    en: (a) => {
      const text = `${a.name}, ${rupees(+a.amount)} has been paid out to your account (UTR ${a.utr}) ✅. Case closed.`;
      return { text, gloss: text };
    },
  },
  disputeFiled: {
    en: (a) => {
      const text = `${a.name}, I've filed your evidence for the ${rupees(+a.amount)} chargeback (${a.dispute}) — QR scan, payer PIN authentication, soundbox confirmation, invoice and location — ${a.margin} before the deadline. NPCI acknowledgement: ${a.ack}. No action needed from you.`;
      return { text, gloss: text };
    },
    hi: (a) => ({
      text: `${a.name} जी, ${rupees(+a.amount)} के चार्जबैक (${a.dispute}) के लिए सारे सबूत डेडलाइन से ${a.margin} पहले फाइल कर दिए हैं। NPCI रसीद: ${a.ack}। आपको कुछ नहीं करना है।`,
      gloss: `${a.name}, all evidence for the ${rupees(+a.amount)} chargeback (${a.dispute}) has been filed ${a.margin} before the deadline. NPCI ack: ${a.ack}. Nothing needed from you.`,
    }),
  },
  accountChangeRefused: {
    en: (a) => {
      const text = `${a.name}, for your safety we can't change payout bank details over chat. A specialist from our merchant safety team will call you on your registered number shortly. Please don't share OTPs or PINs with anyone.`;
      return { text, gloss: text };
    },
    hi: (a) => ({
      text: `${a.name} जी, आपकी सुरक्षा के लिए हम चैट पर पेआउट बैंक अकाउंट नहीं बदल सकते। हमारी सेफ्टी टीम आपको रजिस्टर्ड नंबर पर कॉल करेगी। किसी को OTP या PIN न बताएं।`,
      gloss: `${a.name}, for your safety we can't change payout bank details over chat. Our safety team will call your registered number. Don't share OTPs or PINs.`,
    }),
  },
  handoff: {
    en: (a) => {
      const text = `${a.name}, I've passed your case to a specialist with everything we've found so far, so you won't need to repeat yourself. You'll hear back by ${a.eta}.`;
      return { text, gloss: text };
    },
    kn: (a) => ({
      text: `${a.name} ಅವರೇ, ನಿಮ್ಮ ಪ್ರಕರಣವನ್ನು ಎಲ್ಲಾ ವಿವರಗಳೊಂದಿಗೆ ತಜ್ಞರಿಗೆ ಕಳುಹಿಸಿದ್ದೇವೆ. ಮತ್ತೆ ಹೇಳಬೇಕಿಲ್ಲ. ${a.eta} ಒಳಗೆ ಉತ್ತರ ಬರುತ್ತದೆ.`,
      gloss: `${a.name}, I've passed your case with all details to a specialist. No need to repeat yourself. You'll hear back by ${a.eta}.`,
    }),
    hi: (a) => ({
      text: `${a.name} जी, आपका केस सारी जानकारी के साथ स्पेशलिस्ट को भेज दिया है। आपको दोबारा कुछ बताना नहीं पड़ेगा। ${a.eta} तक जवाब मिलेगा।`,
      gloss: `${a.name}, your case has gone to a specialist with all details. You won't need to repeat anything. You'll hear back by ${a.eta}.`,
    }),
  },
};

export function render(key: keyof typeof TEMPLATES, lang: Lang, args: Record<string, string | number>) {
  const t = TEMPLATES[key];
  return (t[lang] ?? t.en)(args);
}

export function soundboxLine(lang: Lang, amount: number) {
  if (lang === "kn") return `Paytm ನಲ್ಲಿ ${amount} ರೂಪಾಯಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ`;
  if (lang === "hi") return `Paytm पर ${amount} रुपये प्राप्त हुए`;
  return `Received ${amount} rupees on Paytm`;
}
