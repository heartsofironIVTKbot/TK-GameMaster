import { redirect } from "next/navigation";

/** The roleplay archive is the archive's Roleplay tab now (graded games). */
export default function Page() {
  redirect("/archive?tab=roleplay&graded=1");
}
