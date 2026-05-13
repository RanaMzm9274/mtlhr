import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout } from "@/lib/async";

type AnyRecord = Record<string, any> | null | undefined;

export interface ProfileRecord {
  id?: string;
  user_id?: string;
  company_id?: string | null;
  avatar_url?: string | null;
  name: string;
  email: string;
  phone: string;
  gender: string;
  position: string;
  id_passport: string;
  license: string;
  status: string;
  profile_completed: boolean;
  created_at?: string;
}

export interface DocumentRecord {
  id: string;
  user_id: string;
  file_url: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  category: string;
  uploaded_at: string;
}

export interface LeaveRecord {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: string;
  admin_comment: string | null;
  created_at: string;
  updated_at?: string;
}

export type DocumentPreviewKind = "image" | "pdf" | "unsupported";

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const firstNullableString = (...values: unknown[]) => {
  const value = firstString(...values);
  return value || null;
};

const normalizeLeaveStatus = (value: unknown) => {
  switch (firstString(value).toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "pending":
    default:
      return "pending";
  }
};

const normalizeLeaveType = (value: unknown) => {
  const normalized = firstString(value).toLowerCase();
  if (["annual", "sick", "personal", "maternity", "paternity", "unpaid"].includes(normalized)) {
    return normalized;
  }
  return "annual";
};

export const getProfileCompletion = (profile: Pick<ProfileRecord, "name" | "email" | "phone" | "gender" | "position" | "id_passport">) => {
  const requiredFields = [
    profile.name,
    profile.email,
    profile.phone,
    profile.gender,
    profile.position,
    profile.id_passport,
  ];

  return Math.round((requiredFields.filter(Boolean).length / requiredFields.length) * 100);
};

export const normalizeProfileRecord = (row: AnyRecord, user?: Pick<User, "email" | "user_metadata"> | null): ProfileRecord => {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const profile: ProfileRecord = {
    id: typeof row?.id === "string" ? row.id : undefined,
    user_id: typeof row?.user_id === "string" ? row.user_id : undefined,
    company_id: typeof row?.company_id === "string" ? row.company_id : null,
    avatar_url: firstNullableString(row?.avatar_url),
    name: firstString(row?.name, meta.name, meta.full_name),
    email: firstString(row?.email, user?.email),
    phone: firstString(row?.phone),
    gender: firstString(row?.gender),
    position: firstString(row?.position, meta.position),
    id_passport: firstString(row?.id_passport),
    license: firstString(row?.license),
    status: firstString(row?.status, user ? "active" : "invited"),
    profile_completed: typeof row?.profile_completed === "boolean" ? row.profile_completed : false,
    created_at: typeof row?.created_at === "string" ? row.created_at : undefined,
  };

  if (!row?.profile_completed) {
    profile.profile_completed = getProfileCompletion(profile) === 100;
  }

  return profile;
};

export const normalizeDocumentRecord = (row: AnyRecord): DocumentRecord => ({
  id: firstString(row?.id),
  user_id: firstString(row?.user_id, row?.employee_id, row?.uploaded_by),
  file_url: firstString(row?.file_url, row?.storage_path, row?.path, row?.file_name),
  storage_path: firstString(row?.storage_path, row?.file_url, row?.path, row?.file_name),
  file_name: firstString(row?.file_name, row?.title, row?.document_name),
  file_type: firstString(row?.file_type),
  category: firstString(row?.category, inferDocumentCategory(row?.file_name, row?.file_type)),
  uploaded_at: firstString(row?.uploaded_at, row?.created_at, new Date().toISOString()),
});

export const normalizeLeaveRecord = (row: AnyRecord): LeaveRecord => ({
  id: firstString(row?.id),
  user_id: firstString(row?.user_id, row?.employee_id),
  leave_type: normalizeLeaveType(firstString(row?.leave_type, row?.type)),
  start_date: firstString(row?.start_date),
  end_date: firstString(row?.end_date),
  days: typeof row?.days === "number" ? row.days : Number(row?.days) > 0 ? Number(row?.days) : calculateLeaveDays(firstString(row?.start_date), firstString(row?.end_date)),
  reason: firstString(row?.reason),
  status: normalizeLeaveStatus(row?.status),
  admin_comment: firstNullableString(row?.admin_comment, row?.admin_remark, row?.comment),
  created_at: firstString(row?.created_at, new Date().toISOString()),
  updated_at: firstString(row?.updated_at) || undefined,
});

export const buildDocumentInsertPayload = (userId: string, path: string, file: File, category: string) => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  return {
    user_id: userId,
    file_url: path,
    storage_path: path,
    file_name: file.name,
    file_type: ext,
    category,
    uploaded_at: new Date().toISOString(),
  };
};

export const buildLeaveInsertPayload = (userId: string, leave: Pick<LeaveRecord, "leave_type" | "start_date" | "end_date" | "reason">) => ({
  user_id: userId,
  leave_type: normalizeLeaveType(leave.leave_type),
  type: normalizeLeaveType(leave.leave_type),
  start_date: leave.start_date,
  end_date: leave.end_date,
  days: calculateLeaveDays(leave.start_date, leave.end_date),
  reason: leave.reason,
  status: normalizeLeaveStatus("pending"),
  admin_comment: "",
});

export const buildProfileUpsertPayload = (
  user: Pick<User, "id" | "email">,
  profile: Pick<ProfileRecord, "name" | "email" | "phone" | "gender" | "position" | "id_passport" | "license" | "profile_completed"> & { avatar_url?: string | null },
) => ({
  user_id: user.id,
  name: profile.name,
  email: profile.email || user.email || "",
  phone: profile.phone,
  gender: profile.gender,
  position: profile.position,
  id_passport: profile.id_passport,
  license: profile.license,
  avatar_url: profile.avatar_url ?? null,
  profile_completed: profile.profile_completed,
});

export const saveProfileRecord = async (
  supabase: SupabaseClient<Database>,
  payload: ReturnType<typeof buildProfileUpsertPayload> & Record<string, any>,
) => {
  const { data: existingRows, error: lookupError } = await withTimeout(
    supabase
      .from("employee_profiles")
      .select("*")
      .eq("user_id", payload.user_id)
      .order("created_at", { ascending: false })
      .limit(1),
    SUPABASE_REQUEST_TIMEOUT_MS,
    "Profile lookup",
  );

  if (lookupError) {
    throw lookupError;
  }

  const existingRow = existingRows?.[0];
  if (existingRow?.id) {
    const updatePayload = { ...payload };
    delete updatePayload.user_id;

    const { data: updatedRow, error: updateError } = await withTimeout(
      supabase
        .from("employee_profiles")
        .update(updatePayload as any)
        .eq("id", existingRow.id)
        .select("*")
        .single(),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Profile update",
    );

    if (updateError) {
      throw updateError;
    }

    return updatedRow;
  }

  const { data: insertedRow, error: insertError } = await withTimeout(
    supabase
      .from("employee_profiles")
      .insert(payload as any)
      .select("*"),
    SUPABASE_REQUEST_TIMEOUT_MS,
    "Profile insert",
  );

  if (insertError) {
    throw insertError;
  }

  return insertedRow?.[0] ?? null;
};

export const calculateLeaveDays = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

export const inferDocumentCategory = (fileName?: string, fileType?: string) => {
  const value = `${fileName ?? ""} ${fileType ?? ""}`.toLowerCase();
  if (value.includes("cv") || value.includes("resume")) return "cv";
  if (value.includes("passport") || value.includes("id")) return "id_proof";
  return "certificate";
};

export const getDocumentPreviewKind = (fileName?: string, fileType?: string): DocumentPreviewKind => {
  const value = `${fileType ?? ""} ${fileName ?? ""}`.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].some((ext) => value.includes(ext))) {
    return "image";
  }
  if (value.includes("pdf")) {
    return "pdf";
  }
  return "unsupported";
};

export const requestDocumentSignedUrl = async (
  supabase: SupabaseClient<Database>,
  storagePath: string,
  expiresIn = 300,
) => {
  const normalizedPath = firstString(storagePath);
  if (!normalizedPath) {
    throw new Error("This document record has no storage path.");
  }

  const { data, error } = await withTimeout(
    supabase.storage.from("documents").createSignedUrl(normalizedPath, expiresIn),
    SUPABASE_REQUEST_TIMEOUT_MS,
    "Document preview link",
  );

  if (error) {
    throw error;
  }

  if (!data?.signedUrl) {
    throw new Error("Signed URL could not be created.");
  }

  return data.signedUrl;
};

export const indexProfilesByUserId = (profiles: AnyRecord[] = [], users: Array<Pick<User, "id" | "email" | "user_metadata">> = []) => {
  const userMap = new Map(users.map((user) => [user.id, user]));
  return new Map(
    profiles.map((profile) => {
      const userId = firstString(profile?.user_id);
      return [userId, normalizeProfileRecord(profile, userMap.get(userId) ?? null)];
    }),
  );
};

export const filterEmployeeProfiles = (
  profiles: ProfileRecord[] = [],
  roles: Array<{ user_id: string; role: string }> = [],
) => {
  const adminIds = new Set(roles.filter((role) => role.role === "admin").map((role) => role.user_id));
  const employeeIds = new Set(roles.filter((role) => role.role === "employee").map((role) => role.user_id));
  const seen = new Set<string>();

  return profiles.filter((profile) => {
    if (!profile.user_id) {
      if (profile.status !== "invited") return false;
      const key = profile.email;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }

    if (adminIds.has(profile.user_id)) {
      return false;
    }

    if (!employeeIds.has(profile.user_id) && profile.status !== "invited") {
      return false;
    }

    if (seen.has(profile.user_id)) {
      return false;
    }

    seen.add(profile.user_id);
    return true;
  });
};
