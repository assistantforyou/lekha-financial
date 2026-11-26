import { useEffect, useRef, useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ReleasePolicies } from "@/components/ReleasePolicies"
import * as A from "@/lib/account"
import { PLAN_NAME, PRICE } from "@/lib/entitlements"
import { awaitEmail, awaitingEmail } from "@/lib/planIntent"
import { track } from "@/lib/pixel"

const errMsg = (e) => (e && e.message) || "Something went wrong. Try again."
const AUTO_TRIES = 3   // sign-in attempts made without a click when the visitor returns from their inbox; the server rate-limits the rest

/* The account step of picking a plan: it opens over the Plans page the moment a visitor without a session chooses one.
   Same account calls as the profile page (lib/account.js). `onSignedIn(email)` carries on to checkout; closing it
   leaves the visitor on the Plans page.
   Views: signup (default) | login | confirm (an e-mail link has to be opened first) | recover. */
export default function PlanSignup({ plan, onClose, onSignedIn }) {
  const paid = plan !== "free", name = PLAN_NAME[plan]
  const [expected] = useState(() => awaitingEmail())   // reopened while a confirmation e-mail is outstanding: start at sign-in
  const [view, setView] = useState(expected ? "login" : "signup"), [email, setEmail] = useState(expected || ""), [pw, setPw] = useState("")
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [msg, setMsg] = useState(null)
  const working = useRef(false)
  const go = (v) => { setMsg(null); setView(v) }
  const signedIn = () => { setDone(true); setMsg(null); onSignedIn(email) }

  const submit = async (e) => {
    e.preventDefault(); if (working.current) return
    working.current = true; setBusy(true); setMsg(null)
    try {
      if (view === "recover") { const j = await A.recover(email); awaitEmail(email); setMsg({ ok: true, t: j.message }) }
      else if (view === "signup") {
        const j = await A.signup(email, pw); track("CompleteRegistration", { status: true, content_name: "Free", value: 0, currency: "THB" }, "reg")
        if (j.confirm) { awaitEmail(email); setView("confirm"); setMsg({ ok: true, t: j.message }) } else signedIn()
      } else { await A.login(email, pw); signedIn() }
    } catch (err) { setMsg({ ok: false, t: errMsg(err) }) } finally { working.current = false; setBusy(false) }
  }

  /* Coming back to this tab after opening the confirmation link: sign in with what was just typed and carry on.
     Failure stays silent (the link may not have been opened yet); the button does the same with a visible answer. */
  useEffect(() => {
    if (view !== "confirm") return
    let tries = 0, dead = false, trying = false   // its own flag: the button keeps working while a silent attempt is running
    const back = async () => {
      if (document.visibilityState !== "visible" || trying || working.current || tries >= AUTO_TRIES) return
      trying = true; tries++
      try { await A.login(email, pw); if (!dead) signedIn() } catch (e) {} finally { trying = false }
    }
    window.addEventListener("focus", back); document.addEventListener("visibilitychange", back)
    return () => { dead = true; window.removeEventListener("focus", back); document.removeEventListener("visibilitychange", back) }
  }, [view])

  const title = view === "recover" ? "Reset your password" : view === "confirm" ? "Confirm your email" : view === "login" ? "Sign in to continue" : paid ? `Create your account for ${name}` : "Create your free account"
  const after = paid ? `checkout for ${name} opens` : "your account opens"
  const about = view === "confirm" ? `Open the link we send you, then come back to this page: ${after} as soon as you are signed in.`
    : view === "recover" ? "We send a link to set a new password. Then sign in to carry on."
      : paid ? `${name} · ${PRICE[plan]}. ${view === "login" ? "Checkout opens right after you sign in." : "Checkout opens next. Nothing is charged until you confirm it on Stripe."}`
        : `${name} · ${PRICE.free}. No payment details needed.`
  const action = view === "recover" ? "Send reset link" : view === "confirm" ? (paid ? "I have confirmed, continue to checkout" : "I have confirmed, sign in")
    : view === "login" ? (paid ? "Sign in and continue" : "Sign in") : paid ? "Create account and continue" : "Create account"
  const link = "h-auto px-0 text-[13px] underline"

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !done) onClose() }}>
      {/* "shell": the dialog renders outside the app root, so it asks for the shell's scoped style reset (index.css) */}
      <DialogContent className="shell max-w-md" data-plan-signup={plan} hideClose={done}>
        <DialogHeader><DialogTitle className="pr-8 leading-snug">{title}</DialogTitle><DialogDescription>{about}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {view === "confirm" ? <p className="text-sm">Email: <b className="break-all font-medium">{email}</b></p>
            : <div className="space-y-1.5"><Label htmlFor="plan-email">Email</Label><Input id="plan-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
          {(view === "signup" || view === "login") && <div className="space-y-1.5"><Label htmlFor="plan-pw">Password</Label><Input id="plan-pw" type="password" autoComplete={view === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={72} value={pw} onChange={(e) => setPw(e.target.value)} />{view === "signup" && <p className="text-[12px] text-muted-foreground">8 to 72 characters.</p>}</div>}
          {view === "signup" && <ReleasePolicies />}
          {msg && <Alert variant={msg.ok ? "success" : "destructive"}><AlertDescription>{msg.t}</AlertDescription></Alert>}
          <Button type="submit" className="w-full whitespace-normal" disabled={busy || done}>{done ? <><Loader2 className="animate-spin" />{paid ? "Opening checkout…" : "Opening your account…"}</> : busy ? "One moment…" : <>{action}<ArrowRight /></>}</Button>
        </form>
        {!done && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {view === "signup" ? <Button type="button" variant="link" className={link} onClick={() => go("login")}>Have an account? Sign in</Button>
            : view === "confirm" ? <Button type="button" variant="link" className={link} onClick={() => { setPw(""); go("signup") }}>Use a different email</Button>
              : <Button type="button" variant="link" className={link} onClick={() => go("signup")}>New here? Create an account</Button>}
          {(view === "login" || view === "confirm") && <Button type="button" variant="link" className={link} onClick={() => go("recover")}>Forgot password?</Button>}
          {view === "recover" && <Button type="button" variant="link" className={link} onClick={() => go("login")}>Back to sign in</Button>}
        </div>}
      </DialogContent>
    </Dialog>)
}
