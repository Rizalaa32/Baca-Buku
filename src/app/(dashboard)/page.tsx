import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { BookshelfClient } from "@/components/library/bookshelf-client";
import { authOptions, isAllowedEmail } from "@/lib/auth/config";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
    redirect("/login");
  }

  return <BookshelfClient />;
}

