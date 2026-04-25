import { useState, useRef, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListUsers, useCreateUser, useUpdateUser, useListRoles,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { UserPlus, RefreshCw, Pencil, Phone, MapPin, Calendar, Plug, Link2, Copy, Check, RotateCw, Users } from "lucide-react";

type FormData = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  roleId: string;
  positions: string[];
  hourlyRate: string;
  hireDate: string;
  pin: string;
  isAdmin: boolean;
  isActive: boolean;
};

const emptyForm = (): FormData => ({
  fullName: "", email: "", phone: "", dateOfBirth: "", address: "",
  roleId: "", positions: [], hourlyRate: "", hireDate: "",
  pin: "", isAdmin: false, isActive: true,
});

function userToForm(u: User): FormData {
  return {
    fullName: u.fullName,
    email: u.email ?? "",
    phone: u.phone ?? "",
    dateOfBirth: u.dateOfBirth ?? "",
    address: u.address ?? "",
    roleId: u.roleId ?? "",
    positions: u.positions ?? [],
    hourlyRate: u.hourlyRate != null ? String(u.hourlyRate) : "",
    hireDate: u.hireDate ?? "",
    pin: "",
    isAdmin: u.isAdmin,
    isActive: u.isActive,
  };
}

export default function ManagerEmployees() {
  const { activeVenue, activeUser } = useAppContext();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [reloadingRoster, setReloadingRoster] = useState(false);
  const [reloadResult, setReloadResult] = useState("");

  const [toastOpen, setToastOpen] = useState(false);
  const [toastForm, setToastForm] = useState({ clientId: "", clientSecret: "", restaurantGuid: "" });
  const [toastSyncing, setToastSyncing] = useState(false);
  const [toastResult, setToastResult] = useState("");

  const [otOpen, setOtOpen] = useState(false);
  const [otForm, setOtForm] = useState({ apiKey: "", restaurantId: "" });
  const [otSyncing, setOtSyncing] = useState(false);
  const [otResult, setOtResult] = useState("");

  const { data: users, isLoading } = useListUsers(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListUsersQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const { data: roles } = useListRoles(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id } }
  );

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  function invalidateUsers() {
    qc.invalidateQueries({ queryKey: getListUsersQueryKey({ venueId: activeVenue?.id || "" }) });
  }

  function openAdd() {
    setEditingUser(null);
    setForm(emptyForm());
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setForm(userToForm(user));
    setFormError("");
    setModalOpen(true);
  }

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function togglePosition(roleId: string) {
    setForm(f => ({
      ...f,
      positions: f.positions.includes(roleId)
        ? f.positions.filter(p => p !== roleId)
        : [...f.positions, roleId],
    }));
  }

  async function handleSave() {
    if (!form.fullName.trim()) { setFormError("Full name is required."); return; }
    if (form.pin && (form.pin.length < 4 || !/^\d+$/.test(form.pin))) {
      setFormError("PIN must be 4 or more digits.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim() || "",
        phone: form.phone.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address.trim() || undefined,
        roleId: form.roleId || undefined,
        positions: form.positions,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
        hireDate: form.hireDate || undefined,
        isAdmin: form.isAdmin,
        pin: form.pin || undefined,
      };

      if (editingUser) {
        await updateUser.mutateAsync({ id: editingUser.id, data: { ...payload, isActive: form.isActive } });
      } else {
        await createUser.mutateAsync({ data: { venueId: activeVenue!.id, ...payload } });
      }
      invalidateUsers();
      setModalOpen(false);
    } catch {
      setFormError("Failed to save employee. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToastSync() {
    if (!toastForm.clientId || !toastForm.clientSecret || !toastForm.restaurantGuid) {
      setToastResult("All fields are required.");
      return;
    }
    setToastSyncing(true);
    setToastResult("");
    try {
      const res = await fetch("/api/integrations/toast/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: activeVenue!.id, ...toastForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setToastResult(`Sync complete — ${data.created} added, ${data.updated} updated (${data.total} total).`);
      invalidateUsers();
    } catch (e: unknown) {
      setToastResult((e as Error).message || "Sync failed. Check your credentials.");
    } finally {
      setToastSyncing(false);
    }
  }

  async function handleOtSync() {
    if (!otForm.apiKey || !otForm.restaurantId) {
      setOtResult("All fields are required.");
      return;
    }
    setOtSyncing(true);
    setOtResult("");
    try {
      const res = await fetch("/api/integrations/opentable/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: activeVenue!.id, ...otForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setOtResult(`Sync complete — ${data.created} reservations added, ${data.updated} updated.`);
    } catch (e: unknown) {
      setOtResult((e as Error).message || "Sync failed. Check your credentials.");
    } finally {
      setOtSyncing(false);
    }
  }

  const roleById = Object.fromEntries((roles ?? []).map(r => [r.id, r]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight flex-1">Employees</h1>
        <Button variant="outline" size="sm" onClick={() => setToastOpen(true)} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Sync Toast POS
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOtOpen(true)} className="gap-2">
          <Plug className="h-4 w-4" /> Sync OpenTable
        </Button>
        <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)} className="gap-2">
          <Link2 className="h-4 w-4" /> Invite employees
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={reloadingRoster || !activeVenue?.id}
          onClick={async () => {
            if (!activeVenue?.id) return;
            setReloadingRoster(true);
            setReloadResult("");
            try {
              const res = await fetch("/api/users/reload-roster", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ venueId: activeVenue.id }),
              });
              const body = await res.json();
              if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
              setReloadResult(
                `Roster reloaded · ${body.inserted} added · ${body.updated} updated · ${body.skipped} unchanged${
                  body.collisions?.length ? ` · ${body.collisions.length} skipped (PIN collision)` : ""
                }`,
              );
              invalidateUsers();
            } catch (err) {
              setReloadResult(err instanceof Error ? err.message : "Reload failed");
            } finally {
              setReloadingRoster(false);
            }
          }}
          className="gap-2"
          title="Re-insert any deactivated or missing roster employees"
        >
          <Users className={`h-4 w-4 ${reloadingRoster ? "animate-pulse" : ""}`} /> Reload roster
        </Button>
        <Button size="sm" onClick={openAdd} className="gap-2" style={{ background: "var(--gold)", color: "#0a0502" }}>
          <UserPlus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      <InviteLinkModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        venueId={activeVenue?.id ?? null}
        currentUserId={activeUser?.id ?? null}
      />

      {reloadResult ? (
        <div className="text-sm rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-3 py-2">
          {reloadResult}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Staff Directory</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Position(s)</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Date of Birth</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map(user => {
                    const allPositions = [
                      ...(user.roleId ? [user.roleId] : []),
                      ...(user.positions ?? []).filter(p => p !== user.roleId),
                    ];
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="font-medium">{user.fullName}</div>
                          {user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                          {user.isAdmin && (
                            <Badge className="mt-1 text-xs" style={{ background: "var(--gold)", color: "#0a0502" }}>Admin</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {allPositions.length > 0 ? allPositions.map(pid => {
                              const role = roleById[pid];
                              return role ? (
                                <Badge key={pid} variant="outline" style={{ borderColor: role.color, color: role.color }}>
                                  {role.name}
                                </Badge>
                              ) : null;
                            }) : (
                              <span className="text-xs text-muted-foreground">Unassigned</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.phone ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {user.phone}
                            </div>
                          ) : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          {user.dateOfBirth ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {user.dateOfBirth}
                            </div>
                          ) : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(user)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!users?.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No employees yet. Click <strong>Add Employee</strong> to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Employee Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit Employee" : "Add New Employee"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label htmlFor="emp-name">Full Name *</Label>
                <Input id="emp-name" placeholder="e.g. Jordan Smith" value={form.fullName}
                  onChange={e => setField("fullName", e.target.value)} />
              </div>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="emp-email">Email</Label>
                <Input id="emp-email" type="email" placeholder="jordan@example.com" value={form.email}
                  onChange={e => setField("email", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="emp-phone">Phone</Label>
                <Input id="emp-phone" type="tel" placeholder="(713) 555-0100" value={form.phone}
                  onChange={e => setField("phone", e.target.value)} />
              </div>
            </div>

            {/* DOB + Hire */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="emp-dob">Date of Birth</Label>
                <Input id="emp-dob" type="date" value={form.dateOfBirth}
                  onChange={e => setField("dateOfBirth", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="emp-hire">Hire Date</Label>
                <Input id="emp-hire" type="date" value={form.hireDate}
                  onChange={e => setField("hireDate", e.target.value)} />
              </div>
            </div>

            {/* Address */}
            <div>
              <Label htmlFor="emp-addr">Address</Label>
              <Input id="emp-addr" placeholder="123 Main St, Houston TX 77001" value={form.address}
                onChange={e => setField("address", e.target.value)} />
            </div>

            {/* Primary Position */}
            <div>
              <Label>Primary Position</Label>
              <Select
                value={form.roleId === "" ? "__none" : form.roleId}
                onValueChange={v => setField("roleId", v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select primary position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {roles?.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Positions */}
            {roles && roles.length > 0 && (
              <div>
                <Label>Additional Positions</Label>
                <p className="text-xs text-muted-foreground mb-2">Positions this employee can also work</p>
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => {
                    const selected = form.positions.includes(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => togglePosition(r.id)}
                        className="px-3 py-1 rounded-full text-xs border transition-all"
                        style={{
                          borderColor: r.color,
                          background: selected ? r.color + "33" : "transparent",
                          color: selected ? r.color : "inherit",
                        }}>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hourly Rate */}
            <div>
              <Label htmlFor="emp-rate">Hourly Rate ($)</Label>
              <Input id="emp-rate" type="number" min="0" step="0.25" placeholder="0.00" value={form.hourlyRate}
                onChange={e => setField("hourlyRate", e.target.value)} />
            </div>

            {/* PIN */}
            <div>
              <Label htmlFor="emp-pin">Login PIN {editingUser ? "(leave blank to keep current)" : "*"}</Label>
              <Input id="emp-pin" type="password" inputMode="numeric" maxLength={8}
                placeholder={editingUser ? "Enter new PIN to change" : "4–8 digits"}
                value={form.pin} onChange={e => setField("pin", e.target.value.replace(/\D/g, ""))} />
              <p className="text-xs text-muted-foreground mt-1">Used to log into the ENISH employee app</p>
            </div>

            {/* Admin + Active toggles */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Admin Access</p>
                <p className="text-xs text-muted-foreground">Can manage staff, schedules & settings</p>
              </div>
              <Switch checked={form.isAdmin} onCheckedChange={v => setField("isAdmin", v)} />
            </div>

            {editingUser && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Inactive employees cannot log in</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={v => setField("isActive", v)} />
              </div>
            )}

            {formError && <p className="text-sm text-red-400">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}
              style={{ background: "var(--gold)", color: "#0a0502" }}>
              {saving ? "Saving…" : editingUser ? "Save Changes" : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast POS Sync Dialog */}
      <Dialog open={toastOpen} onOpenChange={v => { setToastOpen(v); if (!v) setToastResult(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sync from Toast POS</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Import your employee roster from Toast POS. New employees will be created; existing ones updated.
            Your Toast API credentials can be found in the Toast Developer Portal.
          </p>
          <div className="space-y-3 py-2">
            <div>
              <Label>Client ID</Label>
              <Input placeholder="Toast API Client ID" value={toastForm.clientId}
                onChange={e => setToastForm(f => ({ ...f, clientId: e.target.value }))} />
            </div>
            <div>
              <Label>Client Secret</Label>
              <Input type="password" placeholder="Toast API Client Secret" value={toastForm.clientSecret}
                onChange={e => setToastForm(f => ({ ...f, clientSecret: e.target.value }))} />
            </div>
            <div>
              <Label>Restaurant GUID</Label>
              <Input placeholder="Your Toast Restaurant GUID" value={toastForm.restaurantGuid}
                onChange={e => setToastForm(f => ({ ...f, restaurantGuid: e.target.value }))} />
            </div>
            {toastResult && (
              <p className={`text-sm ${toastResult.includes("complete") ? "text-green-400" : "text-red-400"}`}>
                {toastResult}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToastOpen(false)}>Close</Button>
            <Button onClick={handleToastSync} disabled={toastSyncing}
              style={{ background: "var(--gold)", color: "#0a0502" }}>
              {toastSyncing ? "Syncing…" : "Sync Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OpenTable Sync Dialog */}
      <Dialog open={otOpen} onOpenChange={v => { setOtOpen(v); if (!v) setOtResult(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sync from OpenTable</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pull the next 30 days of reservations from OpenTable into ENISH. Existing reservations
            are updated; new ones are added automatically. Get your credentials from the OpenTable
            Partner Portal.
          </p>
          <div className="space-y-3 py-2">
            <div>
              <Label>API Key</Label>
              <Input type="password" placeholder="OpenTable Bearer Token / API Key" value={otForm.apiKey}
                onChange={e => setOtForm(f => ({ ...f, apiKey: e.target.value }))} />
            </div>
            <div>
              <Label>Restaurant ID</Label>
              <Input placeholder="Your OpenTable Restaurant ID" value={otForm.restaurantId}
                onChange={e => setOtForm(f => ({ ...f, restaurantId: e.target.value }))} />
            </div>
            {otResult && (
              <p className={`text-sm ${otResult.includes("complete") ? "text-green-400" : "text-red-400"}`}>
                {otResult}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOtOpen(false)}>Close</Button>
            <Button onClick={handleOtSync} disabled={otSyncing}
              style={{ background: "var(--gold)", color: "#0a0502" }}>
              {otSyncing ? "Syncing…" : "Sync Reservations"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteLinkModal({
  open, onOpenChange, venueId, currentUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  venueId: string | null;
  currentUserId: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  const fetchLink = async () => {
    if (!venueId || !currentUserId) return;
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/venues/${venueId}/enrollment-link`, {
        headers: { "x-user-id": currentUserId },
      });
      const body = (await res.json()) as { token?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
      setToken(body.token ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load link");
    } finally {
      setLoading(false);
    }
  };

  const rotate = async () => {
    if (!venueId || !currentUserId) return;
    setRotating(true); setErr(null);
    try {
      const res = await fetch(`/api/venues/${venueId}/enrollment-link/rotate`, {
        method: "POST",
        headers: { "x-user-id": currentUserId, "Content-Type": "application/json" },
      });
      const body = (await res.json()) as { token?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
      setToken(body.token ?? null);
      setCopied(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to rotate link");
    } finally {
      setRotating(false);
    }
  };

  useEffect(() => {
    if (open) {
      setToken(null);
      setCopied(false);
      void fetchLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venueId, currentUserId]);

  const url = token && venueId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/enroll/${venueId}/${token}`
    : "";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Invite employees</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Share this link with new hires. They'll pick a position and PIN on a public page — no
            admin access is granted.
          </p>
          <div className="space-y-1.5">
            <Label>Enrollment link</Label>
            <div className="flex gap-2">
              <Input readOnly value={loading ? "Loading…" : url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={handleCopy} disabled={!url}>
                {copied ? <><Check className="w-4 h-4 mr-1.5" /> Copied</> : <><Copy className="w-4 h-4 mr-1.5" /> Copy</>}
              </Button>
            </div>
          </div>
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1.5">
            <div className="font-medium text-foreground">Available positions</div>
            <div>Bartender, Server, Dishwasher, Busser, Cleaner, Host, Cook</div>
            <div className="pt-1">Rotate the link to revoke access for anyone who hasn't enrolled yet.</div>
          </div>
          {err ? (
            <p className="text-sm text-destructive">{err}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={rotate} disabled={rotating || !token}>
            <RotateCw className={`w-4 h-4 mr-1.5 ${rotating ? "animate-spin" : ""}`} /> Rotate link
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
