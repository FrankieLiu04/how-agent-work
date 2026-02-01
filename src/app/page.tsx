import { Microscope } from "~/microscope/Microscope";
import { auth } from "~/server/auth";

export default async function Home() {
  const session = await auth();
  return <Microscope isAuthed={Boolean(session?.user)} userName={session?.user?.name ?? null} />;
}
