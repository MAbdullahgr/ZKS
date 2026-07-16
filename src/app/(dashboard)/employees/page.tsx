"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Plus,
  MagnifyingGlass,
  Storefront,
  IdentificationCard,
  Phone,
  Calendar,
  ArrowsClockwise,
  Check,
  X,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { PaginationBar, type PaginationMeta } from "@/components/ui/pagination";

interface Employee {
  id: string; // FIX: UUID string
  employeeCode: string;
  name: string;
  fatherName: string | null;
  cnic: string | null;
  phone: string | null;
  salary: number; // FIX: number
  joiningDate: string;
  jobTitle: string;
  shift: string | null;
  isActive: boolean;
  store?: { name: string } | null;
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
    store: { id: string; name: string };
  }[];
  _count: {
    attendances: number;
    advances: number;
    leaves: number;
    notes: number;
  };
}

interface EmployeesResponse {
  employees: Employee[];
  // AUDIT-FIX B4: flat pagination envelope (matches all other endpoints).
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const JOB_TITLE_COLORS: Record<string, string> = {
  Owner: "bg-warning/15 text-warning border-warning/25",
  Manager: "bg-primary/15 text-primary border-primary/30",
  Cashier: "bg-success/15 text-success border-success/25",
  Salesman: "bg-success/15 text-success border-teal-200",
  "Godown Keeper": "bg-warning/15 text-warning border-warning/25",
  Helper: "bg-muted text-foreground/90 border-border",
  Cleaner: "bg-info/15 text-info border-pink-200",
  Sweeper: "bg-muted text-foreground/90 border-border",
  Warehouse: "bg-primary/15 text-primary border-primary/30",
};

const JOB_TITLE_GRADIENTS: Record<string, string> = {
  Owner: "from-amber-400 to-orange-500",
  Manager: "from-blue-400 to-indigo-600",
  Cashier: "from-green-400 to-emerald-600",
  Salesman: "from-teal-400 to-cyan-600",
  "Godown Keeper": "from-orange-400 to-red-500",
  Helper: "from-gray-400 to-slate-600",
  Cleaner: "from-pink-400 to-rose-500",
  Sweeper: "from-slate-400 to-gray-600",
  Warehouse: "from-indigo-400 to-purple-600",
};

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formName, setFormName] = useState("");
  const [formFatherName, setFormFatherName] = useState("");
  const [formCnic, setFormCnic] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPhone2, setFormPhone2] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formEmergencyName, setFormEmergencyName] = useState("");
  const [formEmergencyContact, setFormEmergencyContact] = useState("");
  const [formSalary, setFormSalary] = useState("");
  const [formJobTitle, setFormJobTitle] = useState("Helper");
  const [formShift, setFormShift] = useState("morning");
  const [formDob, setFormDob] = useState("");

  // Build query params
  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (jobFilter) queryParams.set("jobTitle", jobFilter);
  queryParams.set("page", page.toString());
  queryParams.set("limit", "20");

  // FIX: Use SWR for data fetching
  // FIX: Use SWR for data fetching
  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<EmployeesResponse>(
    `/api/employees?${queryParams.toString()}`,
    (url: string) =>
      apiGet<EmployeesResponse>(url) as Promise<EmployeesResponse>,
  );
  const employees = data?.employees || [];
  // AUDIT-FIX B4: read flat fields instead of nested data.pagination.
  const totalPages = data?.pages || 1;
  const totalItems = data?.total ?? 0;
  const currentPage = data?.page ?? page;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName) {
      toast.error("Name is required");
      return;
    }

    setCreating(true);
    try {
      const payload = {
        name: formName,
        fatherName: formFatherName || null,
        cnic: formCnic || null,
        phone: formPhone || null,
        phone2: formPhone2 || null,
        address: formAddress || null,
        emergencyName: formEmergencyName || null,
        emergencyContact: formEmergencyContact || null,
        salary: parseFloat(formSalary) || 0, // FIX: Send as number
        jobTitle: formJobTitle,
        shift: formShift,
        dob: formDob ? new Date(formDob).toISOString() : null, // FIX: Added DOB
      };

      await apiPost("/api/employees", payload);
      toast.success("Employee added successfully!");
      setModalOpen(false);
      resetForm();
      setPage(1);
      mutate(); // FIX: Call mutate to refresh the list
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create employee",
      );
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setFormName("");
    setFormFatherName("");
    setFormCnic("");
    setFormPhone("");
    setFormPhone2("");
    setFormAddress("");
    setFormEmergencyName("");
    setFormEmergencyContact("");
    setFormSalary("");
    setFormJobTitle("Helper");
    setFormShift("morning");
    setFormDob("");
  }

  const jobTitles = [
    "Owner",
    "Manager",
    "Cashier",
    "Salesman",
    "Godown Keeper",
    "Helper",
    "Cleaner",
    "Sweeper",
    "Warehouse",
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            All staff on your payroll
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Hire New Employee</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ali Ahmed"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fatherName">Father Name</Label>
                  <Input
                    id="fatherName"
                    value={formFatherName}
                    onChange={(e) => setFormFatherName(e.target.value)}
                    placeholder="Muhammad Ahmed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cnic">CNIC</Label>
                  <Input
                    id="cnic"
                    value={formCnic}
                    onChange={(e) => setFormCnic(e.target.value)}
                    placeholder="XXXXX-XXXXXXX-X"
                  />
                </div>
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={formDob}
                    onChange={(e) => setFormDob(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                  />
                </div>
                <div>
                  <Label htmlFor="phone2">Phone 2</Label>
                  <Input
                    id="phone2"
                    value={formPhone2}
                    onChange={(e) => setFormPhone2(e.target.value)}
                    placeholder="Alternate contact"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="House #, Street, Area, City"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emergencyName">Emergency Contact Name</Label>
                  <Input
                    id="emergencyName"
                    value={formEmergencyName}
                    onChange={(e) => setFormEmergencyName(e.target.value)}
                    placeholder="Father / Brother"
                  />
                </div>
                <div>
                  <Label htmlFor="emergencyContact">Emergency Phone</Label>
                  <Input
                    id="emergencyContact"
                    value={formEmergencyContact}
                    onChange={(e) => setFormEmergencyContact(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="salary">Monthly Salary (Rs.)</Label>
                  <Input
                    id="salary"
                    type="number"
                    value={formSalary}
                    onChange={(e) => setFormSalary(e.target.value)}
                    placeholder="25000"
                  />
                </div>
                <div>
                  <Label htmlFor="jobTitle">Job Title</Label>
                  <select
                    id="jobTitle"
                    value={formJobTitle}
                    onChange={(e) => setFormJobTitle(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring outline-none"
                  >
                    {jobTitles.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="shift">Shift</Label>
                <select
                  id="shift"
                  value={formShift}
                  onChange={(e) => setFormShift(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring outline-none"
                >
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                  <option value="full">Full Day</option>
                </select>
              </div>

              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? (
                  <>
                    <ArrowsClockwise className="w-4 h-4 animate-spin mr-2" />{" "}
                    Adding...
                  </>
                ) : (
                  "Add Employee"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, CNIC, phone, or employee code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <select
          value={jobFilter}
          onChange={(e) => {
            setJobFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring outline-none"
        >
          <option value="">All Job Titles</option>
          {jobTitles.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden md:block border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Employee
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Store
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Job / Shift
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Contact
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Salary
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                System Access
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto mb-2" />{" "}
                  Loading...
                </td>
              </tr>
            ) : fetchError ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-destructive">
                  Error: {fetchError.message}
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No employees found
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/employees/${emp.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl bg-linear-to-br ${JOB_TITLE_GRADIENTS[emp.jobTitle] || "from-gray-400 to-gray-600"} flex items-center justify-center text-white font-bold text-sm shrink-0`}
                      >
                        {emp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium group-hover:text-primary transition-colors">
                          {emp.name}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <IdentificationCard className="w-3 h-3" />{" "}
                          {emp.employeeCode.slice(-6)}
                        </p>
                        {emp.cnic && (
                          <p className="text-xs text-muted-foreground">
                            {emp.cnic}
                          </p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {emp.store?.name ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                        {emp.store.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={JOB_TITLE_COLORS[emp.jobTitle] || ""}
                    >
                      {emp.jobTitle}
                    </Badge>
                    {emp.shift && (
                      <p className="text-xs text-muted-foreground mt-1 capitalize">
                        {emp.shift} shift
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {emp.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {emp.phone}
                      </p>
                    )}
                    {emp.assignments.length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Storefront className="w-3 h-3" />{" "}
                        {emp.assignments.map((a) => a.store.name).join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">
                      Rs. {emp.salary.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{" "}
                      {new Date(emp.joiningDate).toLocaleDateString("en-PK", {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {emp.user ? (
                      <div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <Check className="w-3.5 h-3.5" /> Has Login
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {emp.user.email}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {emp.user.role}
                        </p>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <X className="w-3.5 h-3.5" /> No system access
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {emp.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <Check className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <X className="w-3.5 h-3.5" /> Left
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            <ArrowsClockwise className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : fetchError ? (
          <div className="text-center text-destructive py-8">
            Error: {fetchError.message}
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No employees found
          </div>
        ) : (
          employees.map((emp) => (
            <div
              key={emp.id}
              className="bg-card rounded-lg border border-border p-3 shadow-soft space-y-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-linear-to-br ${JOB_TITLE_GRADIENTS[emp.jobTitle] || "from-gray-400 to-gray-600"} flex items-center justify-center text-white font-bold text-sm shrink-0`}
                >
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {emp.name}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <IdentificationCard className="w-3 h-3" />{" "}
                    {emp.employeeCode.slice(-6)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge
                      variant="outline"
                      className={JOB_TITLE_COLORS[emp.jobTitle] || ""}
                    >
                      {emp.jobTitle}
                    </Badge>
                    {emp.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                        <X className="w-3 h-3" /> Left
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {(emp.store?.name || emp.shift || emp.phone) && (
                <div className="pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                  {emp.store?.name && (
                    <p>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                        {emp.store.name}
                      </span>
                      {emp.shift && (
                        <span className="ml-2 capitalize">{emp.shift} shift</span>
                      )}
                    </p>
                  )}
                  {emp.phone && (
                    <p className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {emp.phone}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <p className="text-sm font-medium">
                    Rs. {emp.salary.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />{" "}
                    {new Date(emp.joiningDate).toLocaleDateString("en-PK", {
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Link
                  href={`/employees/${emp.id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  View Details →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {data && (
        <PaginationBar
          meta={
            {
              page: currentPage,
              limit: data.limit ?? 20,
              total: totalItems,
              pages: totalPages,
              hasNext: Boolean(data.hasNext),
              hasPrev: Boolean(data.hasPrev),
            } satisfies PaginationMeta
          }
          onPageChange={setPage}
          className="mt-4"
        />
      )}
    </div>
  );
}
