import { LANGS, useI18n, type LangId } from "../lib/i18n";

/** Interface language picker. `dark` styles it for the landing page. */
export function LangSwitch({ dark }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as LangId)}
      aria-label="Language"
      className={
        dark
          ? "cursor-pointer rounded-[10px] border border-night-line bg-night-2 px-2.5 py-1.5 text-[13px] font-medium text-fog"
          : "chunky cursor-pointer rounded-[10px] bg-white px-2 py-1.5 text-[13px] font-semibold"
      }
    >
      {LANGS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.native}
        </option>
      ))}
    </select>
  );
}
