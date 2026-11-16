import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const SKEY = "ptpub.v1.session"

function session() {
  try {
    return JSON.parse(localStorage.getItem(SKEY) || "null")
  } catch {
    return null
  }
}

function save(s) {
  try {
    if (s) localStorage.setItem(SKEY, JSON.stringify(s))
    else localStorage.removeItem(SKEY)
  } catch {}
}

async function post(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, j }
}

async function me(token) {
  const r = await fetch("/api/auth/me", {
    headers: { Authorization: "Bearer " + token },
  })
  return r.ok ? r.json().catch(() => null) : null
}

export default function Login() {
  const [mode, setMode] = React.useState("login")
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState({ text: "", kind: "" })
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [repeat, setRepeat] = React.useState("")
  const first = React.useRef(null)

  React.useEffect(() => {
    let alive = true
    fetch("/api/auth/setup")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && j.needed) setMode("setup")
      })
      .catch(() => {})
    const s = session()
    if (s && s.access_token) {
      me(s.access_token).then((u) => {
        if (u) location.replace("/")
      })
    }
    return () => {
      alive = false
    }
  }, [])

  React.useEffect(() => {
    first.current?.focus()
  }, [mode])

  async function signIn(ev) {
    ev.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg({ text: "", kind: "" })
    try {
      const r = await post("/api/auth/login", {
        email: email.trim(),
        password,
        owner: true,
      })
      if (!r.ok || !r.j.session) {
        setMsg({ text: r.j?.error || "Wrong email or password.", kind: "err" })
        return
      }
      save(r.j.session)
      const u = await me(r.j.session.access_token)
      if (!u) {
        save(null)
        setMsg({ text: "That session could not be verified.", kind: "err" })
        return
      }
      if (u.is_admin === false) {
        const s = await fetch("/api/auth/setup")
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null)
        if (s && s.owner_list) {
          save(null)
          setMsg({ text: "This site is private.", kind: "err" })
          return
        }
      }
      location.replace("/")
    } catch {
      setMsg({ text: "Could not reach the server.", kind: "err" })
    } finally {
      setBusy(false)
    }
  }

  async function create(ev) {
    ev.preventDefault()
    if (busy) return
    if (password !== repeat) {
      setMsg({ text: "Passwords do not match.", kind: "err" })
      return
    }
    setBusy(true)
    setMsg({ text: "", kind: "" })
    try {
      const r = await post("/api/auth/setup", {
        email: email.trim(),
        password,
      })
      if (!r.ok) {
        setMsg({ text: r.j?.error || "Could not create the account.", kind: "err" })
        return
      }
      if (r.j.session) {
        save(r.j.session)
        location.replace("/")
      } else {
        setMode("login")
        setPassword("")
        setRepeat("")
        setMsg({ text: r.j.message || "Account created. Sign in.", kind: "ok" })
      }
    } catch {
      setMsg({ text: "Could not reach the server.", kind: "err" })
    } finally {
      setBusy(false)
    }
  }

  async function recover() {
    if (!email.trim()) {
      setMsg({ text: "Enter your email first.", kind: "err" })
      return
    }
    setMsg({ text: "", kind: "" })
    try {
      const r = await post("/api/auth/recover", { email: email.trim() })
      setMsg({
        text: r.j?.message || "Check your email.",
        kind: r.ok ? "ok" : "err",
      })
    } catch {
      setMsg({ text: "Could not reach the server.", kind: "err" })
    }
  }

  const setup = mode === "setup"

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <img
        src="/login/lekha.png"
        alt="Lekha Financials"
        draggable={false}
        className="mb-11 h-11 w-auto select-none"
      />

      <div className="w-full max-w-[288px]">
        <h1 className="mb-8 text-center text-[15px] font-normal tracking-[0.01em] text-foreground">
          {setup ? "Create account" : "Sign in"}
        </h1>

        <form onSubmit={setup ? create : signIn} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              ref={first}
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete={setup ? "new-password" : "current-password"}
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {setup && (
            <div className="space-y-1.5">
              <Label htmlFor="repeat">Repeat password</Label>
              <Input
                id="repeat"
                type="password"
                name="repeat"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                required
              />
            </div>
          )}

          <Button type="submit" className="mt-6 w-full" disabled={busy}>
            {busy
              ? setup
                ? "Creating…"
                : "Signing in…"
              : setup
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        {!setup && (
          <Button
            type="button"
            variant="link"
            onClick={recover}
            className="mx-auto mt-4 block h-auto px-0 text-[13px]"
          >
            Forgot password?
          </Button>
        )}

        <p
          aria-live="polite"
          className={
            "mt-4 min-h-[1rem] text-center text-[12.5px] leading-snug " +
            (msg.kind === "err"
              ? "text-destructive"
              : msg.kind === "ok"
                ? "text-muted-foreground"
                : "text-transparent")
          }
        >
          {msg.text || "·"}
        </p>
      </div>
    </div>
  )
}
