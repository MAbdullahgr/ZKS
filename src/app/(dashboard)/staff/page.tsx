"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Plus,
  ArrowsClockwise,
  Key,
  Shield,
  UserCheck,
  User,
  Envelope,
  MapPin,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiPatch } from "@/lib/fetcher";
import { toast } from "sonner";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";

interface StaffMember {
  id: string; // FIX: UUID string
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLogin: string | null;
  createdAt: string;
  employeeId: string | null; // FIX: UUID string
  employee: {
    id: string;
    name: string;
    phone: string | null;
    jobTitle: string;
    cnic: string | null;
    isActive: boolean;
  } | null;
  createdBy: {
    id: string;
    employee: { name: string } | null;
  } | null;
  assignments: {
    id: string;
    role: string;
    store: { id: string; name: string; type: string };
  }[];
}

interface EmployeeOption {
  id: string;
  name: string;
  jobTitle: string;
  user?: { id: string } | null;
}

interface StoreOption {
  id: string;
  name: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-warning/15 text-warning border-warning/25",
  admin: "bg-info/15 text-info border-info/25",
  manager: "bg-primary/15 text-primary border-primary/30",
  warehouse: "bg-warning/15 text-warning border-warning/25",
  cashier: "bg-success/15 text-success border-success/25",
};

const ROLE_GRADIENTS: Record<string, string> = {
  owner: "from-amber-400 to-orange-500",
  admin: "from-purple-400 to-violet-600",
  manager: "from-blue-400 to-indigo-600",
  warehouse: "from-orange-400 to-red-500",
  cashier: "from-green-400 to-emerald-600",
};

export default function StaffPage() {
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedRole, setSelectedRole] = useState("cashier");
  const [assignEmail, setAssignEmail] = useState("");

  const [resetUser, setResetUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Unified paginated list (fixes F1/F5/F6).
  // /api/staff does NOT support ?search= — the previous client-side search box
  // only filtered the first 20 rows (silent truncation). It has been removed.
  const {
    items: staff,
    meta,
    isLoading: staffLoading,
    error: staffError,
    setPage,
    mutate: mutateStaff,
  } = usePaginatedList<StaffMember>("/api/staff", "staff", {
    limit: 20,
  });

  // FIX P1 (frontend): Fetch current session to filter role dropdown.
  // An admin should not be able to assign "admin" role — only owner can.
  const { data: sessionData } = useSWR<{ user: { role: string } }>(
    "/api/auth",
    (url: string) =>
      apiGet<{ user: { role: string } }>(url, { showToast: false }) as Promise<{
        user: { role: string };
      }>,
  );
  const currentRole = sessionData?.user?.role ?? "cashier";
  const ROLE_WEIGHT: Record<string, number> = {
    cashier: 1,
    warehouse: 2,
    manager: 3,
    admin: 4,
    owner: 5,
  };
  // Can only assign roles BELOW your own (canManageRole logic)
  const assignableRoles = (["cashier", "warehouse", "manager", "admin"] as const).filter(
    (r) => ROLE_WEIGHT[currentRole] > ROLE_WEIGHT[r],
  );

  const { data: employeesData, mutate: mutateEmployees } = useSWR<{
    employees: EmployeeOption[];
  }>(
    "/api/employees?limit=1000",
    (url: string) =>
      apiGet<{ employees: EmployeeOption[] }>(url) as Promise<{
        employees: EmployeeOption[];
      }>,
  );
  // Filter only employees without existing user accounts
  const availableEmployees = (employeesData?.employees || []).filter(
    (e) => !e.user,
  );

  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    "/api/stores",
    (url: string) =>
      apiGet<{ stores: StoreOption[] }>(url) as Promise<{
        stores: StoreOption[];
      }>,
  );
  const stores = storesData?.stores || [];

  async function handleAssign() {
    if (!selectedEmployee || !selectedRole) {
      toast.error("Select employee and role");
      return;
    }

    setAssigning(true);
    try {
      const payload = {
        employeeId: selectedEmployee, // FIX: Send UUID string directly
        storeId: selectedStore || null,
        role: selectedRole,
        email: assignEmail,
      };

      const data = await apiPost<{
        user: { employee: { name: string } };
        tempPassword?: string;
        message: string;
      }>("/api/staff", payload);

      toast.success(data?.message);

      if (data?.tempPassword) {
        toast.custom(
          (t) => (
            <div className="bg-card border border-border rounded-xl shadow-lg p-4 w-80">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-5 h-5 text-warning" />
                <span className="font-semibold">Temp Password</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {data?.user?.employee?.name || "User"} login created
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-warning/10 text-warning px-3 py-2 rounded-lg font-mono text-sm font-bold border border-warning/25">
                  {data?.tempPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(data.tempPassword!);
                    toast.success("Copied");
                    toast.dismiss(t);
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          ),
          { duration: 30000 },
        );
      }

      setAssignModalOpen(false);
      setSelectedEmployee("");
      setSelectedStore("");
      setSelectedRole("cashier");
      setAssignEmail("");

      // FIX: Use mutate to refresh data instantly
      mutateStaff();
      mutateEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    // AUDIT-FIX H-8: Confirm before disabling/enabling — one misclick could
    // disable a cashier mid-shift, stranding their open register.
    const action = currentStatus ? "Disable" : "Enable";
    if (!window.confirm(`${action} this account?`)) return;

    try {
      await apiPatch(`/api/users/${userId}`, { isActive: !currentStatus });
      toast.success(currentStatus ? "Account disabled" : "Account enabled");
      mutateStaff(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const handleResetPassword = async () => {
    if (!resetUser) return;
    setResetLoading(true);
    try {
      const res = await apiPost<{ tempPassword: string }>(
        `/api/users/${resetUser.id}/reset-password`,
        {},
      );
      setTempPassword(res?.tempPassword ?? null);
    } catch {
      // toast handled by fetcher
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Staff Management"
        description="Assign system access and manage roles"
        actions={
          <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" /> Assign Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Assign Employee to Store</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Employee</Label>
                  {/* FIX: Use SearchableSelect for better UX */}
                  <SearchableSelect
                    options={availableEmployees.map((e) => ({
                      id: e.id,
                      name: `${e.name} (${e.jobTitle})`,
                    }))}
                    value={selectedEmployee}
                    onChange={(val) => {
                      setSelectedEmployee(val);
                      const emp = availableEmployees.find((em) => em.id === val);
                      if (emp) {
                        setAssignEmail(
                          `${emp.name.toLowerCase().replace(/\s+/g, ".")}@zkr.local`,
                        );
                      }
                    }}
                    placeholder="Search employee..."
                  />
                  {availableEmployees.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      All employees already have logins.{" "}
                      <Link href="/employees" className="text-primary underline">
                        Hire new employee
                      </Link>
                    </p>
                  )}
                </div>

                <div>
                  <Label>Work Email</Label>
                  <input
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    placeholder="ali.gulshan@zkr.local"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Role</Label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring outline-none"
                    >
                      {/* FIX P1 (frontend): Only show roles the current user can assign. */}
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Store</Label>
                    {/* FIX: Use SearchableSelect for better UX */}
                    <SearchableSelect
                      options={stores}
                      value={selectedStore}
                      onChange={setSelectedStore}
                      placeholder="Search store..."
                    />
                  </div>
                </div>

                <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-sm text-primary">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <span className="font-medium">System Access</span>
                  </div>
                  <p className="text-xs text-primary mt-1">
                    This creates a login account. The employee must change their
                    password on first login.
                  </p>
                </div>

                <Button
                  onClick={handleAssign}
                  disabled={assigning || !selectedEmployee}
                  className="w-full"
                >
                  {assigning ? (
                    <>
                      <ArrowsClockwise className="w-4 h-4 animate-spin mr-2" />{" "}
                      Assigning...
                    </>
                  ) : (
                    "Assign & Create Login"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="hidden md:block border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Staff
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Role / Store
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Login Status
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Last Active
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staffLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto mb-2" />{" "}
                  Loading...
                </td>
              </tr>
            ) : staffError ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-destructive">
                  Error: {staffError.message}
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No staff members found
                </td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl bg-linear-to-br ${ROLE_GRADIENTS[s.role] || "from-gray-400 to-gray-600"} flex items-center justify-center text-white font-bold text-sm shrink-0`}
                      >
                        {(s.employee?.name || s.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">
                          {s.employee?.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Envelope className="w-3 h-3" /> {s.email}
                        </p>
                        {s.employee?.cnic && (
                          <p className="text-xs text-muted-foreground">
                            {s.employee.cnic}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={ROLE_COLORS[s.role] || ""}
                    >
                      {s.role}
                    </Badge>
                    {s.assignments.length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />{" "}
                        {s.assignments.map((a) => a.store.name).join(", ")}
                      </p>
                    )}
                    {s.employee?.jobTitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        HR: {s.employee.jobTitle}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <UserCheck className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <User className="w-3.5 h-3.5" /> Disabled
                      </span>
                    )}
                    {s.mustChangePassword && (
                      <p className="text-xs text-warning mt-0.5">
                        Must change password
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {s.lastLogin
                      ? new Date(s.lastLogin).toLocaleDateString("en-PK", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never logged in"}
                  </td>
                  <td className="px-4 py-3 text-right flex flex-col items-center justify-right gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleUserStatus(s.id, s.isActive)}
                      className={
                        s.isActive
                          ? "text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          : "text-success hover:text-success hover:bg-success/10 cursor-pointer"
                      }
                    >
                      {s.isActive ? "Disable" : "Enable"}
                    </Button>
                    <button
                      onClick={() => {
                        setResetUser({ id: s.id, name: s.email });
                        setTempPassword(null);
                      }}
                      className="text-xs text-warning hover:text-warning hover:bg-warning/15 p-1 rounded underline cursor-pointer"
                    >
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {staffLoading ? (
          <div className="text-center text-muted-foreground py-8">
            <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : staffError ? (
          <div className="text-center text-destructive py-8">
            Error: {staffError.message}
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No staff members found
          </div>
        ) : (
          staff.map((s) => (
            <div
              key={s.id}
              className="bg-card rounded-lg border border-border p-3 shadow-soft space-y-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-linear-to-br ${ROLE_GRADIENTS[s.role] || "from-gray-400 to-gray-600"} flex items-center justify-center text-white font-bold text-sm shrink-0`}
                >
                  {(s.employee?.name || s.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {s.employee?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                    <Envelope className="w-3 h-3 shrink-0" /> {s.email}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge
                      variant="outline"
                      className={ROLE_COLORS[s.role] || ""}
                    >
                      {s.role}
                    </Badge>
                    {s.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                        <UserCheck className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                        <User className="w-3 h-3" /> Disabled
                      </span>
                    )}
                  </div>
                  {s.mustChangePassword && (
                    <p className="text-[10px] text-warning mt-1">
                      Must change password
                    </p>
                  )}
                </div>
              </div>

              {(s.assignments.length > 0 || s.employee?.jobTitle || s.lastLogin) && (
                <div className="pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                  {s.assignments.length > 0 && (
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{" "}
                      {s.assignments.map((a) => a.store.name).join(", ")}
                    </p>
                  )}
                  {s.employee?.jobTitle && (
                    <p>HR: {s.employee.jobTitle}</p>
                  )}
                  <p>
                    Last active:{" "}
                    {s.lastLogin
                      ? new Date(s.lastLogin).toLocaleDateString("en-PK", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never"}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleUserStatus(s.id, s.isActive)}
                  className={`flex-1 cursor-pointer ${
                    s.isActive
                      ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                      : "text-success hover:text-success hover:bg-success/10"
                  }`}
                >
                  {s.isActive ? "Disable" : "Enable"}
                </Button>
                <button
                  onClick={() => {
                    setResetUser({ id: s.id, name: s.email });
                    setTempPassword(null);
                  }}
                  className="flex-1 text-xs text-warning hover:text-warning hover:bg-warning/15 px-3 py-1.5 rounded underline cursor-pointer"
                >
                  Reset Password
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta && <PaginationBar meta={meta} onPageChange={setPage} className="pt-4" />}

      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-foreground">
              Reset Password
            </h2>

            {tempPassword ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Temporary password for{" "}
                  <span className="font-semibold text-foreground">
                    {resetUser.name}
                  </span>
                  :
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
                  <code className="flex-1 font-mono text-lg font-bold text-foreground">
                    {tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      toast.success("Copied to clipboard");
                    }}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The user must change this password on their next login.
                </p>
                <button
                  onClick={() => {
                    setResetUser(null);
                    setTempPassword(null);
                  }}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to reset the password for{" "}
                  <span className="font-semibold text-foreground">
                    {resetUser.name}
                  </span>
                  ? A new temporary password will be generated and the user will
                  be forced to change it on next login.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="flex-1 rounded-lg bg-warning px-4 py-2 text-sm font-medium text-warning-foreground hover:bg-amber-700 disabled:opacity-50"
                  >
                    {resetLoading ? "Resetting..." : "Reset Password"}
                  </button>
                  <button
                    onClick={() => {
                      setResetUser(null);
                      setTempPassword(null);
                    }}
                    disabled={resetLoading}
                    className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
