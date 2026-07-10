import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Osiris NETWORK | The Ultimate Survival Experience" },
      {
        name: "description",
        content:
          "Osiris Network — premium Minecraft survival, luxury house marketplace, in-game store, and global leaderboards.",
      },
      { property: "og:title", content: "Osiris NETWORK | The Ultimate Survival Experience" },
      {
        property: "og:description",
        content:
          "Osiris Network — premium Minecraft survival, luxury house marketplace, in-game store, and global leaderboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/home.html");
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="font-mono text-sm opacity-70">Entering Osiris…</p>
    </div>
  );
}
