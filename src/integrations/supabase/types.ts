export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      documents: {
        Row: {
          category: string
          company_id: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          leave_request_id: string | null
          uploaded_at: string
          user_id: string
        }
        Insert: {
          category: string
          company_id?: string | null
          file_name?: string
          file_type?: string
          file_url: string
          id?: string
          leave_request_id?: string | null
          uploaded_at?: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          leave_request_id?: string | null
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_profiles: {
        Row: {
          address: string | null
          allowed_clock_in_ip: string | null
          avatar_url: string | null
          company_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          employment_type: string
          gender: string | null
          id: string
          id_passport: string | null
          license: string | null
          name: string
          phone: string | null
          position: string | null
          profile_completed: boolean | null
          restrict_clock_in_ip: boolean
          status: string
          shift_end: string | null
          shift_start: string | null
          updated_at: string
          user_id: string
          website: string | null
          working_hours: number | null
        }
        Insert: {
          address?: string | null
          allowed_clock_in_ip?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          employment_type?: string
          gender?: string | null
          id?: string
          id_passport?: string | null
          license?: string | null
          name?: string
          phone?: string | null
          position?: string | null
          profile_completed?: boolean | null
          restrict_clock_in_ip?: boolean
          status?: string
          shift_end?: string | null
          shift_start?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          working_hours?: number | null
        }
        Update: {
          address?: string | null
          allowed_clock_in_ip?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          employment_type?: string
          gender?: string | null
          id?: string
          id_passport?: string | null
          license?: string | null
          name?: string
          phone?: string | null
          position?: string | null
          profile_completed?: boolean | null
          restrict_clock_in_ip?: boolean
          status?: string
          shift_end?: string | null
          shift_start?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          working_hours?: number | null
        }
        Relationships: []
      }
      invitations: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          name: string | null
          position: string | null
          token: string
          used: boolean | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          name?: string | null
          position?: string | null
          token: string
          used?: boolean | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          name?: string | null
          position?: string | null
          token?: string
          used?: boolean | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          admin_comment: string | null
          company_id: string | null
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_comment?: string | null
          company_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_comment?: string | null
          company_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bio: string | null
          created_at: string
          created_by: string | null
          employee_count: number | null
          id: string
          logo_url: string | null
          name: string
          revenue: number | null
          workday_end: string | null
          workday_start: string | null
          slug: string
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          employee_count?: number | null
          id?: string
          logo_url?: string | null
          name: string
          revenue?: number | null
          workday_end?: string | null
          workday_start?: string | null
          slug: string
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          employee_count?: number | null
          id?: string
          logo_url?: string | null
          name?: string
          revenue?: number | null
          workday_end?: string | null
          workday_start?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Relationships: []
      }
      company_memberships: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["company_status"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["company_status"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["company_status"]
          user_id?: string
        }
        Relationships: []
      }
      attendance_entries: {
        Row: {
          check_in_at: string | null
          clock_in_ip: string | null
          allowed_clock_in_ip_at_clock_in: string | null
          check_out_at: string | null
          company_id: string
          created_at: string
          id: string
          manual_work_hours: number | null
          scheduled_end: string | null
          scheduled_start: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          check_in_at?: string | null
          clock_in_ip?: string | null
          allowed_clock_in_ip_at_clock_in?: string | null
          check_out_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          manual_work_hours?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          work_date: string
        }
        Update: {
          check_in_at?: string | null
          clock_in_ip?: string | null
          allowed_clock_in_ip_at_clock_in?: string | null
          check_out_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          manual_work_hours?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          is_group: boolean
          last_message_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          is_group?: boolean
          last_message_at?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_group?: boolean
          last_message_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      chat_message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      company_holidays: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "employee"
      company_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "employee"],
      company_status: ["pending", "approved", "rejected"],
    },
  },
} as const

