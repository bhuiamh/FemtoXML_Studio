import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LogIn, Lock, User } from "lucide-react";
import { verifyCredentials, startSession } from "../auth";
import { Alert, Button, Checkbox, Loader, cx } from "./ui";
import { BrandMark } from "./BrandMark";

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isChecking) return;
    setIsChecking(true);
    setError(null);

    const ok = await verifyCredentials(username, password);
    if (ok) {
      startSession(remember);
      onSignedIn();
      return;
    }

    // Deliberately vague: naming which field was wrong helps an outsider more
    // than it helps the engineer who mistyped.
    setError("That username and password combination was not recognised.");
    setPassword("");
    setIsChecking(false);
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-line bg-surface pl-10 pr-3 text-[13px] text-ink shadow-sm outline-none transition placeholder:text-ink-3/70 focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden px-4 py-10">
      {/* Ambient field — the same dot grid the rail uses, so the sign-in screen
          belongs to the product rather than sitting apart from it. */}
      <div className="dot-field pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgb(var(--accent) / .18), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">FemtoXML Studio</h1>
            <p className="mt-0.5 text-xs text-ink-3">RAN configuration toolkit</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-line bg-surface p-5 shadow-card"
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.11em] text-ink-3">
                Username
              </span>
              <span className="relative block">
                <User
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                  strokeWidth={1.8}
                />
                <input
                  ref={userRef}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="nybsys"
                  className={inputClass}
                />
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.11em] text-ink-3">
                Password
              </span>
              <span className="relative block">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                  strokeWidth={1.8}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cx(inputClass, "pr-10")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-3 transition hover:bg-surface-sunk hover:text-ink-2"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.8} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.8} />
                  )}
                </button>
              </span>
            </label>

            <div className="flex items-center justify-between pt-0.5">
              <Checkbox checked={remember} onChange={setRemember}>
                Keep me signed in
              </Checkbox>
            </div>

            {error && <Alert title={error} />}

            <Button
              type="submit"
              variant="primary"
              icon={LogIn}
              loading={isChecking}
              className="mt-1 h-10 w-full"
              disabled={!username || !password}
            >
              {isChecking ? "Checking…" : "Sign in"}
            </Button>
          </div>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-3">
          Sign-in runs in your browser and gates this interface only. Device XML
          you load never leaves this machine.
        </p>
      </div>

      {isChecking && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2">
          <Loader size="sm" />
        </div>
      )}
    </div>
  );
}
