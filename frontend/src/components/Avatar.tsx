/** Small round author avatar: picture when the account has one, an
 *  initial-letter disc otherwise. Shared by every place a person is
 *  credited — stories, notes, and translation-version discussions. */
export default function Avatar({ name, picture, size = "w-5 h-5" }: { name: string; picture?: string | null; size?: string }) {
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" aria-hidden="true" className={`${size} rounded-full shrink-0 object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${size} rounded-full shrink-0 bg-amber-200 text-amber-900 inline-flex items-center justify-center text-[10px] font-semibold`}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}
