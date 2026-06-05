import { Github, MonitorUp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { createRoom } from "../lib/api";
import { SCREEN_SHARE_UNSUPPORTED_MESSAGE, supportsScreenSharing } from "../lib/screenShareSupport";

export function HomePage() {
  const navigate = useNavigate();
  const canHostFromBrowser = supportsScreenSharing();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(canHostFromBrowser ? null : SCREEN_SHARE_UNSUPPORTED_MESSAGE);

  async function handleStartSharing() {
    if (!canHostFromBrowser) {
      setError(SCREEN_SHARE_UNSUPPORTED_MESSAGE);
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const { roomId } = await createRoom();
      navigate(`/room/${roomId}?role=host`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create a room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-mint text-ink">
      <section className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative z-10 max-w-2xl">
          <p className="mb-4 inline-flex rounded-full border-2 border-ink bg-cream px-4 py-1 text-sm font-extrabold uppercase tracking-wider shadow-[3px_3px_0_#26304f]">
            OpenShare
          </p>
          <h1 className="text-4xl font-black leading-tight text-ink sm:text-6xl">
            Share your screen instantly from the browser.
          </h1>
          <p className="mt-5 max-w-xl text-lg font-bold leading-8 text-ink/80">
            Create a room, share the link, and let others view your screen without installing anything.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              onClick={handleStartSharing}
              disabled={isCreating || !canHostFromBrowser}
              icon={<MonitorUp aria-hidden className="h-5 w-5 stroke-[3]" />}
              className="min-w-40"
            >
              {isCreating ? "Creating..." : "Start Sharing"}
            </Button>
            <a
              href="https://github.com/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-ink bg-cream px-4 py-2 text-sm font-extrabold text-ink shadow-[4px_4px_0_#26304f] transition hover:-translate-y-0.5 hover:bg-white"
            >
              <Github aria-hidden className="h-5 w-5 stroke-[3]" />
              GitHub
            </a>
          </div>

          {error ? (
            <div className="mt-5 max-w-xl rounded-md border-2 border-ink bg-coral px-4 py-3 text-sm font-bold text-ink shadow-soft">
              {error}
            </div>
          ) : null}
        </div>

        <div className="relative z-0 flex items-center justify-center">
          <HeroSketch />
        </div>

        <div className="relative z-10 grid gap-3 lg:col-span-2 sm:grid-cols-3">
          {["Create a room", "Share the link", "Friends join"].map((item) => (
            <div key={item} className="rounded-md border-2 border-ink bg-cream p-4 text-sm font-extrabold text-ink shadow-soft">
              {item}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function HeroSketch() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 620 520"
      className="w-full max-w-[620px]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="540" cy="130" r="12" fill="#F9BD18" />
      <circle cx="95" cy="430" r="10" fill="#F5EFDF" />
      <circle cx="210" cy="472" r="12" stroke="#26304F" strokeWidth="6" />
      <path d="M470 70v24M458 82h24" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M108 344l-44 28M130 358l-18 52M160 356l12 58" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M94 92c6-38 10-42 48-40 86 5 166-2 252-4 28-.7 35 7 41 37 8 42 12 94 5 163"
        fill="#2FC89B"
      />
      <path
        d="M94 92c6-38 10-42 48-40 86 5 166-2 252-4 28-.7 35 7 41 37 8 42 12 94 5 163"
        stroke="#26304F"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M104 54h326c10 0 18 8 20 18l10 42H86l8-60Z" fill="#4698CC" />
      <circle cx="134" cy="83" r="12" fill="#F9BD18" />
      <circle cx="174" cy="83" r="12" stroke="#26304F" strokeWidth="6" />
      <circle cx="214" cy="83" r="12" fill="#F5EFDF" />
      <path d="M118 150c22 4 43 4 66 0l2 62c-22 2-45 1-69-1l1-61Z" fill="#F5EFDF" />
      <path d="M116 244c30 5 60 5 90 2v58h-94l4-60Z" fill="#F9BD18" />
      <path d="M310 106c40 0 65 24 64 59-1 34-22 68-62 68-39 0-70-21-68-59 3-43 26-68 66-68Z" fill="#26304F" />
      <path d="M246 218c-16 36-38 56-72 72 53 32 127 20 164-18l-92-54Z" fill="#26304F" />
      <path d="M258 154c-6 47 10 79 49 87 38 7 65-21 68-65-24 2-58-14-80-38-6 20-18 34-37 16Z" fill="#F5EFDF" />
      <path d="M282 194c8-10 18-10 26 0M334 192c8-10 18-10 26 0M324 210c10 12 5 22-10 24" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M290 248c20 18 43 18 60 0" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M238 386c2-58 6-94 39-120 21 19 55 22 82 1 32 24 39 60 38 119H238Z" fill="#F9BD18" />
      <path d="M277 306l-10 78M368 310l-52 18M360 136c8-34 24-54 46-52 25 3 30 27 20 51" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M410 118c6-34 32-55 45-36 13 20-6 59-24 74" fill="#F5EFDF" />
      <path d="M410 118c6-34 32-55 45-36 13 20-6 59-24 74" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M406 154h38" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M266 388h-84c-63 0-76-12-76-60V120" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M295 384c0-28 8-35 36-34 94 2 188-6 202 10 10 11 10 34 9 74-1 34-4 45-38 45H328c-28 0-36-9-36-39l3-56Z"
        fill="#F9BD18"
        stroke="#26304F"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M299 351h238c8 0 14 6 14 14v38H295v-38c0-8 1-14 4-14Z" fill="#F5EFDF" />
      <circle cx="326" cy="374" r="9" fill="#4698CC" />
      <circle cx="355" cy="374" r="9" stroke="#26304F" strokeWidth="5" />
      <circle cx="384" cy="374" r="9" fill="#F9BD18" />
      <path d="M320 405h52l-4 52h-50l2-52Z" fill="#4698CC" />
      <path d="M415 476c9-51 35-83 78-84 39 1 65 31 70 84H415Z" fill="#F5EFDF" />
      <path d="M444 413c-26-39-4-82 43-80 42 2 70 35 63 73-7 37-29 58-62 58-20 0-34-11-44-51Z" fill="#4698CC" stroke="#26304F" strokeWidth="6" />
      <path d="M472 410c-2 10-7 16-15 20 4 8 9 12 18 14M506 416c0 10-3 17-8 20M478 456c13 5 27 1 37-10" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
      <path d="M423 360c-6-38 29-56 57-36 10-30 54-24 57 8 28 3 45 30 32 55 27 20 15 64-20 69-23 4-44-9-54-31-15 17-45 17-58-3-29 9-46-35-14-62Z" fill="#26304F" />
      <path d="M440 459l-11 54M502 459l-6 54" stroke="#26304F" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
