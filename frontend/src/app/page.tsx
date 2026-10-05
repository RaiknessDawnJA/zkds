import { redirect } from "next/navigation";

// Broil is the only station implemented in V1, so the root is just a shortcut.
export default function Home() {
  redirect("/station/broil");
}
