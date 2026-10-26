/** Round Discord avatar with an initial fallback; `dim` = no longer in the server. */
export default function Avatar({ url, name, size, dim }: { url: string | null; name: string; size: number; dim?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-sm font-black text-slate-300 ${
        dim ? "opacity-50 grayscale" : ""
      }`}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.replace(/^#/, "").charAt(0).toUpperCase()
      )}
    </span>
  );
}
