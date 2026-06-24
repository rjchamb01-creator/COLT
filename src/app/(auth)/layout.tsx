import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-xl shadow-black/30">
        <Link href="/" className="mb-6 block">
          <Logo className="h-9 w-auto text-bone" />
        </Link>
        {children}
      </div>
    </div>
  );
}
