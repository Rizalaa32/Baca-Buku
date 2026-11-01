import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ReaderShell } from "@/components/reader/reader-shell";
import { authOptions, isAllowedEmail } from "@/lib/auth/config";

interface ReaderPageProps {
  params: {
    fileId: string;
  };
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
    redirect("/login");
  }

  const decodedFileId = decodeURIComponent(params.fileId);

  return <ReaderShell googleFileId={decodedFileId} />;
}

