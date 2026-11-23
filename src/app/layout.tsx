import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZecClaim | Dual-Mode QR Payout & ZecHub DAO Proof Portal",
  description:
    "100% Non-Custodial Dual-Mode QR Payout & ZecHub DAO Proof Portal for Post-NU7 Zcash (November 2026)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-slate-950 text-slate-100">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <a href="/" className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-amber-500 rounded-none inline-block"></span>
                <span className="font-bold tracking-tight text-white text-base">ZecClaim</span>
              </a>
              <span className="text-xs font-mono text-slate-500 border border-slate-800 px-1.5 py-0.5">
                NU7 / Nov 2026
              </span>
            </div>
            <nav className="flex items-center space-x-4 text-xs font-medium text-slate-300">
              <a href="/admin/new" className="hover:text-amber-400 transition-colors">
                New Campaign
              </a>
              <a href="/proof/demo-nu7-campaign" className="hover:text-amber-400 transition-colors">
                DAO Proof Portal
              </a>
              <span className="text-slate-700">|</span>
              <span className="text-emerald-400 font-mono text-xs flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-none inline-block animate-pulse"></span>
                <span>zebra.openlightnodes.org</span>
              </span>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-xs text-slate-500">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              ZecClaim: 100% Non-Custodial Zcash Coordination &amp; Proof Portal (MIT License)
            </div>
            <div className="font-mono text-slate-600">
              Branch: 0x77190AD9 | Marg. Fee: 1,000 zat | Block Cap: 330 actions
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
