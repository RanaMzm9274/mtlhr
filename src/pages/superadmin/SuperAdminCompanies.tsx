import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  bio: string | null;
  employee_count: number | null;
  revenue: number | null;
  logo_url: string | null;
}

interface EmployeeRow {
  id: string;
  user_id?: string | null;
  company_id: string | null;
  avatar_url: string | null;
  name: string;
  email: string;
  position: string | null;
  status: string;
}

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function SuperAdminCompanies() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [newCompanyBio, setNewCompanyBio] = useState("");
  const [newCompanyEmployeeCount, setNewCompanyEmployeeCount] = useState("");
  const [newCompanyRevenue, setNewCompanyRevenue] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);

  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePosition, setInvitePosition] = useState("");
  const [inviting, setInviting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editEmployeeCount, setEditEmployeeCount] = useState("");
  const [editRevenue, setEditRevenue] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");

  const [deleteCompanyTarget, setDeleteCompanyTarget] = useState<CompanyRow | null>(null);
  const [deleteCompanyStep, setDeleteCompanyStep] = useState<1 | 2>(1);
  const [deleteCompanyConfirm, setDeleteCompanyConfirm] = useState("");
  const [deletingCompany, setDeletingCompany] = useState(false);

  const [deleteEmployeeTarget, setDeleteEmployeeTarget] = useState<EmployeeRow | null>(null);
  const [deleteEmployeeStep, setDeleteEmployeeStep] = useState<1 | 2>(1);
  const [deleteEmployeeConfirm, setDeleteEmployeeConfirm] = useState("");
  const [deletingEmployee, setDeletingEmployee] = useState(false);

  const employeesByCompany = useMemo(() => {
    const grouped = new Map<string, EmployeeRow[]>();
    for (const employee of employees) {
      if (!employee.company_id) continue;
      const existing = grouped.get(employee.company_id) ?? [];
      existing.push(employee);
      grouped.set(employee.company_id, existing);
    }
    return grouped;
  }, [employees]);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: companyData, error: companyError }, { data: employeeData, error: employeeError }] = await Promise.all([
      supabase.from("companies").select("id,name,slug,status,created_at,bio,employee_count,revenue,logo_url").order("created_at", { ascending: false }),
      supabase.from("employee_profiles").select("id,user_id,company_id,avatar_url,name,email,position,status").order("created_at", { ascending: false }),
    ]);

    if (companyError || employeeError) {
      toast({ title: "Failed to load companies", description: companyError?.message ?? employeeError?.message ?? "Unexpected error", variant: "destructive" });
    } else {
      setCompanies((companyData as CompanyRow[]) ?? []);
      setEmployees((employeeData as EmployeeRow[]) ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getFunctionAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return { Authorization: `Bearer ${session.access_token}` };
  };

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCompanyName.trim();
    const slug = slugify(newCompanySlug || newCompanyName);
    if (!name || !slug) {
      toast({ title: "Invalid company", description: "Name and slug are required.", variant: "destructive" });
      return;
    }

    const employeeCountValue = newCompanyEmployeeCount.trim() ? Number(newCompanyEmployeeCount) : null;
    const revenueValue = newCompanyRevenue.trim() ? Number(newCompanyRevenue) : null;

    setCreatingCompany(true);
    const { error } = await supabase.from("companies").insert({
      name,
      slug,
      status: "approved",
      bio: newCompanyBio.trim() || null,
      employee_count: employeeCountValue,
      revenue: revenueValue,
    });
    setCreatingCompany(false);

    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Company created" });
    setNewCompanyName("");
    setNewCompanySlug("");
    setNewCompanyBio("");
    setNewCompanyEmployeeCount("");
    setNewCompanyRevenue("");
    setCompanyDialogOpen(false);
    fetchData();
  };

  const inviteEmployeeToCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCompanyId) return;

    setInviting(true);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("invite-employee", {
        headers,
        body: {
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          position: invitePosition.trim(),
          company_id: inviteCompanyId,
          redirectTo: `${window.location.origin}/set-password`,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: "Invitation sent", description: `Invitation sent to ${inviteEmail.trim()}` });
      setInviteCompanyId(null);
      setInviteName("");
      setInviteEmail("");
      setInvitePosition("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const updateStatus = async (company: CompanyRow, status: "approved" | "rejected") => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("companies").update({ status, approved_at: status === "approved" ? now : null }).eq("id", company.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    if (status === "approved") {
      await supabase.from("company_memberships").update({ status: "approved", approved_at: now }).eq("company_id", company.id).eq("status", "pending");
    }

    toast({ title: `Company ${status}` });
    fetchData();
  };

  const startEdit = (company: CompanyRow) => {
    setEditingId(company.id);
    setEditName(company.name);
    setEditSlug(company.slug);
    setEditBio(company.bio ?? "");
    setEditEmployeeCount(company.employee_count?.toString() ?? "");
    setEditRevenue(company.revenue?.toString() ?? "");
    setEditLogoUrl(company.logo_url ?? "");
  };

  const saveProfile = async (company: CompanyRow) => {
    const nextName = editName.trim();
    const nextSlug = slugify(editSlug || editName);
    if (!nextName || !nextSlug) {
      toast({ title: "Invalid company profile", description: "Company name and slug are required.", variant: "destructive" });
      return;
    }

    const employeeCountValue = editEmployeeCount.trim() ? Number(editEmployeeCount) : null;
    const revenueValue = editRevenue.trim() ? Number(editRevenue) : null;

    const { error } = await supabase.from("companies").update({
      name: nextName,
      slug: nextSlug,
      bio: editBio.trim() || null,
      employee_count: employeeCountValue,
      revenue: revenueValue,
      logo_url: editLogoUrl.trim() || null,
    }).eq("id", company.id);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Company profile updated" });
    setEditingId(null);
    fetchData();
  };

  const confirmDeleteCompany = async () => {
    if (!deleteCompanyTarget) return;
    setDeletingCompany(true);
    const { error } = await supabase.from("companies").delete().eq("id", deleteCompanyTarget.id);
    setDeletingCompany(false);

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Company deleted", description: `${deleteCompanyTarget.name} and linked records were removed.` });
    setDeleteCompanyTarget(null);
    setDeleteCompanyStep(1);
    setDeleteCompanyConfirm("");
    fetchData();
  };

  const confirmDeleteEmployee = async () => {
    if (!deleteEmployeeTarget) return;
    setDeletingEmployee(true);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("delete-employee", {
        headers,
        body: {
          user_id: deleteEmployeeTarget.user_id || null,
          profile_id: deleteEmployeeTarget.id || null,
          email: deleteEmployeeTarget.email || null,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: "Employee deleted", description: `${deleteEmployeeTarget.name || deleteEmployeeTarget.email} removed.` });
      setDeleteEmployeeTarget(null);
      setDeleteEmployeeStep(1);
      setDeleteEmployeeConfirm("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeletingEmployee(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Company Management</h1>
            <p className="text-muted-foreground">Create/update companies and manage employees per company.</p>
          </div>
          <Button onClick={() => setCompanyDialogOpen(true)}>Add Company</Button>
        </div>
      </div>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>Create a new company profile.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createCompany} className="grid gap-3 md:grid-cols-2">
            <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name" required />
            <Input value={newCompanySlug} onChange={(e) => setNewCompanySlug(slugify(e.target.value))} placeholder="company-slug" required />
            <Input value={newCompanyEmployeeCount} onChange={(e) => setNewCompanyEmployeeCount(e.target.value)} placeholder="Employee count (optional)" />
            <Input value={newCompanyRevenue} onChange={(e) => setNewCompanyRevenue(e.target.value)} placeholder="Revenue (optional)" />
            <div className="md:col-span-2">
              <Textarea value={newCompanyBio} onChange={(e) => setNewCompanyBio(e.target.value)} placeholder="Company bio (optional)" />
            </div>
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setCompanyDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creatingCompany}>{creatingCompany ? "Creating..." : "Create Company"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : companies.length === 0 ? <p className="text-sm text-muted-foreground">No companies found.</p> : (
            <Accordion type="single" collapsible className="w-full space-y-3">
              {companies.map((company) => {
                const companyEmployees = employeesByCompany.get(company.id) ?? [];
                const isEditing = editingId === company.id;
                const showInvite = inviteCompanyId === company.id;

                return (
                  <AccordionItem key={company.id} value={company.id} className="border rounded-lg px-4">
                    <div className="flex items-center justify-between gap-3 py-2">
                      <AccordionTrigger className="hover:no-underline py-0 flex-1">
                        <div className="text-left">
                          <p className="font-medium">{company.name}</p>
                          <p className="text-xs text-muted-foreground">/{company.slug} | {company.status} | Employees: {companyEmployees.length}</p>
                        </div>
                      </AccordionTrigger>
                      <div className="flex gap-2 flex-wrap justify-end pr-6">
                        <Button size="sm" onClick={() => setInviteCompanyId(showInvite ? null : company.id)}>{showInvite ? "Cancel Invite" : "Add Employee"}</Button>
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={() => saveProfile(company)}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(company)}>Edit Profile</Button>
                        )}
                        <Button size="sm" disabled={company.status === "approved"} onClick={() => updateStatus(company, "approved")}>Approve</Button>
                        <Button size="sm" variant="destructive" disabled={company.status === "rejected"} onClick={() => updateStatus(company, "rejected")}>Reject</Button>
                        <Button size="sm" variant="destructive" onClick={() => { setDeleteCompanyTarget(company); setDeleteCompanyStep(1); setDeleteCompanyConfirm(""); }}>Delete Company</Button>
                      </div>
                    </div>

                    <AccordionContent className="space-y-4 pb-4">
                      {showInvite && (
                        <form onSubmit={inviteEmployeeToCompany} className="grid gap-3 md:grid-cols-3 border rounded-md p-3">
                          <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Full name" required />
                          <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email" required />
                          <Input value={invitePosition} onChange={(e) => setInvitePosition(e.target.value)} placeholder="Position" required />
                          <div className="md:col-span-3">
                            <Button type="submit" disabled={inviting}>{inviting ? "Sending..." : "Send Invitation"}</Button>
                          </div>
                        </form>
                      )}

                      {isEditing ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Company name" />
                          <Input value={editSlug} onChange={(e) => setEditSlug(slugify(e.target.value))} placeholder="company-slug" />
                          <Input value={editEmployeeCount} onChange={(e) => setEditEmployeeCount(e.target.value)} placeholder="Employee count (optional)" />
                          <Input value={editRevenue} onChange={(e) => setEditRevenue(e.target.value)} placeholder="Revenue (optional)" />
                          <Input value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} placeholder="Logo URL (optional, super admin only)" />
                          <div className="md:col-span-2">
                            <Textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Company bio (optional)" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Bio:</span> {company.bio || "-"}</p>
                          <p><span className="text-muted-foreground">Employee Count:</span> {company.employee_count ?? "-"}</p>
                          <p><span className="text-muted-foreground">Revenue:</span> {company.revenue ?? "-"}</p>
                          <p><span className="text-muted-foreground">Logo URL:</span> {company.logo_url || "-"}</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-sm font-medium">Linked Employees ({companyEmployees.length})</p>
                        {companyEmployees.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No employees linked.</p>
                        ) : (
                          <div className="border rounded-md overflow-hidden">
                            {companyEmployees.map((employee) => (
                              <div key={employee.id} className="px-3 py-2 text-sm border-b last:border-b-0 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-3">
                                  {employee.avatar_url ? (
                                    <img src={employee.avatar_url} alt={employee.name || employee.email} className="h-9 w-9 rounded-full object-cover border" />
                                  ) : (
                                    <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold border">
                                      {(employee.name || employee.email || "E").trim().charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium">{employee.name || "-"}</p>
                                    <p className="text-xs text-muted-foreground">{employee.email || "-"}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <p className="text-xs text-muted-foreground text-right">{employee.position || "-"} | {employee.status}</p>
                                  <Button size="sm" variant="destructive" onClick={() => { setDeleteEmployeeTarget(employee); setDeleteEmployeeStep(1); setDeleteEmployeeConfirm(""); }}>Delete</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteCompanyTarget} onOpenChange={(open) => { if (!open) { setDeleteCompanyTarget(null); setDeleteCompanyStep(1); setDeleteCompanyConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteCompanyStep === 1 ? "Delete Company" : "Final Confirmation"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCompanyStep === 1
                ? <>Delete <strong>{deleteCompanyTarget?.name}</strong>? This removes linked memberships, profiles, documents, and leave records.</>
                : <>This is permanent. Type <strong>DELETE</strong> to confirm.</>}
            </AlertDialogDescription>
            {deleteCompanyStep === 2 && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="company-delete-confirm">Type DELETE</Label>
                <Input id="company-delete-confirm" value={deleteCompanyConfirm} onChange={(e) => setDeleteCompanyConfirm(e.target.value)} placeholder="DELETE" />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteCompanyStep === 1 ? (
              <Button variant="destructive" onClick={() => setDeleteCompanyStep(2)}>Continue</Button>
            ) : (
              <Button variant="destructive" disabled={deleteCompanyConfirm.trim() !== "DELETE" || deletingCompany} onClick={confirmDeleteCompany}>Delete Permanently</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteEmployeeTarget} onOpenChange={(open) => { if (!open) { setDeleteEmployeeTarget(null); setDeleteEmployeeStep(1); setDeleteEmployeeConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteEmployeeStep === 1 ? "Delete Employee" : "Final Confirmation"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEmployeeStep === 1
                ? <>Delete <strong>{deleteEmployeeTarget?.name || deleteEmployeeTarget?.email}</strong> from this company?</>
                : <>This is permanent. Type <strong>DELETE</strong> to confirm.</>}
            </AlertDialogDescription>
            {deleteEmployeeStep === 2 && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="employee-delete-confirm">Type DELETE</Label>
                <Input id="employee-delete-confirm" value={deleteEmployeeConfirm} onChange={(e) => setDeleteEmployeeConfirm(e.target.value)} placeholder="DELETE" />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteEmployeeStep === 1 ? (
              <Button variant="destructive" onClick={() => setDeleteEmployeeStep(2)}>Continue</Button>
            ) : (
              <Button variant="destructive" disabled={deleteEmployeeConfirm.trim() !== "DELETE" || deletingEmployee} onClick={confirmDeleteEmployee}>Delete Permanently</Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
