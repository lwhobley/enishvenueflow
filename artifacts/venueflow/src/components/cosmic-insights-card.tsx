import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Quote, Smile, RotateCw, Loader2 } from "lucide-react";

interface Insights {
  cosmicInsight: string;
  inspiration: string;
  joke: string;
  generatedAt: string;
  cached: boolean;
  source: "gemini" | "fallback";
}

const QUERY_KEY = ["/ai/cosmic-insights"] as const;

async function fetchInsights(refresh = false): Promise<Insights> {
  const res = await fetch(`/api/ai/cosmic-insights${refresh ? "?refresh=true" : ""}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to load insights (${res.status})`);
  return (await res.json()) as Insights;
}

const L = {
  gold:     "#B2882F",
  goldSoft: "#D9B867",
  espresso: "#2A1F17",
  taupe:    "rgba(42,31,23,0.56)",
  cream:    "#FFFDF7",
  parchment:"#F0E8D3",
  border:   "rgba(178,136,47,0.22)",
};

export function CosmicInsightsCard() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchInsights(false),
    // 6h matches server-side cache. Don't poll — the user can hit refresh.
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = async () => {
    const fresh = await fetchInsights(true);
    qc.setQueryData(QUERY_KEY, fresh);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 20,
        padding: "22px 24px 20px",
        background: `linear-gradient(135deg, ${L.cream} 0%, ${L.parchment} 100%)`,
        border: `1px solid ${L.border}`,
        boxShadow: `0 1px 2px rgba(42,31,23,0.04), 0 12px 32px -18px rgba(42,31,23,0.14)`,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -90,
          left: -50,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(217,184,103,0.32) 0%, rgba(217,184,103,0) 65%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={16} style={{ color: L.gold }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: L.gold,
              }}
            >
              Cosmic Insights
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isFetching}
            aria-label="Refresh insights"
            title="Refresh"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 10,
              border: `1px solid ${L.border}`,
              background: "transparent",
              color: L.taupe,
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: 700,
              cursor: isFetching ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isFetching) {
                (e.currentTarget as HTMLElement).style.background = "rgba(178,136,47,0.08)";
                (e.currentTarget as HTMLElement).style.color = L.espresso;
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = L.taupe;
            }}
          >
            {isFetching ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
            New
          </button>
        </div>

        {isLoading || !data ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: L.taupe, fontSize: 13, padding: "8px 0" }}>
            <Loader2 size={14} className="animate-spin" />
            Consulting the stars…
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={data.generatedAt + (data.cached ? "-c" : "-f")}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr" }}
            >
              <Section icon={<Sparkles size={13} style={{ color: L.gold }} />} label="Cosmos" body={data.cosmicInsight} />
              <Section icon={<Quote size={13} style={{ color: L.gold }} />} label="Inspiration" body={data.inspiration} />
              <Section icon={<Smile size={13} style={{ color: L.gold }} />} label="Joke" body={data.joke} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

function Section({ icon, label, body }: { icon: React.ReactNode; label: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ marginTop: 4, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: L.taupe,
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: L.espresso }}>{body}</div>
      </div>
    </div>
  );
}
