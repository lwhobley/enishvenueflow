import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound } from "lucide-react";

export function ChangePinDialog({
  open, onOpenChange, userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
}) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setCurrent(""); setNext(""); setConfirm("");
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!/^\d{4,8}$/.test(current)) {
      toast({ title: "Enter your current PIN (4–8 digits)", variant: "destructive" }); return;
    }
    if (!/^\d{4,8}$/.test(next)) {
      toast({ title: "New PIN must be 4–8 digits", variant: "destructive" }); return;
    }
    if (next !== confirm) {
      toast({ title: "New PIN and confirmation must match", variant: "destructive" }); return;
    }
    if (current === next) {
      toast({ title: "New PIN must be different from current", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, currentPin: current, newPin: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
      toast({ title: "PIN updated", description: "Use your new PIN next time you sign in." });
      close();
    } catch (err) {
      toast({
        title: "Couldn't change PIN",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const onlyDigits = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setter(e.target.value.replace(/\D/g, "").slice(0, 8));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving && !v) close(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Change your PIN
          </DialogTitle>
          <DialogDescription>
            Pick something you'll remember. 4–8 digits. You'll use it to sign in from now on.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current PIN</Label>
            <Input
              id="cp-current"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={current}
              onChange={onlyDigits(setCurrent)}
              placeholder="••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-new">New PIN</Label>
            <Input
              id="cp-new"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={next}
              onChange={onlyDigits(setNext)}
              placeholder="4–8 digits"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new PIN</Label>
            <Input
              id="cp-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              onChange={onlyDigits(setConfirm)}
              placeholder="Repeat new PIN"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>) : "Update PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
