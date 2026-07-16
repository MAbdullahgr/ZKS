"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Pencil,
  ArrowsClockwise,
  Check,
  Calendar,
  CurrencyDollar,
  FileText,
  Image as ImageIcon,
  Plus,
  Upload,
  User,
  Warning,
  Shield,
  Note,
  PaperPlaneRight,
  Star,
  TrendUp,
  ThumbsUp,
  ThumbsDown,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, apiPatch } from "@/lib/fetcher";
import { toast } from "sonner";

type Tab =
  "profile" | "attendance" | "advances" | "leaves" | "notes" | "documents";

interface Employee {
  id: string; // FIX: UUID string
  employeeCode: string;
  name: string;
  fatherName: string | null;
  cnic: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyContact: string | null;
  dob: string | null;
  salary: number; // FIX: number
  joiningDate: string;
  jobTitle: string;
  shift: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    lastLogin: string | null;
  } | null;
  assignments: {
    id: string;
    role: string;
    store: { id: string; name: string; type: string };
  }[];
  documents: {
    id: string;
    type: string;
    url: string;
    createdAt: string;
  }[];
  attendances: {
    id: string;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    notes: string | null;
  }[];
  advances: {
    id: string;
    amount: number;
    deducted: number;
    remaining: number;
    reason: string | null;
    date: string;
    isActive: boolean;
  }[];
  leaves: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    reason: string | null;
    approvedBy: string | null;
  }[];
  notes: {
    id: string;
    type: string;
    content: string;
    createdAt: string;
    createdBy: {
      id: string;
      employee: { name: string } | null;
    } | null;
  }[];
  _count: {
    attendances: number;
    advances: number;
    leaves: number;
    notes: number;
    documents: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  present: "bg-success/15 text-success border-success/25",
  absent: "bg-destructive/15 text-destructive border-destructive/25",
  late: "bg-warning/15 text-warning border-warning/25",
  half_day: "bg-warning/15 text-warning border-warning/25",
  leave: "bg-primary/15 text-primary border-primary/30",
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  general: "bg-muted text-foreground/90 border-border",
  warning: "bg-destructive/15 text-destructive border-destructive/25",
  appreciation: "bg-success/15 text-success border-success/25",
  incident: "bg-warning/15 text-warning border-warning/25",
  promotion: "bg-info/15 text-info border-info/25",
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/25",
  approved: "bg-success/15 text-success border-success/25",
  rejected: "bg-destructive/15 text-destructive border-destructive/25",
};

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();

  // FIX: Use SWR for data fetching
  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ employee: Employee }>(
    `/api/employees/${id}`,
    (url: string) =>
      apiGet<{ employee: Employee }>(url) as Promise<{ employee: Employee }>,
  );
  const employee = data?.employee;

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [editOpen, setEditOpen] = useState(false);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editFatherName, setEditFatherName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPhone2, setEditPhone2] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyContact, setEditEmergencyContact] = useState("");
  const [editSalary, setEditSalary] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editShift, setEditShift] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  // Deduct Advance form
  const [deductAdvId, setDeductAdvId] = useState<string | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [deducting, setDeducting] = useState(false);
  // Quick settings
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Attendance form
  const [attDate, setAttDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [attStatus, setAttStatus] = useState("present");
  const [attCheckIn, setAttCheckIn] = useState("");
  const [attCheckOut, setAttCheckOut] = useState("");
  const [attNotes, setAttNotes] = useState("");

  // Advance form
  const [advAmount, setAdvAmount] = useState("");
  const [advReason, setAdvReason] = useState("");

  // Leave form
  const [leaveType, setLeaveType] = useState("annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveDays, setLeaveDays] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Note form
  const [noteType, setNoteType] = useState("general");
  const [noteContent, setNoteContent] = useState("");

  // Promote form
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [promoteJobTitle, setPromoteJobTitle] = useState("");
  const [promoteRole, setPromoteRole] = useState("");
  const [promoteSalary, setPromoteSalary] = useState("");
  const [promoteReason, setPromoteReason] = useState("");

  // FIX: Initialize edit form when employee data loads or edit modal opens
  function openEditModal() {
    if (!employee) return;
    setEditName(employee.name);
    setEditFatherName(employee.fatherName || "");
    setEditPhone(employee.phone || "");
    setEditPhone2(employee.phone2 || "");
    setEditAddress(employee.address || "");
    setEditEmergencyName(employee.emergencyName || "");
    setEditEmergencyContact(employee.emergencyContact || "");
    setEditSalary(String(employee.salary));
    setEditJobTitle(employee.jobTitle);
    setEditShift(employee.shift || "morning");
    setEditIsActive(employee.isActive);
    setEditOpen(true);
  }

  async function handleUpdate() {
    try {
      const payload = {
        name: editName,
        fatherName: editFatherName || null,
        phone: editPhone || null,
        phone2: editPhone2 || null,
        address: editAddress || null,
        emergencyName: editEmergencyName || null,
        emergencyContact: editEmergencyContact || null,
        salary: parseFloat(editSalary) || 0, // FIX: Send as number
        jobTitle: editJobTitle,
        shift: editShift,
        isActive: editIsActive,
      };
      await apiPatch(`/api/employees/${id}`, payload);
      toast.success("Employee updated");
      setEditOpen(false);
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleDeductAdvance() {
    if (!deductAdvId || !deductAmount) {
      toast.error("Select an advance and enter an amount");
      return;
    }

    setDeducting(true);
    try {
      // FIX: Use the PATCH route to deduct the advance
      await apiPatch(`/api/employees/${id}/advances`, {
        deducted: parseFloat(deductAmount),
      });
      toast.success("Advance deducted successfully");
      setDeductAdvId(null);
      setDeductAmount("");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deduct");
    } finally {
      setDeducting(false);
    }
  }

  async function handleArchive() {
    setSettingsSaving(true);
    try {
      // FIX: Use the PATCH route to toggle isActive (soft delete)
      await apiPatch(`/api/employees/${id}`, { isActive: !employee?.isActive });
      toast.success(
        employee?.isActive ? "Employee archived" : "Employee re-activated",
      );
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handlePromote() {
    if (!promoteJobTitle) {
      toast.error("New job title is required");
      return;
    }

    try {
      const payload = {
        newJobTitle: promoteJobTitle,
        newRole: promoteRole || undefined,
        newSalary: promoteSalary ? parseFloat(promoteSalary) : undefined, // FIX: Send as number
        reason: promoteReason || null,
      };
      await apiPost(`/api/employees/${id}/promote`, payload);
      toast.success("Employee promoted successfully");
      setPromoteModalOpen(false);
      setPromoteJobTitle("");
      setPromoteRole("");
      setPromoteSalary("");
      setPromoteReason("");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to promote");
    }
  }

  async function handleLeaveAction(
    leaveId: string,
    status: "approved" | "rejected",
  ) {
    try {
      await apiPatch(`/api/employees/${id}/leaves`, { leaveId, status });
      toast.success(`Leave ${status}`);
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleAttendance() {
    try {
      const payload = {
        // FIX: Convert date to ISO string
        date: new Date(attDate).toISOString(),
        status: attStatus,
        checkIn: attCheckIn
          ? new Date(`${attDate}T${attCheckIn}`).toISOString()
          : null,
        checkOut: attCheckOut
          ? new Date(`${attDate}T${attCheckOut}`).toISOString()
          : null,
        notes: attNotes || null,
      };
      await apiPost(`/api/employees/${id}/attendance`, payload);
      toast.success("Attendance marked");
      setAttDate(new Date().toISOString().split("T")[0]);
      setAttStatus("present");
      setAttCheckIn("");
      setAttCheckOut("");
      setAttNotes("");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleAdvance() {
    if (!advAmount || parseFloat(advAmount) <= 0) {
      toast.error("Enter valid amount");
      return;
    }

    try {
      const payload = {
        amount: parseFloat(advAmount), // FIX: Send as number
        reason: advReason || null,
      };
      await apiPost(`/api/employees/${id}/advances`, payload);
      toast.success("Advance recorded");
      setAdvAmount("");
      setAdvReason("");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleLeave() {
    if (!leaveStart || !leaveEnd || !leaveDays) {
      toast.error("Fill all required fields");
      return;
    }

    try {
      const payload = {
        type: leaveType,
        startDate: new Date(leaveStart).toISOString(), // FIX: ISO string
        endDate: new Date(leaveEnd).toISOString(), // FIX: ISO string
        days: parseInt(leaveDays), // FIX: Send as number
        reason: leaveReason || null,
      };
      await apiPost(`/api/employees/${id}/leaves`, payload);
      toast.success("Leave request submitted");
      setLeaveType("annual");
      setLeaveStart("");
      setLeaveEnd("");
      setLeaveDays("");
      setLeaveReason("");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleNote() {
    if (!noteContent.trim()) {
      toast.error("Enter note content");
      return;
    }

    try {
      await apiPost(`/api/employees/${id}/notes`, {
        type: noteType,
        content: noteContent,
      });
      toast.success("Note added");
      setNoteType("general");
      setNoteContent("");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "other");

    try {
      await apiPost(`/api/employees/${id}/documents`, formData);
      toast.success("Document uploaded");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <ArrowsClockwise className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">Loading employee...</p>
      </div>
    );
  }

  if (fetchError || !employee) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">
          {fetchError ? fetchError.message : "Employee not found"}
        </p>
        <Link
          href="/employees"
          className="text-primary hover:underline text-sm mt-2 inline-block"
        >
          Back to employees
        </Link>
      </div>
    );
  }

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    { id: "profile", label: "Profile", icon: User },
    {
      id: "attendance",
      label: "Attendance",
      icon: Calendar,
      count: employee._count.attendances,
    },
    {
      id: "advances",
      label: "Advances",
      icon: CurrencyDollar,
      count: employee._count.advances,
    },
    {
      id: "leaves",
      label: "Leaves",
      icon: FileText,
      count: employee._count.leaves,
    },
    { id: "notes", label: "Notes", icon: Note, count: employee._count.notes },
    {
      id: "documents",
      label: "Documents",
      icon: ImageIcon,
      count: employee._count.documents,
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/employees"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {employee.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              {employee.name}
            </h1>
            <Badge
              variant="outline"
              className={
                employee.isActive
                  ? "bg-success/15 text-success border-success/25"
                  : "bg-destructive/15 text-destructive border-destructive/25"
              }
            >
              {employee.isActive ? "Active" : "Left"}
            </Badge>
            {employee.user && (
              <Badge
                variant="outline"
                className="bg-primary/15 text-primary border-primary/30"
              >
                <Shield className="w-3 h-3 mr-1" /> Has Login
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-0.5">
            {employee.employeeCode} · {employee.jobTitle}
            {employee.assignments.length > 0 && (
              <>
                <span className="mx-1">·</span>
                {employee.assignments.map((a) => a.store.name).join(", ")}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPromoteModalOpen(true)}
            className="gap-1.5"
          >
            <TrendUp className="w-3.5 h-3.5" /> Promote
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openEditModal}
            className="gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          {/* FIX: Add Archive/Deactivate Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={settingsSaving}
            className={`gap-1.5 ${employee.isActive ? "text-destructive hover:bg-destructive/10 border-destructive/25" : "text-success hover:bg-success/10 border-success/25"}`}
          >
            {employee.isActive ? (
              <User className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {employee.isActive ? "Archive" : "Re-activate"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" /> Personal Info
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Full Name</span>
                  <span className="font-medium">{employee.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Father Name</span>
                  <span className="font-medium">
                    {employee.fatherName || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">CNIC</span>
                  <span className="font-medium">{employee.cnic || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Date of Birth</span>
                  <span className="font-medium">
                    {employee.dob
                      ? new Date(employee.dob).toLocaleDateString("en-PK")
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Employee Code</span>
                  <span className="font-medium font-mono">
                    {employee.employeeCode}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" /> Contact
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{employee.phone || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Phone 2</span>
                  <span className="font-medium">{employee.phone2 || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-medium text-right max-w-50">
                    {employee.address || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">
                    Emergency Contact
                  </span>
                  <span className="font-medium text-right">
                    {employee.emergencyName
                      ? `${employee.emergencyName} (${employee.emergencyContact})`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <CurrencyDollar className="w-4 h-4 text-muted-foreground" />{" "}
                Employment
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Job Title</span>
                  <span className="font-medium">{employee.jobTitle}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Shift</span>
                  <span className="font-medium capitalize">
                    {employee.shift || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Monthly Salary</span>
                  <span className="font-medium">
                    Rs. {employee.salary.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-muted-foreground">Joining Date</span>
                  <span className="font-medium">
                    {new Date(employee.joiningDate).toLocaleDateString(
                      "en-PK",
                      { day: "numeric", month: "long", year: "numeric" },
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={`font-medium ${employee.isActive ? "text-success" : "text-destructive"}`}
                  >
                    {employee.isActive ? "Active Employee" : "Left / Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {employee.user ? (
              <div className="bg-card border rounded-xl p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" /> System
                  Access
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{employee.user.email}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Role</span>
                    <span className="font-medium capitalize">
                      {employee.user.role}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Last Login</span>
                    <span className="font-medium">
                      {employee.user.lastLogin
                        ? new Date(employee.user.lastLogin).toLocaleString(
                            "en-PK",
                          )
                        : "Never"}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">
                      Account Status
                    </span>
                    <span
                      className={`font-medium ${employee.user.isActive ? "text-success" : "text-destructive"}`}
                    >
                      {employee.user.isActive ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-warning/10 border border-warning/25 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Warning className="w-5 h-5 text-warning mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-warning">
                      No System Access
                    </h3>
                    <p className="text-sm text-warning mt-1">
                      This employee cannot login. Go to{" "}
                      <Link href="/staff" className="underline font-medium">
                        Staff Management
                      </Link>{" "}
                      to create a login.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === "attendance" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Mark Attendance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={attDate}
                  onChange={(e) => setAttDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={attStatus}
                  onChange={(e) => setAttStatus(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave</option>
                </select>
              </div>
              <div>
                <Label>Check In</Label>
                <Input
                  type="time"
                  value={attCheckIn}
                  onChange={(e) => setAttCheckIn(e.target.value)}
                />
              </div>
              <div>
                <Label>Check Out</Label>
                <Input
                  type="time"
                  value={attCheckOut}
                  onChange={(e) => setAttCheckOut(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <Label>Notes</Label>
              <Input
                value={attNotes}
                onChange={(e) => setAttNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <Button onClick={handleAttendance} className="mt-3 gap-1.5">
              <Check className="w-4 h-4" /> Mark Attendance
            </Button>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Check In</th>
                  <th className="text-left px-4 py-3 font-medium">Check Out</th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employee.attendances.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No attendance records
                    </td>
                  </tr>
                ) : (
                  employee.attendances.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {new Date(a.date).toLocaleDateString("en-PK")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={STATUS_COLORS[a.status] || ""}
                        >
                          {a.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.checkIn
                          ? new Date(a.checkIn).toLocaleTimeString("en-PK", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.checkOut
                          ? new Date(a.checkOut).toLocaleTimeString("en-PK", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.notes || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advances Tab */}
      {activeTab === "advances" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Give Advance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Amount (Rs.)</Label>
                <Input
                  type="number"
                  value={advAmount}
                  onChange={(e) => setAdvAmount(e.target.value)}
                  placeholder="5000"
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Input
                  value={advReason}
                  onChange={(e) => setAdvReason(e.target.value)}
                  placeholder="Medical emergency"
                />
              </div>
            </div>
            <Button onClick={handleAdvance} className="mt-3 gap-1.5">
              <Plus className="w-4 h-4" /> Record Advance
            </Button>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Deducted</th>
                  <th className="text-left px-4 py-3 font-medium">Remaining</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Reason</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employee.advances.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No advances
                    </td>
                  </tr>
                ) : (
                  employee.advances.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {new Date(a.date).toLocaleDateString("en-PK")}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        Rs. {a.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        Rs. {a.deducted.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        Rs. {a.remaining.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            a.isActive
                              ? "bg-warning/15 text-warning"
                              : "bg-success/15 text-success"
                          }
                        >
                          {a.isActive ? "Pending" : "Paid Off"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.reason || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* FIX: Add Deduct button for active advances */}
                        {a.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeductAdvId(a.id)}
                            className="text-destructive hover:bg-destructive/10 border-destructive/25"
                          >
                            Deduct
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Deduct Advance Modal */}
          {deductAdvId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card border rounded-xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="font-semibold text-lg mb-4">Deduct Advance</h3>
                <div className="space-y-3">
                  <div>
                    <Label>Amount to Deduct (Rs.)</Label>
                    <Input
                      type="number"
                      value={deductAmount}
                      onChange={(e) => setDeductAmount(e.target.value)}
                      placeholder="Enter amount"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDeductAdvId(null);
                        setDeductAmount("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeductAdvance}
                      disabled={deducting}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      {deducting ? (
                        <ArrowsClockwise className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        "Confirm Deduction"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leaves Tab */}
      {activeTab === "leaves" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Request Leave</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Type</Label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="annual">Annual</option>
                  <option value="sick">Sick</option>
                  <option value="casual">Casual</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={leaveEnd}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Days</Label>
                <Input
                  type="number"
                  value={leaveDays}
                  onChange={(e) => setLeaveDays(e.target.value)}
                  placeholder="3"
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Input
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Family event"
                />
              </div>
            </div>
            <Button onClick={handleLeave} className="mt-3 gap-1.5">
              <PaperPlaneRight className="w-4 h-4" /> Submit Request
            </Button>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Dates</th>
                  <th className="text-left px-4 py-3 font-medium">Days</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Reason</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employee.leaves.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No leave requests
                    </td>
                  </tr>
                ) : (
                  employee.leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 capitalize">{l.type}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(l.startDate).toLocaleDateString("en-PK")} →{" "}
                        {new Date(l.endDate).toLocaleDateString("en-PK")}
                      </td>
                      <td className="px-4 py-3 font-medium">{l.days}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={LEAVE_STATUS_COLORS[l.status] || ""}
                        >
                          {l.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {l.reason || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {l.status === "pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleLeaveAction(l.id, "approved")
                              }
                              className="text-success hover:text-success hover:bg-success/10 h-8 px-2"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleLeaveAction(l.id, "rejected")
                              }
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Add Note</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-1">
                <Label>Type</Label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="general">General</option>
                  <option value="warning">Warning</option>
                  <option value="appreciation">Appreciation</option>
                  <option value="incident">Incident</option>
                  <option value="promotion">Promotion</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <Label>Content</Label>
                <Input
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Describe the note..."
                />
              </div>
            </div>
            <Button onClick={handleNote} className="mt-3 gap-1.5">
              <Plus className="w-4 h-4" /> Add Note
            </Button>
          </div>

          <div className="space-y-3">
            {employee.notes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No notes
              </div>
            ) : (
              employee.notes.map((n) => (
                <div key={n.id} className="bg-card border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant="outline"
                      className={NOTE_TYPE_COLORS[n.type] || ""}
                    >
                      {n.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleDateString("en-PK", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm">{n.content}</p>
                  {n.createdBy && (
                    <p className="text-xs text-muted-foreground mt-2">
                      By {n.createdBy.employee?.name || "Unknown"}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Upload Document</h3>
            <div className="flex items-center gap-3">
              <Label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-accent rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors">
                  <Upload className="w-4 h-4" /> Choose File
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleDocumentUpload}
                />
              </Label>
              <p className="text-sm text-muted-foreground">
                Upload CNIC, photo, or contract
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {employee.documents.length === 0 ? (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                No documents uploaded
              </div>
            ) : (
              employee.documents.map((d) => (
                <div
                  key={d.id}
                  className="bg-card border rounded-xl overflow-hidden group"
                >
                  <div className="aspect-square bg-muted relative">
                    <Image
                      src={d.url}
                      alt={d.type}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium capitalize">
                      {d.type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString("en-PK")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Edit Employee</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Father Name</Label>
                  <Input
                    value={editFatherName}
                    onChange={(e) => setEditFatherName(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Phone 2</Label>
                  <Input
                    value={editPhone2}
                    onChange={(e) => setEditPhone2(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Emergency Name</Label>
                  <Input
                    value={editEmergencyName}
                    onChange={(e) => setEditEmergencyName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Emergency Phone</Label>
                  <Input
                    value={editEmergencyContact}
                    onChange={(e) => setEditEmergencyContact(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Salary (Rs.)</Label>
                  <Input
                    type="number"
                    value={editSalary}
                    onChange={(e) => setEditSalary(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Job Title</Label>
                  <Input
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Shift</Label>
                  <select
                    value={editShift}
                    onChange={(e) => setEditShift(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                    <option value="full">Full Day</option>
                  </select>
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    value={editIsActive.toString()}
                    onChange={(e) => setEditIsActive(e.target.value === "true")}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="true">Active</option>
                    <option value="false">Left / Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} className="gap-1.5">
                <Check className="w-4 h-4" /> Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Promote Dialog */}
      {promoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Star className="w-5 h-5 text-info" /> Promote Employee
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-info/10 border border-info/25 rounded-lg text-sm">
                <p className="font-medium text-info">
                  Current: {employee.jobTitle}
                </p>
                {employee.user && (
                  <p className="text-info text-xs mt-0.5">
                    System role: {employee.user.role}
                  </p>
                )}
              </div>
              <div>
                <Label>New Job Title *</Label>
                <Input
                  value={promoteJobTitle}
                  onChange={(e) => setPromoteJobTitle(e.target.value)}
                  placeholder="e.g. Cashier, Manager"
                />
              </div>
              {employee.user && (
                <div>
                  <Label>New System Role</Label>
                  <select
                    value={promoteRole}
                    onChange={(e) => setPromoteRole(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">
                      Keep current ({employee.user.role})
                    </option>
                    <option value="cashier">Cashier</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              )}
              <div>
                <Label>New Salary (optional)</Label>
                <Input
                  type="number"
                  value={promoteSalary}
                  onChange={(e) => setPromoteSalary(e.target.value)}
                  placeholder="e.g. 30000"
                />
              </div>
              <div>
                <Label>Reason / Notes</Label>
                <Input
                  value={promoteReason}
                  onChange={(e) => setPromoteReason(e.target.value)}
                  placeholder="Performance, experience, etc."
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPromoteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePromote}
                className="gap-1.5 bg-info hover:bg-info/90"
              >
                <TrendUp className="w-4 h-4" /> Confirm Promotion
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
