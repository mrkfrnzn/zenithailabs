import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/leagues");

  return (
    <div className="relative">
      {/* Background grid texture */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,45,69,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(30,45,69,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Gold glow from top */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(245,158,11,0.08) 0%, transparent 70%)" }}
      />

      <div className="relative max-w-5xl mx-auto pt-16 pb-20">
        {/* Category badges row */}
        <div className="flex items-center gap-2 justify-center mb-8 flex-wrap">
          <span className="badge-amber">Heisman Trophy</span>
          <span className="badge-blue">CFP Playoff</span>
          <span className="badge-green">Cinderella Run</span>
          <span className="badge-red">Conference Champion</span>
        </div>

        {/* Hero headline */}
        <h1 className="text-center text-5xl md:text-7xl font-black tracking-tighter leading-none mb-6">
          <span className="text-white">Build Your</span>
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #F59E0B 0%, #FCD34D 50%, #F59E0B 100%)" }}
          >
            War Chest.
          </span>
        </h1>

        <p className="text-center text-slate-400 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
          A futures-style fantasy league for college football. Draft before kickoff,
          lock in sportsbook odds, and let the season decide who wins the chest.
        </p>

        <div className="flex justify-center gap-4">
          <Link href="/login" className="btn-primary btn-lg">
            Enter the League
          </Link>
        </div>

        {/* Scoring cards */}
        <div className="grid md:grid-cols-2 gap-4 mt-16">
          <div className="panel group hover:border-amber-500/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span className="text-amber-400 font-black text-sm">H</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-amber-300 mb-1">Heisman Trophy</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Pick the winner and finalists. Points scale by your locked odds vs. the
                  shortest-priced pick in the pool — long shots pay huge.
                </p>
              </div>
            </div>
          </div>
          <div className="panel group hover:border-blue-500/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                <span className="text-blue-400 font-black text-sm">C</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-blue-300 mb-1">CFP Playoff</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Five outcome tiers from national champion to first-round exit. Every
                  round your team advances is another payout scaled to their preseason odds.
                </p>
              </div>
            </div>
          </div>
          <div className="panel group hover:border-green-500/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
                <span className="text-green-400 font-black text-sm">G</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-green-300 mb-1">Cinderella Run</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Preseason unranked teams that crash the AP top 25 by season&apos;s end.
                  Fixed point buckets — no odds math, just guts and faith in your pick.
                </p>
              </div>
            </div>
          </div>
          <div className="panel group hover:border-red-500/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <span className="text-red-400 font-black text-sm">CC</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-red-300 mb-1">Conference Champion</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Win or reach your conference title game. Denominator is the lowest
                  odds drafted <em>within your conference</em> — pick the dark horse.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
