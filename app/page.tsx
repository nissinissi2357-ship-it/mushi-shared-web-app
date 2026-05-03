import { AppShell } from "@/components/app-shell";
import { getAppData, getPublicViewer } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ members, source, warning }, initialViewer] = await Promise.all([
    getAppData(),
    getPublicViewer()
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
