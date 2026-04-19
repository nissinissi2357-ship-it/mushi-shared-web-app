import { AppShell } from "@/components/app-shell";
import { getAppData, getViewerFromSession } from "@/lib/data";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await readSession();
  const [{ members, source, warning }, initialViewer] = await Promise.all([
    getAppData(),
    getViewerFromSession(session)
  ]);

  return (
    <AppShell
      initialMembers={members}
      source={source}
      warning={warning}
      initialViewer={initialViewer}
    />
  );
}
